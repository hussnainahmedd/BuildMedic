# BuildMedic

BuildMedic is an offline-first, browser-based developer tool for turning Node.js
build failures into actionable diagnostics. It is being developed for the
OmniRush Frontier Buildathon 2026 in the Developer Tools & Open Source track.
The planned MVP keeps log analysis local and does not require an external AI
API, account, or backend service.

## Current status

The repository now contains a working **frontend demo milestone**: a responsive
public site, BuildMedic Lab workspace, local input validation, sample log
interactions, evidence viewer, simulated verification, settings, reports, and
help surfaces. Demo content is explicitly labeled.

The real diagnostic engine, backend services, authentication, external AI
integrations, and persistence are not implemented in this phase. A multi-stage
Dockerfile and built-in static production server are now included; Docker is
verified in Linux CI because it is unavailable on the Windows development
machine.

Verified locally with Node.js 22: lockfile installation, typecheck, lint, 18
Vitest tests, and the production build. Docker is not run locally.

## Planned features

The following capabilities are implemented as frontend flows or labeled demo
surfaces:

- Responsive public website and workspace navigation.
- Paste/upload form with required, MIME, and size validation.
- Local sample log loading, search, filtering, evidence expansion, copy, and
  report download interactions.
- Theme, motion, density, and display preferences stored without raw logs.
- Simulated analysis and verification results clearly separated from live logic.

The following capabilities remain planned and are not live yet:

- Analyze build inputs, outputs, and metadata.
- Normalize build failures into useful diagnostic findings.
- Verify proposed fixes and report verification evidence.
- Connect the React workspace to the real diagnostic engine.
- Define shared TypeScript types for analyzers, diagnostics, and verification
  results.
- Support fixture-driven and unit-level validation of the core workflows.
- Keep user logs in the browser and treat all log content as untrusted text.

## Intended architecture

The future source layout separates responsibilities so the analysis pipeline
can evolve independently from its presentation layer:

- `src/analyzer/` — build inspection and analysis orchestration.
- `src/diagnostics/` — finding classification, explanations, and reporting.
- `src/verification/` — checks that confirm whether a build issue was resolved.
- `src/components/`, `src/pages/`, and `src/styles.css` — the implemented React
  presentation layer and design system.
- `src/types/` — shared TypeScript contracts and domain types.
- `tests/unit/` — focused tests for individual modules.
- `tests/fixtures/` — small, repeatable build inputs and expected outcomes.
- `docs/` — product, architecture, security, quality, and delivery guidance.

The intended engine flow is analyzer → diagnostics → verification, with shared
types between the pipeline and UI. The current frontend uses typed fixture data
at that seam; no live analyzer is connected.

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
- [API and future interfaces](docs/API.md)
- [Changelog](CHANGELOG.md)

## Declared stack

The application stack is:

- Node.js 22
- TypeScript
- React
- Vite
- Vitest

Dependencies are declared in `package.json` and pinned in `package-lock.json`.
The frontend intentionally avoids a component framework and motion dependency;
its design system uses reusable React components, CSS transitions, and reduced-
motion support.

## Setup requirements

Development requires Node.js 22.x, preferably managed with a tool that honors
`.nvmrc`, plus npm bundled with Node.js.

```text
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run start
```

The Vite development server is the recommended way to preview the frontend.
For a production-style local run, execute `npm run build` followed by
`npm run start` and open `http://127.0.0.1:4173`. The `/health` endpoint returns
the server readiness status. `npm test` is the single offline test command and
does not make network requests.

## Environment

The offline-first MVP has no required environment variables. `.env.example`
documents this explicitly. Optional `HOST` and `PORT` process variables are
available to the production static server; do not put secrets in client-visible
Vite variables.

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for phased milestones, priorities,
exit criteria, and explicitly deferred opportunities.

## Future local, Docker, and CI setup

Local frontend commands are available and verified as described above. Docker
image verification is delegated to Linux CI.

### Local development

1. Select Node.js 22 using `.nvmrc`.
2. Install dependencies with `npm ci`.
3. Start the Vite development server with `npm run dev`.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

### Docker

`Dockerfile` is a multi-stage Node.js 22 build/runtime image. It installs from
the committed lockfile, builds the Vite output, runs the static server as a
non-root user, exposes port `4173`, and includes a container health check.
Docker is unavailable on the local Windows machine; Linux CI builds the image,
starts it, checks `/health`, and smoke-tests the rendered homepage. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### CI

The repository contains a Linux CI workflow at
`.github/workflows/ci.yml`. It targets a Linux runner with Node.js 22, installs
from the lockfile, runs test/lint/build scripts, builds the Docker image, starts
the container, checks `/health`, and smoke-tests the homepage. Any missing file
or failing command fails the workflow.

### Deployment (planned)

Deployment targets, environment configuration, secrets handling, and release
promotion will be documented after the runtime and hosting model are selected.
