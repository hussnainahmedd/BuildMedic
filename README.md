# BuildMedic

BuildMedic is a planned Frontier Buildathon project for understanding build
health, turning build failures into actionable diagnostics, and giving teams a
clear path from detection to verification.

## Current status

This repository currently contains **repository setup only**. No application
behavior, UI components, APIs, business logic, dependencies, or automated
checks have been implemented or verified yet.

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
- `docs/` — architecture notes, decisions, and future operational guidance.

The intended flow is analyzer → diagnostics → verification, with shared types
between the pipeline and UI. The exact module boundaries and persistence
approach will be defined when implementation begins.

## Declared stack

The planned application stack is:

- Node.js 22
- TypeScript
- React
- Vite
- Vitest

No package manifest or lockfile is present by design; dependency installation
is intentionally deferred until the application scaffold is approved.

## Setup requirements

For this repository-setup phase, Git and a text editor are sufficient. Future
development will require Node.js 22.x, preferably managed with a tool that
honors `.nvmrc`.

There is currently no install, development-server, test, or build command to
run. Those commands will be documented here together with the first
application scaffold.

## Roadmap

1. Establish the application scaffold and dependency policy.
2. Define shared domain types and analyzer input/output contracts.
3. Implement analyzer and diagnostics workflows.
4. Add verification checks and fixture-driven coverage.
5. Build the React/Vite workspace.
6. Add integration coverage, packaging, and operational documentation.
7. Finalize CI, Docker, and deployment workflows.

## Future local, Docker, and CI setup

These are planned steps, not currently available commands or verified checks.

### Local development (planned)

1. Select Node.js 22 using `.nvmrc`.
2. Install dependencies from the committed lockfile once the manifest exists.
3. Start the Vite development server with the documented project script.
4. Run the documented typecheck, unit-test, and production-build scripts.

### Docker (planned)

A future `Dockerfile` will pin a Node.js 22 base image, install from the
committed lockfile, build the application, and define the production runtime.
The image build and run commands will be added here when that artifact exists.

### CI (planned)

The repository already contains a future-check workflow at
`.github/workflows/ci.yml`. It targets a Linux runner with Node.js 22 and will
install from the lockfile, run the project test/build scripts, and verify the
Docker image once those artifacts exist. Until then, the workflow reports the
checks as skipped; no current CI result is being claimed.

### Deployment (planned)

Deployment targets, environment configuration, secrets handling, and release
promotion will be documented after the runtime and hosting model are selected.
