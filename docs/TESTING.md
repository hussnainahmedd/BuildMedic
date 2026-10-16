# BuildMedic Testing Strategy

**Status:** The offline unit and component suite is implemented for the current
local MVP: **180 tests in 15 files passed** locally on Node.js 22.22.3.
**42 production Playwright scenarios passed** across Chromium, Firefox and
WebKit on Windows. Automated keyboard, responsive and axe checks are included;
manual screen-reader/physical-device review is still unverified. See
`docs/QA-RELEASE.md` and `docs/PERFORMANCE.md` for evidence and limits.

## 1. Testing principles

- Test user-visible outcomes and domain contracts, not implementation trivia.
- Keep all automated tests offline and deterministic.
- Use sanitized, small fixtures that can be committed and reviewed.
- Treat security, accessibility, resource limits, and no-match behavior as
  first-class requirements.
- Do not claim a check passed unless it was run in the stated environment.

## 2. Test layers

### Unit tests

Use Vitest for pure modules:

- newline and encoding normalization;
- signal extraction and line-number preservation;
- each diagnostic rule's positive, negative, ambiguous, and adversarial cases;
- finding severity/confidence and deterministic ordering;
- deduplication and bounded evidence;
- baseline/rerun matching and all verification states;
- validation limits and exact error categories;
- redaction helpers and control-character handling.

Domain tests should not import React or require a browser.

### Integration tests

Exercise the analyzer pipeline from validated text to a complete serialized
result. Include representative npm, pnpm, yarn, TypeScript, bundler,
node-gyp, network, permission, lockfile, and memory fixtures. Assert the top
finding, evidence line, status, and no unexpected findings—not only that the
pipeline returns an object.

### UI tests

Cover the real interaction flow:

- paste, clear, and analyze a log;
- select a readable file and handle file errors;
- show loading, empty, invalid, no-match, findings, and unexpected-error
  states;
- expand evidence and copy a summary;
- submit baseline/rerun logs and display verification states;
- preserve input after a failed analysis.

Use a DOM test environment for component behavior. Reserve browser-level tests
for keyboard/focus and a small number of critical end-to-end journeys.

### Security tests

Test that:

- HTML/script-looking content is rendered as text;
- log URLs and shell commands are never fetched or executed;
- oversized and pathological inputs are rejected or bounded;
- credential-like content follows the redaction/display policy;
- analysis makes no unexpected network request;
- production configuration does not expose secrets.

Security tests should include regression fixtures for every discovered issue.

### Accessibility tests

Check labels, accessible names, error associations, live-region behavior,
keyboard navigation, focus recovery, severity text, and contrast with the
project's chosen tooling. Automated checks complement manual keyboard and
screen-reader spot checks; they do not replace them.

### Performance tests

Use the fixture sizes and protocol in `docs/PERFORMANCE.md`. At minimum,
record normalization/analysis time, result rendering time, input size, finding
count, and whether the browser remained responsive. Keep performance baselines
separate from noisy pull-request checks when necessary.

## 3. Fixture policy

Fixtures must:

- be synthetic or scrubbed of real secrets, tokens, usernames, private paths,
  and proprietary package names;
- include the expected rule ID, evidence line, and result state;
- document the tool family and scenario;
- include counterexamples so a rule does not match ordinary text accidentally;
- remain small enough for code review.

Never commit a production log merely because it is useful for a test.

## 4. Determinism and offline behavior

Tests must not depend on network access, current time, locale, random ordering,
machine-specific paths, or globally installed tools. Time-sensitive or random
behavior must be injected and controlled. A test that needs a browser or Docker
must be clearly separated from the offline unit suite.

## 5. Implemented commands and checks

The repository defines the following offline checks:

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
npm run benchmark
```

`npm ci` installs dependencies and may need network/cache access; subsequent
checks above work without external services. `npm test` includes loopback-only
static-server tests and does not need Docker or a real browser. Vitest concurrency
is capped at two workers to reduce contention rather than relaxing assertions
or the default test timeout.

Coverage includes domain rules/identity/comparison/redaction, malformed storage,
cache bounds and clear behavior, worker transport/abort/timeout/fallback, stale
file reads, viewer/report sanitization, public claims, and real App workflows.
The unit worker transport tests use controlled workers and the real task runtime;
the separate Playwright suite executes the genuine production module worker.

`npm run smoke` starts an ephemeral production server after `npm run build`,
checks `/health`, SPA paths, the actual emitted worker JS and CSP, asset 404,
and write-method 405, then stops its server. To check a running container use
`node tests/production-smoke.mjs http://127.0.0.1:4173`. It verifies HTTP delivery,
not browser execution or CSP enforcement by itself. GitHub Actions repeats the
checks on Ubuntu 24.04 and builds/starts the non-root Docker image; its separate
browser QA image runs the real-browser suite against that runtime container.
Docker is unavailable locally.

Local typecheck, lint, build, and production smoke passed. The online release
check `npm audit --audit-level=high` found zero vulnerabilities on 2026-10-16.
Run `npm run benchmark` for the separate bounded timing suite. Neither audit
nor benchmark substitutes for the offline regression suite.

### Reproducible browser QA

```sh
npm run browser:install -- --no-shell chromium firefox webkit
npm run build
npm run test:e2e
npm run benchmark:browser
```

The wrapper keeps binaries project-local in `.cache/ms-playwright/`. Clean Linux
browser OS prerequisites are supplied by `docker build --target browser-qa -t
buildmedic:qa .` followed by `docker run --rm --shm-size=1g buildmedic:qa`; no host
sudo/global installation is needed. Full setup is also in the README.

Tests use the production server at loopback port 4183, not Vite or JSDOM. An
explicit `BUILDMEDIC_BASE_URL` points them at the already-running CI production
container instead. Do not point these synthetic QA tests at an unrelated service.
They test actual upload/FileReader, DataTransfer drops, worker execution,
downloaded report contents, storage clearing, recovery, shortcuts, dialogs and
320/390/768/1440 px layouts. Cancellation deliberately injects a stalled worker
boundary; independent cases test the actual worker. Clipboard/storage denials
are injected, while the actual report Blob download is tested in all engines.

Axe 4.14 checks WCAG 2 A/AA, 2.1 AA and 2.2 AA tags on dark/light public,
populated workspace, dialog and mobile input/sidebar surfaces. Zero violations
in those scans is not a manual accessibility or complete WCAG certification.
The two theme cases have separate bounded timeouts, retaining every assertion;
the combined 24+-scan case originally exceeded its test-runner timeout.
Scans await fonts and finite CSS transitions/entrance animations rather than
measuring intermediate transparent or mixed-theme colors on faster CI runners;
contrast and every other axe assertion remain enabled.

The production-repair suite adds 15 browser cases (five per engine) to the
existing 42. It covers every direct React route and refresh, trailing slashes,
branded unknown routes, missing asset GET/HEAD responses and the SVG favicon.
Populated Analysis is now explicitly included in the original layout loop; new
long-evidence checks inspect both element bounds and main scroll width at all
four widths, so global overflow clipping cannot disguise the 320 px regression.
Mobile theme access and 24 px control/44 px small-screen header targets are checked.

`production-qa.spec.ts` separates a screenshot-free, zero-console-error CSP
workflow from intentional negative CSP tests. The positive case exercises native
selects, two genuine production workers (analysis/comparison), dialogs, report
tabs and sanitized Blob download. The negative case asserts arbitrary inline
scripts, style attributes and style elements remain blocked. Do not infer a CSP
pass from screenshot-containing tests: WebKit screenshots can inject their own
empty style element. See [SECURITY.md](SECURITY.md) for the native-select hash.
Run `npm run test:e2e -- production-qa.spec.ts` for just these focused regressions.
Live runs require the revision/asset gates in [DEPLOYMENT.md](DEPLOYMENT.md).

`.cache/browser-results/` contains JSON results and synthetic screenshots; failed
cases also retain a trace. CI uploads `browser-qa-evidence` for 14 days. Performance
measurement disables snapshots/tracing, warms once and takes three samples per
size; it saves JSON in `.cache/browser-performance/`. No test artifact may
contain a real customer/private log.

## 6. Coverage and release gates

Initial targets, to be confirmed after the first implementation slice:

- meaningful branch coverage for every diagnostic rule;
- at least one regression fixture for every supported error family;
- all P0 acceptance criteria covered by automated or documented manual checks;
- no high-severity accessibility or security finding open at release;
- production build and offline test command pass from a clean checkout.

Coverage percentage alone is not a release gate. Uncovered parsing boundaries,
validation branches, and failure states must be reviewed explicitly.
