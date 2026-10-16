# BuildMedic Deployment

**Status:** The frontend bundle and multi-stage Dockerfile are implemented.
Docker verification is performed in Linux CI because Docker is unavailable on
the Windows development machine. Hardening code `4ae575e`, included in revision
`3f8318f`, passed [CI run 38897847991](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38897847991):
Linux tests/typecheck/lint/build, pinned Docker build, container startup, and
production HTTP/worker-asset smoke. That historical run did not establish browser
execution. The final QA workflow additionally checks Chromium/Firefox/WebKit
against the non-root production container; current revision receipts and gaps
are in [QA-RELEASE.md](QA-RELEASE.md). Production hosts are
[Vercel](https://build-medic.vercel.app/) and
[Render](https://buildmedic.onrender.com/); see section 7 for their configuration
and revision checks. Historical CI results below are not evidence for a newer commit.
The production repair receipt is in [PRODUCTION-QA.md](PRODUCTION-QA.md).
Final QA source `efaa547` passed
[CI 38914960876](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38914960876),
including clean Linux rebuild, both Docker targets, non-root startup/HTTP and
all 42 production-container browser scenarios.

## 1. Deployment model

The MVP is intended to be a static browser application. The analyzer runs in
the user's browser, so a deployment needs only to serve the built assets over
HTTPS. A backend, database, AI provider, and runtime secret are not required.

Suitable targets may include a static hosting service, an object store behind
a CDN, or the included minimal Linux web server/container. Static hosts must
support SPA route fallback, correct JavaScript MIME types, and same-origin module
workers. Do not rewrite missing JS assets to HTML. `vercel.json` configures the
static Vercel target; `server.mjs` supplies the Render/container target.

## 2. Local production workflow

Use the pinned Node.js 22.22.3 runtime and committed lockfile:

```text
npm ci
npm run build
npm run smoke
npm run start
```

The production server listens on `0.0.0.0:4173` by default and serves the
generated `dist/` output with SPA fallback. Verify it locally with:

```text
curl --fail http://127.0.0.1:4173/health
curl --fail http://127.0.0.1:4173/
```

The development server remains `npm run dev`; it is not production verification.

## 3. Docker workflow

The committed `Dockerfile` is multi-stage:

1. Use `node:22.22.3-bookworm-slim` in both build and runtime stages.
2. Copy only manifests first and install with `npm ci`.
3. Copy source, run the production build, and discard build-time dependencies.
4. Serve only the static output from a minimal runtime image.
5. Run as a non-root user, expose port `4173`, and define a health check for
   `/health`.

```sh
docker build --pull --tag buildmedic:local .
docker run --rm --name buildmedic-local --publish 4173:4173 buildmedic:local
```

From a second terminal with project dependencies installed:

```sh
node tests/production-smoke.mjs http://127.0.0.1:4173
```

Stop the foreground container with Ctrl+C. Redeploy/rollback by building and
running a reviewed commit's image; preserve a prior known-good image tag before
replacing a deployment. There is no database migration or stored server log data.
HTTPS termination is the deployment host's responsibility.

Docker is unavailable on the Windows development laptop, so no local Docker
build or run result is claimed. GitHub Actions performs the image build and
container smoke test on an Ubuntu runner.

An optional `browser-qa` target installs its browser OS packages inside Docker
and runs the production browser suite. It is not included in the default final
runtime image:

```sh
docker build --target browser-qa --tag buildmedic:qa .
docker run --rm --shm-size=1g buildmedic:qa
```

The standalone QA image starts its own loopback production server. CI uses
`BUILDMEDIC_BASE_URL` and host networking to test a separate production container
instead. The browser wrapper stores binaries under `.cache/ms-playwright/`;
do not install browser system dependencies globally or with host sudo.

## 4. Linux CI verification

The repository workflow at `.github/workflows/ci.yml` performs the complete
Linux verification flow:

- check out the repository;
- select Node.js 22.22.3 using `.nvmrc` on Ubuntu 24.04;
- install exactly from `package-lock.json` with `npm ci`;
- run test, typecheck, lint, production-build, advisory audit and benchmark scripts;
- build the production and browser-QA Docker images;
- start the production image, assert its non-root user and run
  `tests/production-smoke.mjs` (health, SPA, worker asset, CSP, missing assets,
  unsupported method);
- run the three-engine production browser suite against that container; and
- retain synthetic screenshots/results/failure traces for 14 days.

Missing manifests, scripts, Dockerfile, image startup, health responses, or
homepage content fail the workflow. Record the actual CI run URL or status in
release notes; local setup must never claim that CI passed.

## 5. Configuration and secrets

The static MVP should not require secrets. Build-time public configuration must
be reviewed because Vite client variables are visible to users. Never place
private keys, tokens, credentials, or local absolute paths in a client bundle,
Docker image, workflow log, or repository file.

If a future hosted mode introduces environment variables, document:

- whether each value is public or secret;
- where it is configured in each environment;
- rotation and revocation steps;
- safe defaults and behavior when it is missing; and
- whether the value is embedded into browser assets.

## 6. Release checklist

- clean checkout succeeds on the pinned Node.js version;
- lockfile install is reproducible;
- tests, build, security, and accessibility checks have actual evidence;
- production assets contain no secrets or raw fixture logs;
- static headers include HTTPS, appropriate content types, and a restrictive
  policy suitable for the final hosting target;
- Linux Docker build succeeds in CI if the image is published;
- version and changelog entries identify limitations and supported browsers;
- rollback or redeploy steps are written for the selected hosting target.

## 7. Vercel and Render production operations

### Vercel — static frontend

- Connect the existing GitHub repository, production branch `main`, project root
  `.`, Vite preset, Node 22.x, install `npm ci`, build `npm run build`, output `dist`.
  No runtime secrets, functions, or external analyzer are required.
- Keep committed `vercel.json`. Its first route applies security headers with
  `continue`, followed by `handle: filesystem`. Only missing extensionless paths
  outside `/assets` fall back to `/index.html` for GET/HEAD. React handles valid
  pages and branded unknown-page UI. Missing dotted/encoded asset-like paths and
  the assets namespace return genuine 404s, never successful SPA HTML.
- This is intentionally a static host: `/health` is not a JSON health API there.
  Use the homepage, emitted assets and GitHub's **Vercel** commit status as the
  deployment readiness checks. Do not substitute a generic Vercel 404 for the
  application's extensionless unknown-route handling.

### Render — production Node server or existing Docker service

- For the Node service: project root `.`, Node 22.22.3, build
  `npm ci && npm run build`, start `npm start`, health path `/health`. Render
  supplies `PORT`; the server binds `0.0.0.0`. The Docker alternative uses the
  default final runtime target already documented above, not a QA/media target.
- Keep `server.mjs` in the deployment. It serves the same restrictive policy as
  Vercel, real JavaScript module MIME types, immutable hashed assets and uncached
  HTML. No dependency install is needed by the final container runtime.
- `/health` returns `service` and `status`, plus `revision` when Render's
  `RENDER_GIT_COMMIT` is a valid full Git SHA. An explicitly supplied
  `BUILDMEDIC_COMMIT` is the equivalent for another container host. Unset/invalid
  values are omitted; no full environment or private configuration is exposed.

### Verify the deployed revision before live QA

After pushing `main`, first check the exact commit's CI and Vercel status:

```sh
git rev-parse HEAD
gh run list --branch main --limit 5
gh api repos/hussnainahmedd/BuildMedic/commits/main/status
curl --fail https://buildmedic.onrender.com/health
```

Require the successful Vercel status to reference the intended SHA and Render's
health `revision` to match it. Also compare each host's HTML-linked JS/CSS,
worker and favicon with the local production build (SHA-256); a stale CDN or
alias can otherwise point at an older build despite a successful provider job.
If revision identity cannot be established, report it as unverified and do not
claim a live repair from tests of the old deployment. Do not trigger an
unnecessary redeploy to mask a failure; inspect provider logs/settings first.

Once both revision gates pass, run the targeted production QA on each host:

```sh
BUILDMEDIC_BASE_URL=https://build-medic.vercel.app npm run test:e2e -- production-qa.spec.ts
BUILDMEDIC_BASE_URL=https://buildmedic.onrender.com npm run test:e2e -- production-qa.spec.ts
```

It exercises all direct routes/refreshes, branded unknown routes, asset misses,
headers, native selects, genuine worker analysis/comparison, sanitized downloads,
inline CSP blocking, long evidence, 320/390/768/1440 px geometry, touch target
minimums and mobile theme access in Chromium/Firefox/WebKit. The screenshot-free
CSP/console case is separate: WebKit screenshot tooling itself may inject an
empty `body {}` stylesheet and generate a tooling-only violation. Never count
that as application evidence or silence genuine violations by weakening CSP.

Rollback means redeploying a reviewed prior commit on the existing provider and
checking the alias, revision and assets again. Keep the last known-good commit
available; no database migration or destructive history rewrite is needed.
