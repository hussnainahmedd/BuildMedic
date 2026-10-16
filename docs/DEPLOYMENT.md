# BuildMedic Deployment

**Status:** The frontend bundle and multi-stage Dockerfile are implemented.
Docker verification is performed in Linux CI because Docker is unavailable on
the Windows development machine. The prior local-MVP checkpoint passed CI run
[38818606997](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38818606997)
at `fae0860`; that result does not verify later worker/hardening changes.

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

## 4. Linux CI verification

The repository workflow at `.github/workflows/ci.yml` performs the complete
Linux verification flow:

- check out the repository;
- select Node.js 22.22.3 using `.nvmrc` on Ubuntu 24.04;
- install exactly from `package-lock.json` with `npm ci`;
- run test, typecheck, lint, and production-build scripts; and
- build the Docker image, start it, and run `tests/production-smoke.mjs` against
  it (health, SPA, worker asset, CSP, missing assets, unsupported method).

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
