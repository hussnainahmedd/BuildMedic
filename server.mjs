import { createServer } from "node:http";
import { access, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.join(rootDirectory, "dist");
const indexPath = path.join(distDirectory, "index.html");
const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "4173", 10);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function sendText(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": "text/plain; charset=utf-8",
    ...headers,
  });
  response.end(body);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function safePathname(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url);
  } catch {
    return null;
  }

  if (!pathname.startsWith("/") || pathname.includes("\0")) {
    return null;
  }

  const candidate = path.resolve(distDirectory, `.${pathname}`);
  if (candidate !== distDirectory && !candidate.startsWith(`${distDirectory}${path.sep}`)) {
    return null;
  }
  return candidate;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function serveFile(request, response, filePath) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  const isAsset = filePath.startsWith(path.join(distDirectory, "assets"));
  response.writeHead(200, {
    ...securityHeaders,
    "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
    "Content-Length": fileStats.size,
    "Content-Type": contentTypes.get(extension) || "application/octet-stream",
  });

  if (request.method === "HEAD") {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
  return true;
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, "Bad request");
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed", { Allow: "GET, HEAD" });
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname === "/health") {
    sendJson(response, 200, { service: "buildmedic", status: "ok" });
    return;
  }

  const requestedPath = safePathname(requestUrl.pathname);
  if (!requestedPath) {
    sendText(response, 400, "Bad request");
    return;
  }

  try {
    if (await fileExists(requestedPath) && await serveFile(request, response, requestedPath)) {
      return;
    }

    if (await serveFile(request, response, indexPath)) {
      return;
    }
    sendText(response, 404, "BuildMedic production assets are missing");
  } catch (error) {
    console.error("Static server error", error instanceof Error ? error.message : "unknown error");
    if (!response.headersSent) {
      sendText(response, 500, "Internal server error");
    } else {
      response.destroy();
    }
  }
});

server.listen(port, host, () => {
  console.log(`BuildMedic listening on http://${host}:${port}`);
});
