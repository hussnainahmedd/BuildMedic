# BuildMedic Performance

**Status:** Pure-pipeline and production Chromium worker/UI measurements are
available. Total browser/worker peak memory remains unverified; input/cache byte
limits are not a heap-memory budget. See [final QA](QA-RELEASE.md).

## Final QA pipeline measurement (2026-10-16)

Command: `npm run benchmark`. Node.js 22.22.3, Windows x64, Intel Core i7-8665U;
same committed synthetic ASCII workload, one warmup, up to 30 timed samples and
a 15-second cutoff per case. This run was not concurrent with the test/browser
suites. The initial QA benchmark overlapped other checks and is not used as a
controlled before/after comparison.

| Input | Median | p95 | Timed samples |
| --- | ---: | ---: | ---: |
| 10 KiB | 2.11 ms | 5.31 ms | 30 |
| 100 KiB | 14.04 ms | 19.09 ms | 30 |
| 1 MiB | 138.44 ms | 223.18 ms | 30 |
| 5 MiB | 736.72 ms | 989.20 ms | 19 (cutoff) |
| 10 MiB | 1361.52 ms | 1627.99 ms | 10 (cutoff) |
| 25 MiB | 3823.16 ms | 4828.57 ms | 3 (cutoff) |

The observed 1 MiB p95 is below 250 ms. The observed 10 MiB value is below 2 s,
but ten samples do not establish a reliable tail estimate or a cross-device
performance guarantee. The maximum-size case remains expensive. The harness
also checked dense no-match input and viewer preparation; no assertions were
relaxed to obtain these measurements.

### Proven bottlenecks and focused repair

`npm run benchmark -- tests/performance/profile.perf.ts` profiles each stage and
rule on the same 1 MiB workload (one warmup, ten timed samples per stage).
Before/after warmed medians from adjacent isolated profiling runs:

| Stage | Before | After |
| --- | ---: | ---: |
| All diagnostic rules | 114.85 ms | 44.32 ms |
| Missing CLI detector | 56.58 ms | 0.76 ms |
| Lockfile detector | 20.80 ms | 4.85 ms |
| Full pipeline | 228.10 ms | 143.54 ms |

The missing-CLI command-name regex retried at each character of ordinary long
lines. Both supported spellings require `not found`, so a necessary-condition
guard avoids that work without changing matches. Lockfile matching allocated
and searched four-line context even when the primary line had no lockfile cue;
the existing cue is now checked first. Evidence, identities, severity, limits,
redaction and verification behavior are unchanged. Seven new domain regressions
and the existing domain/comparison suites passed. Host/JIT/GC variation still
affects timings; do not generalize the full-pipeline percentage to every log.

### Browser measurement command and limits

After building and installing project-local browsers, run
`npm run benchmark:browser`. It uses the real production worker and file-upload
UI at all five requested sizes, with one warmup plus three samples per size.
It records worker round-trip (including cloning), message-to-result-DOM timing,
16 ms UI heartbeat gaps and optional Chromium UI-heap snapshots in
`.cache/browser-performance/`. Snapshots exclude worker/DOM/native allocations;
they cannot validate the roughly 3× input peak-memory goal. This small browser
sample is observational and does not prove a p95 target. Final numbers are in
the release QA report.

## Previous hardening baseline (2026-10-16)

Run `npm run benchmark` separately from `npm test`. The committed harness uses
synthetic ASCII logs, checks correctness, warms each case once, and takes up to
30 samples with a 15-second per-case cutoff (including warmup). It emits JSON
with samples, median, p95, runtime, CPU, and actual sample count.
`BENCH_ITERATIONS` can lower the requested count; fewer samples weaken conclusions.

Environment: Node.js 22.22.3, Windows x64, Intel Core i7-8665U. These are pure
pipeline timings, not browser UI or real worker round-trip measurements.

| Input | Median | p95 | Timed samples |
| --- | ---: | ---: | ---: |
| 10 KiB | 3.63 ms | 6.31 ms | 30 |
| 100 KiB | 23.01 ms | 34.32 ms | 30 |
| 1 MiB | 214.92 ms | 295.94 ms | 30 |
| 5 MiB | 1065.73 ms | 1398.38 ms | 13 (cutoff) |
| 10 MiB | 2279.36 ms | 3481.90 ms | 5 (cutoff) |
| 25 MiB | 6621.72 ms | 6621.72 ms | 2 (cutoff) |

Small-sample p95 values, especially at 25 MiB, are not robust tail estimates.
The original 1 MiB/250 ms and 10 MiB/2 s p95 goals were **not met**. Keep large
processing in the worker and show progress/cancel; do not claim instant analysis.
The harness also exercises dense no-match input and sanitized viewer preparation;
their detailed timings are not recorded here. No peak-memory claim is made.

An initial run exceeded the shell's 240-second limit and revealed quadratic
string-rope flattening in control stripping (approximately 1.1 s at 1 MiB,
19.8 s at 5 MiB). Span collection and a plain-text fast path removed that
specific bottleneck; the complete post-fix run passed. Those early partial
timings are diagnostic observations, not a full controlled baseline comparison.

Production build at this checkpoint: main JS about 400.03 kB (118.32 kB gzip),
worker 52.62 kB, deferred fallback runtime 15.99 kB, CSS 83.78 kB (15.13 kB gzip).
These are emitted asset sizes, not measured loading time or a hard size budget.

## 1. Performance goals

BuildMedic should feel immediate for normal build logs and should fail clearly
instead of consuming unbounded browser resources. Initial targets for a
representative modern laptop are:

| Workload | Target |
| --- | --- |
| Normalize and analyze a 1 MiB supported log | p95 under 250 ms |
| Normalize and analyze a 10 MiB supported log | p95 under 2 s |
| Render the initial result view after analysis | p95 under 500 ms |
| Peak analysis memory | No more than roughly 3× input size, excluding browser baseline |
| First meaningful UI after a production load | p95 under 2 s on a local static server |

These are engineering targets, not current results or guarantees. The supported
input limit and final budgets must be confirmed by measurement before release.

## 2. Resource limits

The implemented default input policy is:

- warn at 5 MiB;
- accept up to 25 MiB, 100,000 lines, and 16,384 characters per line;
- reject larger input before rule evaluation;
- cap the number of retained lines of context per finding;
- cap the total findings shown in the primary view while allowing a clear
  “additional findings omitted” state.

The limits are configurable in the shared domain policy and exposed in validation
messages. They are safety limits, not a promise that every device can analyze
the maximum size comfortably.

## 3. Processing strategy

- Read the input once and normalize newline sequences without repeated whole-
  string copies where practical.
- Split or scan by line while retaining one-based source line numbers.
- Index rules by cheap signals such as error codes, tool names, and stable
  prefixes before evaluating more detailed patterns.
- Compile regular expressions once and keep them bounded and linear-time.
- Keep context windows small and deduplicate evidence before rendering.
- Avoid sorting large raw-log arrays; sort only the bounded finding set.
- Use the module Web Worker for analysis, comparison, inspection, and sanitized
  viewer preparation/search. Worker-unavailable fallback is capped at 64 KiB.
- Render long evidence lazily or with a bounded list rather than mounting every
  raw line at once.
- Keep the analysis result serializable so work can be moved off the main
  thread without changing domain behavior.

## 4. Avoiding waste

Rules must not repeatedly rescan the entire log for each variant of the same
signal. Shared extraction should produce reusable tokens and line references.
The UI should not re-run analysis on every keystroke; it should use a short,
documented debounce for deliberate live analysis or analyze on submit for large
inputs.

No performance optimization should remove evidence, weaken validation, or make
a finding non-deterministic.

## 5. Measurement protocol

For future comparable release measurements:

1. Pin Node.js and browser versions used for the measurement.
2. Use sanitized fixtures at 10 KiB, 100 KiB, 1 MiB, 5 MiB, 10 MiB, and the
   maximum accepted size.
3. Include normal, high-error, long-line, no-match, and adversarial-pattern
   inputs.
4. Warm the browser and record at least 30 iterations per workload.
5. Report median, p95, peak memory where available, and bundle size.
6. Compare each change with the same fixture and environment.
7. Keep benchmark data free of secrets and avoid treating a local development
   server as a production result.

The local benchmark above establishes an initial baseline. CI may run
a smaller regression suite; full performance measurements can run on a pinned
Linux or release environment if they are too variable for every pull request.

## 6. Performance failure behavior

If the input exceeds a limit, a rule times out, or the browser cannot complete
analysis safely, the UI should show a specific recovery action: reduce the log,
disable optional context, or retry in a supported environment. It must not show
an incomplete list as if it were complete.

## 7. Release budget

The production bundle should remain small enough for a static browser tool. The
final release checklist will set a measured JavaScript/CSS budget after the
first UI exists. New dependencies require a performance and security rationale
in the pull request.
