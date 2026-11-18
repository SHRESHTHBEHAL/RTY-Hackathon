import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "./api/client";
import { GaitwayError } from "./api/errors";
import type { Account } from "./api/types";

/**
 * The session token lives only in an httpOnly cookie, written by server code
 * (server actions and route handlers). It never reaches browser JavaScript,
 * localStorage or a URL.
 */
export const SESSION_COOKIE = "gw_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function getSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** Call from a server action or route handler only. */
export async function setSessionToken(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Call from a server action or route handler only. */
export async function clearSessionToken(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** The signed-in account, or null when there is no valid session. */
export async function getAccount(): Promise<{ account: Account; token: string } | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const { account } = await api(token).getMe();
    return { account, token };
  } catch (e) {
    if (e instanceof GaitwayError && (e.code === "unauthorized" || e.code === "forbidden")) return null;
    throw e;
  }
}

/**
 * Guard for dashboard layouts and pages. Logged out goes to /login; the
 * wrong kind of account goes to its own dashboard.
 */
export async function requireAccount(kind: Account["kind"]): Promise<{ account: Account; token: string }> {
  const session = await getAccount();
  if (!session) redirect("/login");
  if (session.account.kind !== kind) redirect(session.account.kind === "business" ? "/business" : "/seller");
  return session;
}

/** Convenience: the API client bound to the current session. */
export async function sessionApi() {
  return api(await getSessionToken());
}
