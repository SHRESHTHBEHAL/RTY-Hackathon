"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/api/client";
import { GaitwayError } from "@/lib/api/errors";
import { clearSessionToken, setSessionToken } from "@/lib/session";

export type AuthField = "email" | "password" | "name" | "kind" | "form";

export type SignupResult =
  | { ok: true; kind: "business" | "seller"; name: string; apiKey: string }
  | { ok: false; field: AuthField; message: string };

export type LoginResult = { ok: true; kind: "business" | "seller" } | { ok: false; field: AuthField; message: string };

function fieldOf(e: GaitwayError): AuthField {
  const f = e.details?.field;
  return f === "email" || f === "password" || f === "name" || f === "kind" ? f : "form";
}

const unreachable = "Cannot reach Gaitway right now. Check your connection and try again.";

/**
 * Creates the account, sets the session cookie, and returns the API key
 * once. The key is never stored by the dashboard; the page holds it in
 * memory until the person leaves.
 */
export async function signupAction(input: { kind: string; name: string; email: string; password: string }): Promise<SignupResult> {
  const kind = input.kind === "seller" ? "seller" : "business";
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  const password = input.password ?? "";
  if (!name) return { ok: false, field: "name", message: kind === "business" ? "Enter your business name." : "Enter your seller name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, field: "email", message: "Enter a valid email address." };
  if (password.length < 8) return { ok: false, field: "password", message: "Use at least 8 characters." };
  try {
    const res = await api(null).createAccount({ kind, name, email, password });
    await setSessionToken(res.sessionToken);
    return { ok: true, kind: res.account.kind, name: res.account.name, apiKey: res.apiKey };
  } catch (e) {
    if (e instanceof GaitwayError) {
      if (e.code === "network_error" || e.code === "timeout") return { ok: false, field: "form", message: unreachable };
      if (e.code === "validation_failed") return { ok: false, field: fieldOf(e), message: e.message };
      return { ok: false, field: "form", message: e.message };
    }
    throw e;
  }
}

export async function loginAction(input: { email: string; password: string }): Promise<LoginResult> {
  const email = (input.email ?? "").trim();
  const password = input.password ?? "";
  if (!email) return { ok: false, field: "email", message: "Enter your email address." };
  if (!password) return { ok: false, field: "password", message: "Enter your password." };
  try {
    const res = await api(null).createSession({ email, password });
    await setSessionToken(res.sessionToken);
    return { ok: true, kind: res.account.kind };
  } catch (e) {
    if (e instanceof GaitwayError) {
      if (e.code === "unauthorized") return { ok: false, field: "password", message: "Email or password is wrong. Check both and try again." };
      if (e.code === "network_error" || e.code === "timeout") return { ok: false, field: "form", message: unreachable };
      return { ok: false, field: "form", message: e.message };
    }
    throw e;
  }
}

export async function logoutAction(): Promise<void> {
  await clearSessionToken();
  redirect("/login");
}
