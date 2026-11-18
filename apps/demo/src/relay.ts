// Relay: a pretend messaging API that charges one cent per message through Gaitway.
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { GaitwaySeller } from "@gaitway/sdk";
import { gaitwayExpress } from "@gaitway/sdk/express";

export type RelayMessage = { id: number; from: string; to: string; text: string; at: string };

export async function startRelay(opts: {
  port?: number;
  apiBase: string;
  sellerId: string;
  sellerKey: string;
}): Promise<{ url: string; close(): Promise<void> }> {
  const seller = new GaitwaySeller({ apiKey: opts.sellerKey, sellerId: opts.sellerId, baseUrl: opts.apiBase });
  const messages: RelayMessage[] = [];
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    if (req.method === "GET") res.setHeader("access-control-allow-origin", "*");
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/messages", (_req, res) => {
    res.json({ messages });
  });
  app.post(
    "/messages",
    gaitwayExpress(seller, { priceMicros: "10000", priceNote: "per message", description: "Relay message" }),
    (req, res) => {
      const { to, text } = (req.body ?? {}) as { to?: unknown; text?: unknown };
      if (typeof to !== "string" || typeof text !== "string") {
        res.status(422).json({ error: { code: "validation_failed", message: "to and text are required strings" } });
        return;
      }
      const message: RelayMessage = {
        id: messages.length + 1,
        from: req.gaitway!.claims.agentName,
        to,
        text,
        at: new Date().toISOString(),
      };
      messages.push(message);
      res.json({ ok: true, message });
    },
  );

  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(opts.port ?? 0, "127.0.0.1", () => resolve(s));
    s.once("error", reject);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
