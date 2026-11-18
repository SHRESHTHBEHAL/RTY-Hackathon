# @gaitway/demo

Relay, a pretend messaging API that charges one cent per message, and agents that pay it through Gaitway.

```sh
pnpm --filter @gaitway/sdk build      # once
pnpm --filter @gaitway/demo demo      # tells the story; uses a built-in test API unless settings are present
pnpm --filter @gaitway/demo relay     # Relay alone on port 4000
pnpm --filter @gaitway/demo test
```

Real API: set `GAITWAY_API_BASE`, `DEMO_SELLER_ID`, `DEMO_SELLER_KEY` and `DEMO_AGENT_KEYS`
(three agent keys, comma separated: Scout, Buyer, Broke). `relay` needs the first three.
Relay: `POST /messages { to, text }` (one cent), `GET /messages` (free), `GET /health`.
