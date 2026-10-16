# BuildMedic

BuildMedic is an offline-first, browser-based developer tool for turning Node.js
build failures into actionable diagnostics. It is being developed for the
OmniRush Frontier Buildathon 2026 in the Developer Tools & Open Source track.
The MVP keeps log analysis local and does not require an external AI
API, account, or backend service.

## Current status

BuildMedic now has a working **offline-first local MVP**. The responsive public
site and premium BuildMedic Lab workspace are connected to a deterministic
TypeScript analyzer that runs in a local module Web Worker. The engine normalizes Node.js
build logs, recognizes common npm/pnpm/yarn failure families, ranks and
deduplicates evidence-backed findings, redacts common secret-shaped values for
display, and returns explicit invalid/no-match/partial states.

The workspace supports paste, text-file upload, drag and drop, real analysis,
search/filter/sort, evidence highlighting, sanitized copy/export, metadata-only
local history, and before/after comparison with resolved, persistent, new, and
uncertain transitions. It never executes commands or sends log text to a
backend. The synthetic example input remains explicitly labeled and is only an
input convenience.

Final QA locally verified Node.js 22.22.3, typecheck, lint, **180 Vitest tests**,
production build/HTTP smoke, and **42 Playwright scenarios** across Chromium,
Firefox and WebKit. The real production worker, upload/drop, comparison,
history/export, failure recovery and 320–1440 px layouts were exercised.
Automated axe checks cover dark/light populated surfaces and mobile navigation;
they do not certify screen-reader usability or full WCAG conformance.
`npm audit --audit-level=high` reported zero vulnerabilities. Docker is unavailable
on this Windows machine; Linux CI builds and tests the non-root production
container, including real browsers. See the [release QA report](docs/QA-RELEASE.md),
[testing](docs/TESTING.md), and [measured performance/limitations](docs/PERFORMANCE.md).

## Implemented MVP capabilities

- Deterministic browser-safe analysis for TypeScript diagnostics, missing
  modules, dependency/peer conflicts, lockfile mismatches, missing package
  scripts, missing CLIs, filesystem/permission errors, registry/network errors,
  node-gyp/native builds, and memory/resource signals.
- Stable rule/signature identities, evidence line numbers, confidence and
  severity, causal ranking, duplicate consolidation, bounded work, and honest
  unsupported/ambiguous outcomes.
- Redaction of common bearer/basic credentials, tokens, key/value secrets,
  private-key blocks, URL credentials, and query values in display/export paths.
  Pattern redaction is not perfect secret detection.
- Real frontend analysis, no-match, invalid, loading, error, empty, search,
  severity-filter, sorting, evidence, history, report, and verification states.
- Local metadata history in browser storage; raw logs and findings are not
  persisted. History uses generic labels/random IDs, never filenames or
  log-derived fingerprints, and is schema-whitelisted and bounded to 24 entries.
- Cancellable worker processing with stale-result rejection and a 30-second
  timeout; worker-unavailable fallback accepts only 64 KiB combined input.
- Visible large-log warning from 5 MiB; maximum-size inputs can still cause
  noticeable UI pauses and significant memory use, especially on smaller devices.
- Whole-log sanitized viewer with 200-line pages and bounded, disclosed copy;
  session-only cache limited to four results/25 MiB of aggregate raw log input
  (not a total browser-memory cap).
- Multi-stage Dockerfile, non-root static server, health endpoint, pinned Node
  runtime, committed lockfile, and Linux CI workflow.

Hosted APIs, authentication, database persistence, external AI integrations,
automatic remediation, unrestricted shell execution, and arbitrary build-tool
diagnosis remain out of scope for this local MVP.

## Intended architecture

The source layout separates responsibilities so the analysis pipeline can evolve
independently from its presentation layer:

- `src/analyzer/` — build inspection and analysis orchestration.
- `src/diagnostics/` — finding classification, explanations, and reporting.
- `src/verification/` — checks that confirm whether a build issue was resolved.
- `src/components/`, `src/pages/`, and `src/styles.css` — the implemented React
  presentation layer and design system.
- `src/types/` — shared TypeScript contracts and domain types.
- `src/workers/` — validated local task protocol, runtime, and module worker.
- `src/lib/` — worker client, input validation, private history/cache, and reports.
- `tests/unit/` — focused tests for individual modules.
- `tests/fixtures/` — small, repeatable build inputs and expected outcomes.
- `docs/` — product, architecture, security, quality, and delivery guidance.

The live engine flow is analyzer → diagnostics → verification, with shared types
between the pure pipeline and UI. React owns transient input/loading state and
metadata history; the domain modules do not read files, spawn processes, or
make network requests.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Performance](docs/PERFORMANCE.md)
- [Validation and accessibility](docs/VALIDATION.md)
- [Testing strategy](docs/TESTING.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [API and interfaces](docs/API.md)
- [Changelog](CHANGELOG.md)
- [Final QA and release readiness](docs/QA-RELEASE.md)

## Declared stack

The application stack is:

- Node.js 22.22.3 (exact `.nvmrc` and Docker image version)
- TypeScript
- React
- Vite
- Vitest

Dependencies are declared in `package.json` and pinned in `package-lock.json`.
The frontend intentionally avoids a component framework and motion dependency;
its design system uses reusable React components, CSS transitions, and reduced-
motion support.

## Setup requirements

Development requires Node.js 22.22.3, preferably managed with a tool that honors
`.nvmrc`, plus npm bundled with Node.js.

```text
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
npm run start
```

The Vite development server is the recommended way to preview the frontend.
For a production-style local run, execute `npm run build` followed by
`npm run start` and open `http://127.0.0.1:4173`. The `/health` endpoint returns
the server readiness status. `npm test` is the single offline test command and
does not make external network requests (server tests bind only loopback).
Dependency installation needs registry access or an already-populated npm cache;
offline-first describes local analysis, not first-time package installation.
`npm run benchmark` runs the separate synthetic timing suite.
`npm run benchmark:browser` measures the real Chromium worker/UI (three samples
per size, not a robust p95 or total-memory measurement).

### Real-browser checks

On Windows/macOS with supported browser prerequisites:

```sh
npm run browser:install -- --no-shell chromium firefox webkit
npm run build
npm run test:e2e
npm run benchmark:browser
```

Browser binaries remain in `.cache/ms-playwright/`; nothing is installed globally.
First-time browser downloads need network access. Browser tests then use only
loopback/synthetic data and the production server on port `4183`. They refuse
to reuse an unrelated running server. Results/screenshots are in
`.cache/browser-results/`; performance JSON is in `.cache/browser-performance/`.
On clean Linux, use the QA Docker target below to install browser system
dependencies inside the image rather than modifying the host with sudo.

## Environment

The offline-first MVP has no required environment variables. `.env.example`
documents this explicitly. Optional `HOST` and `PORT` process variables are
available to the production static server; do not put secrets in client-visible
Vite variables.

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for phased milestones, priorities,
exit criteria, and explicitly deferred opportunities.

## Local, Docker, and CI setup

Local frontend commands are available and verified as described above. Docker
image verification is delegated to Linux CI.

### Local development

1. Select Node.js 22.22.3 using `.nvmrc` (`nvm install && nvm use` on Linux with nvm).
2. Install dependencies with `npm ci`.
3. Start the Vite development server with `npm run dev`.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run smoke`.

### Docker

`Dockerfile` is a multi-stage Node.js 22.22.3 build/runtime image. It installs from
the committed lockfile, builds the Vite output, runs the static server as a
non-root user, exposes port `4173`, and includes a container health check.
Docker is unavailable on the local Windows machine; Linux CI builds the image,
starts it, checks `/health`, and tests actual worker delivery and security headers. Run:

```sh
docker build --pull -t buildmedic:local .
docker run --rm --name buildmedic-local -p 4173:4173 buildmedic:local
```

Open `http://127.0.0.1:4173`; stop the foreground container with Ctrl+C. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

The optional browser QA target is separate from the minimal non-root runtime:

```sh
docker build --target browser-qa -t buildmedic:qa .
docker run --rm --shm-size=1g buildmedic:qa
```

This starts its own production server inside the QA container and runs the
three-engine suite. CI instead points the QA image at the separate production
container, preserving screenshots as an Actions artifact. The default Docker
target remains the production runtime, without browser/test dependencies.

### CI

The repository contains a Linux CI workflow at
`.github/workflows/ci.yml`. It targets Ubuntu 24.04 with the exact `.nvmrc` runtime,
installs from the lockfile, runs test/typecheck/lint/build/audit/benchmark scripts,
builds the Docker images, starts the non-root production container, and runs HTTP
smoke plus Chromium/Firefox/WebKit checks against it. Synthetic screenshots and
failure traces are retained for 14 days. Any missing file or failing assertion
fails the workflow. Current revision receipts are in `docs/QA-RELEASE.md`.

Final QA source `efaa547` passed
[Linux/container/browser CI 38914960876](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38914960876),
including all 42 production-browser scenarios with zero skipped/flaky cases.

Hardening code `4ae575e` (included in `3f8318f`) passed
[Linux/Docker CI run 38897847991](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38897847991).
This historical run verified build and HTTP delivery only; it predates browser QA.

### Deployment

The MVP can be deployed as static assets or with the included production
server/container. Keep HTTPS, restrictive headers, and the documented no-secret
client boundary in the selected host. A hosted service is not required for
analysis.
