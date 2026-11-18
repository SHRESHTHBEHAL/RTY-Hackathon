# Workspace 3 (Edge) notes

## Built

- `packages/sdk`: seller and agent SDKs, webhooks helper, stand-in API (`@gaitway/sdk/testing`). 89 tests.
- `packages/mcp`: MCP server with five tools. 24 tests.
- `apps/demo`: Relay sample seller and paying agent. `pnpm --filter @gaitway/demo demo`.
- `apps/dashboard`: landing, docs, seller directory, auth, business and seller dashboards, `/demo`, `/styleguide`. Runs on fixture data (`API_MODE=fixtures`, the default).

## Not verified

- Dashboard live mode (`API_MODE=live`) and the demo's real-API path have never run against a real API.
- No production build (`next build`) of the final dashboard was run.
- Plan Task 14 (live integration pass) and the accessibility audit in Task 13 are not done.
- The policy-hook "held or blocked" banner on the business side is not built.

## Gaps and ambiguities found in context.md

- No route returns the reconciliation result, so no screen shows it.
- No seller route lists mandates; the seller Subscriptions page infers them from charges.
- No route reads a single charge, or the saved webhook URL.
- A seller named in a 402 reply cannot be checked against the origin: a dishonest site could name another seller and the agent would pay it.
- Error codes are unspecified for: charging a credential that names another seller (mock uses 403 `forbidden`), a missing `Idempotency-Key` (422), charging a revoked mandate (409 `credential_not_active`), exceeding a mandate period or refundable amount (409 `amount_exceeds_remaining`).
- Success status for `POST` routes is unspecified (mock uses 200). Idempotency key scope is unspecified (mock scopes per seller).
- Whether `dailyMaxMicros` subtracts refunds is unspecified (mock does not).
- `perPaymentMaxMicros` has nothing to check against on mandate creation.
