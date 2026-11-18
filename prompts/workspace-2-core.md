You are building Workspace 2 (Core) of Gaitway, a payment gateway for AI agents. Two other builders are working in parallel on other parts. You cannot talk to them. A shared contract file keeps your work compatible with theirs.

Before writing any code, read these three files in full, in this order:

1. `context.md`
2. `docs/superpowers/specs/2026-11-18-agent-payment-gateway-design.md`
3. `docs/superpowers/plans/2026-11-18-ws2-core.md`

Then carry out the plan task by task, in order.

What you are building: the backend. A ledger that tracks every agent's wallet, and the HTTP API for businesses, agents, and sellers: accounts, wallets, payment credentials, charges, settlement to the vault, and reconciliation.

Rules:

- Work on the git branch `ws2-core`. Create it from `main` if it does not exist. Never commit to `main`.
- Edit only the repository's root config files (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`, `docker-compose.yml`, `README.md`), `apps/api/`, and `docs/handoff/ws2-notes.md`. Do not create or change any file elsewhere.
- Every route, request field, response field, error code, and HTTP status in `context.md` section 8 is fixed, and so is the `VaultClient` interface in section 9. Another builder is writing a frontend and SDKs against exactly those. If you think the contract is wrong or incomplete, do not change it: write the problem in `docs/handoff/ws2-notes.md` and build to it as written.
- Do not import the vault package. Use the `VaultClient` interface with your own in-memory implementation, as the plan describes. The real one is plugged in later.
- This is money. Every balance change goes through the ledger's single `post` function inside one database transaction. Never use floating point for amounts. The concurrency tests in the plan are not optional.
- Finish every Milestone 1 task before starting any Milestone 2 task. Milestone 1 feeds a live presentation, so it comes first and must work.
- Write the tests first, watch them fail, then implement. Run tests against a real Postgres from the Compose file. Commit after every task.
- `apps/api` must install, build, and test on its own, with the other workspaces' directories absent.
- Never commit secrets. Keep `.env.example` current.

When Milestone 1 is done, stop and tell me: what exists, the exact commands to start Postgres, run the API, seed the demo, and run the tests, the test results, and anything in `context.md` you found wrong. Then wait for me before starting Milestone 2.
