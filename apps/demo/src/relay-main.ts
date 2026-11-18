// Runs Relay alone on port 4000, using settings from the environment.
import { startRelay } from "./relay.js";

const apiBase = process.env.GAITWAY_API_BASE ?? "http://localhost:8787";
const sellerKey = process.env.DEMO_SELLER_KEY;
const sellerId = process.env.DEMO_SELLER_ID;
if (!sellerKey || !sellerId) {
  console.error("Set DEMO_SELLER_KEY and DEMO_SELLER_ID (and GAITWAY_API_BASE) to run Relay.");
  process.exit(1);
}
const relay = await startRelay({ port: Number(process.env.PORT ?? 4000), apiBase, sellerId, sellerKey });
console.log(`Relay is listening at ${relay.url} (charging via ${apiBase})`);
const stop = () => relay.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
