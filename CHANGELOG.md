# Changelog

All notable changes to BuildMedic will be documented here. The project is
currently in an unreleased local-MVP checkpoint.

## [Unreleased]

### Final QA repairs

- Fixed live System-theme updates and light-mode text/button contrast.
- Added dialog/drawer focus containment and restoration, background isolation,
  skip links, current-page semantics, and visible keyboard toggle focus.
- Repaired command navigation, report/demo tabs, viewer search and verification
  shortcuts, form error focus, disclosure states, and input-mode semantics.
- Retained the existing design and local diagnostic pipeline; added 31 focused
  UI regressions. Verified 173 unit/DOM tests and production Chromium checks.
- Profiled and removed unnecessary missing-CLI regex work and lockfile lookahead;
  retained matching semantics and added seven domain regressions. The isolated
  1 MiB/10 MiB pipeline run observed p95 223/1628 ms; the latter has only ten
  samples. Full method, sample counts and limitations are in `docs/PERFORMANCE.md`.
- Added lockfile-pinned, project-local Playwright/axe QA: 42 scenarios passed
  locally across Chromium, Firefox and WebKit, including the genuine production
  module worker, file picker/drop, report downloads, hostile text, privacy,
  failure/cancel recovery, mobile layouts and automated accessibility scans.
- Fixed WebKit pointer-opened dialog focus restoration, nested badge contrast,
  and missing large-input warnings. Added a separate production-browser timing
  command; large-log UI pauses and unverified peak memory remain disclosed.
- Added an optional Docker browser-QA target and CI container/browser checks,
  dependency audit, benchmark and retained synthetic evidence. Production
  runtime remains non-root and free of test/browser dependencies.

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
- Verified Ubuntu/Docker CI run
  [38897847991](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38897847991)
  at `3f8318f`, including hardening code `4ae575e` and production worker delivery.

### Historical gaps at the earlier hardening checkpoint

- Browser/worker execution, cross-browser automation and performance were not
  verified at that earlier checkpoint; final QA evidence now lives in
  `docs/QA-RELEASE.md`. Peak memory and manual assistive-technology review remain
  open; browser automation is not a security or accessibility certification.
- Docker cannot be run on the Windows development machine; the Linux image and
  HTTP checks passed in the run above. Future code revisions need their own
  independently checked CI result.
- Backend services, authentication, external AI integrations, raw-log
  persistence, automatic remediation, and unrestricted shell execution remain
  intentionally out of scope.
