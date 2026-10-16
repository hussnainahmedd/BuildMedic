# BuildMedic Deployment

**Status:** The frontend bundle and multi-stage Dockerfile are implemented.
Docker verification is performed in Linux CI because Docker is unavailable on
the Windows development machine. Hardening code `4ae575e`, included in revision
`3f8318f`, passed [CI run 38897847991](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38897847991):
Linux tests/typecheck/lint/build, pinned Docker build, container startup, and
production HTTP/worker-asset smoke. That historical run did not establish browser
execution. The final QA workflow additionally checks Chromium/Firefox/WebKit
against the non-root production container; current revision receipts and gaps
are in [QA-RELEASE.md](QA-RELEASE.md). No public deployment has been performed.

## 1. Deployment model

The MVP is intended to be a static browser application. The analyzer runs in
the user's browser, so a deployment needs only to serve the built assets over
HTTPS. A backend, database, AI provider, and runtime secret are not required.

Suitable targets may include a static hosting service, an object store behind
a CDN, or the included minimal Linux web server/container. Static hosts must
support SPA route fallback, correct JavaScript MIME types, and same-origin module
workers. Do not rewrite missing JS assets to HTML. No hosted target is configured.

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
