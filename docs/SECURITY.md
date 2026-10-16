# BuildMedic Security

**Status:** Core local-MVP controls are implemented and covered by regression
tests. Pattern-based redaction, browser behavior, dependency supply-chain
review, and deployment configuration still need a broader release security
review.

## 1. Security objectives

- Keep build logs local unless a future user explicitly chooses another mode.
- Never execute commands, evaluate log text, or treat log content as trusted
  configuration.
- Prevent accidental exposure of credentials commonly printed by build tools.
- Bound resource use so untrusted logs cannot freeze the browser or exhaust
  memory.
- Make dependency and release decisions auditable.

## 2. Trust boundaries and assets

| Boundary or asset | Trust level | Main concern |
| --- | --- | --- |
| Pasted or uploaded log | Untrusted | May contain secrets, hostile markup, huge lines, or control characters. |
| Browser analysis pipeline | Local trusted code | Must not execute or transmit input. |
| Rendered evidence | Untrusted text | Must be rendered as text, never as HTML. |
| Rule catalog | Maintainer-controlled | A bad rule can mislead users or create expensive matching. |
| Dependencies and build tooling | External supply chain | Compromise, vulnerable transitive packages, or install scripts. |
| CI artifacts and deployment bundle | Release asset | Must not contain secrets or unreviewed debug data. |

## 3. Threat model and mitigations

| Threat | Mitigation policy | Residual risk |
| --- | --- | --- |
| Token or password appears in a log | Detect common credential patterns, mask in display/copy paths, warn users, and never send logs by default. | Pattern-based redaction cannot identify every secret. |
| Log contains HTML or script text | Render evidence as text and avoid `innerHTML`/HTML interpretation. | A future export format must preserve the same rule. |
| Log triggers catastrophic regex behavior | Use anchored/bounded patterns, compile rules once, cap context, and test adversarial inputs. | New rules can regress performance without review. |
| Oversized input causes memory or UI exhaustion | Enforce byte/line limits before analysis and use bounded result counts. | A browser still has finite resources. |
| Log contains shell commands or URLs | Treat all content as inert evidence; never execute, fetch, or follow it automatically. | Users may manually follow a displayed suggestion. |
| Malicious local file is selected | Read it as text under browser file permissions; do not execute or interpret it as a document. | Browser and OS file-picker behavior remains outside the app. |
| Dependency compromise | Commit a lockfile, review dependency additions, use trusted sources, audit in CI, and minimize runtime dependencies. | No process removes all supply-chain risk. |
| Secret leaks into client build | Keep secrets out of source, `.env` files, logs, and Vite client variables; use placeholders only. | A misconfigured deployment can still expose public data. |
| False diagnosis causes unsafe remediation | Show evidence, confidence, uncertainty, and human-reviewable steps; never run fixes automatically. | A user may still act on a suggestion incorrectly. |

## 4. Input validation and sanitization

The implemented input boundary validates before normalization or rule evaluation:

- accept text content and known text-file selections only;
- reject empty/whitespace-only, binary-looking, oversized, and overlong-line
  input;
- enforce documented byte, line-count, line-length, finding, match, and evidence
  limits;
- decode as text without evaluating file content;
- normalize newlines while retaining line numbers;
- replace or visibly mark control characters that could confuse the UI;
- cap the number of evidence lines and findings returned;
- treat all extracted package names, paths, URLs, and commands as data.

Sanitization is a presentation and sharing control, not a guarantee that a log
is safe to disclose. The UI marks bounded/uncertain results, redacts common
secret-shaped values in evidence/copy/report paths, and provides a way to clear
the active session. Raw log text is not persisted. Whole-log redaction happens
before viewer paging so multiline/incomplete private-key blocks remain masked.
Escaped JSON/environment credentials and long secret values have regression
coverage; unknown secret formats can still escape detection. Review exports.

## 5. Privacy policy for the MVP

- Analysis is in-memory and local to the browser.
- No analytics, crash upload, remote AI, or telemetry endpoint is required.
- No log content belongs in query strings, console output, URLs, or error
  reports.
- Browser storage contains only schema-whitelisted preferences and at most 24
  generic metadata entries (32 KiB maximum JSON read). Labels, IDs, and summaries
  cannot carry filenames, evidence, raw logs, or log-derived fingerprints.
- Session results are transient and bounded to four entries/25 MiB aggregate
  raw-log UTF-8 bytes, not total heap size. Clearing
  session/history evicts these caches and comparison drafts; reload does not
  restore inputs or findings. This is logical deletion, not memory zeroization.
- Worker errors return fixed codes/messages, not exception text. Work is
  cancellable and bounded by a 30-second timeout; no-worker fallback is limited
  to 64 KiB combined input. Browser allocation/GC remains outside these bounds.
- A future hosted mode must be opt-in, separately threat-modeled, authenticated,
  encrypted in transit, retention-limited, and clearly distinguished from the
  local MVP.

## 6. Dependency and build security

- Pin Node.js 22.22.3 in `.nvmrc` and both Docker stages; commit `package-lock.json`.
- Prefer a small dependency set and browser-native APIs where practical.
- Review licenses and transitive dependency changes in pull requests.
- Run `npm audit --audit-level=high` during release review, treating high/critical
  production-path issues as blockers unless explicitly accepted. The local
  2026-10-16 audit reported zero vulnerabilities; audit is online and not part of
  the offline test command or current CI workflow. It is not a full security review.
- Avoid lifecycle scripts that execute unreviewed code during install.
- Do not put private keys, tokens, or machine-specific paths in the repository.
- Build artifacts must be reproducible from a clean checkout and documented
  toolchain.

The production server sends a restrictive CSP including `worker-src 'self'`,
rejects unsupported methods, and returns 404 for missing assets rather than SPA
HTML. The host must provide HTTPS; HTTP smoke checks do not verify browser CSP
enforcement. Same-origin extensions, developer tools, and compromised browsers
are not isolation boundaries this application can control.

## 7. Vulnerability handling

When a security issue is suspected:

1. Do not publish secrets or exploit details in a public issue.
2. Reproduce with the smallest sanitized input possible.
3. Notify maintainers through the repository's private security-reporting
   channel when available; otherwise use the maintainer contact documented by
   the GitHub repository.
4. Assess affected versions, exposure, and whether logs or artifacts contain
   sensitive data.
5. Ship a minimal fix, regression test, and changelog entry where appropriate.
6. Document the user action required to upgrade or rotate exposed credentials.

## 8. Security review checklist

Before an implementation release, reviewers should confirm:

- no user-controlled string is interpreted as HTML or code;
- no network request contains raw log content without explicit product review;
- size and result limits are enforced before expensive work;
- new rules have adversarial and secret-like fixtures;
- dependency and lockfile changes are reviewed;
- production bundles contain no secrets or debug log payloads;
- security-sensitive behavior has a test and a documented limitation.
