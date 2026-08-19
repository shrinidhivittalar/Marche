import { useEffect } from 'react';

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
 */
export function usePolling(
  refetch: () => Promise<void>,
  enabled: boolean,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): void {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => void refetch(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, refetch, intervalMs]);
}
