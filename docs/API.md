# BuildMedic API and Interfaces

**Status:** The MVP has **no backend API**. This document prevents accidental
assumptions that a server, account, or external AI provider is required.

## 1. MVP boundary

BuildMedic is a browser application. The user supplies text or a local file;
the browser validates and analyzes it; the browser renders the result. There
are no analysis HTTP endpoints, authentication flows, database calls, or webhook
contracts. Serving application assets and `/health` does not transmit log input.

The browser's internal modules are interfaces in the software-design sense,
not public APIs. They should exchange typed, serializable values and remain
independent from React where practical.

## 2. Implemented internal interfaces

The browser-facing domain modules expose these pure, serializable interfaces.
Exact TypeScript contracts and options live in `src/types/` and the referenced
source modules:

```text
normalizeLogText(inputText) -> NormalizedLog
analyzeLog(input, options?) -> AnalysisResult
compareAnalysisResults(baselineResult, rerunResult, options?) -> VerificationResult
redactSensitiveLog(text) -> RedactedText
```

Required properties:

- functions do not execute commands or make network requests;
- invalid input is represented explicitly rather than thrown as an opaque UI
  error;
- results include rule/catalog identity and evidence references;
- output is serializable for testing, copying, and the implemented module worker;
- the API does not leak raw logs into telemetry or exception messages.

## 3. Local worker transport

`LocalTaskClient.request(kind, input, { signal?, timeoutMs? })` wraps the pure
domain functions. Version-1 typed requests/responses in `src/workers/protocol.ts`
cover `analyze`, `compare`, `inspect`, `viewer-prepare`, `viewer-page`, and
`viewer-copy`. Requests are structurally validated; responses are checked before
resolving a matching request ID. These are local messages, not network APIs.

The client allows at most two pending requests and a maximum 30-second timeout.
Abort, timeout, and worker failure terminate the worker and reject pending work;
stale responses cannot complete a new request. Errors use fixed public messages,
not exception payloads. Without Web Worker support, only 64 KiB combined input
may use the small asynchronous main-thread fallback. A synchronous fallback
cannot be interrupted mid-execution; its size restriction is intentional.

Viewer preparation redacts the whole log before retaining sanitized lines.
Search/page requests reuse that representation, returning at most 200 lines.
Copy and line limits are disclosed rather than silently returning the full log.

## 4. Possible future hosted API

A hosted or CI-integrated mode is not part of the MVP. It would require a new
product and security review before any endpoint is implemented. If justified,
the future design would need to specify:

- authentication, authorization, and tenant isolation;
- maximum request size and rate limits;
- retention, deletion, and redaction guarantees;
- versioned request/response schemas;
- error and partial-analysis semantics;
- audit logging without storing raw secrets; and
- whether an AI provider is optional, isolated, and disclosed.

No URL, endpoint, token, or server contract should be inferred from this
document. The optional static production server only serves the built browser
assets and `/health`; it is not an analysis API.
