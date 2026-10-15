# BuildMedic Deployment

**Status:** Planned deployment guidance. The frontend bundle can be built
locally; no Docker image or deployment has been verified yet.

## 1. Deployment model

The MVP is intended to be a static browser application. The analyzer runs in
the user's browser, so a deployment needs only to serve the built assets over
HTTPS. A backend, database, AI provider, and runtime secret are not required.

Suitable targets may include a static hosting service, an object store behind
a CDN, or a minimal Linux web server. The final target will be selected after
the first production build exists.

## 2. Local production workflow (planned)

After the package manifest, lockfile, and scripts are added, the documented
workflow should be:

```text
npm ci
npm run build
npm run preview
```

The exact script names must match `package.json`. A production build must be
served from the generated output rather than the Vite development server. Do
not treat a development server as deployment verification.

## 3. Docker workflow (planned)

The future Dockerfile should be multi-stage:

1. Use a pinned Node.js 22 build image.
2. Copy only manifests first and install with `npm ci`.
3. Copy source, run the production build, and discard build-time dependencies.
4. Serve only the static output from a minimal runtime image.
5. Run as a non-root user, expose only the documented port, and define a
   health/readiness behavior appropriate for a static site.

Docker is unavailable on the Windows development laptop, so no local Docker
build or run result should be reported. GitHub Actions will perform the image
build on an Ubuntu runner once `Dockerfile`, package manifests, lockfile, and
build scripts exist.

## 4. Linux CI verification

The repository workflow at `.github/workflows/ci.yml` runs the available Node.js
checks now and keeps Docker verification gated until the production image
artifacts exist. It is intended to:

- check out the repository;
- select Node.js 22 using `.nvmrc`;
- install exactly from `package-lock.json` with `npm ci`;
- run the offline test and production-build scripts; and
- run `docker build` on the Linux runner.

The workflow now runs the Node.js checks because the package manifest, lockfile,
and scripts exist. It still skips Docker verification until a Dockerfile and
production runtime are added. Record the actual CI run URL or status in release
notes; local setup must never claim that CI passed.

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
