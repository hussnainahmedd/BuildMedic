# BuildMedic Validation and Accessibility

**Status:** Proposed UI and input-validation specification; no form is
implemented yet.

## 1. Validation model

Validation is split into three layers:

1. **Syntactic:** Can the browser read the value and is it within the size and
   file constraints?
2. **Semantic:** Does the value contain usable log content rather than only
   whitespace or an unsupported format?
3. **Analysis:** Did the analyzer complete, find supported signals, or reject
   the input for a domain reason?

The UI must not label an analyzable input as invalid merely because no rule
matched. “Valid, no supported diagnosis” is a distinct state.

## 2. Primary log form

| Field or action | Rule | Message |
| --- | --- | --- |
| Log text | Required after trimming whitespace | `Paste a build log to analyze.` |
| Log text | Must be at or below the configured byte limit | `This log is too large. Reduce it to {limit} or less.` |
| Log text | Must decode as text | `We could not read this input as text.` |
| File selection | Accept text-like files only; do not trust extension alone | `Choose a readable text log file.` |
| File selection | Apply the same byte limit as pasted text | `This file is too large. Choose a smaller log.` |
| Analyze action | Disabled only when submission cannot succeed; explain why | `Add a log before analyzing.` |
| Analysis result | No rule match is not a validation error | `No supported diagnostic matched this log.` |

The final byte limit must come from the shared domain policy so pasted and file
inputs cannot drift. Line endings are normalized after validation while source
line numbers remain stable.

## 3. Verification form

The verification flow has two inputs:

- **Baseline log:** required and independently valid.
- **Rerun log:** required and independently valid.

Messages:

- `Add the original build log before verifying a fix.`
- `Add the rerun build log before verifying a fix.`
- `The baseline and rerun logs must be readable text.`
- `The rerun could not be compared because the baseline analysis was invalid.`

The two inputs may be identical. In that case, the UI should report that no
change was detected rather than claiming a fix failed. If either analysis has
an invalid status, the comparison must not produce resolved/persistent/new
labels.

## 4. Validation timing and recovery

- Show required-field feedback on submit and on blur after a user has touched a
  field.
- For optional live counters, update after a short debounce rather than on
  every expensive analysis pass.
- Keep valid user input visible after an error so it can be corrected.
- Place focus on the first invalid field after submission when doing so does
  not interrupt assistive technology.
- Clear errors when the value becomes valid, but do not hide a result that is
  still relevant without user action.
- If analysis fails unexpectedly, preserve the input and show a retry action;
  do not expose a stack trace or log payload in the message.

## 5. Accessibility requirements

The core flow should target WCAG 2.2 AA:

- every text area, file control, button, filter, and verification field has a
  visible label or an equivalent accessible name;
- associate messages with controls through `aria-describedby` and use
  `aria-invalid` only when invalid;
- announce validation, analysis completion, and high-level errors through a
  polite live region without flooding screen readers with raw log lines;
- preserve a logical keyboard order and a visible focus indicator;
- do not make color the sole indicator of severity or verification state;
- provide text labels for severity, confidence, and resolved/persistent/new;
- keep contrast and target sizes usable at normal zoom and high zoom;
- support reduced motion and avoid essential time limits;
- ensure evidence can be read and copied without requiring hover or precise
  pointer selection;
- use headings and landmarks so results can be navigated efficiently.

## 6. Edge cases

The UI and domain layer must define behavior for:

- empty, whitespace-only, and null-like input;
- CRLF, LF, and mixed newline input;
- a single very long line;
- invalid byte sequences or a file that cannot be read;
- binary-looking content;
- duplicate errors and repeated stack traces;
- logs with timestamps, ANSI color codes, control characters, or Unicode;
- a log with no supported rule match;
- a log that matches several competing rules;
- a baseline with no findings and a rerun with findings;
- a baseline with findings and a clean rerun;
- identical baseline and rerun content;
- input containing credential-like strings or private filesystem paths;
- limits exceeded during file selection rather than after full loading.

## 7. Testable acceptance checks

Each validation rule should have a valid boundary case, an invalid boundary
case, the exact user-facing message, and an accessibility assertion. The
validation specification is complete only when the tests in `docs/TESTING.md`
cover both paste and file paths with the same domain policy.
