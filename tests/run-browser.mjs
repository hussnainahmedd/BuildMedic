import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Keep downloaded browser binaries inside the project on every platform. No
// global install, external browser profile, or running desktop app is involved.
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: fileURLToPath(new URL("../.cache/ms-playwright", import.meta.url)) },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
