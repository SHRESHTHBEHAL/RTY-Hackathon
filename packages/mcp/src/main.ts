#!/usr/bin/env node
// Stdio entry point. Configure with GAITWAY_AGENT_KEY, GAITWAY_API_BASE, GAITWAY_MAX_SESSION_DOLLARS.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const agentKey = process.env.GAITWAY_AGENT_KEY;
if (!agentKey) {
  // stdout is the protocol channel, so diagnostics go to stderr.
  console.error("gaitway-mcp: set GAITWAY_AGENT_KEY to your agent's API key (gw_test_agt_...).");
  process.exit(1);
}

const server = createServer({
  agentKey,
  ...(process.env.GAITWAY_API_BASE ? { apiBase: process.env.GAITWAY_API_BASE } : {}),
  maxSessionDollars: process.env.GAITWAY_MAX_SESSION_DOLLARS || "5",
});
await server.connect(new StdioServerTransport());
