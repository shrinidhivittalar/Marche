import base from "@marche/config/eslint/base";

export default [
  // Jest's own CommonJS config and setup files, which the TypeScript/ESM
  // rules below do not apply to.
  { ignores: ["dist", "jest.*.js"] },
  ...base,
];
