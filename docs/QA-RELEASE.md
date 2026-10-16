# BuildMedic — final QA and release hardening

**Historical checkpoint:** the newer Vercel/Render routing, narrow-layout and
WebKit CSP repairs and their live receipts are in [PRODUCTION-QA.md](PRODUCTION-QA.md).
The counts and limits below remain the evidence for the earlier release source.

Date: **2026-10-16**. Baseline: `ae7792f`. Scope: existing local MVP; no redesign,
hosted feature, deployment, video or submission. Git history and working flows
were preserved. All log/credential-looking QA inputs are synthetic.

## Release decision

**Conditional release candidate for the bounded local MVP / Buildathon review.**
Local functional/regression checks and the independent Linux/container/browser
run pass. The verified source and immutable CI receipt are recorded below.
Do not describe this as unconditional production, performance, security or WCAG
certification. Large-log UI pauses, total peak memory and manual assistive-tech
review remain material limitations.

## Check summary

| Check | Status | Evidence / limits |
| --- | --- | --- |
| Clean baseline, runtime and lockfile | PASS | Started clean on main at `ae7792f`; Node 22.22.3, committed npm lockfile, no force operations |
| `npm ci` | PASS | Baseline and final lockfile clean installs; final offline-mode regression rerun also passed |
| Typecheck / lint | PASS | `npm run typecheck`; `npm run lint` |
| Offline unit / DOM / HTTP regression suite | PASS | `npm test`: 180 tests in 15 files, zero skips |
| Production build and HTTP smoke | PASS | `npm run build`; `npm run smoke`: health, SPA, actual worker JS, CSP, asset 404, method 405 |
| Real-browser workflows | PASS | `npm run test:e2e`: 42 scenarios, 14 per engine, zero skips/retries |
| Automated accessibility | PASS within tested scope | axe 4.14 WCAG 2 A/AA, 2.1 AA and 2.2 AA tags; dark/light populated surfaces, dialogs, mobile input/sidebar |
| Responsive and keyboard | PASS within tested scope | 1440×1000, 768×1024, 390×844, 320×700; navigation, inputs, scrolling/paging, modal focus and main-content overflow assertions; screenshots inspected |
| Hostile input / export privacy | PASS within tested scope | Inert HTML/script text; common credentials/private keys redacted in viewer and downloaded plain-text report; generic metadata-only storage |
| Worker failure / cancellation | PASS | Real failed worker fetch and retry, no-worker 64 KiB limit; injected stalled transport for deterministic cancel; independent real-worker execution |
| Dependency advisories | PASS | `npm audit --audit-level=high`: zero reported vulnerabilities, including development dependencies |
| Pipeline benchmark | PASS as measurement | Both benchmark tests pass; five requested sizes plus 25 MiB measured; see tables below |
| Browser benchmark | PASS as measurement | Genuine production Chromium worker/UI, one warmup plus three samples per size; no performance assertions weakened |
| Linux clean rebuild / Docker / container browser QA | PASS | Run `38914960876` at `efaa547`: both images built; non-root runtime, HTTP smoke and all 42 real-browser scenarios passed |
| Local Docker invocation | BLOCKED locally | Docker executable unavailable on Windows; independent Linux verification passed |
| Total peak-memory budget / manual screen reader / physical devices | UNVERIFIED | Not established by DOM tests, viewport emulation, axe or UI-heap snapshots |

No automated assertion remains failing at the verified source checkpoint.
Performance signoff is **not complete**: pure timing observations are promising,
but the 10 MiB browser round-trip and UI pauses remain unsuitable for an
unqualified instant/smooth large-log claim.

### Genuine user behavior exercised

- Paste/edit/analyze, FileReader upload and real DataTransfer drop; npm/pnpm/yarn,
  TypeScript, missing modules/CLIs, dependency and lockfile diagnostics. Asserted
  root finding, severity, one-based evidence and suggested guidance.
- Empty input, overlong lines, binary/empty/unsupported/over-25-MiB uploads,
  malformed JSON-as-text, unknown/custom and unsupported-language diagnostics;
  input preservation and recovery.
- Before/after persistent, changed (resolved + new), explicit-completion-backed
  improvement and uncertain arbitrary-rerun cases. No build-pass claim.
- Findings search/severity/sort, sanitized viewer search/highlight/error filter
  and pagination; line-number/density/motion settings, System-theme updates,
  report tabs, command arrows/Enter/Ctrl+K, viewer `/`, comparison Ctrl/Cmd+Enter.
- In-session history reopen, metadata-only reopen after reload, clear-history
  clearing raw drafts/cache, actual Blob report download, denied clipboard and
  storage recovery. No external requests observed in the normal workflow case.

Browsers: Playwright **1.64.1** managed Chromium **156.0.8078.4**, Firefox **157.0**,
WebKit **27.2** on Windows; the three-engine suite also passed in the Linux QA
container against the separate production image. WebKit is not proof of branded Safari/iOS compatibility.
The suite uses compiled production assets, not Vite or fixture-only DOM success.

## Repairs and regression evidence

1. Live System theme, truthful theme-toggle labels, dark/light contrast including
   nested populated badges, and visible toggle focus.
2. Dialog/drawer entry/trap/restore and background isolation; WebKit pointer
   activation; hidden mobile navigation no longer remains keyboard reachable.
3. Semantic main/skip/current-page links, real tab behavior, honest input-source
   toggles, filter/disclosure states, implemented advertised shortcuts, invalid
   form focus and documented 5 MiB warnings.
4. Proven missing-CLI regex and lockfile-lookahead bottlenecks removed without
   altering diagnostics/evidence/identity/redaction. Seven new domain regressions
   plus 31 UI regressions; the original 142 tests remain covered.
5. Reproducible browser QA, optional Docker QA stage and CI evidence retention;
   only development test dependencies added. Runtime stack unchanged.

Initial browser failures were repaired rather than suppressed. Two harness
issues were also corrected: Firefox emulation must be applied after navigation
in this environment; a combined multi-surface axe case exceeded its runner
timeout and was split by theme with all assertions retained. A 4,000-line
automation fill exceeded its deadline; the equivalent >64 KiB fallback boundary
uses 70 valid lines, while separate multi-megabyte browser workloads remain.
The first Linux run (`38912231595`, source `779cba9`) passed builds, unit checks,
audit, benchmarks, runtime startup/HTTP and all functional browser scenarios,
but four axe cases sampled intermediate theme/opacity animation colors. The
harness now waits for fonts and finite animations, retaining every assertion;
that failed run is not presented as a release pass. CI Actions were also moved
to commit-pinned checkout/setup v5 and artifact v6 releases after Node-20
deprecation warnings. The application's own runtime remains Node 22.22.3.

## Measured performance

Node 22.22.3, Windows x64, Intel Core i7-8665U. Isolated
`npm run benchmark`: one warmup, requested 30 samples, 15-second per-case cutoff.
Full methodology and previous baseline: [PERFORMANCE.md](PERFORMANCE.md).

| Input | Pipeline median | Pipeline p95 | Samples |
| --- | ---: | ---: | ---: |
| 10 KiB | 2.11 ms | 5.31 ms | 30 |
| 100 KiB | 14.04 ms | 19.09 ms | 30 |
| 1 MiB | 138.44 ms | 223.18 ms | 30 |
| 5 MiB | 736.72 ms | 989.20 ms | 19 |
| 10 MiB | 1361.52 ms | 1627.99 ms | 10 |
| 25 MiB | 3823.16 ms | 4828.57 ms | 3 |

The 1 MiB observed p95 meets 250 ms. The 10 MiB observation is under 2 s, but
only ten samples do not establish robust tail compliance. No cross-device claim.
Adjacent ten-sample stage profiling reduced rules from 114.85 to 44.32 ms,
missing-CLI from 56.58 to 0.76 ms, lockfile from 20.80 to 4.85 ms (1 MiB).

Production Chromium `npm run benchmark:browser`, **three measured samples** per
size, tracing/snapshots disabled to avoid serializing huge textarea contents:

| Input | Worker round-trip median | Result DOM median | Largest observed 16 ms heartbeat gap |
| --- | ---: | ---: | ---: |
| 10 KiB | 48.3 ms | 7.2 ms | 28.8 ms |
| 100 KiB | 67.0 ms | 9.3 ms | 29.3 ms |
| 1 MiB | 292.2 ms | 33.1 ms | 90.7 ms |
| 5 MiB | 1556.6 ms | 206.3 ms | 626.4 ms |
| 10 MiB | 3352.1 ms | 408.8 ms | 1379.6 ms |

Worker round-trip includes startup/cloning and main-loop delivery. Result timing
ends at DOM mutation, not verified paint. The main loop advanced during large
analysis, but **large-log responsiveness is not consistently smooth**. Browser
timings are not interchangeable with pure-pipeline targets; three samples cannot
support a p95 claim. Do not advertise instant 10 MiB processing.

Main-world heap snapshots at 10 MiB were approximately 328–416 MB after the
result, GC-sensitive and potentially affected by automation/session overhead.
They exclude worker/DOM/native allocations and are not incremental/peak totals.
The roughly 3× input peak-memory objective is **not verified**. Inspection found
multiple normalized/matching/redacted copies and native textarea allocation;
input/cache limits do not cap total browser memory. No speculative editor or
engine rewrite was made to disguise this gap. Prefer reduced logs on small devices.

Production emitted sizes: main JS **408.30 kB / 121.07 kB gzip**, worker **52.66 kB**,
deferred runtime **15.99 kB**, CSS **84.60 kB / 15.30 kB gzip**. Not loading-time budgets.

## Reproduce and run

From the repository root, select `.nvmrc` Node 22.22.3 (`nvm install && nvm use`
on Linux with nvm), then:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
npm run benchmark
npm audit --audit-level=high
npm run browser:install -- --no-shell chromium firefox webkit
npm run test:e2e
npm run benchmark:browser
npm start
```

Open `http://127.0.0.1:4173` after `npm start`. No environment variables or
credentials are required. After dependencies exist, `npm test` is the single
offline check; it binds only loopback and needs no browser/Docker download.
Browser/system dependency installation and npm audit need network/cache access.

Clean Linux / container equivalents:

```sh
docker build --pull -t buildmedic:local .
docker run --rm --name buildmedic-local -p 4173:4173 buildmedic:local
# Separate terminal, after building local dist for the emitted-worker filename:
node tests/production-smoke.mjs http://127.0.0.1:4173
# Standalone browser suite; installs OS libraries only inside Docker:
docker build --target browser-qa -t buildmedic:qa .
docker run --rm --shm-size=1g buildmedic:qa
```

These are verification/run recipes, **not a deployment performed by this QA**.
No Vercel/Render action, commercial video, submission or live-user data was used.

## Evidence, revisions and remaining signoff

- Code checkpoints: `e4a1975` (accessible workflows), `a26d598` (diagnostic fast
  paths), `fe089d9` (browser feedback/focus), `779cba9` (browser QA) and
  **`efaa54797c6ccf8872ee5593bc6a3ea6743e39d1`** (settled accessibility / verified
  release source).
- **PASS:** [Linux/container/browser CI 38914960876](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38914960876)
  at that source SHA. All job steps succeeded; downloaded results explicitly
  report 42 expected, 0 skipped, 0 unexpected and 0 flaky browser cases.
  The final documentation/CI-action receipt commit does not change application
  code; its exact repository SHA and final CI URL are returned in the delivery
  summary. Locally, `git rev-parse HEAD` identifies that final report commit.
- Downloaded Linux screenshots/results: `.cache/ci-release-evidence/`, including
  `release-production-module--f1392-reports-and-private-history-chromium/desktop-analysis.png`
  and `release-desktop-tablet-and-0f6cd-gation-dialogs-and-controls-chromium/workspace-390.png`.
  Windows and downloaded Linux desktop/narrow-mobile captures were visually inspected; this is not a
  pixel-perfect screenshot comparison or exhaustive visual review.
- Browser raw measurements:
  `.cache/browser-performance/performance-measures-actua-c01a4--trips-and-result-rendering-chromium/measurements.json`.
- Original local runs write `.cache/browser-results/`; the downloaded Linux
  artifact above survives later local reruns. These generated files are ignored
  by Git and contain synthetic data only.
  Re-running the command replaces local results. CI retains its own
  [`browser-qa-evidence` artifact](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38914960876/artifacts/12051449401)
  for 14 days; persistent source evidence is the
  committed harness and this report, not a claim that local cache is in Git.
- Outstanding signoff: total-memory/low-memory-device profiling; robust browser
  p95 samples and native textarea/rendering pauses; NVDA/VoiceOver or equivalent
  manual review; physical mobile/browser versions, true zoom and OS clipboard
  success; external deployment TLS/headers and container-OS vulnerability scan.
  No penetration test, exhaustive secret detection, container-CVE audit or
  browser-baseline memory guarantee was performed.
- Historical baseline Linux/Docker CI `38898094995` passed at `ae7792f`. It does
  not verify the new revision; the independent successful receipt above does.
