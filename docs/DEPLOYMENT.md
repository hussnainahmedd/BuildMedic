# BuildMedic Deployment

**Status:** The frontend bundle and multi-stage Dockerfile are implemented.
Docker verification is performed in Linux CI because Docker is unavailable on
the Windows development machine. Run `38806248540` passed the image build,
container startup, `/health` check, and homepage smoke check.

## 1. Deployment model

The MVP is intended to be a static browser application. The analyzer runs in
the user's browser, so a deployment needs only to serve the built assets over
HTTPS. A backend, database, AI provider, and runtime secret are not required.

Suitable targets may include a static hosting service, an object store behind
a CDN, or a minimal Linux web server. The final target will be selected after
the first production build exists.

## 2. Local production workflow

Use the pinned Node.js 22 runtime and committed lockfile:

```text
npm ci
npm run build
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

1. Use a pinned Node.js 22 build image.
2. Copy only manifests first and install with `npm ci`.
3. Copy source, run the production build, and discard build-time dependencies.
4. Serve only the static output from a minimal runtime image.
5. Run as a non-root user, expose port `4173`, and define a health check for
   `/health`.

Docker is unavailable on the Windows development laptop, so no local Docker
build or run result is claimed. GitHub Actions performs the image build and
container smoke test on an Ubuntu runner.

## 4. Linux CI verification

The repository workflow at `.github/workflows/ci.yml` performs the complete
Linux verification flow:

- check out the repository;
- select Node.js 22 using `.nvmrc`;
- install exactly from `package-lock.json` with `npm ci`;
- run test, lint, and production-build scripts; and
- build the Docker image, start it, check `/health`, and smoke-test `/`.

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
