import base from "@marche/config/eslint/base";

export default [
  { ignores: ["dist"] },
  ...base,
  // The maintenance scripts are Node programs, not library code — they read
  // the environment and report to the console. Declared rather than ignored
  // so they stay linted.
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
];
