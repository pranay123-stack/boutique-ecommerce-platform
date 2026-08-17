/**
 * Typed API client.
 *
 * Responsibilities kept deliberately in one place:
 *  - unwrap the `{ success, data, meta }` envelope the API returns
 *  - attach the access token and the guest session id
 *  - transparently refresh an expired access token exactly once, replaying
 *    the original request afterwards
 *  - surface errors as a typed ApiError carrying the server's error code
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/proxy';
const SESSION_KEY = 'boutique.sessionId';
const TOKEN_KEY = 'boutique.accessToken';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = 'REQUEST_ERROR',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: ApiMeta;
}

// --------------------------------------------------------------- token store
// The access token lives in memory first and mirrors to sessionStorage so a
// page refresh does not sign the customer out. The refresh token is httpOnly
// and never visible to JavaScript, which is what limits XSS blast radius.
let accessToken: string | null = null;

export const tokenStore = {
  get(): string | null {
    if (accessToken) return accessToken;
    if (typeof window === 'undefined') return null;
    accessToken = window.sessionStorage.getItem(TOKEN_KEY);
    return accessToken;
  },
  set(token: string | null) {
    accessToken = token;
    if (typeof window === 'undefined') return;
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  },
  clear() {
    this.set(null);
  },
};

/** Stable anonymous id so a guest keeps their cart across visits. */
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  skipRefresh?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

/** Refresh the access token. Concurrent callers share one in-flight request. */
async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const csrf = readCookie('csrfToken');
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;
      const json = await res.json();
      tokenStore.set(json?.data?.accessToken ?? null);
      return Boolean(json?.data?.accessToken);
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, skipRefresh = false, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = tokenStore.get();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }
  if (typeof window !== 'undefined') {
    finalHeaders['X-Session-Id'] = getSessionId();
    const csrf = readCookie('csrfToken');
    if (csrf) finalHeaders['X-CSRF-Token'] = csrf;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  // One transparent retry after refreshing an expired access token.
  if (response.status === 401 && auth && !skipRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, { ...options, skipRefresh: true });
    }
    tokenStore.clear();
  }

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(
      json?.error?.message ?? 'Something went wrong',
      response.status,
      json?.error?.code ?? 'REQUEST_ERROR',
      json?.error?.details,
    );
  }

  // Paginated endpoints return meta alongside data; re-pair them.
  if (json?.meta !== undefined) {
    return { items: json.data, meta: json.meta } as T;
  }
  return json?.data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE', body }),
};

/**
 * Server-side fetch for React Server Components, which cannot reach the
 * browser-relative rewrite and must call the API origin directly.
 */
export async function serverFetch<T>(path: string, revalidate = 60): Promise<T | null> {
  // Two names existed for one concept: this read API_ORIGIN while the
  // rewrites in next.config.mjs and the sitemap read NEXT_PUBLIC_API_ORIGIN.
  // Setting only the latter - the obvious thing to do, since it is the one
  // that appears in the deployment docs - left server-side fetches pointed at
  // localhost, so every ISR page rendered its "catalogue unavailable"
  // fallback while the rest of the site worked. Accept either.
  const origin =
    process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4100';
  try {
    const res = await fetch(`${origin}/api/v1${path}`, {
      next: { revalidate },
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.meta !== undefined ? { items: json.data, meta: json.meta } : json?.data) as T;
  } catch {
    // A dead API must degrade to an empty section, not a 500 page.
    return null;
  }
}
