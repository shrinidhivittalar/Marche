// Requires at least one lowercase letter, one uppercase letter, and one digit.
// Special characters are intentionally not required — the added friction isn't
// worth it for this app's risk profile.
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
export const PASSWORD_PATTERN_MESSAGE =
  'Password must contain at least one lowercase letter, one uppercase letter, and one digit';

// Defense-in-depth, not a load-bearing mitigation: argon2id's cost is
// dominated by its fixed memory/time parameters, not input length, so an
// unbounded password field isn't a usable DoS on its own (SECURITY_AUDIT.md
// finding #2). Bounding it anyway is free and closes the hygiene gap.
export const PASSWORD_MAX_LENGTH = 128;
