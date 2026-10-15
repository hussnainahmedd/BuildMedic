# BuildMedic Performance

**Status:** Proposed budgets and measurement plan. The frontend is implemented,
but the documented performance benchmark has not been run yet.

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

The proposed input policy is:

- warn at 5 MiB;
- accept up to 25 MiB when the browser has sufficient capacity;
- reject larger input before rule evaluation;
- cap the number of retained lines of context per finding;
- cap the total findings shown in the primary view while allowing a clear
  “additional findings omitted” state.

The limits must be configurable in one domain policy and exposed in validation
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
- Use a Web Worker for large inputs if profiling shows the main thread becomes
  visibly unresponsive.
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

When implementation exists:

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

The first benchmark should establish a baseline before optimization. CI may run
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
