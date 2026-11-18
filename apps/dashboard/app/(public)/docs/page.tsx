import type { ReactNode } from "react";
import { CodeBlock } from "@/components/public/CodeBlock";
import { DocsToc, type TocItem } from "@/components/public/DocsToc";
import {
  AGENT_SNIPPET,
  ERROR_BODY_SNIPPET,
  FIND_SELLERS_SNIPPET,
  INSTALL_SNIPPET,
  MANDATE_SNIPPET,
  MCP_JSON_SNIPPET,
  MCP_SNIPPET,
  MCP_TOOLS,
  PAYMENT_REQUIRED_SNIPPET,
  POLICY_REQUEST_SNIPPET,
  POLICY_RESPONSE_SNIPPET,
  REFUND_SNIPPET,
  SELLER_SNIPPET,
  TRANSFER_SNIPPET,
  WEBHOOK_BODY_SNIPPET,
  WEBHOOK_SNIPPET,
} from "@/components/public/snippets";

export const metadata = {
  title: "Docs",
  description: "Seller and agent quickstarts, the credential, the 402 reply, error codes, and the rest of the Gaitway API.",
};

const TOC: TocItem[] = [
  { id: "basics", label: "Amounts and keys", group: "Start" },
  { id: "seller-quickstart", label: "Seller quickstart", group: "Start" },
  { id: "agent-quickstart", label: "Agent quickstart", group: "Start" },
  { id: "credential", label: "The credential", group: "Reference" },
  { id: "payment-required", label: "The 402 reply", group: "Reference" },
  { id: "errors", label: "Error codes", group: "Reference" },
  { id: "mandates", label: "Mandates", group: "More ways to pay" },
  { id: "transfers", label: "Transfers", group: "More ways to pay" },
  { id: "refunds", label: "Refunds", group: "More ways to pay" },
  { id: "webhooks", label: "Webhooks", group: "Control" },
  { id: "policy-hook", label: "The policy hook", group: "Control" },
  { id: "mcp", label: "MCP server", group: "Control" },
];

const CLAIMS: Array<[string, string]> = [
  ["iss", "The API's public base URL. Development: http://localhost:8787"],
  ["sub", "Agent ID"],
  ["aud", "Seller ID"],
  ["jti", "Credential ID"],
  ["iat, exp", "Seconds since epoch"],
  ["env", '"test" or "live"'],
  ["biz", '{ "id", "name", "email", "verified": boolean }'],
  ["agent", '{ "id", "name" }'],
  ["max", "Maximum chargeable amount, micros string"],
  ["cur", '"USD"'],
];

const ERRORS: Array<[string, number, string]> = [
  ["unauthorized", 401, "Missing or bad key or session"],
  ["forbidden", 403, "Valid key, wrong owner or wrong key type"],
  ["not_found", 404, "The thing does not exist"],
  ["validation_failed", 422, "Bad input"],
  ["insufficient_funds", 402, "Wallet or unallocated balance too low"],
  ["credential_expired", 409, "The credential has expired"],
  ["credential_not_active", 409, "Released or exhausted"],
  ["amount_exceeds_remaining", 409, "Charge larger than what is left"],
  ["idempotency_conflict", 409, "Same key, different request body"],
  ["rule_violation", 403, "A spending rule or the policy hook blocked it"],
  ["insufficient_seller_balance", 409, "Refund larger than the unsettled balance"],
  ["live_disabled", 403, "Live mode is not enabled"],
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <header className="border-b border-line py-12 sm:py-16">
        <p className="eyebrow">Developer docs</p>
        <h1 className="font-display mt-3 text-[48px] text-ink sm:text-[72px]">Build with Gaitway</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Everything here runs in test mode with test money. The SDK is <code className="font-mono text-[0.9em]">@gaitway/sdk</code>, for Node 20 or later.
          The HTTP API lives under <code className="font-mono text-[0.9em]">/v1</code> and speaks JSON.
        </p>
      </header>

      <div className="grid gap-10 py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14 lg:py-14">
        <aside className="lg:sticky lg:top-[96px] lg:max-h-[calc(100dvh-120px)] lg:self-start lg:overflow-y-auto">
          <details className="rounded-[14px] border border-line bg-card p-4 lg:hidden">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">On this page</summary>
            <ul className="mt-2 space-y-1">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="flex min-h-11 items-center text-[15px] text-ink-soft">
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </details>
          <div className="hidden lg:block">
            <DocsToc items={TOC} />
          </div>
        </aside>

        <article className="min-w-0 max-w-[760px] space-y-16 pb-10">
          <Section id="basics" title="Amounts and keys">
            <P>
              Every amount is a whole number of millionths of a US dollar, called micros, sent as a string of digits: <C>&quot;10000&quot;</C> is one cent and{" "}
              <C>&quot;1000000&quot;</C> is one dollar. Field names end in <C>Micros</C>. Parse them to <C>bigint</C>; never use floating point for money.
              In the SDK, <C>usd(&quot;0.01&quot;)</C> converts dollars to micros.
            </P>
            <P>
              Send API keys as <C>Authorization: Bearer &lt;key&gt;</C>. Keys are shown once, when they are created.
            </P>
            <Table
              head={["Holder", "Key format"]}
              rows={[
                ["Business", "gw_<env>_biz_<32 chars>"],
                ["Agent", "gw_<env>_agt_<32 chars>"],
                ["Seller", "gw_<env>_sel_<32 chars>"],
              ]}
              mono={[1]}
            />
            <CodeBlock code={INSTALL_SNIPPET} lang="sh" title="Install" />
          </Section>

          <Section id="seller-quickstart" title="Seller quickstart">
            <P>Charge an agent one cent per request with the Express middleware. Express is a peer dependency.</P>
            <CodeBlock code={SELLER_SNIPPET} title="server.ts" copyLabel="Copy the seller quickstart" />
            <P>
              With no valid credential the middleware answers HTTP 402 with a Gaitway body. With one, it charges the price first, then runs your handler with{" "}
              <C>req.gaitway</C> set. A retried request, with the same <C>gaitway-request-id</C> header, is charged once. Without Express, use{" "}
              <C>seller.verify(token)</C>, <C>seller.charge(&#123; credentialId, amountMicros &#125;)</C> and <C>seller.paymentRequired(price)</C> directly.
            </P>
          </Section>

          <Section id="agent-quickstart" title="Agent quickstart">
            <CodeBlock code={AGENT_SNIPPET} title="agent.ts" copyLabel="Copy the agent quickstart" />
            <P>
              <C>agent.fetch</C> works like <C>fetch</C>. When a seller answers 402 with a Gaitway body, it opens a credential for that seller (
              <C>sessionMicros</C>, default $1, or <C>opts.maxMicros</C>, capped to the available balance), retries once, and reuses the credential for later
              calls to the same seller.
            </P>
            <ul className="list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-ink">
              <li>
                A second 402 after paying throws <C>GaitwayError</C> with code <C>payment_failed</C>. It never tries a third time.
              </li>
              <li>
                An empty balance throws <C>GaitwayError</C> with code <C>insufficient_funds</C>.
              </li>
              <li>A 402 without a Gaitway body is returned to you untouched.</li>
              <li>The request body must be re-sendable (string, bytes, FormData, URLSearchParams, Blob). Stream bodies throw TypeError.</li>
            </ul>
            <P>Agents can also look sellers up in the directory:</P>
            <CodeBlock code={FIND_SELLERS_SNIPPET} title="agent.ts" />
          </Section>

          <Section id="credential" title="The credential">
            <P>
              A credential is a JWT signed with ES256, with header <C>alg: &quot;ES256&quot;</C>, a <C>kid</C>, and <C>typ: &quot;gaitway-credential+jwt&quot;</C>. It
              is a session with one seller: it can be charged many times until its maximum is used or it expires. Its lifetime defaults to 300 seconds, with
              a minimum of 10 and a maximum of 86400.
            </P>
            <Table head={["Claim", "Value"]} rows={CLAIMS} mono={[0]} />
            <P>
              Agents send it in the <C>gaitway-token</C> header. Sellers check the signature, audience and expiry locally against the public keys at{" "}
              <C>GET &#123;iss&#125;/.well-known/jwks.json</C>, then charge it with <C>POST /v1/charges</C> before delivering.
            </P>
          </Section>

          <Section id="payment-required" title="The 402 reply">
            <P>When a seller has no valid credential, it replies HTTP 402 with this body. priceMicros and priceNote may be null.</P>
            <CodeBlock code={PAYMENT_REQUIRED_SNIPPET} lang="json" title="HTTP 402" />
            <P>
              The agent SDK sends <C>gaitway-request-id</C>, a fresh random value per logical request and the same value when it retries that request. The
              seller SDK uses it as the charge&apos;s idempotency key, so a retried request is charged once.
            </P>
          </Section>

          <Section id="errors" title="Error codes">
            <P>Every non-2xx response has this body. An error may also carry a details object.</P>
            <CodeBlock code={ERROR_BODY_SNIPPET} lang="json" title="Error body" />
            <Table head={["Code", "HTTP", "Meaning"]} rows={ERRORS.map(([c, h, m]) => [c, String(h), m])} mono={[0, 1]} />
            <P>
              The SDK adds a few of its own: <C>payment_failed</C> (a second 402 after paying), <C>invalid_mandate</C> and <C>invalid_signature</C>.
            </P>
          </Section>

          <Section id="mandates" title="Mandates">
            <P>
              A mandate lets a seller charge an agent repeatedly, up to a limit per <C>day</C>, <C>week</C> or <C>month</C>, without opening a credential each
              time. The money comes straight from the available balance. It is a token like the credential, with <C>typ: &quot;gaitway-mandate+jwt&quot;</C>,
              and it expires after one year.
            </P>
            <CodeBlock code={MANDATE_SNIPPET} title="mandate.ts" />
            <P>
              <C>verifyMandate</C> checks the signature, audience and expiry locally; <C>chargeMandate</C> fails if the mandate was revoked, the period limit
              would be exceeded, or the balance is too low.
            </P>
          </Section>

          <Section id="transfers" title="Transfers">
            <P>A push payment from the agent straight to a seller, with no credential and no seller call. Spending rules and the policy hook apply.</P>
            <CodeBlock code={TRANSFER_SNIPPET} title="agent.ts" />
          </Section>

          <Section id="refunds" title="Refunds">
            <CodeBlock code={REFUND_SNIPPET} title="seller.ts" />
            <P>
              The money goes back to the agent&apos;s balance. A refund larger than your unsettled balance fails with <C>insufficient_seller_balance</C>.{" "}
              <C>chargeMandate</C>, <C>transfer</C> and <C>refund</C> send an <C>Idempotency-Key</C>; pass your own <C>idempotencyKey</C> to make a retry
              safe.
            </P>
          </Section>

          <Section id="webhooks" title="Webhooks">
            <P>
              Set a URL with <C>PUT /v1/webhook</C>. Gaitway posts events with the body below and a <C>gaitway-signature</C> header: the hex HMAC-SHA256 of
              the raw body, using the webhook secret. Types are <C>payout.sent</C>, <C>charge.refunded</C> and <C>mandate.revoked</C>.
            </P>
            <CodeBlock code={WEBHOOK_BODY_SNIPPET} lang="json" title="Webhook body" />
            <P>Verify the signature against the raw body, before parsing JSON:</P>
            <CodeBlock code={WEBHOOK_SNIPPET} title="webhook.ts" />
            <P>
              A bad signature throws <C>GaitwayError</C> with code <C>invalid_signature</C>.
            </P>
          </Section>

          <Section id="policy-hook" title="The policy hook">
            <P>
              A business can set a URL with <C>PUT /v1/policy-hook</C>. Gaitway calls it before creating a credential, a mandate or a transfer, after its own
              spending rules pass, with a <C>gaitway-signature</C> header (hex HMAC-SHA256 of the raw body, using the hook secret):
            </P>
            <CodeBlock code={POLICY_REQUEST_SNIPPET} lang="json" title="POST {url}" />
            <P>The hook must answer HTTP 200 within 2 seconds:</P>
            <CodeBlock code={POLICY_RESPONSE_SNIPPET} lang="json" title="200 OK" />
            <P>
              <C>outcome</C> is <C>allow</C>, <C>hold</C> or <C>block</C>. Anything other than a valid allow, including a timeout or an error, refuses the
              request with <C>rule_violation</C>, the reasons joined by &quot;; &quot; as the message, and <C>details: &#123; outcome, approvalLink &#125;</C>.
              Gaitway keeps no pending state: after a person approves a hold on the hook&apos;s side, the agent tries again.
            </P>
          </Section>

          <Section id="mcp" title="MCP server">
            <P>
              <C>@gaitway/mcp</C> lets an AI agent in Claude Code, Claude Desktop or any MCP client pay through Gaitway. It talks to the API with an agent key;
              the key and any credential token are never put in tool output. Amounts are decimal dollar strings such as <C>&quot;0.25&quot;</C>.
            </P>
            <Table head={["Tool", "Inputs", "Does"]} rows={MCP_TOOLS.map((t) => [t.name, t.inputs, t.does])} mono={[0, 1]} />
            <P>
              Amounts above <C>GAITWAY_MAX_SESSION_DOLLARS</C> (default 5) are refused with a plain error before any money moves. Build it first with{" "}
              <C>pnpm --filter @gaitway/mcp build</C>.
            </P>
            <CodeBlock code={MCP_SNIPPET} lang="sh" title="Claude Code" />
            <P>Or add it to .mcp.json, ~/.claude.json, or claude_desktop_config.json:</P>
            <CodeBlock code={MCP_JSON_SNIPPET} lang="json" title=".mcp.json" />
          </Section>
        </article>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-[96px] space-y-5">
      <h2 id={`${id}-h`} className="font-display text-[32px] text-ink sm:text-[40px]">
        <a href={`#${id}`} className="hover-fine:text-pass">
          {title}
        </a>
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-[16px] leading-relaxed text-ink">{children}</p>;
}

function C({ children }: { children: ReactNode }) {
  return <code className="rounded-[5px] bg-ink/6 px-1.5 py-0.5 font-mono text-[0.88em] text-ink">{children}</code>;
}

function Table({ head, rows, mono = [] }: { head: string[]; rows: string[][]; mono?: number[] }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line bg-card">
      <table className="w-full min-w-[480px] border-collapse text-left text-[15px]">
        <thead>
          <tr className="border-b border-line">
            {head.map((h) => (
              <th key={h} scope="col" className="eyebrow px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.join("|")} className="border-b border-line last:border-0">
              {r.map((cell, i) => (
                <td key={i} className={i === 0 ? "px-4 py-3 align-top" : "px-4 py-3 align-top text-ink-soft"}>
                  {mono.includes(i) ? <code className="font-mono text-[13px] text-ink">{cell}</code> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
