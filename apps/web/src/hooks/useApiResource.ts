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
  // Mirrors `data`, read synchronously inside `load` — state updates aren't
  // visible until the next render, so a background poll firing mid-render
  // needs a way to know "is something already on screen" that isn't stale.
  const dataRef = useRef<T | null>(null);

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
    // Only shows the loading state when nothing is displayed yet for the
    // current resource. usePolling calls this every 4s app-wide (connection
    // status, payments, message previews, notifications) — without this
    // guard, every poll tick flips `loading` true then false again, and any
    // page that renders a skeleton while loading (most do) flickers the
    // entire screen back to that skeleton on every single tick. Navigating
    // to a genuinely different resource still shows loading as normal — the
    // effect below resets dataRef whenever `deps` changes, before this runs.
    if (dataRef.current === null) setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (generation.current !== current) return;
      dataRef.current = result;
      setData(result);
    } catch (err) {
      if (generation.current !== current) return;
      setError(toMessage(err));
      // Keep whatever data is already displayed — a transient refetch/poll
      // failure (rate limit hiccup, dropped connection) must not blank a
      // screen that was showing real data a moment ago. A caller with
      // nothing loaded yet already has data === null, so this only changes
      // behavior for the refetch case.
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
    //
    // dataRef/data reset here, not inside `load` — this effect only re-runs
    // when `deps` actually changes (a genuinely different resource), while
    // `load` also gets called directly by a same-resource background poll
    // (usePolling), which must NOT reset anything or every poll would be
    // back to showing loading again, undoing the point of the guard above.
    dataRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
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
    setData((current) => {
      if (current === null) return null;
      const next = update(current);
      dataRef.current = next;
      return next;
    });
  }, []);

  return { data, loading: enabled && loading, error, refetch: load, mutate };
}
