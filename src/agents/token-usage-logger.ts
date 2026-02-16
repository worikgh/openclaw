/**
 * Token Usage Logger
 *
 * Logs all AI API requests with timestamps, token usage, and cost information.
 * This module intercepts API responses and extracts usage metadata to maintain
 * a comprehensive audit trail of AI service consumption.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { normalizeUsage, type NormalizedUsage } from "./usage.js";

export type TokenUsageLogEntry = {
  timestamp: string; // ISO 8601 timestamp
  provider: string; // e.g., "anthropic", "openai", "google"
  model: string; // e.g., "claude-3-5-sonnet-20241022"
  sessionKey?: string; // Session identifier
  requestId?: string; // API request ID if available
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
  };
  cost?: {
    inputCost: number; // USD
    outputCost: number; // USD
    cacheReadCost: number; // USD
    cacheWriteCost: number; // USD
    totalCost: number; // USD
  };
};

// Cost per 1M tokens (in USD) - Updated 2026-02-16
// Source: https://www.anthropic.com/pricing
const TOKEN_COSTS: Record<
  string,
  {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  }
> = {
  // Anthropic Claude
  "claude-3-5-sonnet-20241022": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-sonnet-4-5": {
    // Alias for claude-3-5-sonnet-20241022
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-3-5-haiku-20241022": {
    input: 0.8,
    output: 4.0,
    cacheRead: 0.08,
    cacheWrite: 1.0,
  },
  "claude-3-opus-20240229": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  "claude-3-sonnet-20240229": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-3-haiku-20240307": {
    input: 0.25,
    output: 1.25,
    cacheRead: 0.03,
    cacheWrite: 0.3,
  },

  // OpenAI GPT-4
  "gpt-4-turbo": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-4": {
    input: 30.0,
    output: 60.0,
  },
  "gpt-4-32k": {
    input: 60.0,
    output: 120.0,
  },

  // OpenAI GPT-3.5
  "gpt-3.5-turbo": {
    input: 0.5,
    output: 1.5,
  },
  "gpt-3.5-turbo-16k": {
    input: 3.0,
    output: 4.0,
  },

  // OpenAI o1
  o1: {
    input: 15.0,
    output: 60.0,
  },
  "o1-mini": {
    input: 3.0,
    output: 12.0,
  },

  // Google Gemini
  "gemini-1.5-pro": {
    input: 1.25,
    output: 5.0,
  },
  "gemini-1.5-flash": {
    input: 0.075,
    output: 0.3,
  },
  "gemini-1.0-pro": {
    input: 0.5,
    output: 1.5,
  },
};

/**
 * Calculate cost based on token usage and model pricing
 */
function calculateCost(
  model: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  },
):
  | {
      inputCost: number;
      outputCost: number;
      cacheReadCost: number;
      cacheWriteCost: number;
      totalCost: number;
    }
  | undefined {
  const costs = TOKEN_COSTS[model];
  if (!costs) {
    return undefined;
  }

  const inputCost = (usage.inputTokens / 1_000_000) * costs.input;
  const outputCost = (usage.outputTokens / 1_000_000) * costs.output;
  const cacheReadCost = costs.cacheRead ? (usage.cacheReadTokens / 1_000_000) * costs.cacheRead : 0;
  const cacheWriteCost = costs.cacheWrite
    ? (usage.cacheWriteTokens / 1_000_000) * costs.cacheWrite
    : 0;

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
  };
}

/**
 * Get the log file path
 */
function getLogFilePath(): string {
  const logDir = process.env.OPENCLAW_TOKEN_LOG_DIR || path.join(process.cwd(), ".openclaw");
  return path.join(logDir, "token-usage.jsonl");
}

/**
 * Ensure log directory exists
 */
async function ensureLogDirectory(): Promise<void> {
  const logPath = getLogFilePath();
  const logDir = path.dirname(logPath);

  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch (err) {
    console.error("Failed to create token usage log directory:", err);
  }
}

/**
 * Append a log entry to the token usage log file
 */
async function appendLogEntry(entry: TokenUsageLogEntry): Promise<void> {
  try {
    await ensureLogDirectory();
    const logPath = getLogFilePath();
    const logLine = JSON.stringify(entry) + "\n";
    await fs.appendFile(logPath, logLine, "utf-8");
  } catch (err) {
    console.error("Failed to write token usage log:", err);
  }
}

/**
 * Log AI API usage
 *
 * @param provider - AI provider (e.g., "anthropic", "openai")
 * @param model - Model identifier
 * @param usage - Normalized usage object from API response
 * @param sessionKey - Optional session identifier
 * @param requestId - Optional API request ID
 */
export async function logTokenUsage(params: {
  provider: string;
  model: string;
  usage: NormalizedUsage | undefined;
  sessionKey?: string;
  requestId?: string;
}): Promise<void> {
  if (!params.usage) {
    return;
  }

  const normalizedUsage = normalizeUsage(params.usage);
  if (!normalizedUsage) {
    return;
  }

  const inputTokens = normalizedUsage.input ?? 0;
  const outputTokens = normalizedUsage.output ?? 0;
  const cacheReadTokens = normalizedUsage.cacheRead ?? 0;
  const cacheWriteTokens = normalizedUsage.cacheWrite ?? 0;
  const totalTokens =
    normalizedUsage.total ?? inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;

  const cost = calculateCost(params.model, {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  });

  const logEntry: TokenUsageLogEntry = {
    timestamp: new Date().toISOString(),
    provider: params.provider,
    model: params.model,
    sessionKey: params.sessionKey,
    requestId: params.requestId,
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens,
    },
    ...(cost && { cost }),
  };

  await appendLogEntry(logEntry);
}

/**
 * Read token usage log entries
 *
 * @param options - Filtering options
 * @returns Array of log entries
 */
export async function readTokenUsageLog(options?: {
  provider?: string;
  model?: string;
  sessionKey?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}): Promise<TokenUsageLogEntry[]> {
  try {
    const logPath = getLogFilePath();
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    let entries: TokenUsageLogEntry[] = lines
      .map((line) => {
        try {
          return JSON.parse(line) as TokenUsageLogEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is TokenUsageLogEntry => entry !== null);

    // Apply filters
    if (options?.provider) {
      entries = entries.filter((e) => e.provider === options.provider);
    }
    if (options?.model) {
      entries = entries.filter((e) => e.model === options.model);
    }
    if (options?.sessionKey) {
      entries = entries.filter((e) => e.sessionKey === options.sessionKey);
    }
    if (options?.since) {
      entries = entries.filter((e) => new Date(e.timestamp) >= options.since!);
    }
    if (options?.until) {
      entries = entries.filter((e) => new Date(e.timestamp) <= options.until!);
    }

    // Apply limit (take last N entries)
    if (options?.limit && options.limit > 0) {
      entries = entries.slice(-options.limit);
    }

    return entries;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

/**
 * Get aggregated usage statistics
 */
export async function getUsageStatistics(options?: {
  provider?: string;
  model?: string;
  sessionKey?: string;
  since?: Date;
  until?: Date;
}): Promise<{
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalTokens: number;
  totalCost: number;
  byModel: Record<
    string,
    {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cost: number;
    }
  >;
}> {
  const entries = await readTokenUsageLog(options);

  const stats = {
    totalRequests: entries.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    byModel: {} as Record<
      string,
      {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cost: number;
      }
    >,
  };

  for (const entry of entries) {
    stats.totalInputTokens += entry.usage.inputTokens;
    stats.totalOutputTokens += entry.usage.outputTokens;
    stats.totalCacheReadTokens += entry.usage.cacheReadTokens;
    stats.totalCacheWriteTokens += entry.usage.cacheWriteTokens;
    stats.totalTokens += entry.usage.totalTokens;
    if (entry.cost) {
      stats.totalCost += entry.cost.totalCost;
    }

    // Aggregate by model
    if (!stats.byModel[entry.model]) {
      stats.byModel[entry.model] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
      };
    }
    const modelStats = stats.byModel[entry.model];
    modelStats.requests += 1;
    modelStats.inputTokens += entry.usage.inputTokens;
    modelStats.outputTokens += entry.usage.outputTokens;
    modelStats.totalTokens += entry.usage.totalTokens;
    if (entry.cost) {
      modelStats.cost += entry.cost.totalCost;
    }
  }

  return stats;
}
