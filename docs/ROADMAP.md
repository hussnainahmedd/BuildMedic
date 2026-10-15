# BuildMedic Roadmap

**Status:** Proposed sequence. Dates are intentionally omitted until the
implementation plan and contributor capacity are known.

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

## Phase 1 — Reproducible application scaffold and frontend demo

**Priority:** P0
**Status:** Frontend milestone completed locally; production Docker runtime and
Linux Docker verification remain pending.

- Add the TypeScript, React, Vite, and Vitest manifests.
- Generate and commit the npm lockfile using Node.js 22.
- Add strict compiler/build/test scripts and the first meaningful offline test.
- Add the responsive React/Vite public site and BuildMedic Lab workspace.
- Add frontend validation, demo fixtures, tests, linting, and local preferences.
- Add a multi-stage Dockerfile and static runtime design. *(Pending.)*
- Make Linux CI install, test, build, and Docker checks real rather than gated.
  *(Node checks are active; Docker remains gated.)*

**Exit criteria:** Clean Linux and local Node.js setup commands are documented;
the first real test and production build pass from the lockfile.

## Phase 2 — Domain analysis engine

**Priority:** P0
**Status:** Planned.

- Define shared input, finding, rule, and verification types.
- Implement newline normalization, bounded extraction, and deterministic rule
  evaluation.
- Add sanitized fixtures for common Node.js build failures.
- Implement ranking, evidence references, no-match behavior, and validation
  limits.

**Exit criteria:** Fixture-driven tests prove stable findings, evidence, and
safe behavior for valid, invalid, ambiguous, and adversarial logs.

## Phase 3 — Browser workspace

**Priority:** P0
**Status:** Planned.

- Add accessible paste/file input and clear states.
- Render summary, severity/confidence, evidence, explanations, and actions.
- Provide copyable local summaries without adding a network dependency.
- Meet the validation and accessibility specification.

**Exit criteria:** A user can complete the primary analyze flow with keyboard
and browser-only execution, and UI tests cover the critical states.

## Phase 4 — Fix verification

**Priority:** P0
**Status:** Planned.

- Add baseline/rerun inputs and structured comparison.
- Match findings by stable identity, not array position.
- Show resolved, persistent, new, no-match, and invalid comparison states.
- Add regression fixtures for common fix outcomes.

**Exit criteria:** The verification acceptance criteria in `docs/PRD.md` pass
without executing commands or uploading logs.

## Phase 5 — Hardening and release

**Priority:** P1
**Status:** Planned.

- Measure input-size and rendering budgets.
- Complete security, dependency, accessibility, and cross-browser reviews.
- Verify the production image on a Linux GitHub Actions runner.
- Document static deployment and release procedures.
- Publish a first release with limitations and known rule coverage.

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
