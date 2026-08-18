#!/usr/bin/env node
// PreToolUse hook: blocks any Bash `git commit` that would skip husky's
// pre-commit hook (--no-verify / -n, or a gpg-sign bypass slipped in
// alongside it). CLAUDE.md says hooks are never skipped without an explicit
// user ask — this makes that rule unbypassable rather than just remembered.

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0); // Nothing parseable — don't block on our own error.
  }

  const command = payload?.tool_input?.command;
  if (payload?.tool_name !== 'Bash' || typeof command !== 'string') {
    process.exit(0);
  }

  // Split on shell command separators and check each segment on its own —
  // a naive whole-string search would also fire on "git" and "commit"
  // appearing incidentally inside an unrelated command (e.g. a quoted
  // string, or this very hook being tested with a sample payload).
  const segments = command.split(/&&|\|\||[;|\n]/);
  const isGitCommit = (segment) => /^\s*git\s+(-\S+\s+)*commit\b/.test(segment);
  const skipsHooks = (segment) =>
    /(^|\s)(--no-verify|-n)(\s|$)/.test(segment) || /--no-gpg-sign/.test(segment);

  const offendingSegment = segments.find((s) => isGitCommit(s) && skipsHooks(s));
  if (offendingSegment) {
    console.error(
      'Blocked: this git commit skips hooks (--no-verify/-n or --no-gpg-sign). ' +
        "Husky's pre-commit (lint-staged, lint, typecheck) must run on every commit — " +
        'only the user can authorize skipping it.',
    );
    process.exit(2); // Exit 2 blocks the tool call and returns the message to Claude.
  }

  process.exit(0);
});
