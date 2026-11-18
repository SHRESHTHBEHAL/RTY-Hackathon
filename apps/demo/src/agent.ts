// A paying agent: sends messages through Relay, paying one cent each via Gaitway.
import { GaitwayAgent, GaitwayError } from "@gaitway/sdk";

export async function runAgent(opts: {
  apiBase: string;
  agentKey: string;
  relayUrl: string;
  count: number;
  name: string;
  log?: (line: string) => void;
}): Promise<{ sent: number; failed: boolean; reason?: string }> {
  const log = opts.log ?? (() => {});
  const agent = new GaitwayAgent({ apiKey: opts.agentKey, baseUrl: opts.apiBase });
  let sent = 0;
  try {
    for (let i = 1; i <= opts.count; i++) {
      const res = await agent.fetch(`${opts.relayUrl}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: "ops@example.test", text: `Message ${i} from ${opts.name}` }),
      });
      if (!res.ok) {
        const reason = `http_${res.status}`;
        log(`${opts.name}: message ${i} was refused (HTTP ${res.status})`);
        return { sent, failed: true, reason };
      }
      sent++;
      log(`${opts.name}: message ${i} sent`);
    }
    return { sent, failed: false };
  } catch (err) {
    const reason = err instanceof GaitwayError ? err.code : "error";
    log(`${opts.name}: stopped (${reason})`);
    return { sent, failed: true, reason };
  } finally {
    await agent.releaseAll().catch(() => {});
  }
}
