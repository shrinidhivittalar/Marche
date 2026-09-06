import type { KeyboardEvent } from 'react';

/**
 * Spread onto a `<div>` standing in for a `<button>` (a list/grid row that
 * navigates or opens something) — same fix `packages/ui`'s `Card` already
 * gets automatically when passed `onClick`, for rows that don't use `Card`.
 * Makes the row focusable and keyboard-activatable with Enter/Space,
 * matching real `<button>` semantics for screen-reader and keyboard users.
 */
export function clickableRowProps(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
