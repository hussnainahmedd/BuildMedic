/** Synthetic, sanitized output used by the offline diagnostic-engine tests. */
export const DIAGNOSTIC_FAMILIES_LOG = [
  "$ npm run build",
  "src/report.ts:18:9 - error TS2322: Type 'string | undefined' is not assignable to type 'string'.",
  "18   return formatLabel(config.label);",
  "npm error code ERESOLVE",
  "npm error ERESOLVE unable to resolve dependency tree",
  "npm ci can only install packages when your package.json and package-lock.json are in sync.",
  'npm error Missing script: "build"',
  "npm error code EACCES",
  "npm error code EAI_AGAIN",
  "gyp ERR! configure error",
  "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory",
  "Error: Cannot find module 'example-dependency'",
].join("\n");

export const ANSI_AND_SECRET_LOG = [
  "\u001b[31mnpm error code EAI_AGAIN\u001b[0m token=fixture-secret Authorization: Bearer fixtureBearerToken123",
  "registry request failed for https://user:password@example.invalid/pkg",
].join("\r\n");

export const AMBIGUOUS_AND_SAFE_LOG = [
  "package-lock.json is up to date",
  "node-gyp rebuild",
  'const message = "Cannot find module";',
  "The build completed successfully.",
].join("\r");
