# Lore Observability

This document describes the structured logging contract, configuration, and operator recipes for `lore-memory-mcp`.

## Log Envelope (v1.0)

Every MCP tool call, authenticated REST request, and auth event emits a single line of JSON to stdout. The shape is defined in `architecture.md` §8.1 and is treated as contract — adding or removing keys requires a story and review.

### Success envelope

```json
{
  "level": "info",
  "tool": "query_lessons_for_task",
  "project_id": "9f8b1e2c-…-dd55",
  "duration_ms": 285,
  "result_count": 7,
  "success": true,
  "timestamp": "2026-05-06T10:23:45Z"
}
```

### Error envelope

```json
{
  "level": "error",
  "tool": "save_lesson",
  "project_id": "9f8b1e2c-…-dd55",
  "duration_ms": 45,
  "success": false,
  "error_code": "EMBEDDING_FAILED",
  "error_message": "OpenAI API returned 503",
  "retryable": true,
  "timestamp": "2026-05-06T10:23:45Z"
}
```

At `LOG_LEVEL=debug` the error envelope additionally includes:

```json
{
  "stack": "Error: OpenAI API returned 503\n    at ..."
}
```

### REST envelope

Admin and project routes that opt in emit:

```json
{
  "level": "info",
  "tool": "rest:POST:/api/projects/register",
  "project_id": "-",
  "duration_ms": 12,
  "success": true,
  "status_code": 201,
  "timestamp": "2026-05-06T10:23:45Z"
}
```

### Auth envelope

Bearer auth failures:

```json
{
  "level": "warn",
  "tool": "auth:bearer",
  "project_id": "-",
  "success": false,
  "reason": "missing_header",
  "ip": "192.168.1.0",
  "timestamp": "2026-05-06T10:23:45Z"
}
```

Rate-limit trips:

```json
{
  "level": "warn",
  "tool": "auth:rate_limit",
  "project_id": "-",
  "success": false,
  "reason": "rate_limit_exceeded",
  "failure_count": 21,
  "ip": "192.168.1.0",
  "timestamp": "2026-05-06T10:23:45Z"
}
```

## Configuration

| Env var     | Default | Allowed values                                      |
| ----------- | ------- | --------------------------------------------------- |
| `LOG_LEVEL` | `info`  | `debug`, `info`, `warn`, `error` (case-insensitive) |

Invalid values cause the process to exit non-zero at boot with a fatal validation message.

Changing `LOG_LEVEL` requires a process restart — runtime mutation is not supported in v1.0.

## Privacy

### Masked fields

- **`project_id`** — first 8 hex chars + `-…-` + last 4 hex chars. Example: `9f8b1e2c-…-dd55`.
- **`ip`** — IPv4 last octet zeroed (`192.168.1.42` → `192.168.1.0`). IPv6 last 80 bits zeroed (`2001:db8::1` → `2001:db8::`).

### Redacted fields

Pino's built-in redact replaces the following paths with `"[Redacted]"` before serialization:

- `*.api_key`
- `*.api_key_hash`
- `*.password`
- `*.token`
- `*.authorization`
- `headers.authorization`

Lesson content (`title`, `problem`, `fix`, `prevention_rule`, `code_example`) is **never** logged at any level. The envelope reports `result_count`, never row payloads.

## Operator Recipes

### Tail recent tool calls

```bash
docker logs lore-mcp-server --since=1m | jq -c 'select(.tool != null)'
```

### Slow queries (>500 ms)

```bash
docker logs lore-mcp-server --since=1h | jq -c 'select(.tool=="query_lessons" and .duration_ms>500)'
```

### Errors only

```bash
docker logs lore-mcp-server --since=1h | jq -c 'select(.level=="error")'
```

### Rate-limit events

```bash
docker logs lore-mcp-server --since=1h | jq -c 'select(.tool=="auth:rate_limit")'
```

## Known Caveats

- `stack` at debug MAY include user-supplied input strings if the throw site embedded them in the error message. We recommend operators **not** ship debug logs to long-retention storage.
- No `request_id` field in v1.0 — correlation is by `timestamp` proximity + `tool`.
- No log sampling in v1.0 — every tool call produces exactly one line.
