# BuildMedic — production QA repair receipt

Date: **2026-10-16** (Asia/Karachi). Repair source:
**`e6dde230740909b3a25728c0000bc79a3fa8686e`**. Baseline: `565770f`.
Scope: existing production UI, hosting and regression coverage; no diagnostic
engine, dependency, video or submission changes. Unrelated local media work was
excluded from the commits.

## Repaired issues

| Issue | Cause and focused repair |
| --- | --- |
| Vercel direct routes/reloads | No SPA configuration existed. `vercel.json` now applies security headers, checks the filesystem, then falls back for extensionless React paths. Unknown application paths render the existing branded 404; missing assets remain real 404s. |
| 320 px populated Analysis | Non-wrapping severity filters imposed an intrinsic minimum, growing `main.scrollWidth` to 334 within a 320 px viewport. Shrinkable grid tracks/children and whole-control filter wrapping remove the overflow. Evidence and full viewer text preserve whitespace and remain accessible through wrapping/normal viewer scrolling. |
| Render WebKit CSP | An isolated plain native select reproduces WebKit's internal inline `text-overflow:inherit` declaration. An exact SHA-256 style-attribute allowlist fixes it without unsafe-inline/eval, removing controls or replacing the UI. |
| Vercel security parity | Both hosts now use aligned CSP, nosniff, DENY framing, no-referrer, Permissions-Policy, same-origin COOP/CORP and HSTS. Real module workers and Blob downloads remain functional. |
| Favicon and mobile controls | Added an SVG version of the existing brand mark and explicit icon link. Restored public mobile theme access; small-screen header controls are 44×44 px, with 24 px minimum tested form/control targets. |

Render's health response also reports a validated provider Git revision, allowing
the deployment's identity to be checked before live tests. No environment dump
or secret is exposed. Detailed configuration and rollback steps are in
[DEPLOYMENT.md](DEPLOYMENT.md); the exact CSP exception is in
[SECURITY.md](SECURITY.md).

## Verification results

| Check | Result |
| --- | --- |
| `npm test` | **249 passed**, 16 files, no skips; 69 additional HTTP/config regressions |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS**, pinned Node 22.22.3; production module worker emitted |
| `npm run smoke` | **PASS**: health, SPA paths, worker MIME/content, CSP, missing assets, rejected writes |
| `npm run test:e2e` | **57 passed**, Chromium/Firefox/WebKit; existing 42 plus 15 production regressions |
| Final filter-label adjustment | All checks above plus the focused **15/15** production cases rerun; final exact source also passed all 57 in Linux CI |
| Linux CI | **PASS**, [run 38931948471](https://github.com/hussnainahmedd/BuildMedic/actions/runs/38931948471), exact repair SHA above |
| CI clean checkout | Lockfile install, unit/lint/type/build, advisory audit and bounded benchmarks passed |
| CI containers | Both production and isolated QA images built; non-root production startup and HTTP smoke passed |
| CI browser artifact | Downloaded `browser-qa-evidence`: **57 expected, 0 skipped, 0 unexpected, 0 flaky** |
| Vercel live | **15/15 passed**, all three engines, after the revision/artifact gate |
| Render live | **15/15 passed**, all three engines, after the revision/artifact gate |

### Live deployment identity gate

Before live retesting, GitHub's Vercel status reported successful deployment of
the exact repair SHA. Render `/health` independently returned the same full
`revision`. Both production aliases served SHA-256-identical HTML, JS, CSS,
deferred runtime, worker and favicon matching the reviewed local build.
The checks completed at **21:27 Asia/Karachi**, before the browser matrix began.

| Artifact | SHA-256 on both hosts and local build |
| --- | --- |
| `/` | `4cea8d5d143de9bf660f46fedef6f4ab2f27b62aaeadca46e0fe05fbdcf6e915` |
| `/assets/index-LRuh4hZK.js` | `be3a8fb6bcedd531f561774eec83215733e90851b6d35f22dbc045816768ef92` |
| `/assets/index-DDrLjFdk.css` | `5d54a1f27b6de8270f2c74aee425a12f228ad431eb1551243a32ef64270f0395` |
| `/assets/analysis.worker-BBwjFJ6x.js` | `86ec4aa10b79c478793c737da456d99bfd46d597eb2bae4526f2610f34595c38` |
| `/assets/runtime-ChyEOKiN.js` | `0dbe999d7408dde70737dec1f3e2395d80dbe3a38b646b65e04ac902b5751ab8` |
| `/favicon.svg` | `5c4834ee01707bab51bcbde5198aeeb6d5e05502a04b02295a1a88594669dd2c` |

### Behavior exercised

- All 18 React route entries, direct requests, refresh and trailing slashes;
  public/workspace/nested unknown paths display BuildMedic's branded 404.
- Missing scripts/workers/styles/images/assets return 404 for GET and HEAD,
  rather than React HTML. Real hashed assets and the configured SVG icon load.
- Populated Analysis, cards, filters, forms and long evidence at **320, 390, 768,
  1440 px**. Both main scroll width and descendant bounds are asserted, preventing
  existing outer overflow clipping from hiding a regression. The original full
  workspace layout loop now explicitly measures Analysis too.
- Genuine emitted Web Workers perform analysis and before/after verification;
  sanitized text downloads contain findings but not the synthetic secret.
- Native sorting, report tabs, command dialog focus, theme changes and minimum
  mobile target bounds remain functional. Existing full-suite axe checks pass.
- Screenshot-free application journey: **zero console errors, uncaught errors
  or CSP violations on both hosts in all engines**, including WebKit. Separate
  negative tests prove arbitrary inline scripts, style attributes and style
  elements are still blocked; those intentional violations are not app errors.

The first live Vercel route case rejected Firefox's legitimate HTTP **304** on
reload. The harness now accepts only **200 or 304** for reload, still requires
200 on direct requests and asserts the actual rendered heading/branded screen.
The complete Vercel matrix was rerun and passed; the failed harness run is not
counted as a pass. The receipt/harness follow-up changes no deployed app assets.

## Reproduce

From the repository root with `.nvmrc` Node 22.22.3 and the committed lockfile:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
npm run test:e2e
```

For live checks, first verify the exact current commit's Vercel status, Render
health revision and built artifact hashes as described in the deployment guide.
The following commands retain separate live results rather than overwrite local
evidence (Bash syntax; no global installation):

```sh
BUILDMEDIC_BASE_URL=https://build-medic.vercel.app PLAYWRIGHT_JSON_OUTPUT_FILE=.cache/live-qa-vercel-final.json npm run test:e2e -- production-qa.spec.ts --output=.cache/live-qa-vercel-final --reporter=list,json
BUILDMEDIC_BASE_URL=https://buildmedic.onrender.com PLAYWRIGHT_JSON_OUTPUT_FILE=.cache/live-qa-render.json npm run test:e2e -- production-qa.spec.ts --output=.cache/live-qa-render --reporter=list,json
```

Local synthetic evidence: `.cache/production-qa-deployments.json`,
`.cache/live-qa-vercel-final.json`, `.cache/live-qa-render.json`, the corresponding
screenshots and `.cache/ci-production-qa/results.json`. These generated files are
ignored by Git. The immutable CI receipt above retains its Actions artifact for
14 days. Historical QA remains in [QA-RELEASE.md](QA-RELEASE.md).

## Remaining limits

No application failure remains in this requested matrix. Local Docker remains
unavailable, but the clean Linux/container/browser CI passed. Viewport emulation
and WebKit do not certify physical devices, branded Safari/iOS, manual screen
readers or full WCAG compliance. Previously documented large-log UI pauses and
unverified peak-memory limits remain unchanged. No new performance claim is made.
