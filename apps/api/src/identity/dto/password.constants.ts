// Requires at least one lowercase letter, one uppercase letter, and one digit.
// Special characters are intentionally not required — the added friction isn't
// worth it for this app's risk profile.
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
export const PASSWORD_PATTERN_MESSAGE =
  'Password must contain at least one lowercase letter, one uppercase letter, and one digit';
