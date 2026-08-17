import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /**
   * Re-runs the fetch and resolves once the new data is in state.
   * Awaitable on purpose: a caller that shows "Saved" before the refetch
   * lands will briefly claim success while still displaying the old value.
   */
  refetch: () => Promise<void>;
  /**
   * Applies a local update to the held data without a request, for a caller
   * that already knows what the server is about to say — see
   * markApiNotificationRead in AppContext. The next refetch overwrites it,
   * so the caller owes one whether its mutation succeeded or failed.
   */
  mutate: (update: (current: T) => T) => void;
}

// Small fetch-on-mount hook. TanStack Query would be the usual answer, but
// this app has no query client and adding one to wire two modules would be
// a larger change than the wiring itself — so this covers the three things
// actually needed: loading, error, and an awaitable refetch after a
// mutation.
//
// The generation counter guards against a stale response overwriting a
// newer one: filters change fast on a search screen and responses can
// arrive out of order.
export function useApiResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const enabled = options.enabled !== false;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  // Callers define the fetcher inline, so its identity changes every
  // render. Holding it in a ref lets refetch stay stable while always
  // calling the current closure. Written in an effect rather than during
  // render — mutating a ref while rendering is unsafe under concurrent
  // rendering, where a render can be discarded.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const toMessage = (err: unknown) =>
    err instanceof ApiError
      ? err.message
      : "We couldn't reach the server. Check your connection and try again.";

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (generation.current !== current) return;
      setData(result);
    } catch (err) {
      if (generation.current !== current) return;
      setError(toMessage(err));
      setData(null);
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // set-state-in-effect is disabled deliberately here, not worked around.
    // Fetch-on-mount has to flip `loading` to true before awaiting, or the
    // first paint claims the data is ready when the request has not even
    // been sent. Every data-fetching library does this; the rule's concern
    // is state synchronisation loops, which this is not — `load` runs once
    // per dependency change and the generation counter drops stale results.
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    void load();
    // `deps` is the real signal; the fetcher is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  // Derived rather than assigned in the effect. A disabled resource is
  // never loading by definition, so expressing that as a computed value
  // avoids an extra render pass and a setState the effect does not need.
  // Skipped when there is nothing loaded yet: an update derived from data
  // the caller never saw would be a guess, and the fetch in flight is about
  // to supply the real thing anyway.
  const mutate = useCallback((update: (current: T) => T) => {
    setData((current) => (current === null ? null : update(current)));
  }, []);

  return { data, loading: enabled && loading, error, refetch: load, mutate };
}
