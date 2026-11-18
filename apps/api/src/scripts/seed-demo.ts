/**
 * Seeds the M1 demo (context.md section 11) through a running API:
 * business demo@gaitway.test, seller relay@gaitway.test with service "Relay",
 * 100 test dollars topped up, and three agents holding 50, 30 and 0 dollars.
 * Prints every key once. Safe to re-run: existing accounts are signed into
 * and fresh keys are issued.
 *
 *   pnpm --filter @gaitway/api seed:demo
 */
try {
  process.loadEnvFile();
} catch {
  /* no .env */
}

const BASE = (process.env.GAITWAY_API_BASE ?? `http://localhost:${process.env.PORT ?? 8787}`).replace(/\/$/, "");
// Demo-only password for the seeded test accounts. Override with DEMO_PASSWORD.
const PASSWORD = process.env.DEMO_PASSWORD ?? "gaitway-demo";
const DOLLAR = 1_000_000n;

async function api(method: string, path: string, body?: unknown, token?: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`) as Error & { code?: string };
    err.code = json?.error?.code;
    throw err;
  }
  return json;
}

async function account(email: string, name: string, kind: "business" | "seller") {
  try {
    const r = await api("POST", "/v1/accounts", { email, password: PASSWORD, name, kind });
    return { account: r.account, session: r.sessionToken as string, apiKey: r.apiKey as string, created: true };
  } catch (e) {
    if ((e as { code?: string }).code !== "validation_failed") throw e;
    const s = await api("POST", "/v1/sessions", { email, password: PASSWORD });
    const k = await api("POST", "/v1/keys", { label: `seed ${new Date().toISOString()}` }, s.sessionToken);
    return { account: s.account, session: s.sessionToken as string, apiKey: k.apiKey as string, created: false };
  }
}

async function main() {
  await api("GET", "/health").catch(() => {
    throw new Error(`The API is not reachable at ${BASE}. Start it with: pnpm --filter @gaitway/api dev`);
  });

  const biz = await account("demo@gaitway.test", "Demo Co", "business");
  const relay = await account("relay@gaitway.test", "Relay", "seller");

  const services = await api("GET", "/v1/services", undefined, relay.apiKey);
  let service = services.data.find((s: any) => s.name === "Relay");
  if (!service) {
    service = (
      await api("POST", "/v1/services", {
        name: "Relay",
        description: "A pretend messaging API. Pay per message with Gaitway.",
        priceNote: "1 cent per message",
        url: "http://localhost:4000",
      }, relay.apiKey)
    ).service;
  }

  // Agents: reuse by name, create if missing.
  const wanted = [
    { name: "Atlas", dollars: 50n },
    { name: "Beacon", dollars: 30n },
    { name: "Comet", dollars: 0n },
  ];
  const existing = (await api("GET", "/v1/agents?limit=200", undefined, biz.apiKey)).data as any[];
  const agents: { name: string; id: string; walletId: string; apiKey: string; dollars: bigint }[] = [];
  for (const w of wanted) {
    const found = existing.find((a) => a.name === w.name);
    if (found) {
      const k = await api("POST", `/v1/agents/${found.id}/keys`, { label: "seed" }, biz.apiKey);
      agents.push({ name: w.name, id: found.id, walletId: found.walletId, apiKey: k.apiKey, dollars: w.dollars });
    } else {
      const r = await api("POST", "/v1/agents", { name: w.name }, biz.apiKey);
      agents.push({ name: w.name, id: r.agent.id, walletId: r.agent.walletId, apiKey: r.apiKey, dollars: w.dollars });
    }
  }

  // Bring each wallet to its target, topping up the business as needed.
  const balance = await api("GET", "/v1/balance", undefined, biz.apiKey);
  const current = new Map<string, bigint>(balance.wallets.map((w: any) => [w.walletId, BigInt(w.availableMicros)]));
  let need = 0n;
  for (const a of agents) {
    const diff = a.dollars * DOLLAR - (current.get(a.walletId) ?? 0n);
    if (diff > 0n) need += diff;
  }
  const unallocated = BigInt(balance.unallocatedMicros);
  if (biz.created || unallocated < need) {
    const amount = biz.created ? 100n * DOLLAR : need - unallocated;
    await api("POST", "/v1/topups", { amountMicros: amount.toString(), method: "test" }, biz.apiKey);
    process.stdout.write(`Topped up ${Number(amount) / 1e6} test dollars; waiting for the deposit to confirm`);
    const target = unallocated + amount;
    for (let i = 0; ; i++) {
      const b = await api("GET", "/v1/balance", undefined, biz.apiKey);
      if (BigInt(b.unallocatedMicros) >= target) break;
      if (i > 60) throw new Error("\nDeposit did not confirm within 60 seconds. Is the API's job runner running?");
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 1000));
    }
    process.stdout.write(" confirmed\n");
  }
  for (const a of agents) {
    const diff = a.dollars * DOLLAR - (current.get(a.walletId) ?? 0n);
    if (diff === 0n) continue;
    await api("POST", "/v1/allocations", {
      walletId: a.walletId,
      amountMicros: (diff > 0n ? diff : -diff).toString(),
      direction: diff > 0n ? "to_wallet" : "to_unallocated",
    }, biz.apiKey);
  }

  const final = await api("GET", "/v1/balance", undefined, biz.apiKey);
  const line = "-".repeat(72);
  console.log(`\n${line}\nGaitway demo seeded against ${BASE}\n${line}`);
  console.log(`Business  demo@gaitway.test   password: ${PASSWORD}`);
  console.log(`  businessId   ${biz.account.businessId}`);
  console.log(`  apiKey       ${biz.apiKey}`);
  console.log(`  unallocated  ${Number(final.unallocatedMicros) / 1e6} USD`);
  console.log(`Seller    relay@gaitway.test  password: ${PASSWORD}`);
  console.log(`  sellerId     ${relay.account.sellerId}`);
  console.log(`  apiKey       ${relay.apiKey}`);
  console.log(`  service      ${service.id} (${service.priceNote})`);
  for (const a of agents) {
    const w = final.wallets.find((x: any) => x.walletId === a.walletId);
    console.log(`Agent     ${a.name.padEnd(8)} ${a.id}  wallet ${a.walletId}  ${Number(w.availableMicros) / 1e6} USD`);
    console.log(`  apiKey       ${a.apiKey}`);
  }
  console.log(`${line}\nThese keys are shown once. Re-running issues new ones.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
