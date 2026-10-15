# BuildMedic Architecture

**Status:** Proposed design; no application modules are implemented yet.

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

## 2. Planned repository boundaries

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

The directory names are structural only at this stage. The eventual module
names may be refined without changing the public product behavior.

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

### Analyzer

The analyzer accepts validated text and produces a normalized representation.
It should handle CRLF/LF/CR newlines, preserve original line ordering, and
extract bounded context around recognized signals. It should not decide how a
finding is rendered.

### Diagnostics

The diagnostics module owns the rule catalog and transforms extracted signals
into findings. A rule should declare its stable identifier, category, matching
conditions, evidence requirements, explanation, severity policy, confidence
policy, and remediation metadata. Rules should be deterministic and safe to
evaluate on adversarial text.

### Verification

Verification compares structured baseline and rerun results. It should match
findings by stable rule/signature identity rather than by array position and
return `resolved`, `persistent`, or `new` states. It must also distinguish “no
finding detected” from “input could not be analyzed.”

### Types

Shared types define the contracts between modules. A conceptual finding
contains a stable ID, category, severity, confidence, explanation, evidence
line references, suggested actions, and rule-catalog version. Types should
make invalid states difficult to represent, especially for validation and
verification outcomes.

### UI

The React layer presents the input form, analysis state, finding list, evidence
detail, and verification comparison. It adapts domain results to accessible
components but must not duplicate matching logic. Loading, empty, invalid,
no-match, and unexpected-error states are first-class UI states.

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

## 6. Conceptual result model

The planned result shape is intentionally serializable:

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

This is a design sketch, not an implemented API or a commitment to exact field
names. The finalized contract belongs in source-level types and tests.

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
