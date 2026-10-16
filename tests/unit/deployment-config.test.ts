// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";

type Route = {
  src?: string;
  dest?: string;
  headers?: Record<string, string>;
  methods?: string[];
  continue?: boolean;
  status?: number;
  handle?: "filesystem";
};

const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  $schema: string;
  framework: string;
  buildCommand: string;
  installCommand: string;
  outputDirectory: string;
  routes: Route[];
};
const appSource = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");
const reactRoutes = [...new Set([...appSource.matchAll(/\bcase "(\/[^"]*)":/g)].map((match) => match[1]))];
const files = new Set(["/index.html", "/assets/analysis.worker-hash.js", "/assets/app-hash.css", "/manifest"]);

// Model only the documented primitives used here: headers + continue in the
// initial phase, a filesystem hit/miss, then terminal fallback/status routes.
// This is an offline configuration regression check, not Vercel edge emulation.
function resolveRequest(url: string, method = "GET") {
  const pathname = new URL(url, "https://buildmedic.example").pathname;
  const headers: Record<string, string> = {};
  for (const route of config.routes) {
    if (route.handle === "filesystem") {
      const file = pathname === "/" ? "/index.html" : pathname;
      if (files.has(file)) return { status: 200, file, headers };
      continue;
    }
    if (route.methods && !route.methods.includes(method)) continue;
    if (!new RegExp(route.src!).test(pathname)) continue;
    Object.assign(headers, route.headers);
    if (route.continue) continue;
    const file = route.dest ?? null;
    return { status: route.status ?? (file && files.has(file) ? 200 : 404), file, headers };
  }
  return { status: 404, file: null, headers };
}

it("uses supported Vercel route primitives without incompatible routing properties", () => {
  expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
  expect(config.framework).toBe("vite");
  expect(config.buildCommand).toBe("npm run build");
  expect(config.installCommand).toBe("npm ci");
  expect(config.outputDirectory).toBe("dist");
  // routes cannot be combined with these higher-level routing properties.
  for (const name of ["headers", "rewrites", "redirects", "cleanUrls", "trailingSlash"]) {
    expect(config).not.toHaveProperty(name);
  }
  for (const route of config.routes) {
    if (route.handle) {
      expect(route).toEqual({ handle: "filesystem" });
    } else {
      expect(typeof route.src).toBe("string");
      expect(() => new RegExp(route.src!)).not.toThrow();
      expect(Object.keys(route).every((key) => ["src", "dest", "headers", "methods", "continue", "status"].includes(key))).toBe(true);
    }
  }
  expect(config.routes[0].continue).toBe(true);
  expect(config.routes[0].headers).toHaveProperty("Content-Security-Policy");
  expect(config.routes.findIndex((route) => route.handle === "filesystem"))
    .toBeLessThan(config.routes.findIndex((route) => route.dest === "/index.html"));
});

it("serves every React route, /app aliases, trailing slashes, and unknown extensionless routes", () => {
  expect(reactRoutes).toContain("/app");
  expect(reactRoutes).toContain("/app/help");
  expect(reactRoutes).toContain("/security");
  const paths = [...reactRoutes, "/unknown", "/app/unknown", "/nested/unknown/page", "/assets-other/unknown"];
  for (const pathname of paths) {
    for (const suffix of pathname === "/" ? [""] : ["", "/"]) {
      for (const method of ["GET", "HEAD"]) {
        const result = resolveRequest(`${pathname}${suffix}?direct=1`, method);
        expect(result.status, `${method} ${pathname}${suffix}`).toBe(200);
        expect(result.file).toBe("/index.html");
        expect(result.headers).toEqual(config.routes[0].headers);
      }
    }
  }
});

it("checks real filesystem assets before fallback and keeps security headers on hits", () => {
  for (const file of files) {
    const result = resolveRequest(file);
    expect(result.status).toBe(200);
    expect(result.file).toBe(file);
    expect(result.headers).toEqual(config.routes[0].headers);
  }
});

it("does not return the React document for asset misses or write requests", () => {
  for (const pathname of [
    "/assets", "/assets/", "/assets/missing", "/assets/missing/", "/assets/missing-worker.js",
    "/missing.js", "/missing.mjs", "/missing.css", "/favicon.ico", "/missing.js/", "/app/missing.json",
    "/.env", "/.well-known/missing", "/nested/file.js/child", "/missing%2ejs", "/assets%2fmissing",
    "/%61ssets/missing",
  ]) {
    for (const method of ["GET", "HEAD"]) {
      const result = resolveRequest(pathname, method);
      expect(result.status, `${method} ${pathname}`).toBe(404);
      expect(result.file).not.toBe("/index.html");
      expect(result.headers).toEqual(config.routes[0].headers);
    }
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    expect(resolveRequest("/app/new-analysis", method).file).not.toBe("/index.html");
  }
});

it("retains a strict same-origin CSP and aligned browser security controls without blocking downloads", () => {
  const headers = config.routes[0].headers!;
  expect(headers).toEqual({
    "Content-Security-Policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; style-src-attr 'unsafe-hashes' 'sha256-3oFxofzq3N//6J8H86e9ul4WT2OkJrtonB66gn/TLJw='",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  const csp = headers["Content-Security-Policy"];
  expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:|\*/);
  expect(csp).toContain("worker-src 'self'");
  const nativeSelectHash = createHash("sha256").update("text-overflow:inherit").digest("base64");
  expect(csp.split("; ").find((directive) => directive.startsWith("style-src-attr ")))
    .toBe(`style-src-attr 'unsafe-hashes' 'sha256-${nativeSelectHash}'`);
  // Export is a blob-backed <a download>, not a script/worker/fetch permission.
  // Do not add sandbox/navigation or clipboard restrictions that disable it.
  expect(csp).not.toMatch(/sandbox|navigate-to/);
  expect(headers["Permissions-Policy"]).not.toContain("clipboard-write=()");
});
