// MCP server exposing Gaitway to an AI agent. Amounts are dollars toward the model, micros inside.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GaitwayAgent, GaitwayError, formatUsd, usd } from "@gaitway/sdk";
import type { Charge, Seller } from "@gaitway/sdk";

export type ServerOptions = {
  agentKey: string;
  apiBase?: string;
  /** Largest amount, in dollars, the model may commit in one call. Default "5". */
  maxSessionDollars?: string;
};

export const MAX_BODY_CHARS = 20_000;
const MAX_PAYMENTS_SHOWN = 50;
const DEFAULT_MAX_SESSION_DOLLARS = "5";
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export function createServer(opts: ServerOptions): McpServer {
  const maxDollars = opts.maxSessionDollars ?? DEFAULT_MAX_SESSION_DOLLARS;
  let maxMicros: bigint;
  try {
    maxMicros = BigInt(usd(maxDollars));
  } catch {
    throw new TypeError(`maxSessionDollars must be a decimal dollar amount such as "5", got ${JSON.stringify(maxDollars)}`);
  }
  if (maxMicros <= 0n) throw new TypeError("maxSessionDollars must be greater than zero");
  const oneDollar = 1_000_000n;

  const agent = new GaitwayAgent({
    apiKey: opts.agentKey,
    ...(opts.apiBase ? { baseUrl: opts.apiBase } : {}),
    sessionMicros: (maxMicros < oneDollar ? maxMicros : oneDollar).toString(),
  });

  /** Strip the agent key and anything shaped like a signed token from text shown to the model. */
  const scrub = (s: string): string => {
    let out = s.replace(JWT, "[redacted]");
    if (opts.agentKey) out = out.split(opts.agentKey).join("[redacted]");
    return out;
  };
  const ok = (text: string): ToolResult => ({ content: [{ type: "text", text: scrub(text) }] });
  const fail = (text: string): ToolResult => ({ content: [{ type: "text", text: scrub(text) }], isError: true });

  const failure = (err: unknown): ToolResult => {
    if (err instanceof GaitwayError) {
      let text = `Gaitway refused: ${err.code}. ${err.message}`;
      const link = (err.details as { approvalLink?: unknown } | undefined)?.approvalLink;
      if (typeof link === "string" && link) text += `\nA person can approve this here: ${link}`;
      return fail(text);
    }
    return fail(`Error: ${err instanceof Error ? err.message : String(err)}`);
  };

  /** Parse a decimal dollar string to micros, or return an error result to hand back to the model. */
  const amount = (name: string, value: string | undefined): { micros: bigint } | { error: ToolResult } => {
    let micros: bigint;
    try {
      micros = BigInt(usd(value ?? ""));
    } catch {
      return { error: fail(`${name} must be a decimal dollar amount such as "0.25" (at most 6 decimals), got ${JSON.stringify(value)}.`) };
    }
    if (micros <= 0n) return { error: fail(`${name} must be greater than zero.`) };
    if (micros > maxMicros) {
      return {
        error: fail(
          `${name} of ${formatUsd(micros)} is above this server's limit of ${formatUsd(maxMicros)} per call. ` +
            `Use a smaller amount, or ask the person to raise GAITWAY_MAX_SESSION_DOLLARS.`,
        ),
      };
    }
    return { micros };
  };

  const server = new McpServer({ name: "gaitway", version: "0.1.0" });

  server.registerTool(
    "gaitway_balance",
    { description: "Show how much money this agent can spend (available) and how much is reserved for open sessions (held), in dollars." },
    async () => {
      try {
        const w = await agent.balance();
        return ok(`Available: ${formatUsd(w.availableMicros)}\nHeld: ${formatUsd(w.heldMicros)}`);
      } catch (e) {
        return failure(e);
      }
    },
  );

  server.registerTool(
    "gaitway_find_sellers",
    {
      description: "Search the Gaitway directory for sellers and the paid services they offer. Returns seller ids, service names, price notes and URLs.",
      inputSchema: { query: z.string().describe("What you are looking for, e.g. 'translation'") },
    },
    async ({ query }) => {
      try {
        const sellers = await agent.findSellers(query);
        if (sellers.length === 0) return ok(`No sellers found for ${JSON.stringify(query)}.`);
        return ok(sellers.map(describeSeller).join("\n\n"));
      } catch (e) {
        return failure(e);
      }
    },
  );

  server.registerTool(
    "gaitway_paid_request",
    {
      description:
        "Make an HTTP request to a URL. If the seller asks for payment (HTTP 402) Gaitway pays automatically from the balance and retries. " +
        `Returns the HTTP status and response body (first ${MAX_BODY_CHARS} characters). ` +
        `max_dollars caps the spend for this seller (default $1, at most ${formatUsd(maxMicros)}).`,
      inputSchema: {
        url: z.string().describe("Full URL of the paid endpoint"),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
        body: z.string().optional().describe("Request body as text, usually JSON"),
        max_dollars: z.string().optional().describe('Most this call may spend, as a decimal dollar string such as "0.50"'),
      },
    },
    async ({ url, method, body, max_dollars }) => {
      let capMicros: string | undefined;
      if (max_dollars !== undefined) {
        const a = amount("max_dollars", max_dollars);
        if ("error" in a) return a.error;
        capMicros = a.micros.toString();
      }
      try {
        const init: RequestInit = { method };
        if (body !== undefined && method !== "GET") {
          init.body = body;
          init.headers = { "content-type": looksLikeJson(body) ? "application/json" : "text/plain" };
        }
        const res = await agent.fetch(url, init, capMicros ? { maxMicros: capMicros } : {});
        const text = scrub(await res.text());
        const shown = text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) : text;
        const note = text.length > MAX_BODY_CHARS ? `\n\n[truncated: response was ${text.length} characters, showing the first ${MAX_BODY_CHARS}]` : "";
        return ok(`HTTP ${res.status}\n\n${shown}${note}`);
      } catch (e) {
        return failure(e);
      }
    },
  );

  server.registerTool(
    "gaitway_pay_seller",
    {
      description: `Pay a seller directly, without calling their API. Amount is in dollars (at most ${formatUsd(maxMicros)} per call).`,
      inputSchema: {
        seller_id: z.string().describe("Seller id, e.g. sel_..."),
        dollars: z.string().describe('Amount as a decimal dollar string such as "12.50"'),
        reference: z.string().optional().describe("Note for the seller, e.g. an invoice number"),
      },
    },
    async ({ seller_id, dollars, reference }) => {
      const a = amount("dollars", dollars);
      if ("error" in a) return a.error;
      try {
        const charge = await agent.transfer({
          sellerId: seller_id,
          amountMicros: a.micros.toString(),
          ...(reference !== undefined ? { reference } : {}),
        });
        return ok(`Paid ${formatUsd(charge.amountMicros)} to ${charge.sellerId} (payment ${charge.id}).`);
      } catch (e) {
        return failure(e);
      }
    },
  );

  server.registerTool(
    "gaitway_payments",
    { description: `List this agent's payments, newest first (up to ${MAX_PAYMENTS_SHOWN}), with amounts in dollars.` },
    async () => {
      try {
        const all = await agent.payments();
        if (all.length === 0) return ok("No payments yet.");
        const lines = all.slice(0, MAX_PAYMENTS_SHOWN).map(describePayment);
        const more = all.length > MAX_PAYMENTS_SHOWN ? `\n(${all.length - MAX_PAYMENTS_SHOWN} older payments not shown)` : "";
        return ok(lines.join("\n") + more);
      } catch (e) {
        return failure(e);
      }
    },
  );

  return server;
}

function looksLikeJson(s: string): boolean {
  const t = s.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}

function describeSeller(s: Seller): string {
  const head = `${s.name} (${s.id})`;
  const services = s.services.filter((x) => x.active);
  if (services.length === 0) return `${head}\n  no listed services`;
  return [head, ...services.map((x) => `  - ${x.name}: ${x.description} [${x.priceNote}] ${x.url}`)].join("\n");
}

function describePayment(c: Charge): string {
  const refunded = c.refundedMicros !== "0" ? `, refunded ${formatUsd(c.refundedMicros)}` : "";
  const note = c.description ? ` "${c.description}"` : "";
  return `${c.createdAt}  ${formatUsd(c.amountMicros)} to ${c.sellerId}${refunded}${note} (${c.id})`;
}
