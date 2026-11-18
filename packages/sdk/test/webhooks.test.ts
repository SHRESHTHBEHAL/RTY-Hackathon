import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { GaitwayError, verifyWebhook, type WebhookEvent } from "../src/index.js";

const secret = "whsec_test_0123456789";
const event = {
  id: "evt_" + "a".repeat(24),
  type: "charge.refunded",
  createdAt: "2026-11-18T10:00:00.000Z",
  data: { refund: { id: "rfd_" + "b".repeat(24), chargeId: "chg_" + "c".repeat(24), amountMicros: "10000" } },
};
const rawBody = JSON.stringify(event);
const sign = (body: string, s = secret) => createHmac("sha256", s).update(body, "utf8").digest("hex");

function expectInvalid(fn: () => unknown) {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(GaitwayError);
  expect((err as GaitwayError).code).toBe("invalid_signature");
}

describe("verifyWebhook", () => {
  it("accepts a correct signature and returns the parsed event", () => {
    const ev: WebhookEvent = verifyWebhook(rawBody, sign(rawBody), secret);
    expect(ev).toEqual(event);
  });

  it("accepts an upper-case hex signature", () => {
    expect(verifyWebhook(rawBody, sign(rawBody).toUpperCase(), secret).id).toBe(event.id);
  });

  it("rejects a wrong signature", () => {
    expectInvalid(() => verifyWebhook(rawBody, sign(rawBody, "other-secret"), secret));
    expectInvalid(() => verifyWebhook(rawBody, "0".repeat(64), secret));
  });

  it("rejects a truncated signature", () => {
    expectInvalid(() => verifyWebhook(rawBody, sign(rawBody).slice(0, 63), secret));
    expectInvalid(() => verifyWebhook(rawBody, sign(rawBody).slice(0, 32), secret));
    expectInvalid(() => verifyWebhook(rawBody, "", secret));
  });

  it("rejects a body altered by one byte", () => {
    const sig = sign(rawBody);
    const altered = rawBody.replace("10000", "10001");
    expect(altered).not.toBe(rawBody);
    expect(altered.length).toBe(rawBody.length);
    expectInvalid(() => verifyWebhook(altered, sig, secret));
    expectInvalid(() => verifyWebhook(rawBody + " ", sig, secret));
  });

  it("rejects non-hex signatures and a missing secret", () => {
    expectInvalid(() => verifyWebhook(rawBody, "z".repeat(64), secret));
    expectInvalid(() => verifyWebhook(rawBody, sign(rawBody), ""));
  });

  it("a correctly signed body that is not a webhook event is rejected as validation_failed", () => {
    const body = "not json";
    let err: unknown;
    try {
      verifyWebhook(body, sign(body), secret);
    } catch (e) {
      err = e;
    }
    expect((err as GaitwayError).code).toBe("validation_failed");
  });
});
