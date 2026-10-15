# BuildMedic Architecture

**Status:** Implemented local MVP architecture. The analyzer, diagnostics,
verification engine, and React workspace are connected; no backend is required.

## 1. Design principles

1. **Local by default.** Log analysis happens in the browser without a backend
   or external AI request.
2. **Pure domain logic.** Parsing, rule matching, ranking, and verification do
   not depend on React, the DOM, or browser storage.
3. **Evidence before explanation.** Every finding points back to normalized log
   lines and records the rule that produced it.
4. **Safe failure.** Unknown input produces an explicit no-match result rather
   than a confident guess.
5. **Small extension surface.** New diagnostic rules should not require changes
   to the UI or to unrelated rule families.

## 2. Repository boundaries

```text
src/
  analyzer/       Input normalization, line extraction, and analysis pipeline
  diagnostics/    Rule catalog, finding construction, ranking, explanations
  verification/   Baseline/rerun comparison and verification outcomes
  types/          Shared domain contracts and discriminated result types
  ui/             React views, interaction state, and presentation adapters
tests/
  fixtures/       Sanitized logs and expected analysis outcomes
  unit/           Domain and UI-adapter tests
docs/             Product, architecture, security, and delivery decisions
```

The directory boundaries are enforced by imports and tests. New rules should
remain independent of React, storage, and browser APIs.

## 3. Data flow

```text
paste/file
   ↓
input validation and size check
   ↓
normalization (encoding/newlines/line numbers)
   ↓
signal extraction (error codes, packages, commands, context)
   ↓
diagnostic rule evaluation
   ↓
deduplication and causal ranking
   ↓
typed analysis result → React result view
                         ↓
                 optional baseline/rerun verification
```

The UI owns transient interaction state. The domain pipeline receives explicit
values and returns serializable results. No module should read from the
filesystem, run a process, or make a network request as part of analysis.

## 4. Module responsibilities

### Analyzer (implemented)

The analyzer accepts text or an `AnalysisRequest`, validates bounded input,
handles CRLF/LF/CR newlines, preserves original line ordering, extracts bounded
context, and returns `AnalysisResult`. It never executes or fetches values from
the log.

### Diagnostics (implemented)

The diagnostics module owns the versioned rule catalog and transforms extracted
signals into findings. Each rule declares a stable identifier, category,
matching conditions, evidence requirements, explanation, severity/confidence
policy, and remediation metadata. Rules are deterministic and bounded for
adversarial text.

### Verification (implemented)

Verification compares structured baseline and rerun results. It matches by
normalized rule/signature identity rather than array position and returns
`resolved`, `persistent`, `new`, or `uncertain` states. It distinguishes no
supported match from invalid input and never infers that a build passed.

### Types

Shared types define the contracts between modules. A conceptual finding
contains a stable ID, category, severity, confidence, explanation, evidence
line references, suggested actions, and rule-catalog version. Types should
make invalid states difficult to represent, especially for validation and
verification outcomes.

### UI (implemented)

The React layer presents the input form, analysis state, finding list, evidence
detail, reports, metadata history, and verification comparison. It adapts
domain results to accessible components but does not own diagnostic matching.
Loading, empty, invalid, no-match, partial, and unexpected-error states are
first-class UI states.

## 5. Component boundaries

- **Input boundary:** Converts user paste/file events into a validated domain
  input. It owns file metadata and user-facing validation messages.
- **Analysis boundary:** Receives text and options; returns a result or a typed
  validation failure. It has no UI imports.
- **Presentation boundary:** Maps findings to cards, filters, and evidence
  views. It does not re-run regular expressions.
- **Verification boundary:** Receives two analysis results or two validated
  inputs and returns a comparison. It does not infer success from UI state.
- **Export boundary:** If a summary is copied, it consumes structured results;
  it does not expose unsanitized internal objects by default.

## 6. Result model

The result shape is intentionally serializable:

```text
AnalysisResult
  status: "complete" | "no-match" | "invalid"
  input: { lineCount, byteCount, normalizedNewlines }
  findings: Finding[]
  ruleCatalogVersion

Finding
  id
  ruleId
  category
  severity
  confidence
  title
  explanation
  evidence: { lineNumber, text }[]
  suggestedActions: Action[]
  verificationHint
```

The source-level contracts in `src/types/analysis.ts`, `finding.ts`, and
`verification.ts` are the implementation source of truth. Analysis metadata
marks capped/partial work so absence of a finding is not presented as
exhaustive.

## 7. Technical decisions

- **React + Vite:** A small, static browser application with fast local
  iteration and a conventional production build.
- **TypeScript:** Shared contracts and strict checking for analyzer results,
  validation state, and UI boundaries.
- **Vitest:** Fast offline unit and integration testing using sanitized fixtures.
- **No backend in MVP:** Reduces privacy risk, deployment complexity, and
  external-service dependency.
- **No AI requirement:** Deterministic rules make results reproducible,
  testable, explainable, and available offline.
- **Plain CSS initially:** Avoids a component-library dependency and keeps the
  visual system under project control.

## 8. Extension and evolution

New rule families should be added as data plus a small evaluator, with fixtures
for positive, negative, ambiguous, and adversarial cases. If a future hosted
mode is needed, the pure analyzer can be wrapped by a service boundary without
making the browser MVP dependent on it. See `docs/API.md` for the intentional
absence of an MVP backend API.

## 9. Operational boundaries

The browser bundle is the only required runtime for the MVP. A future static
production image may be served by a minimal non-root web server. Build-time
tooling and deployment configuration must not introduce secrets into the
client bundle. See `docs/SECURITY.md` and `docs/DEPLOYMENT.md`.

## 10. Frontend implementation

The current frontend keeps the engine seam visible rather than hiding it:

- `src/components/` contains reusable controls, icons, layout shells, badges,
  dialogs, forms, and status primitives.
- `src/pages/public.tsx` contains the public product, documentation, support,
  privacy, security, and not-found surfaces.
- `src/pages/workspace.tsx` contains the overview, input, result, log viewer,
  verification, history, reports, settings, and help surfaces.
- `src/styles.css` defines the dark-first/light-mode token system, responsive
  layouts, spring-like CSS transitions, focus states, and reduced-motion rules.
- `src/data/` contains sanitized, explicitly marked example input and legacy
  presentation fixtures. The live workspace does not use fixture findings or
  fixture verification results as analysis output.
- `src/lib/validation.ts` is a browser-independent input boundary that can be
  reused when the live engine is connected.

Navigation is intentionally implemented without a router dependency: internal
paths use the History API and render from typed route boundaries. This keeps the
static MVP small while leaving room for a router if future route-level code
splitting justifies one.
