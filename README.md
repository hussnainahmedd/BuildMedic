# BuildMedic

BuildMedic is an offline-first, browser-based developer tool for turning Node.js
build failures into actionable diagnostics. It is being developed for the
OmniRush Frontier Buildathon 2026 in the Developer Tools & Open Source track.
The planned MVP keeps log analysis local and does not require an external AI
API, account, or backend service.

## Current status

This repository currently contains **structure and documentation only**. No
application behavior, UI components, APIs, business logic, dependencies,
automated checks, Docker image, or deployment has been implemented or verified
yet.

## Planned features

The following capabilities are planned and are not implemented in this setup
phase:

- Analyze build inputs, outputs, and metadata.
- Normalize build failures into useful diagnostic findings.
- Verify proposed fixes and report verification evidence.
- Provide a React-based workspace for exploring findings and build history.
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
- `src/ui/` — the planned React application and presentation components.
- `src/types/` — shared TypeScript contracts and domain types.
- `tests/unit/` — focused tests for individual modules.
- `tests/fixtures/` — small, repeatable build inputs and expected outcomes.
- `docs/` — product, architecture, security, quality, and delivery guidance.

The intended flow is analyzer → diagnostics → verification, with shared types
between the pipeline and UI. The exact module boundaries and persistence
approach will be defined when implementation begins.

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

The planned application stack is:

- Node.js 22
- TypeScript
- React
- Vite
- Vitest

No package manifest or lockfile is present by design in this documentation-only
phase. Dependency installation is intentionally deferred until the application
scaffold is approved; the lockfile must be generated and committed before
implementation is considered reproducible.

## Setup requirements

For this repository-setup phase, Git and a text editor are sufficient. Future
development will require Node.js 22.x, preferably managed with a tool that
honors `.nvmrc`, plus npm bundled with Node.js.

There is currently no install, development-server, test, or build command to
run. Those commands will be documented here together with the first
application scaffold.

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for phased milestones, priorities,
exit criteria, and explicitly deferred opportunities.

## Future local, Docker, and CI setup

These are planned steps, not currently available commands or verified checks.

### Local development (planned)

1. Select Node.js 22 using `.nvmrc`.
2. Install dependencies from the committed lockfile once the manifest exists.
3. Start the Vite development server with the documented project script.
4. Run the documented typecheck, unit-test, and production-build scripts.

### Docker (planned)

A future multi-stage `Dockerfile` will pin a Node.js 22 base image, install from
the committed lockfile, build the application, and define a minimal production
runtime. Docker is unavailable on the local Windows machine; Linux CI will
verify the image after the implementation artifacts exist. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### CI (planned)

The repository already contains a future-check workflow at
`.github/workflows/ci.yml`. It targets a Linux runner with Node.js 22 and will
install from the lockfile, run the project test/build scripts, and verify the
Docker image once those artifacts exist. Until then, the workflow reports the
checks as skipped; no current CI result is being claimed.

### Deployment (planned)

Deployment targets, environment configuration, secrets handling, and release
promotion will be documented after the runtime and hosting model are selected.
