# Changelog

All notable changes to BuildMedic will be documented here. The project is
currently in an unreleased frontend milestone.

## [Unreleased]

### Added

- Documented the BuildMedic product requirements, MVP boundaries, personas, and
  acceptance criteria.
- Documented the planned module boundaries and local browser data flow.
- Added security, privacy, input-sanitization, and dependency-safety guidance.
- Added performance budgets, measurement protocol, and resource-limit policy.
- Added validation, accessibility, testing, roadmap, contribution, deployment,
  and interface documentation.
- Clarified that the MVP has no backend API or required external AI provider.
- Added the React/Vite frontend shell, responsive design system, public product
  pages, and BuildMedic Lab workspace surfaces.
- Added frontend-only input validation, local sample log interactions, evidence
  viewer, simulated verification, history, reports, settings, help, and
  accessible empty/error states.
- Added ESLint configuration and frontend component tests alongside validation
  unit tests.
- Added a multi-stage Node.js 22 Dockerfile, non-root static server, Docker
  health check, `.dockerignore`, and `.env.example`.
- Made Linux CI fail on missing build artifacts and verify container startup,
  `/health`, and rendered homepage content.

### Intentionally pending

- The live analyzer, diagnostic rule engine, backend services, persistence,
  authentication, and external AI integrations are not implemented.
- Docker has not been run locally; Docker build and HTTP smoke verification
  passed in GitHub Actions run `38806248540`.
