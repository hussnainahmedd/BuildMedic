# BuildMedic Product Requirements Document

**Status:** Proposed; documentation only. No requirements in this document are
implemented yet.

## 1. Product summary

BuildMedic is an offline-first browser tool for turning Node.js build logs into
prioritized, understandable diagnostics. It should help a developer move from
an unstructured failure to a likely cause, a practical next action, and evidence
that a rerun improved the situation.

The MVP runs entirely in the browser. It does not require an account, a
backend, an external AI provider, or a network connection after the application
assets are available.

## 2. Problem and goals

Node.js build output is often long, repetitive, and optimized for machines
rather than people. The first error may be buried under cascaded messages, and
the same symptom can have several causes. BuildMedic will:

- reduce a log to a small set of evidence-backed findings;
- explain likely causes in plain language;
- recommend safe, concrete next steps; and
- compare a baseline log with a rerun log to verify whether a finding changed.

The product is not intended to replace a build system, execute repair commands,
or make unreviewed changes to a project.

## 3. Personas

### Application developer

Needs a fast answer while fixing a failed local install, typecheck, bundling,
or production build. May not know whether the first visible error is causal or
cascaded.

### Maintainer or release engineer

Needs repeatable explanations that can be shared in an issue or pull request,
without uploading private source paths, tokens, or proprietary logs.

### Learner or support engineer

Needs terminology, evidence, and suggested verification steps rather than an
opaque answer from an automated system.

## 4. User stories

- As a developer, I can paste or select a Node.js build log so that I can
  inspect it without sending it to a service.
- As a developer, I can see the most likely root cause first, with severity,
  confidence, and the exact supporting lines.
- As a developer, I can read an explanation and suggested fix steps that are
  specific to the detected error family.
- As a developer, I can provide a post-fix rerun log and see whether prior
  findings were resolved, persisted, or replaced by new findings.
- As a maintainer, I can understand why a finding was produced and reproduce it
  with a deterministic fixture.
- As a keyboard or assistive-technology user, I can complete the core flow
  without relying on color, a pointer, or a hover state.

## 5. MVP scope

### In scope

- Pasting text and selecting a local text log file.
- Input normalization for common newline and encoding variations.
- Deterministic rules for common Node.js failures, including missing modules,
  TypeScript diagnostics, package resolution conflicts, lockfile mismatch,
  missing scripts, permission errors, network failures, native-module builds,
  and memory exhaustion.
- Finding severity, confidence, category, explanation, evidence line numbers,
  and suggested remediation.
- A before/after verification flow using a baseline and a rerun log.
- Clear input limits, empty states, accessible forms, and copyable results.
- Fixture-driven offline tests for the domain engine and key UI flows.

### Out of scope for the MVP

- Executing shell commands or modifying a repository.
- Sending logs to an external AI, telemetry service, or hosted API.
- A server-side account, team workspace, history database, or collaboration
  layer.
- Guaranteed diagnosis of arbitrary third-party tools or application runtime
  failures.
- Automatic dependency upgrades or lockfile edits.

## 6. Functional requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-01 | Accept a non-empty log through paste or a local text-file selection. | P0 |
| FR-02 | Reject unsupported, unreadable, oversized, or empty input with an actionable message. | P0 |
| FR-03 | Preserve line boundaries and associate evidence with one-based line numbers. | P0 |
| FR-04 | Produce zero or more structured findings using deterministic, versioned rules. | P0 |
| FR-05 | Rank findings by likely causal importance, severity, confidence, and evidence quality. | P0 |
| FR-06 | Explain each finding without presenting a heuristic as certainty. | P0 |
| FR-07 | Show suggested fixes and a human-reviewable verification command or condition. | P0 |
| FR-08 | Compare a baseline result with a rerun and label findings resolved, persistent, or new. | P0 |
| FR-09 | Make raw evidence inspectable while applying the documented display-sanitization policy. | P0 |
| FR-10 | Allow a user to clear the current input and results from the active session. | P1 |
| FR-11 | Offer a copyable text summary without requiring a network request. | P1 |
| FR-12 | Explain when no supported rule matched instead of inventing a diagnosis. | P0 |

## 7. Nonfunctional requirements

- **Privacy:** Log content remains local to the browser in the MVP. No network
  request is required for analysis.
- **Determinism:** The same normalized input and rule catalog version produce
  the same findings and ordering.
- **Safety:** BuildMedic never executes commands, evaluates log text as code, or
  treats a log-provided URL as an instruction.
- **Performance:** Meet the proposed budgets in `docs/PERFORMANCE.md` for
  supported input sizes on a representative modern laptop.
- **Accessibility:** Meet the project accessibility requirements in
  `docs/VALIDATION.md`, targeting WCAG 2.2 AA for the core flow.
- **Portability:** Run as a static browser application with Node.js tooling;
  no server is required for the MVP.
- **Maintainability:** Domain analysis stays independent from React rendering,
  and every rule has focused fixtures and explanation metadata.

## 8. Acceptance criteria

The MVP is ready for review when all of the following are true:

1. A user can paste a supported sample log and receive at least one finding
   with a category, severity, confidence, explanation, evidence line, and
   suggested next step.
2. A user can load the same input from a local text file and receive equivalent
   normalized results.
3. A user can supply a rerun log and see a stable, understandable comparison
   containing resolved, persistent, and new states where applicable.
4. Unsupported or empty input is rejected without an exception escaping to the
   user interface.
5. A log containing credential-like material is handled according to the
   sanitization policy and is never sent over the network by the application.
6. Unit and integration tests cover representative rule families, ordering,
   verification transitions, validation boundaries, and the no-match state.
7. The core flow is keyboard usable and exposes validation and result changes
   to assistive technologies.
8. The documented Node.js setup, lockfile-based install, production build, and
   Linux CI workflow are reproducible once implementation artifacts exist.

## 9. Success signals

These are evaluation signals, not current measurements:

- A first-time user can identify the recommended next action without reading
  the entire raw log.
- Fixture cases do not regress when rules are added or reordered.
- Users can distinguish a high-confidence causal finding from a low-confidence
  hint and from an unsupported log.
- The tool remains useful with no network access and does not require an AI key.

## 10. Known limitations

Rule-based analysis can miss novel tools, project-specific conventions, or
causes that are absent from the log. Confidence is a prioritization aid, not a
proof. BuildMedic will show uncertainty and evidence so a developer can make
the final decision.
