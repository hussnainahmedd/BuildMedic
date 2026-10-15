# BuildMedic Testing Strategy

**Status:** The offline unit and component suite is implemented for the current
local MVP. Performance measurement, manual accessibility, cross-browser, and
browser-level automation remain release-hardening work.

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

## 5. Planned commands and checks

The repository defines the following offline checks:

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

At this checkpoint, `npm test` covers the analyzer, diagnostics, verification,
validation, security boundaries, and critical workspace flows. The latest local
run must be recorded from the actual command output; do not infer browser,
accessibility, performance, or Docker results from the unit suite. GitHub
Actions runs the Node.js 22 checks on Linux. Docker build verification belongs
in Linux CI because Docker is unavailable on the local Windows machine.

## 6. Coverage and release gates

Initial targets, to be confirmed after the first implementation slice:

- meaningful branch coverage for every diagnostic rule;
- at least one regression fixture for every supported error family;
- all P0 acceptance criteria covered by automated or documented manual checks;
- no high-severity accessibility or security finding open at release;
- production build and offline test command pass from a clean checkout.

Coverage percentage alone is not a release gate. Uncovered parsing boundaries,
validation branches, and failure states must be reviewed explicitly.
