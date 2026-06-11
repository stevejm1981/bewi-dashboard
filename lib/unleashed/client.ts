/**
 * Unleashed REST API client.
 *
 * All requests are HMAC-SHA256 signed. The signed value is the query string
 * without the leading "?" (or empty string for non-GET requests with no
 * query params). See the unleashed-api-reference skill for full signing rules.
 *
 * Do not duplicate this client. Every Unleashed call goes through it.
 *
 * Notes:
 * - cache: 'no-store' is required. Next.js App Router caches outbound
 *   fetch() GET responses by default, which caused the dashboard to serve
 *   stale Unleashed data on Vercel while local scripts saw fresh data.
 * - Transient errors (rate limiting, occasional 4xx/5xx under load) are
 *   retried up to 3 times with backoff. Pages are paced with a short delay.
 */

import crypto from 'node:crypto';

const BASE_URL = 'https://api.unleashedsoftware.com';

export interface UnleashedClientOptions {
  apiId: string;
  apiKey: string;
}

export interface UnleashedPagination {
  NumberOfItems: number;
  PageSize: number;
  PageNumber: number;
  NumberOfPages: number;
}

export interface UnleashedPagedResponse<T> {
  Pagination: UnleashedPagination;
  Items: T[];
}

export class UnleashedApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
    message: string,
  ) {
    super(message);
    this.name = 'UnleashedApiError';
  }
}

export class UnleashedClient {
  constructor(private readonly options: UnleashedClientOptions) {}

  private computeSignature(queryString: string): string {
    const hmac = crypto.createHmac('sha256', this.options.apiKey);
    hmac.update(queryString, 'utf8');
    return hmac.digest('base64');
  }

  private buildHeaders(queryString: string): HeadersInit {
    return {
      'api-auth-id': this.options.apiId,
      'api-auth-signature': this.computeSignature(queryString),
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
  }

  /**
   * GET request. Signs over the full query string (without leading ?).
   * Pagination uses page number in the URL path: /Endpoint/Page/{n}.
   * Retries transient failures up to 3 times with linear backoff.
   */
  async get<T>(path: string, queryParams: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    const filtered = Object.entries(queryParams)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)] as [string, string]);

    const queryString = new URLSearchParams(filtered).toString();
    const url = queryString ? `${BASE_URL}${path}?${queryString}` : `${BASE_URL}${path}`;

    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(queryString),
        cache: 'no-store',
      });

      if (response.ok) {
        return response.json() as Promise<T>;
      }

      const body = await response.text();
      lastError = new UnleashedApiError(response.status, body, `GET ${path} failed: ${response.status}`);

      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, attempt * 1500));
      }
    }

    throw lastError;
  }

  /**
   * Paged GET. Iterates pages using the /Endpoint/Page/{n} convention.
   * Yields each page so callers can checkpoint between pages.
   * Pages are paced with a short delay to avoid hammering the API.
   */
  async *paged<T>(
    basePath: string,
    queryParams: Record<string, string | number | boolean | undefined> = {},
    options: { pageSize?: number; startPage?: number; maxPages?: number } = {},
  ): AsyncGenerator<{ page: number; totalPages: number; items: T[] }> {
    const pageSize = options.pageSize ?? 200;
    let page = options.startPage ?? 1;
    const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;

    while (true) {
      const path = `${basePath}/Page/${page}`;
      const params = { ...queryParams, pageSize };
      const response = await this.get<UnleashedPagedResponse<T>>(path, params);

      yield {
        page,
        totalPages: response.Pagination.NumberOfPages,
        items: response.Items ?? [],
      };

      if (page >= response.Pagination.NumberOfPages) break;
      await new Promise(r => setTimeout(r, 300));
      page += 1;
      if (page - (options.startPage ?? 1) >= maxPages) break;
    }
  }
}

/**
 * Constructs an Unleashed client from environment variables.
 */
export function unleashedClientFromEnv(): UnleashedClient {
  const apiId = process.env.UNLEASHED_API_ID;
  const apiKey = process.env.UNLEASHED_API_KEY;
  if (!apiId || !apiKey) {
    throw new Error('UNLEASHED_API_ID and UNLEASHED_API_KEY must be set in the environment');
  }
  return new UnleashedClient({ apiId, apiKey });
}
