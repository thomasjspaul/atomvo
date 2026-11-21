export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: { error?: string; detail?: string } | null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // An HTML page instead of JSON: Cloudflare's timeout/error page, or a login redirect.
    const why =
      res.status === 524 || res.status === 504
        ? "The server took too long to answer. Try again in a minute."
        : res.ok
          ? "Unexpected response from the server — try reloading the app."
          : `Server error (HTTP ${res.status}).`;
    throw new ApiError(res.status, why);
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || data?.detail || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => fetch(path, { credentials: "same-origin" }).then((r) => handle<T>(r)),
  post: <T>(path: string, body?: unknown) =>
    fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  patch: <T>(path: string, body: unknown) =>
    fetch(path, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  put: <T>(path: string, body: unknown) =>
    fetch(path, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  del: <T>(path: string) =>
    fetch(path, { method: "DELETE", credentials: "same-origin" }).then((r) => handle<T>(r)),
  postForm: <T>(path: string, form: FormData) =>
    fetch(path, { method: "POST", credentials: "same-origin", body: form }).then((r) => handle<T>(r)),
};
