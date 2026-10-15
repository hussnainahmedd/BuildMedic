# Contributing to BuildMedic

BuildMedic is an open-source developer-tool project. Contributions should make
diagnostics safer, clearer, more reproducible, or easier to validate. The
current repository contains documentation and structure only; implementation
conventions below apply when the application scaffold is introduced.

## 1. Before starting

1. Read `README.md`, `docs/PRD.md`, and the relevant design document.
2. Check existing issues and pull requests before starting duplicate work.
3. For a behavior change, describe the user outcome and acceptance criteria.
4. Do not include real logs, credentials, private paths, or proprietary data in
   issues, fixtures, commits, or screenshots.

## 2. Local setup

The intended toolchain is Node.js 22, TypeScript, React, Vite, and Vitest. The
package manifest, lockfile, and scripts are not present in this documentation-
only state. Once they are added, setup will be:

```text
npm ci
npm test
npm run build
```

Use the version specified by `.nvmrc`. Do not install project dependencies
globally, use `sudo`, or rely on tools that are not declared in the repository.
Docker is verified in Linux CI rather than on the Windows development machine.

## 3. Branches and pull requests

- Create a focused branch from the current default branch.
- Keep one logical change per pull request where practical.
- Explain the problem, the approach, scope, limitations, and verification
  commands in the PR description.
- Link the relevant requirement or issue.
- Update documentation and changelog entries when user-visible behavior or
  security/performance assumptions change.
- Keep generated output, local environment files, secrets, and machine-specific
  paths out of commits.

## 4. Coding conventions

When code exists:

- prefer strict TypeScript and explicit domain types;
- keep analyzer, diagnostics, verification, and UI responsibilities separated;
- keep domain functions deterministic and independent of the DOM;
- render user-controlled text as text, never as HTML;
- make limits and rule identifiers explicit and testable;
- keep user-facing uncertainty honest; do not turn a heuristic into a fact;
- use accessible labels, focus behavior, error associations, and text labels
  for non-color states;
- add or update a sanitized fixture for every new diagnostic rule;
- avoid dependencies unless the security, maintenance, and performance tradeoff
  is documented.

## 5. Commit messages

Use concise Conventional Commit-style prefixes:

```text
feat: add lockfile mismatch diagnostic
fix: preserve evidence line numbers after normalization
docs: clarify local privacy guarantees
test: cover unresolved verification state
refactor: isolate rule ranking
chore: update Node.js toolchain metadata
```

Do not include secrets or raw logs in commit messages.

## 6. Review checklist

Reviewers should verify:

- the change satisfies an explicit user outcome;
- tests cover normal, boundary, invalid, and no-match cases;
- input remains local and inert;
- evidence and confidence are explainable;
- resource limits and accessibility are preserved;
- docs and changelog statements distinguish implemented behavior from plans;
- the smallest meaningful local checks were run and their results are stated.

## 7. Security reports

Do not disclose credentials or exploitable details in a public issue. Use the
repository's private GitHub security-reporting channel when enabled. If it is
not available, contact the maintainers through the channel documented in the
repository before public disclosure. See `docs/SECURITY.md` for handling
expectations.

## 8. License

By contributing, you agree that your contribution is provided under the MIT
License in the repository unless a separate written agreement says otherwise.
