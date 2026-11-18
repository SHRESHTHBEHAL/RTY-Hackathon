# @gaitway/mcp

An MCP server that lets an AI agent (Claude Code, Claude Desktop, any MCP client) pay for things through Gaitway. The agent can check its balance, find sellers, call paid APIs (HTTP 402 is paid automatically), and pay a seller directly. Amounts are always dollars in what the model sees.

Node 20 or later. It talks to the Gaitway API with an agent key (`gw_test_agt_...`); the key and any credential token are never put in tool output.

## Tools

| Tool | Inputs | Does |
|---|---|---|
| `gaitway_balance` | none | Available and held balance, in dollars. |
| `gaitway_find_sellers` | `query` | Directory search: seller ids, services, price notes, URLs. |
| `gaitway_paid_request` | `url`, `method` (GET, POST, PUT, PATCH, DELETE), `body?`, `max_dollars?` | Calls the URL. On a Gaitway 402 it opens a spending session for that seller, pays, and retries once. Returns `HTTP <status>` and the body (first 20,000 characters). |
| `gaitway_pay_seller` | `seller_id`, `dollars`, `reference?` | Pays a seller directly, without calling their API. |
| `gaitway_payments` | none | Recent payments, newest first (up to 50). |

Amounts are decimal dollar strings such as `"0.25"` (at most 6 decimals), never numbers.

`max_dollars` (and `dollars` for `gaitway_pay_seller`) above the server's limit are refused with a plain error before any money moves. The limit is `GAITWAY_MAX_SESSION_DOLLARS`, default `5`. Without `max_dollars`, a paid request opens a session of up to $1.

Refusals (`insufficient_funds`, `rule_violation`, `payment_failed`) come back as an error result with the reason in plain text, plus the approval link when a person can approve the payment.

## Configuration

| Variable | Required | Default |
|---|---|---|
| `GAITWAY_AGENT_KEY` | yes | none |
| `GAITWAY_API_BASE` | no | `http://localhost:8787` |
| `GAITWAY_MAX_SESSION_DOLLARS` | no | `5` |

Build first from the repository root: `pnpm --filter @gaitway/mcp build`. In the commands below, replace `/path/to/Gaitway` with your checkout (or use `npx -y @gaitway/mcp` once published).

## Claude Code

```sh
claude mcp add gaitway \
  --env GAITWAY_AGENT_KEY=gw_test_agt_... \
  --env GAITWAY_API_BASE=http://localhost:8787 \
  --env GAITWAY_MAX_SESSION_DOLLARS=5 \
  -- node /path/to/Gaitway/packages/mcp/dist/main.js
```

Or the JSON form, in `.mcp.json` (project) or `~/.claude.json`:

```json
{
  "mcpServers": {
    "gaitway": {
      "command": "node",
      "args": ["/path/to/Gaitway/packages/mcp/dist/main.js"],
      "env": {
        "GAITWAY_AGENT_KEY": "gw_test_agt_...",
        "GAITWAY_API_BASE": "http://localhost:8787",
        "GAITWAY_MAX_SESSION_DOLLARS": "5"
      }
    }
  }
}
```

## Claude Desktop

Add the same block to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json`), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "gaitway": {
      "command": "node",
      "args": ["/path/to/Gaitway/packages/mcp/dist/main.js"],
      "env": {
        "GAITWAY_AGENT_KEY": "gw_test_agt_...",
        "GAITWAY_API_BASE": "http://localhost:8787",
        "GAITWAY_MAX_SESSION_DOLLARS": "5"
      }
    }
  }
}
```

## Development

```sh
pnpm --filter @gaitway/mcp test    # runs against the SDK's mock API
pnpm --filter @gaitway/mcp start   # stdio server (needs GAITWAY_AGENT_KEY)
```

`createServer({ agentKey, apiBase?, maxSessionDollars? })` from `src/server.ts` returns the `McpServer`, so tests can connect it to a client over an in-memory transport.
