import type { FindingConfidence, FindingSeverity, SuggestedAction } from "../types";
import { redactSensitiveText } from "../analyzer/normalize";

import type { DiagnosticCandidate, DiagnosticRule, DiagnosticRuleContext } from "./types";

export const RULE_CATALOG_VERSION = "buildmedic-rules-1";

export const RULE_IDS = {
  typescript: "typescript/compiler-diagnostic",
  missingModule: "dependencies/missing-module",
  dependencyConflict: "dependencies/peer-version-conflict",
  lockfile: "lockfile/mismatch",
  missingScript: "package-script/missing",
  filesystem: "permissions/filesystem-failure",
  network: "network/registry-failure",
  native: "native-module/build-failure",
  memory: "memory/resource-exhaustion",
  missingCli: "tooling/missing-cli",
} as const;

const TS_DIAGNOSTIC_PATTERN = /\bTS\d{3,5}\b/i;
const SOURCE_STATEMENT_PATTERN = /^\s*(?:const|let|var|return|throw|if|else|for|while|function|class|import|export)\b/i;
const PACKAGE_NAME_PATTERN = /[^A-Za-z0-9@._/:%+~-]/g;
const SCRIPT_NAME_PATTERN = /[^A-Za-z0-9:_./@-]/g;

const ACTIONS = {
  typescript: [
    {
      id: "typescript/review-compiler-diagnostic",
      label: "Review the compiler diagnostic",
      description: "Inspect the reported type or compiler error and update the source or declared types to agree.",
      verificationCondition: "The same TypeScript diagnostic is absent on the next build.",
    },
  ],
  missingModule: [
    {
      id: "dependencies/restore-missing-module",
      label: "Restore the missing dependency",
      description: "Check the manifest and install state, then declare or restore the required module using the project package manager.",
      verificationCondition: "The build resolves the module without a missing-module error.",
    },
  ],
  dependencyConflict: [
    {
      id: "dependencies/align-peer-versions",
      label: "Align dependency versions",
      description: "Review the conflicting direct and peer ranges and choose compatible declared versions before regenerating the install state.",
      verificationCondition: "The package manager resolves the dependency tree without a peer-version conflict.",
    },
  ],
  lockfile: [
    {
      id: "lockfile/synchronize-manifest",
      label: "Synchronize the lockfile",
      description: "Update the lockfile from the intended manifest with the project package manager, then keep the resulting files together.",
      verificationCondition: "A frozen or continuous-install command completes without a lockfile mismatch.",
    },
  ],
  missingScript: [
    {
      id: "package-script/add-or-correct-script",
      label: "Add or correct the package script",
      description: "Check the scripts section and the requested script name, then invoke a script that is declared for this project.",
      verificationCondition: "The requested package script is found and starts successfully.",
    },
  ],
  filesystem: [
    {
      id: "permissions/check-filesystem-access",
      label: "Check filesystem access",
      description: "Confirm the build user can read, write, and execute the required project and cache paths, and that storage is available.",
      verificationCondition: "The build can access its required files without an operating-system filesystem error.",
    },
  ],
  network: [
    {
      id: "network/check-registry-access",
      label: "Check registry or network access",
      description: "Verify the configured registry, connectivity, certificate trust, and proxy settings for the build environment.",
      verificationCondition: "The package or build request reaches its required registry or network resource.",
    },
  ],
  native: [
    {
      id: "native-module/check-build-toolchain",
      label: "Check the native build toolchain",
      description: "Inspect the native module version, supported runtime, compiler toolchain, and available prebuilt binary for this platform.",
      verificationCondition: "The native module installs or rebuilds without a node-gyp or native compilation error.",
    },
  ],
  memory: [
    {
      id: "memory/reduce-resource-pressure",
      label: "Reduce build resource pressure",
      description: "Reduce concurrent work or input size and ensure the build environment has enough memory and process resources.",
      verificationCondition: "The build completes without exhausting its memory or process resource limit.",
    },
  ],
  missingCli: [
    {
      id: "tooling/install-missing-cli",
      label: "Install or expose the requested CLI",
      description: "Check that the command-line tool is installed and available to the build user, or invoke the project-local binary through its package script.",
      verificationCondition: "The requested command is found and starts successfully.",
    },
  ],
} as const satisfies Record<string, readonly SuggestedAction[]>;

function safePackageName(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const safe = redactSensitiveText(value).text.replace(PACKAGE_NAME_PATTERN, "").slice(0, 96);
  return safe.length > 0 ? safe : undefined;
}

function safeScriptName(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const safe = redactSensitiveText(value).text.replace(SCRIPT_NAME_PATTERN, "").slice(0, 80);
  return safe.length > 0 ? safe : undefined;
}

function isSourceStatement(line: string): boolean {
  return SOURCE_STATEMENT_PATTERN.test(line);
}

function isErrorLike(line: string): boolean {
  return /\b(?:error|failed|failure|fatal|warning|warn|exception|cannot|can't|unable|not found|denied)\b/i.test(line);
}

function boundedNearbyText(context: DiagnosticRuleContext, lineIndex: number, radius = 3): string {
  return context.matchingLines.slice(lineIndex, Math.min(context.matchingLines.length, lineIndex + radius + 1)).join(" ").slice(0, 1200);
}

function safeDiagnosticIdentity(value: string): string {
  return redactSensitiveText(value)
    .text
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/gi, "")
    .replace(/\b(?:at\s+)?(?:[A-Za-z]:)?[^\s:|]+:\d+(?::\d+)?\b/gi, "")
    .replace(/\b\d{10,13}\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function sourceFileBeforeDiagnostic(line: string, codeIndex: number): string | undefined {
  const prefix = line.slice(0, codeIndex);
  const match = prefix.match(/(?:^|\s)((?:[A-Za-z]:)?[^\s:]+)\s*:\d+(?::\d+)?\s*(?:-\s*)?(?:error|warning)?\s*$/i)
    ?? prefix.match(/(?:^|\s)((?:[A-Za-z]:)?[^\s(]+)\(\d+(?:,\d+)?\)\s*:\s*(?:error|warning)?\s*$/i);
  return match === null ? undefined : redactSensitiveText(match[1] ?? "").text.replace(/\\/g, "/").toLowerCase();
}

function typeScriptSignature(line: string, code: string | undefined, codeIndex: number | undefined): string {
  const source = codeIndex === undefined ? undefined : sourceFileBeforeDiagnostic(line, codeIndex);
  const afterCode = codeIndex === undefined || code === undefined ? "" : line.slice(codeIndex + code.length).replace(/^\s*[-:]\s*/, "");
  const message = safeDiagnosticIdentity(afterCode || line.replace(/\bTS\d{3,5}\b/i, ""));
  const codePart = code ?? "compiler-diagnostic";
  return `typescript:${codePart.toLowerCase()}:${source ?? "unknown"}:${message || "diagnostic"}`.slice(0, 512);
}

function createCandidate(
  values: Omit<DiagnosticCandidate, "lineIndex">,
  lineIndex: number,
): DiagnosticCandidate {
  return { ...values, lineIndex };
}

function collect(
  context: DiagnosticRuleContext,
  detector: (line: string, lineIndex: number) => DiagnosticCandidate | undefined,
): readonly DiagnosticCandidate[] {
  const matches: DiagnosticCandidate[] = [];
  const maxMatches = Math.max(1, context.maxMatchesPerRule);

  for (let lineIndex = 0; lineIndex < context.matchingLines.length; lineIndex += 1) {
    if (matches.length >= maxMatches) {
      break;
    }

    const candidate = detector(context.matchingLines[lineIndex], lineIndex);
    if (candidate !== undefined) {
      matches.push(candidate);
    }
  }

  return matches;
}

function typeScriptRule(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  return collect(context, (line, lineIndex) => {
    if (isSourceStatement(line)) {
      return undefined;
    }
    const codeMatch = line.match(TS_DIAGNOSTIC_PATTERN);
    const compilerMention = /\b(?:typescript|tsc(?:\.js)?)\b[^\n]{0,200}\b(?:error|failed|failure|diagnostic|compile error|compilation failed)\b/i.test(line);
    const successMention = /\b(?:typescript|tsc(?:\.js)?)\b[^\n]{0,200}\b(?:success(?:fully)?|succeed(?:ed|s)?|passed|completed|no errors?)\b/i.test(line);
    const hasDiagnosticCode = codeMatch !== null &&
      (isErrorLike(line) || /^\s*TS\d{3,5}\b/i.test(line) || /:\d+(?::\d+)?\s*[-(]?\s*(?:error|warning)?\s*TS\d+/i.test(line));

    if (successMention || (codeMatch !== null && !/\b(?:error|warning)\s+TS\d{3,5}\b/i.test(line) && /\b(?:success(?:fully)?|succeed(?:ed|s)?|passed|completed|fixed|resolved|no errors?)\b/i.test(line)) || (!hasDiagnosticCode && !compilerMention)) {
      return undefined;
    }

    const code = codeMatch?.[0].toUpperCase();
    if (code !== undefined && /^(?:TS2307|TS2688|TS7016)$/.test(code) && /(?:cannot find|module|type definition)/i.test(line)) {
      return undefined;
    }

    const severity: FindingSeverity = /\bwarning\b/i.test(line) ? "warning" : "error";
    const locatedCodeIndex = code === undefined ? -1 : (codeMatch?.index ?? -1);
    return createCandidate(
      {
        ruleId: RULE_IDS.typescript,
        signature: typeScriptSignature(line, code, locatedCodeIndex < 0 ? undefined : locatedCodeIndex),
        category: "typescript",
        severity,
        confidence: code === undefined ? "medium" : "high",
        title: code === undefined ? "TypeScript compilation failed" : `TypeScript compiler diagnostic ${code}`,
        explanation: code === undefined
          ? "The TypeScript compiler reported a build failure. Inspect the compiler output and resolve the first source-level error."
          : `The TypeScript compiler reported ${code}. Resolve that source or type-contract error before rerunning the build.`,
        suggestedActions: ACTIONS.typescript,
        verificationHint: "Run the same Node.js build again and confirm this TypeScript diagnostic is absent.",
      },
      lineIndex,
    );
  });
}

function missingModuleRule(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  return collect(context, (line, lineIndex) => {
    const nearby = boundedNearbyText(context, lineIndex);
    const moduleMatch = nearby.match(/(?:cannot|can't)\s+find\s+(?:module|package|dependency)\s+["']([^"']{1,160})["']/i)
      ?? nearby.match(/(?:can't|cannot)\s+resolve\s+["']([^"']{1,160})["']/i)
      ?? nearby.match(/cannot\s+find\s+type\s+definition\s+file\s+for\s+["']([^"']{1,160})["']/i)
      ?? nearby.match(/could\s+not\s+find\s+(?:a\s+)?declaration\s+file\s+for\s+module\s+["']([^"']{1,160})["']/i)
      ?? nearby.match(/(?:cannot|can't)\s+find\s+(?:module|package|dependency)\s*[-:]?\s*([@A-Za-z0-9._/:%+~-]{1,160})/i);
    const moduleError = /\b(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND)\b/i.test(line);
    const resolutionPhrase = /\b(?:cannot|can't|could not)\s+(?:find|resolve)\s+(?:module|package|dependency)\b/i.test(nearby);
    const lineResolutionPhrase = /\b(?:cannot|can't|could not)\s+(?:find|resolve)\s+(?:module|package|dependency)\b/i.test(line);
    const missingDeclaration = /\bmissing:\s+[^,\s]{1,160}(?:@[^,\s]+)?\s*,\s*required by\b/i.test(line);
    const missingVersion = /\b(?:ERR_PNPM_NO_MATCHING_VERSION|YN0035)\b/i.test(line)
      || /no matching (?:version|package) found for\s+([^\s,]{1,160})/i.test(nearby);

    if ((moduleMatch === null && !moduleError && (!resolutionPhrase || !lineResolutionPhrase) && !missingDeclaration && !missingVersion) || isSourceStatement(line)) {
      return undefined;
    }

    const versionPackage = nearby.match(/no matching (?:version|package) found for\s+([^\s,]{1,160})/i)?.[1];
    const packageName = safePackageName(moduleMatch?.[1] ?? versionPackage);
    const signature = packageName === undefined ? "dependencies:missing-module" : `dependencies:missing-module:${packageName.toLowerCase()}`;
    const confidence: FindingConfidence = moduleMatch !== null || moduleError ? "high" : "medium";
    return createCandidate(
      {
        ruleId: RULE_IDS.missingModule,
        signature,
        category: "dependencies",
        severity: "error",
        confidence,
        title: packageName === undefined ? "A required module cannot be resolved" : `The required module ${packageName} cannot be resolved`,
        explanation: packageName === undefined
          ? "The build cannot resolve a required module or dependency from the current install state."
          : `The build cannot resolve ${packageName} from the current dependency or module-resolution state.`,
        suggestedActions: ACTIONS.missingModule,
        verificationHint: "Run the same Node.js build again and confirm the missing-module diagnostic is absent.",
      },
      lineIndex,
    );
  });
}

function dependencyConflictRule(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  return collect(context, (line, lineIndex) => {
    if (isSourceStatement(line)) {
      return undefined;
    }
    const exactCode = /\b(?:ERESOLVE|ERR_PNPM_PEER_DEP_ISSUES|YN0002|YN0060)\b/i.test(line);
    const explicitPhrase = /(?:unable to resolve dependency tree|could not resolve dependency|conflicting peer dependency|invalid peer dependency|peer\s+(?:dep|dependencies?|version)[^\n]{0,100}(?:incompatible|invalid|missing|unmet|required)|has unmet peer|unmet peer)/i.test(line);

    if (!exactCode && !explicitPhrase) {
      return undefined;
    }

    return createCandidate(
      {
        ruleId: RULE_IDS.dependencyConflict,
        signature: "dependencies:peer-version-conflict",
        category: "dependencies",
        severity: /\b(?:YN0002|YN0060)\b/i.test(line) ? "warning" : "error",
        confidence: exactCode ? "high" : "medium",
        title: "Dependency or peer versions cannot be resolved together",
        explanation: /\b(?:YN0002|YN0060)\b/i.test(line)
          ? "The package manager reported a peer dependency warning. It may not block this build, but the dependency tree has an unmet or incompatible peer requirement."
          : "The package manager found incompatible dependency or peer-version requirements in the requested install tree.",
        suggestedActions: ACTIONS.dependencyConflict,
        verificationHint: "Run the same package-manager install or build again and confirm dependency resolution succeeds.",
      },
      lineIndex,
    );
  });
}

function lockfileRule(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  return collect(context, (line, lineIndex) => {
    if (isSourceStatement(line)) {
      return undefined;
    }
    const exactCode = /\b(?:ERR_PNPM_OUTDATED_LOCKFILE|YN0028)\b/i.test(line);
    const lockCue = /\b(?:npm\s+ci|lockfile|lock file|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|frozen-lockfile|--immutable|ERR_PNPM_OUTDATED_LOCKFILE|YN0028)\b/i.test(line);
    const nearby = boundedNearbyText(context, lineIndex);
    const npmCiMismatch = /\bnpm\s+ci\b[^\n]{0,500}\b(?:package(?:\.json)?|lock|npm-shrinkwrap\.json)[^\n]{0,500}\b(?:in sync|synchron|only install)/i.test(nearby);
    const lockMismatch = /(?:lockfile|lock file|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)[^\n]{0,500}(?:not\s+(?:in\s+sync|up[ -]?to[ -]?date)|out\s+of\s+date|outdated|mismatch|does\s+not\s+satisfy|would have been modified|needs?\s+(?:to be\s+)?updated)/i.test(nearby);
    const frozenFailure = /(?:frozen-lockfile|--immutable)[^\n]{0,500}(?:error|fail|modified|outdated|update)/i.test(nearby);

    if (!lockCue || (!exactCode && !npmCiMismatch && !lockMismatch && !frozenFailure)) {
      return undefined;
    }

    return createCandidate(
      {
        ruleId: RULE_IDS.lockfile,
        signature: "lockfile:manifest-mismatch",
        category: "lockfile",
        severity: "error",
        confidence: exactCode || npmCiMismatch || lockMismatch ? "high" : "medium",
        title: "The dependency lockfile does not match the manifest",
        explanation: "The package manager rejected the install because the lockfile is stale, inconsistent, or would need to change during a frozen install.",
        suggestedActions: ACTIONS.lockfile,
        verificationHint: "Run the same frozen or continuous-install command again and confirm the lockfile mismatch is absent.",
      },
      lineIndex,
    );
  });
}

function missingScriptRule(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  return collect(context, (line, lineIndex) => {
    if (isSourceStatement(line)) {
      return undefined;
    }
    const missingScript = line.match(/missing\s+script:\s*["']?([^"'\s,]{1,80})["']?/i);
    const yarnMissingScript = line.match(/\berror\s+command\s+["']([^"']{1,80})["']\s+not\s+found/i);
    const packageManagerNoScript = /\bERR_PNPM_NO_SCRIPT\b/i.test(line);
    const scriptName = safeScriptName(missingScript?.[1] ?? yarnMissingScript?.[1]);

    if (missingScript === null && yarnMissingScript === null && !packageManagerNoScript) {
      return undefined;
    }

    return createCandidate(
      {
        ruleId: RULE_IDS.missingScript,
        signature: `package-script:missing:${(scriptName ?? "unknown").toLowerCase()}`,
        category: "package-script",
        severity: "error",
        confidence: packageManagerNoScript || missingScript !== null || yarnMissingScript !== null ? "high" : "medium",
        title: scriptName === undefined ? "The requested package script is missing" : `The package script ${scriptName} is missing`,
        explanation: scriptName === undefined
          ? "The package manager could not find the script requested by the build."
          : `The package manager could not find the declared script ${scriptName}.`,
        suggestedActions: ACTIONS.missingScript,
        verificationHint: "Run the same package script again and confirm it is found and starts successfully.",
      },
      lineIndex,
    );
  });
}

function missingCliRule(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  return collect(context, (line, lineIndex) => {
    if (isSourceStatement(line)) {
      return undefined;
    }
    const commandMissing = line.match(/(?:command\s+)?["']?([A-Za-z0-9_.:@/+~-]{1,80})["']?\s*:\s*(?:command\s+)?not\s+found/i)
      ?? line.match(/command\s+["']([^"']{1,80})["']\s+not\s+found/i);
    if (commandMissing === null || /(?:npm|pnpm|yarn)\s+(?:error|warn)\b/i.test(line) || /\berror\s+command\b/i.test(line)) {
      return undefined;
    }
    const command = safeScriptName(commandMissing[1]);
    return createCandidate(
      {
        ruleId: RULE_IDS.missingCli,
        signature: `tooling:missing-cli:${(command ?? "unknown").toLowerCase()}`,
        category: "tooling",
        severity: "error",
        confidence: "high",
        title: command === undefined ? "A required command-line tool is missing" : `The command-line tool ${command} is missing`,
        explanation: command === undefined
          ? "The shell could not find a command required by the build. This is distinct from a missing package script."
          : `The shell could not find ${command}. Install it or invoke the project-local binary instead of treating it as a missing package script.`,
        suggestedActions: ACTIONS.missingCli,
        verificationHint: "Run the same command again and confirm the command-line tool is found.",
      },
      lineIndex,
    );
  });
}

function filesystemRule(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  return collect(context, (line, lineIndex) => {
    if (isSourceStatement(line)) {
      return undefined;
    }
    const code = /\b(?:EACCES|EPERM|EISDIR|ENOSPC|EROFS|EMFILE|ENFILE)\b/i.test(line);
    const phrase = /(?:permission denied|operation not permitted|read-only file system|no space left on device|too many open files|access is denied)/i.test(line);
    const missingPath = /\bENOENT\b.*(?:open|stat|scandir|file|directory|path)/i.test(line);

    if ((!code && !phrase && !missingPath) || (isSourceStatement(line) && !isErrorLike(line))) {
      return undefined;
    }

    return createCandidate(
      {
        ruleId: RULE_IDS.filesystem,
        signature: `permissions:filesystem:${code ? "operating-system-error" : phrase ? "access-or-storage" : "missing-path"}`,
        category: "permissions",
        severity: "error",
        confidence: code || phrase ? "high" : "medium",
        title: "The build cannot access a required filesystem resource",
        explanation: "The operating system rejected a required read, write, execute, or filesystem operation for this build.",
        suggestedActions: ACTIONS.filesystem,
        verificationHint: "Run the same build again and confirm the filesystem access diagnostic is absent.",
      },
      lineIndex,
    );
  });
}

function networkRule(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  return collect(context, (line, lineIndex) => {
    if (isSourceStatement(line)) {
      return undefined;
    }
    const transportCode = /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|CERT_HAS_EXPIRED|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|ERR_TLS_CERT_ALTNAME_INVALID)\b/i.test(line);
    const dnsFailure = /\b(?:getaddrinfo|ENOTFOUND)\b/i.test(line) && /(?:registry|npm|pnpm|yarn|https?:\/\/|request|fetch)/i.test(line);
    const registryCode = /\b(?:ERR_PNPM_FETCH_(?:5\d{2}|429)|ERR_PNPM_META_FETCH_FAIL|YN0080)\b/i.test(line);
    const authCode = /\b(?:E401|E403|ERR_PNPM_FETCH_401|ERR_PNPM_FETCH_403)\b/i.test(line);
    const notFoundCode = /\b(?:E404|ERR_PNPM_FETCH_404)\b/i.test(line) ||
      (/\b404\b/i.test(line) && /(?:registry|\bGET\b|package|npm|pnpm|yarn)/i.test(line));
    const registryFailure = /(?:network request failed|fetch failed|socket hang up|unable to connect|registry[^\n]{0,100}(?:unavailable|failed|timeout|error)|503\s+service unavailable|502\s+bad gateway|429\s+too many requests)/i.test(line);

    if (!transportCode && !dnsFailure && !registryCode && !authCode && !notFoundCode && !registryFailure) {
      return undefined;
    }

    return createCandidate(
      {
        ruleId: RULE_IDS.network,
        signature: `network:registry:${authCode ? "auth" : notFoundCode ? "not-found" : transportCode ? "transport" : dnsFailure ? "dns" : "registry"}`,
        category: "network",
        severity: "error",
        confidence: transportCode || dnsFailure || registryCode || authCode || notFoundCode ? "high" : "medium",
        title: authCode
          ? "Registry authentication or authorization failed"
          : notFoundCode
            ? "The registry could not find the requested package"
            : "The build could not reach a required registry or network resource",
        explanation: authCode
          ? "The registry rejected the request with an authentication or authorization response. Check the configured account, token scope, and private-registry access; this is not proof of a connectivity failure."
          : notFoundCode
            ? "The registry returned 404 for the requested package or version. Check its name, version, registry configuration, and publication state; a 404 does not by itself prove a local module is missing."
            : "The package manager or build process failed while connecting to a registry or another required network resource.",
        suggestedActions: ACTIONS.network,
        verificationHint: "Run the same package or build request again and confirm the network diagnostic is absent.",
      },
      lineIndex,
    );
  });
}

function nativeRule(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  return collect(context, (line, lineIndex) => {
    if (isSourceStatement(line)) {
      return undefined;
    }
    const noPrebuiltNotice = /(?:node-gyp|node-pre-gyp|prebuild-install)[^\n]{0,160}\b(?:no prebuilt|no pre-built|prebuilt binaries? not found)\b/i.test(line);
    const exact = /(?:gyp\s+ERR!|node-pre-gyp\s+ERR!|ERR_DLOPEN_FAILED|binding\.gyp[^\n]{0,100}(?:not found|error)|fatal error:\s+[^\n]{0,120}\.(?:h|hh|c|cc|cpp)\b|MSB\d{4})/i.test(line);
    const generic = /(?:node-gyp|node-pre-gyp|native module|prebuild)[^\n]{0,100}(?:error|failed|unable|not found|no prebuilt)/i.test(line);
    const makeFailure = /\bmake:\s+\*{3}[^\n]{0,120}(?:error|failed)/i.test(line) && /(?:gyp|native|binding|compile|c\+\+)/i.test(line);

    if (!exact && !generic && !makeFailure) {
      return undefined;
    }

    const ambiguousPrebuilt = noPrebuiltNotice && !exact && !makeFailure;

    return createCandidate(
      {
        ruleId: RULE_IDS.native,
        signature: `native-module:${ambiguousPrebuilt ? "prebuilt-unavailable" : exact ? "toolchain-error" : "build-failure"}`,
        category: "native-module",
        severity: ambiguousPrebuilt ? "warning" : "error",
        confidence: ambiguousPrebuilt ? "low" : exact ? "high" : "medium",
        title: ambiguousPrebuilt ? "A native module has no prebuilt binary" : "A native Node.js module failed to build",
        explanation: ambiguousPrebuilt
          ? "The native module did not provide a prebuilt binary for this platform. This is a warning and may fall back to a source build; it is not by itself a failed build."
          : "A platform-specific Node.js module could not use its prebuilt binary or complete its native compilation step.",
        suggestedActions: ACTIONS.native,
        verificationHint: "Run the same install or build again and confirm the native-module diagnostic is absent.",
      },
      lineIndex,
    );
  });
}

function memoryRule(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  return collect(context, (line, lineIndex) => {
    if (isSourceStatement(line)) {
      return undefined;
    }
    const exact = /(?:javascript heap out of memory|fatal error:\s*reached heap limit|allocation failed\s*-|ERR_WORKER_OUT_OF_MEMORY|\bENOMEM\b|OOMKilled)/i.test(line);
    const generic = /(?:out of memory|heap limit|memory exhausted|resource exhausted)/i.test(line);
    const killed = /^(?:process\s+)?killed\s*$/i.test(line) || /\b(?:exit code|status)\s*137\b|\bSIGKILL\b/i.test(line);

    if (!exact && !generic && !killed) {
      return undefined;
    }

    return createCandidate(
      {
        ruleId: RULE_IDS.memory,
        signature: `memory:resource:${exact ? "out-of-memory" : killed ? "killed-process" : "resource-exhaustion"}`,
        category: "memory",
        severity: exact ? "critical" : killed ? "warning" : "error",
        confidence: exact ? "high" : killed ? "low" : "medium",
        title: exact ? "The build exhausted memory or another process resource" : killed ? "The build process was terminated unexpectedly" : "The build may have exhausted a process resource",
        explanation: exact
          ? "The Node.js process reported a concrete memory exhaustion condition."
          : killed
            ? "SIGKILL or exit status 137 is ambiguous: the process may have been stopped by an external supervisor, timeout, or resource limit, but this evidence does not prove that memory was exhausted."
            : "The build reported resource exhaustion, but the available evidence does not identify the exact resource.",
        suggestedActions: ACTIONS.memory,
        verificationHint: "Run the same build again and confirm the resource-exhaustion diagnostic is absent.",
      },
      lineIndex,
    );
  });
}

export const DIAGNOSTIC_RULES: readonly DiagnosticRule[] = [
  { id: RULE_IDS.typescript, detect: typeScriptRule },
  { id: RULE_IDS.missingModule, detect: missingModuleRule },
  { id: RULE_IDS.dependencyConflict, detect: dependencyConflictRule },
  { id: RULE_IDS.lockfile, detect: lockfileRule },
  { id: RULE_IDS.missingScript, detect: missingScriptRule },
  { id: RULE_IDS.missingCli, detect: missingCliRule },
  { id: RULE_IDS.filesystem, detect: filesystemRule },
  { id: RULE_IDS.network, detect: networkRule },
  { id: RULE_IDS.native, detect: nativeRule },
  { id: RULE_IDS.memory, detect: memoryRule },
] as const;

export function collectDiagnosticCandidates(context: DiagnosticRuleContext): readonly DiagnosticCandidate[] {
  const candidates: DiagnosticCandidate[] = [];
  for (const rule of DIAGNOSTIC_RULES) {
    candidates.push(...rule.detect(context));
  }
  return candidates;
}
