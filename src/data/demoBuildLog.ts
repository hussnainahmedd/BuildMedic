import type { DemoBuildLog } from "../types";

/**
 * Demonstration-only fixture. It is synthetic and contains no user, repository,
 * credential, or private filesystem data.
 */
export const DEMO_NODE_BUILD_LOG: DemoBuildLog = {
  isDemo: true,
  id: "demo-node-typescript-build-failure",
  label: "Sanitized Node.js TypeScript build failure",
  description: "A small synthetic npm build log showing a type mismatch and its lifecycle summary.",
  fileName: "sanitized-node-build.log",
  mimeType: "text/plain",
  sanitizationNote:
    "Demonstration-only content: package names, source paths, and values are intentionally generic.",
  text: [
    "$ node --version",
    "v22.14.0",
    "$ npm run build",
    "> demo-package@0.0.0 build",
    "> tsc --noEmit",
    "",
    "src/formatters/report.ts:18:9 - error TS2322: Type 'string | undefined' is not assignable to type 'string'.",
    "18   return formatLabel(config.label);",
    "           ~~~~~~~~~~~~~~~~~~~~~~~~~",
    "",
    "Found 1 error in src/formatters/report.ts:18",
    "npm error Lifecycle script \"build\" failed with error:",
    "npm error code 2",
  ].join("\n"),
};
