import type { ErrorBody } from "./types.js";

export class GaitwayError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, message: string, status = 0, details?: unknown) {
    super(message);
    this.name = "GaitwayError";
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

export const DEFAULT_BASE_URL = "http://localhost:8787";

export type HttpClientOptions = { apiKey: string; baseUrl?: string };

export type RequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
};

/** Minimal JSON fetch wrapper for the Gaitway API. Throws GaitwayError on any failure. */
export class HttpClient {
  readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: HttpClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    let url = this.baseUrl + path;
    if (opts.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) if (v !== undefined) qs.set(k, String(v));
      const s = qs.toString();
      if (s) url += (url.includes("?") ? "&" : "?") + s;
    }
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${this.apiKey}`,
      ...opts.headers,
    };
    if (opts.body !== undefined) headers["content-type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      throw new GaitwayError("network_error", `Could not reach Gaitway at ${this.baseUrl}: ${(err as Error).message}`, 0);
    }

    const text = await res.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    if (!res.ok) {
      const e = (json as Partial<ErrorBody> | undefined)?.error;
      if (e && typeof e.code === "string") {
        throw new GaitwayError(e.code, e.message ?? e.code, res.status, e.details);
      }
      throw new GaitwayError("http_error", `Unexpected response (${res.status}) from Gaitway`, res.status);
    }
    return json as T;
  }

  get<T>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.request<T>("GET", path, { query });
  }
  post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>("POST", path, { body: body ?? {}, headers });
  }
}
