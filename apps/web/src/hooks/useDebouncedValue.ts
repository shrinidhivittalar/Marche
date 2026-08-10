import { useEffect, useState } from 'react';

// Holds a value back until it stops changing, so a search box does not fire
// a request per keystroke.
//
// useApiResource already drops out-of-order responses, but that is damage
// control after the fact: without this, typing "photography" sends eleven
// requests and the server does eleven searches to answer one question.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // Cleared on every change, which is what makes it a debounce rather
    // than a throttle: the timer only fires once typing pauses.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
