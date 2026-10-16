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

### Hardening milestone

- Added cancellable module-worker analysis/comparison/inspection and sanitized
  viewer paging/search, bounded pending work, timeout, and a 64 KiB no-worker fallback.
- Hardened SHA-256 diagnostic identities and conservative ambiguous comparisons,
  required evidence continuations, completion markers, and whole-log redaction.
- Whitelisted stored preferences/history, removed filename/log-fingerprint
  persistence, bounded session caches, and rejected stale file/task results.
- Added honest copy/report truncation and clipboard failure states; removed
  stale planned-engine/public confidence claims without replacing the UI design.
- Fixed quadratic control stripping found by the synthetic benchmark; recorded
  actual timings and the 1 MiB/10 MiB p95 targets that remain unmet.
- Pinned Node.js 22.22.3 in runtime/Docker, strengthened server routing/CSP, and
  added actual production worker-asset HTTP smoke checks to Linux CI.
- Verified 142 local tests, typecheck, lint, build, HTTP smoke, and zero reported
  vulnerabilities from `npm audit --audit-level=high` on 2026-10-16.

### Pending after this checkpoint

- Browser performance/peak memory, manual accessibility/security, cross-browser
  review, and actual production-worker execution in a browser remain unverified.
- Docker cannot be run on the Windows development machine. Docker build and
  HTTP smoke verification passed for the prior MVP in GitHub Actions run `38818606997`; the new
  checkpoint still needs its pushed CI run inspected.
- Backend services, authentication, external AI integrations, raw-log
  persistence, automatic remediation, and unrestricted shell execution remain
  intentionally out of scope.
