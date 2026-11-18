"use server";

import { attempt, fetchChartDays, fetchOverview, findCharge } from "@/components/seller/server";
import type { ActionResult, ChargePage, ChartDay, OverviewData } from "@/components/seller/result";
import type { ApiKey, Charge, Refund, Service } from "@/lib/api/types";

const fail = (field: string, message: string): ActionResult<never> => ({ ok: false, code: "validation_failed", message, field });

/* ---- Overview (polled every 3 seconds while the tab is visible) ---- */
export async function overviewAction(): Promise<ActionResult<OverviewData>> {
  return attempt(fetchOverview);
}
export async function chartAction(): Promise<ActionResult<ChartDay[]>> {
  return attempt((gw) => fetchChartDays(gw));
}

/* ---- Charges ---- */
export async function listChargesAction(cursor?: string): Promise<ActionResult<ChargePage>> {
  return attempt((gw) => gw.listCharges({ limit: 50, cursor }));
}
export async function refundAction(input: { chargeId: string; amountMicros?: string; key: string }): Promise<ActionResult<{ refund: Refund; charge: Charge | null }>> {
  if (input.amountMicros !== undefined && !/^[1-9]\d*$/.test(input.amountMicros)) return fail("amount", "Enter an amount above $0.00.");
  return attempt(async (gw) => {
    const { refund } = await gw.createRefund({ chargeId: input.chargeId, amountMicros: input.amountMicros }, input.key);
    return { refund, charge: await findCharge(gw, input.chargeId) };
  });
}

/* ---- Services ---- */
type ServiceInput = { name: string; description: string; priceNote: string; url: string };
function checkService(i: ServiceInput): ActionResult<never> | null {
  if (!i.name.trim()) return fail("name", "Enter a name for this service.");
  try {
    const u = new URL(i.url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
  } catch {
    return fail("url", "Enter the full address of the service, starting with https://.");
  }
  return null;
}
export async function createServiceAction(input: ServiceInput): Promise<ActionResult<Service>> {
  const bad = checkService(input);
  if (bad) return bad;
  return attempt(async (gw) =>
    (await gw.createService({ name: input.name.trim(), description: input.description.trim(), priceNote: input.priceNote.trim(), url: input.url.trim() })).service,
  );
}
export async function updateServiceAction(id: string, patch: Partial<ServiceInput> & { active?: boolean }): Promise<ActionResult<Service>> {
  if (patch.name !== undefined || patch.url !== undefined) {
    const bad = checkService({ name: patch.name ?? "x", description: "", priceNote: "", url: patch.url ?? "https://x.test" });
    if (bad) return bad;
  }
  const clean: Record<string, string | boolean | undefined> = {};
  for (const [k, v] of Object.entries(patch)) clean[k] = typeof v === "string" ? v.trim() : v;
  return attempt(async (gw) => (await gw.updateService(id, clean)).service);
}

/* ---- Developers ---- */
export async function createKeyAction(label: string): Promise<ActionResult<{ key: ApiKey; apiKey: string }>> {
  if (!label.trim()) return fail("label", "Give the key a name so you can tell it apart later.");
  return attempt((gw) => gw.createKey({ label: label.trim() }));
}
export async function revokeKeyAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return attempt((gw) => gw.deleteKey(id));
}
export async function setWebhookAction(url: string): Promise<ActionResult<{ url: string; secret: string }>> {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
  } catch {
    return fail("url", "Enter the full address Gaitway should call, starting with https://.");
  }
  return attempt((gw) => gw.setWebhook({ url: url.trim() }));
}

/* ---- Payout details ---- */
export async function setPayoutAddressAction(address: string): Promise<ActionResult<{ address: string }>> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) return fail("address", "A payout address is 0x followed by 40 letters and digits (0 to 9, a to f).");
  return attempt((gw) => gw.setPayoutAddress({ address: address.trim() }));
}
