# BuildMedic Roadmap

**Status:** Checkpointed sequence. Phases 0–4 are implemented in the current
local MVP; the remaining release-hardening work is explicit below.

Priorities use **P0** for required foundation/MVP work, **P1** for high-value
quality or usability work, and **P2** for later expansion.

## Phase 0 — Repository foundation (current)

**Priority:** P0
**Status:** Completed locally. Repository conventions and the documentation
foundation are in place.

- Establish Node.js 22 pinning and repository conventions.
- Document product requirements, architecture, security, validation,
  performance, testing, deployment, and contribution expectations.
- Add the future Linux CI/Docker verification workflow without claiming a
  current result.
- Select a permissive open-source license.

**Exit criteria:** A new contributor can understand the intended product and
the remaining implementation work without mistaking plans for completed
features.

## Phase 1 — Reproducible application scaffold and frontend foundation

**Priority:** P0
**Status:** Completed. The Node.js 22 toolchain, lockfile, frontend foundation,
production server, Docker image, and Linux CI workflow are implemented. The
last verified Docker/HTTP CI run is
[38806248540](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38806248540)
(`success`, commit `7f8a7cf`).

- Add the TypeScript, React, Vite, and Vitest manifests.
- Generate and commit the npm lockfile using Node.js 22.
- Add strict compiler/build/test scripts and the first meaningful offline test.
- Add the responsive React/Vite public site and BuildMedic Lab workspace.
- Add frontend validation, demo fixtures, tests, linting, and local preferences.
- Add a multi-stage Dockerfile and static runtime design.
- Make Linux CI install, test, build, and Docker checks real rather than gated.
  *(Node checks are active; Docker runs on Linux CI.)*

**Exit criteria:** Clean Linux and local Node.js setup commands are documented;
the first real test and production build pass from the lockfile.

## Phase 2 — Domain analysis engine

**Priority:** P0
**Status:** Completed in this checkpoint.

- Define shared input, finding, rule, and verification types.
- Implement newline normalization, bounded extraction, deterministic rule
  evaluation, secret-shaped display redaction, and partial-result metadata.
- Add sanitized fixtures and offline tests for npm, pnpm, yarn, TypeScript,
  dependencies, lockfiles, scripts, permissions, network, native modules, and
  resource failures.
- Implement causal ranking, duplicate consolidation, evidence references,
  no-match behavior, and validation limits.

**Exit criteria:** Fixture-driven tests prove stable findings, evidence, and
safe behavior for valid, invalid, ambiguous, and adversarial logs.

## Phase 3 — Browser workspace

**Priority:** P0
**Status:** Completed in this checkpoint.

- Add accessible paste/file/drop input, loading, error, empty, invalid, and
  clear states.
- Render live summary, severity/confidence, search/filter/sort, evidence,
  explanations, and actions.
- Provide sanitized copy/report exports and metadata-only local history without
  adding a network dependency.
- Add component coverage for the critical local flows; a full manual WCAG
  review remains part of Phase 5.

**Exit criteria:** A user can complete the primary analyze flow with keyboard
and browser-only execution, and UI tests cover the critical states.

## Phase 4 — Fix verification

**Priority:** P0
**Status:** Completed in this checkpoint.

- Add baseline/rerun inputs and structured comparison over actual analyzer
  results.
- Match findings by normalized stable rule/signature identity, not array
  position; expose conservative uncertain states for ambiguous or partial data.
- Show resolved, persistent, new, no-match, and invalid comparison states
  without claiming that a build passed.
- Add regression fixtures for common fix outcomes and identity changes.

**Exit criteria:** The verification acceptance criteria in `docs/PRD.md` pass
without executing commands or uploading logs.

## Phase 5 — Hardening and release

**Priority:** P1
**Status:** Pending after this checkpoint.

- Measure representative input-size and rendering budgets and record actual
  results.
- Complete security, dependency, accessibility, and cross-browser reviews.
- Re-run and inspect Linux CI/Docker verification after this checkpoint is
  pushed.
- Finish any remaining public-copy/documentation review and publish release
  notes with known rule coverage and limitations.

**Exit criteria:** Required quality gates are green in Linux CI and the release
artifacts are reproducible from a clean checkout.

## Later opportunities

**Priority:** P2
**Status:** Not committed.

- Optional adapters for more build tools and log formats.
- User-authored rule packs with a safe, documented schema.
- Optional redacted export/import of analysis results.
- An opt-in hosted/team mode with a separate threat model and API.
- Historical comparison and CI annotations if they can preserve privacy and
  remain useful without making the local MVP dependent on a service.

These ideas require a new product review; they are not part of the MVP plan.
