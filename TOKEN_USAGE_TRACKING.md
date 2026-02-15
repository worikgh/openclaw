# Token Usage Tracking

## Overview

This branch (`mistress`) adds comprehensive token usage tracking to OpenClaw. All AI API calls are logged with timestamps, token counts, and calculated costs.

## Features

- **Automatic Logging**: Every AI API call is automatically logged
- **Cost Calculation**: Automatically calculates costs based on current pricing
- **JSONL Format**: Easy to parse and analyze with standard tools
- **Non-Intrusive**: Logging failures don't affect agent operation
- **Privacy-Focused**: Only logs metadata (tokens, costs, timestamps) - no prompt content

## Log File Location

```
~/.openclaw/logs/token-usage.jsonl
```

## Log Format

Each line is a JSON object with the following structure:

```json
{
  "timestamp": "2026-02-16T11:15:30.123Z",
  "model": "claude-sonnet-4-5",
  "provider": "anthropic",
  "sessionKey": "agent:main:main",
  "usage": {
    "input": 15000,
    "output": 500,
    "cacheRead": 0,
    "cacheWrite": 0,
    "total": 15500
  },
  "cost": {
    "input": 0.045,
    "output": 0.0075,
    "cacheRead": 0,
    "cacheWrite": 0,
    "total": 0.0525
  }
}
```

## Viewing Logs

### Using standard Unix tools:

```bash
# View recent entries
tail -20 ~/.openclaw/logs/token-usage.jsonl

# Count total requests
wc -l ~/.openclaw/logs/token-usage.jsonl

# View logs from a specific date
grep "2026-02-16" ~/.openclaw/logs/token-usage.jsonl

# Pretty-print JSON
tail -20 ~/.openclaw/logs/token-usage.jsonl | jq '.'

# Calculate total cost (requires jq)
jq -s 'map(.cost.total // 0) | add' ~/.openclaw/logs/token-usage.jsonl
```

### Using Node.js:

```javascript
import { readRecentTokenUsage, calculateTotalCost } from "./src/agents/token-usage-logger.js";

// Read last 100 entries
const entries = await readRecentTokenUsage(100);

// Calculate total cost
const totalCost = calculateTotalCost(entries);
console.log(`Total cost: $${totalCost.toFixed(4)}`);
```

## Model Pricing

The logger includes current pricing for popular models (as of Feb 2026):

| Model             | Input (per 1M tokens) | Output (per 1M tokens) |
| ----------------- | --------------------- | ---------------------- |
| claude-sonnet-4-5 | $3.00                 | $15.00                 |
| claude-3-haiku    | $0.25                 | $1.25                  |
| gpt-4o            | $2.50                 | $10.00                 |
| gpt-4o-mini       | $0.15                 | $0.60                  |

To update pricing, edit `src/agents/token-usage-logger.ts` and modify the `MODEL_PRICING` object.

## Implementation Details

### Integration Point

Token usage is logged in `src/agents/pi-embedded-runner/run.ts` immediately after each API call completes. The logging happens after usage data is normalized but before the agent continues processing.

### Error Handling

Logging errors are caught and logged to stderr but do not interrupt agent operation. This ensures that logging failures never break the agent.

### Performance Impact

- Minimal: Async file append operations
- Non-blocking: Uses promise-based I/O
- Fail-safe: Errors are caught and don't propagate

## Branch Information

- **Branch Name**: `mistress`
- **Parent Branch**: `main`
- **Created**: 2026-02-16
- **Purpose**: Track token usage independently of upstream changes

## Files Modified/Added

- **Added**: `src/agents/token-usage-logger.ts` - Core logging module
- **Modified**: `src/agents/pi-embedded-runner/run.ts` - Integration point
- **Added**: `TOKEN_USAGE_TRACKING.md` - This documentation

## Future Enhancements

Potential improvements for this feature:

1. **Web Dashboard**: Real-time usage visualization
2. **Budget Alerts**: Notify when approaching spending limits
3. **Per-Session Analysis**: Break down costs by conversation
4. **Export Tools**: CSV/Excel export for accounting
5. **Retention Policy**: Automatic log rotation/archival
6. **Rate Limiting**: Track and enforce token/cost limits

## Merging Upstream Changes

To keep this branch up-to-date with upstream:

```bash
cd /home/fook/openclaw
git fetch origin
git merge origin/main
# Resolve conflicts if any
```

## Testing

To verify logging is working:

1. Make any request to your OpenClaw agent
2. Check the log file:
   ```bash
   tail ~/.openclaw/logs/token-usage.jsonl
   ```
3. Verify the entry contains timestamp, model, usage, and cost

## Support

For issues with token tracking:

- Check file permissions on `~/.openclaw/logs/`
- Review stderr for logging errors
- Verify the log file is being created/updated

## License

Same license as OpenClaw (see main repository LICENSE file)
