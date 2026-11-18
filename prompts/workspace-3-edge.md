You are building Workspace 3 (Edge) of Gaitway, a payment gateway for AI agents. Two other builders are working in parallel on other parts. You cannot talk to them. A shared contract file keeps your work compatible with theirs.

Before writing any code, read these three files in full, in this order:

1. `context.md`
2. `docs/superpowers/specs/2026-11-18-agent-payment-gateway-design.md`
3. `docs/superpowers/plans/2026-11-18-ws3-edge.md`

Then carry out the plan task by task, in order.

What you are building: everything a person or an agent touches. The whole frontend (public website, business dashboard, seller dashboard, docs, and the live demo screen used in the presentation), the seller SDK and agent SDK, an MCP server, and the demo itself.

Rules:

- Work on the git branch `ws3-edge`. Create it from `main` if it does not exist. Never commit to `main`.
- Edit only `packages/sdk/`, `packages/mcp/`, `apps/dashboard/`, `apps/demo/`, and `docs/handoff/ws3-notes.md`. Do not create or change any file elsewhere.
- Every route, field name, header, and error code comes from `context.md` sections 7 and 8. Another builder is writing the real API to exactly that contract. Do not invent routes or fields. If the frontend needs something the contract does not provide, write it in `docs/handoff/ws3-notes.md` and build without it.
- The real API will not exist while you work. Use the mock server and the fixture mode the plan describes, so everything you build runs on its own.
- The frontend is what the audience will see. Settle one visual direction before building screens, write it down as the plan says, and hold every screen to it. It handles money: aim for calm, exact, and trustworthy, and avoid a generic template look. Use no crypto vocabulary in the interface except where the plan allows it.
- Invent no customers, testimonials, statistics, or claims for the public site. Use only what `context.md` and the design document say.
- Never put a session token or API key in `localStorage` or a URL. Show an API key once, at creation.
- Finish every Milestone 1 task before starting any Milestone 2 task. Milestone 1 is the presentation, so it comes first and must work.
- Write the tests first, watch them fail, then implement. Commit after every task.
- Each of your directories must install, build, and test on its own, with the other workspaces' directories absent.

When Milestone 1 is done, stop and tell me: what exists, the exact commands to run the demo, the dashboard, and the tests, the test results, screenshots of the main screens if you can take them, and anything in `context.md` you found wrong or missing. Then wait for me before starting Milestone 2.
