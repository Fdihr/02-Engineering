// Thin fetch wrapper. Relies on the httponly `ta_session` cookie for auth
// (same-origin when served from FastAPI at /app; via Vite proxy in dev).

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function extractDetail(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e === "object" && "msg" in e ? (e as { msg: string }).msg : JSON.stringify(e)))
      .join("; ");
  }
  return `Request failed (${status})`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  let url = path;
  if (method === "GET") {
    url += (url.includes("?") ? "&" : "?") + "_t=" + Date.now();
  }

  // Don't set JSON content-type for FormData bodies (browser sets boundary).
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = isForm
    ? { ...(options.headers as Record<string, string>) }
    : { "Content-Type": "application/json", ...(options.headers as Record<string, string>) };

  const resp = await fetch(url, { credentials: "same-origin", ...options, headers });

  if (resp.status === 401) {
    window.location.href = "/login";
    throw new ApiError("Unauthorized", 401);
  }
  if (resp.status === 204) return null as T;
  if (!resp.ok) {
    const detail = await resp
      .json()
      .then((d) => d?.detail)
      .catch(() => null);
    throw new ApiError(extractDetail(detail, resp.status), resp.status);
  }
  // Some endpoints return empty bodies on success.
  const text = await resp.text();
  return (text ? JSON.parse(text) : null) as T;
}

const body = (b?: unknown) => (b === undefined ? undefined : JSON.stringify(b));

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, b?: unknown) => request<T>(path, { method: "POST", body: body(b) }),
  put: <T>(path: string, b?: unknown) => request<T>(path, { method: "PUT", body: body(b) }),
  patch: <T>(path: string, b?: unknown) => request<T>(path, { method: "PATCH", body: body(b) }),
  delete: <T>(path: string, b?: unknown) => request<T>(path, { method: "DELETE", body: body(b) }),
  /** Multipart upload (FormData). */
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};

/** Trigger a browser download by navigating to a backend file endpoint. */
export function download(path: string) {
  window.location.href = path;
}
