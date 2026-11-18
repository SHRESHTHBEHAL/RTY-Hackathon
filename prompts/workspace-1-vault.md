You are building Workspace 1 (Vault) of Gaitway, a payment gateway for AI agents. Two other builders are working in parallel on other parts. You cannot talk to them. A shared contract file keeps your work compatible with theirs.

Before writing any code, read these three files in full, in this order:

1. `context.md`
2. `docs/superpowers/specs/2026-11-18-agent-payment-gateway-design.md`
3. `docs/superpowers/plans/2026-11-18-ws1-vault.md`

Then carry out the plan task by task, in order.

What you are building: the smart contract that holds the money, its tests and deploy script, the TypeScript client (`@gaitway/chain`) the API will use to drive it, and later a bridge to a companion project called Dwarpal.

Rules:

- Work on the git branch `ws1-vault`. Create it from `main` if it does not exist. Never commit to `main`.
- Edit only `contracts/`, `packages/chain/`, and `docs/handoff/ws1-notes.md`. Do not create or change any file elsewhere in this repository.
- Every interface, event, role name, type, and function signature in `context.md` section 9 is fixed. Copy them exactly. If you think the contract is wrong or incomplete, do not change it: write the problem in `docs/handoff/ws1-notes.md` and build to it as written.
- Finish every Milestone 1 task before starting any Milestone 2 task. Milestone 1 feeds a live presentation, so it comes first and must work.
- Write the tests first, watch them fail, then implement. Commit after every task.
- Your directories must install, build, and test on their own, with the other workspaces' directories absent.
- Never commit secrets or private keys other than anvil's well-known default test key.
- For Tasks 9 and 10 you work in a separate checkout of `https://github.com/Aadhar-Gupta-0/dwarpal`, on a new branch `gaitway-bridge`. Read that repository's own README and `contracts/CONTRACTS.md` first. Never commit to its `main`, never edit its `contracts/` folder, and never push or open a pull request there unless I tell you to.
- Do not deploy to any public network. Document how; do not do it.

When Milestone 1 is done, stop and tell me: what exists, the exact commands to run the tests and the local chain, the test results, and anything in `context.md` you found wrong. Then wait for me before starting Milestone 2.
