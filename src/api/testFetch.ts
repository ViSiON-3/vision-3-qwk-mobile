/** Test helper: a scripted fetch that records calls (not a test suite). */
import { FetchInitLike, FetchLike, FetchResponseLike } from './types';

export interface MockResponse {
  status: number;
  json?: unknown;
  text?: string;
  bytes?: Uint8Array;
  headers?: Record<string, string>;
}

export interface RecordedCall {
  url: string;
  init?: FetchInitLike;
}

export function makeResponse(r: MockResponse): FetchResponseLike {
  const headers = new Map(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status: r.status,
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
    arrayBuffer: async () => (r.bytes ? r.bytes.slice().buffer : new ArrayBuffer(0)),
    json: async () => {
      if (r.json === undefined) throw new Error('no json body');
      return r.json;
    },
    text: async () => r.text ?? '',
  };
}

/** A fetch that returns queued responses in order and records each call. */
export function scriptedFetch(responses: MockResponse[]): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let i = 0;
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return makeResponse(r);
  };
  return { fetch, calls };
}
