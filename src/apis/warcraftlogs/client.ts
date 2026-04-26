import { getAccessToken } from './auth.js';

const API_URL = 'https://www.warcraftlogs.com/api/v2/client';
const RETRY_DELAY_MS = 1000;

export interface GraphQLError {
  message: string;
  path?: ReadonlyArray<string | number>;
  extensions?: Record<string, unknown>;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

/**
 * POSTs a GraphQL query to the Warcraft Logs v2 client endpoint and
 * returns the parsed `data` field. Throws on transport errors,
 * non-2xx responses, or any returned `errors[]` (caller can wrap if
 * partial-data tolerance is wanted).
 *
 * Single retry on 429 after 1s. WCL has a points-based rate limit;
 * if we routinely hit it the call site should batch via batched
 * GraphQL queries rather than firing many small ones.
 */
export async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const token = await getAccessToken();
  const body = JSON.stringify({ query, variables });
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Warcraft Logs API ${res.status}: ${text}`);
    }
    const json = (await res.json()) as GraphQLResponse<T>;
    if (json.errors && json.errors.length > 0) {
      throw new Error(
        `Warcraft Logs GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`,
      );
    }
    if (json.data === undefined) {
      throw new Error('Warcraft Logs returned no data');
    }
    return json.data;
  }
  throw new Error('Warcraft Logs API rate-limited after retry');
}
