# Changelog

All notable changes to BuildMedic will be documented here. The project is
currently in an unreleased local-MVP checkpoint.

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
- Added browser-safe deterministic analysis for supported Node.js build failure
  families, stable identities, causal ranking, bounded evidence, redaction, and
  honest invalid/no-match/partial outcomes.
- Connected paste, upload, drag/drop, analysis, evidence viewer, search/filter/
  sort, verification, metadata-only history, and sanitized report export flows
  to the live local engine. The synthetic example remains input-only and
  explicitly labeled.
- Added ESLint configuration and frontend component tests alongside validation
  unit tests, domain fixtures, comparison tests, and security-oriented cases.
- Added a multi-stage Node.js 22 Dockerfile, non-root static server, Docker
  health check, `.dockerignore`, and `.env.example`.
- Made Linux CI fail on missing build artifacts and verify container startup,
  `/health`, and rendered homepage content.

### Pending after this checkpoint

- Full performance measurement/reporting, manual accessibility and
  cross-browser review, and release hardening remain.
- Docker cannot be run on the Windows development machine. Docker build and
  HTTP smoke verification passed in GitHub Actions run `38806248540`; the new
  checkpoint still needs its pushed CI run inspected.
- Backend services, authentication, external AI integrations, raw-log
  persistence, automatic remediation, and unrestricted shell execution remain
  intentionally out of scope.
