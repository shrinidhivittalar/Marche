import { useEffect, useRef } from 'react';

const DEFAULT_INTERVAL_MS = 4000;

/**
 * Re-runs `refetch` on an interval while `enabled` is true. Same interval
 * MessagesPage already polls its thread and conversation previews at —
 * pulled out here now that a second and third caller need the identical
 * effect (payment status, the notifications badge).
 *
 * `refetch` must be referentially stable (useApiResource's is) — an
 * unstable one would tear the interval down and rebuild it every render
 * instead of every `intervalMs`.
 *
 * Skips a tick while the previous call is still in flight. Without this, a
 * request slower than `intervalMs` (routine on this dev setup) means every
 * tick starts before the last one resolves — useApiResource's generation
 * counter then discards every single response forever, including a caller's
 * own post-mutation refetch, since a newer tick always starts first.
 */
export function usePolling(
  refetch: () => Promise<void>,
  enabled: boolean,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): void {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (inFlight.current) return;
      inFlight.current = true;
      void refetch().finally(() => {
        inFlight.current = false;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, refetch, intervalMs]);
}
