import { useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";

import { Icon, type IconName } from "../components/icons";
import { type Navigate } from "../components/layout";
import {
  AppLink,
  Badge,
  Button,
  Card,
  DemoNotice,
  Divider,
  EmptyState,
  IconButton,
  Kbd,
  Modal,
  TextareaField,
  Toggle,
} from "../components/ui";
import { DEMO_HISTORY, DEMO_NODE_BUILD_LOG, DEMO_VERIFICATION_RESULT } from "../data";
import { formatBytes, formatCategory, formatDate, formatNumber, formatSource } from "../lib/format";
import {
  getUtf8ByteLength,
  validateFile,
  validateLogText,
  validateVerificationLogs,
} from "../lib/validation";
import type {
  DemoAnalysisResult,
  DemoHistoryEntry,
  DemoVerificationResult,
  Finding,
  FindingSeverity,
  UserPreferences,
  VerificationFindingState,
} from "../types";

type ComparedDemoVerification = Extract<DemoVerificationResult, { status: "compared" }>;

export interface WorkspacePageProps {
  onNavigate: Navigate;
  onNotify: (message: string) => void;
  currentLog: string;
  onAnalyze: (text: string, source?: "paste" | "file", fileName?: string) => void;
  analysis: DemoAnalysisResult;
  preferences: UserPreferences;
  onPatchPreferences: (patch: Partial<UserPreferences>) => void;
  theme: UserPreferences["theme"];
  onSetTheme: (theme: UserPreferences["theme"]) => void;
}

function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="workspace-page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="workspace-page-actions">{actions}</div> : null}
    </div>
  );
}

function StatCard({ label, value, detail, icon, tone = "neutral" }: { label: string; value: string; detail: string; icon: IconName; tone?: string }) {
  return (
    <Card className={`stat-card stat-card-${tone}`}>
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-icon"><Icon name={icon} size={17} /></span>
      </div>
      <strong>{value}</strong>
      <span className="stat-card-detail">{detail}</span>
    </Card>
  );
}

function DemoStatusRow({ children }: { children: ReactNode }) {
  return <div className="demo-status-row"><span className="status-pulse" />{children}</div>;
}

export function OverviewPage({ onNavigate, onNotify, analysis }: WorkspacePageProps) {
  const latest = DEMO_HISTORY[0];
  const topFinding = analysis.findings[0];
  return (
    <div className="workspace-page overview-page">
      <DemoNotice>Demo workspace · cards below use sanitized fixture data, not a live diagnostic engine.</DemoNotice>
      <WorkspacePageHeader
        actions={<Button onClick={() => onNavigate("/app/new-analysis")} icon="plus">New analysis</Button>}
        description="A calm starting point for seeing what is in flight, what needs attention, and where the next investigation can begin."
        eyebrow="Workspace pulse"
        title="Good morning, builder."
      />
      <div className="stats-grid">
        <StatCard detail="Sanitized fixture result" icon="activity" label="Current findings" tone="accent" value={formatNumber(analysis.findings.length)} />
        <StatCard detail="Primary signal" icon="circle-alert" label="Needs review" tone="error" value="1" />
        <StatCard detail="Frontend simulation" icon="shield-check" label="Verification" tone="success" value="Improved" />
        <StatCard detail="This browser session" icon="clock" label="Last opened" value="Just now" />
      </div>
      <div className="overview-grid">
        <Card className="overview-primary-card">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Latest analysis</span>
              <h2>{latest.label}</h2>
            </div>
            <Badge tone="accent" dot>Demo result</Badge>
          </div>
          <div className="latest-analysis-meta">
            <span><Icon name="file-code" size={15} /> {DEMO_NODE_BUILD_LOG.fileName}</span>
            <span><Icon name="clock" size={15} /> {formatDate(latest.createdAt)}</span>
            <span><Icon name="layers" size={15} /> {latest.findingCount} findings</span>
          </div>
          <div className="root-cause-callout">
            <span className="root-cause-icon"><Icon name="circle-alert" size={20} /></span>
            <div>
              <span className="panel-kicker">Likely root cause</span>
              <h3>{topFinding?.title ?? "No supported signal"}</h3>
              <p>{topFinding?.explanation ?? "This demo result has no findings to review."}</p>
            </div>
            <Badge tone="info">High confidence</Badge>
          </div>
          <div className="overview-primary-footer">
            <DemoStatusRow>Ready for human review · no commands executed</DemoStatusRow>
            <Button onClick={() => onNavigate("/app/analysis")} variant="secondary" icon="arrow-right" iconPosition="right" size="sm">Open result</Button>
          </div>
        </Card>
        <Card className="overview-side-card">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Verification</span>
              <h2>Rerun signal</h2>
            </div>
            <IconButton icon="more-horizontal" label="More verification actions" onClick={() => onNotify("Verification actions are available in the dedicated view.")} size="sm" />
          </div>
          <div className="verification-ring-wrap">
            <div className="verification-ring"><strong>1</strong><span>resolved</span></div>
            <div className="verification-ring-copy">
              <Badge tone="success" dot>Improved</Badge>
              <p>The primary compiler finding is absent from the simulated rerun.</p>
            </div>
          </div>
          <Divider />
          <div className="side-card-row"><span>Persistent</span><strong>1</strong></div>
          <div className="side-card-row"><span>New signals</span><strong className="text-muted">0</strong></div>
          <Button className="side-card-button" onClick={() => onNavigate("/app/verification")} variant="quiet" icon="arrow-right" iconPosition="right" size="sm">Open verification</Button>
        </Card>
      </div>
      <div className="overview-lower-grid">
        <Card className="activity-card">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Workspace activity</span>
              <h2>Recent sessions</h2>
            </div>
            <AppLink className="panel-link" onNavigate={onNavigate} to="/app/history">View history <Icon name="arrow-right" size={14} /></AppLink>
          </div>
          <div className="activity-list">
            {DEMO_HISTORY.map((entry) => <HistoryRow entry={entry} key={entry.id} onClick={() => onNavigate("/app/analysis")} />)}
          </div>
        </Card>
        <Card className="quick-start-card">
          <div className="quick-start-orbit" aria-hidden="true"><span /><span /><span /></div>
          <span className="panel-kicker">Quick start</span>
          <h2>Have a build log nearby?</h2>
          <p>Load the sanitized example first, then swap in your own text when the real analyzer lands.</p>
          <Button onClick={() => onNavigate("/app/new-analysis")} icon="upload-cloud" iconPosition="left">Bring in a log</Button>
          <span className="quick-start-note"><Icon name="lock" size={13} /> Current session never uploads logs.</span>
        </Card>
      </div>
    </div>
  );
}

function HistoryRow({ entry, onClick }: { entry: DemoHistoryEntry; onClick: () => void }) {
  return (
    <button className="history-row" onClick={onClick} type="button">
      <span className="history-row-icon"><Icon name={entry.status === "no-match" ? "check-circle" : "file-code"} size={16} /></span>
      <span className="history-row-main"><strong>{entry.label}</strong><small>{entry.summary}</small></span>
      <span className="history-row-meta"><Badge tone={entry.status === "no-match" ? "success" : "warning"}>{entry.status === "no-match" ? "No match" : `${entry.findingCount} findings`}</Badge><small>{formatDate(entry.createdAt)}</small></span>
      <Icon name="chevron-right" size={15} />
    </button>
  );
}

export function NewAnalysisPage({ onNotify, currentLog, onAnalyze }: WorkspacePageProps) {
  const [inputMode, setInputMode] = useState<"paste" | "file">("paste");
  const [text, setText] = useState(currentLog);
  const [fileName, setFileName] = useState(DEMO_NODE_BUILD_LOG.fileName);
  const [touched, setTouched] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const validation = validateLogText(text);
  const byteCount = getUtf8ByteLength(text);

  function loadSample() {
    setText(DEMO_NODE_BUILD_LOG.text);
    setFileName(DEMO_NODE_BUILD_LOG.fileName);
    setInputMode("paste");
    setTouched(false);
    onNotify("Sanitized demo log loaded.");
  }

  function submit() {
    setTouched(true);
    if (!validation.valid) {
      onNotify(validation.error.message);
      return;
    }
    onAnalyze(text, inputMode, inputMode === "file" ? fileName : undefined);
  }

  function readFile(file: File) {
    const fileValidation = validateFile(file);
    setTouched(true);
    if (!fileValidation.valid) {
      onNotify(fileValidation.error.message);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        onNotify("We could not read this input as text.");
        return;
      }
      setText(reader.result);
      setFileName(file.name || "selected-build.log");
      setInputMode("file");
      setTouched(false);
      onNotify(`${file.name || "Local file"} is ready for the demo flow.`);
    };
    reader.onerror = () => onNotify("We could not read this input as text.");
    reader.readAsText(file);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) readFile(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) readFile(file);
  }

  return (
    <div className="workspace-page new-analysis-page">
      <DemoNotice>This input flow is real frontend behavior. The result after submit is a labeled demonstration response.</DemoNotice>
      <WorkspacePageHeader
        actions={<Button onClick={loadSample} variant="secondary" icon="refresh">Load sample</Button>}
        description="Start with a local build log. Nothing is executed or sent anywhere in this frontend-only milestone."
        eyebrow="Workbench / new analysis"
        title="Bring the failure into focus."
      />
      <div className="analysis-input-layout">
        <Card className="analysis-input-card">
          <div className="input-card-top">
            <div>
              <span className="panel-kicker">Source input</span>
              <h2>What did the build say?</h2>
            </div>
            <Badge tone={validation.valid ? "success" : "neutral"} dot>{validation.valid ? "Ready" : "Waiting for input"}</Badge>
          </div>
          <div className="input-mode-tabs" role="tablist" aria-label="Input mode">
            <button aria-selected={inputMode === "paste"} className={inputMode === "paste" ? "active" : ""} onClick={() => setInputMode("paste")} role="tab" type="button"><Icon name="terminal" size={15} /> Paste text</button>
            <button aria-selected={inputMode === "file"} className={inputMode === "file" ? "active" : ""} onClick={() => setInputMode("file")} role="tab" type="button"><Icon name="upload-cloud" size={15} /> Upload file</button>
          </div>
          <TextareaField
            counter={`${formatBytes(byteCount)} · ${text ? text.split("\n").length : 0} lines`}
            error={touched && !validation.valid ? validation.error.message : undefined}
            hint="Text is treated as untrusted evidence and stays in this browser session."
            id="analysis-log"
            label="Build log"
            onBlur={() => setTouched(true)}
            onChange={(event) => setText(event.target.value)}
            placeholder="$ npm run build\nPaste the relevant output here..."
            value={text}
          />
          <div className="input-card-actions">
            <Button onClick={submit} size="lg" icon="sparkles" iconPosition="left">Analyze demo log</Button>
            <Button onClick={() => { setText(""); setFileName(""); setTouched(false); }} variant="quiet" icon="x">Clear</Button>
          </div>
          <div className="input-limit-row">
            <span><Icon name="shield-check" size={14} /> Up to 25 MiB planned</span>
            <span><Icon name="lock" size={14} /> No network request</span>
          </div>
        </Card>
        <div className="input-side-column">
          <Card className={`upload-card${dragActive ? " drag-active" : ""}`}>
            <div className="upload-card-icon"><Icon name="upload-cloud" size={22} /></div>
            <h2>Drop a text log</h2>
            <p>Drag a .txt, .log, .json, or other readable text file here.</p>
            <div
              className="drop-zone"
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <input accept=".txt,.log,.json,.ndjson,text/plain,application/json" id="log-file" onChange={handleFileInput} type="file" />
              <label htmlFor="log-file"><span>Choose a file</span> or drag it in</label>
            </div>
            {fileName ? <div className="selected-file"><Icon name="file-code" size={15} /><span>{fileName}</span><Icon name="check" size={14} /></div> : null}
          </Card>
          <Card className="input-safety-card">
            <div className="panel-heading"><span className="panel-kicker">Good to know</span><Icon name="info" size={16} /></div>
            <ul className="plain-list">
              <li>Demo analysis does not parse or execute your input.</li>
              <li>Remove secrets before sharing a log outside your device.</li>
              <li>Live rule coverage will arrive in a later milestone.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function severityTone(severity: FindingSeverity): "critical" | "error" | "warning" | "info" {
  return severity;
}

function FindingCard({ finding, expanded, onToggle, onCopy, onNavigate }: { finding: Finding; expanded: boolean; onToggle: () => void; onCopy: () => void; onNavigate: Navigate }) {
  return (
    <Card className={`finding-card finding-card-${finding.severity}${expanded ? " expanded" : ""}`}>
      <button className="finding-card-header" onClick={onToggle} type="button">
        <span className={`finding-severity-icon finding-severity-${finding.severity}`}><Icon name={finding.severity === "info" ? "info" : "circle-alert"} size={18} /></span>
        <span className="finding-heading-copy"><span className="panel-kicker">{formatCategory(finding.category)} · {finding.ruleId}</span><strong>{finding.title}</strong></span>
        <span className="finding-heading-badges"><Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge><Badge tone="info">{finding.confidence} confidence</Badge><Icon name={expanded ? "chevron-down" : "chevron-right"} size={17} /></span>
      </button>
      <div className="finding-summary"><p>{finding.explanation}</p><span className="finding-evidence-count"><Icon name="hash" size={13} /> {finding.evidence.length} evidence lines</span></div>
      {expanded ? (
        <div className="finding-expanded">
          <div className="finding-section">
            <div className="finding-section-heading"><span>Evidence</span><Button onClick={onCopy} variant="quiet" size="sm" icon="copy">Copy</Button></div>
            <div className="evidence-list">
              {finding.evidence.map((evidence) => <code className={`evidence-line evidence-line-${evidence.role ?? "context"}`} key={`${finding.id}-${evidence.lineNumber}`}><span>{String(evidence.lineNumber).padStart(2, "0")}</span><span>{evidence.text}</span></code>)}
            </div>
          </div>
          <div className="finding-action-row">
            <span className="finding-action-icon"><Icon name="lightbulb" size={17} /></span>
            <span><strong>Suggested next step</strong><small>{finding.suggestedActions[0]?.description}</small></span>
            <Button onClick={() => onNavigate("/app/verification")} variant="secondary" size="sm" icon="arrow-right" iconPosition="right">Verify later</Button>
          </div>
          <div className="finding-verification-hint"><Icon name="check-circle" size={14} /> {finding.verificationHint}</div>
        </div>
      ) : null}
    </Card>
  );
}

export function AnalysisPage({ onNavigate, onNotify, analysis }: WorkspacePageProps) {
  const [filter, setFilter] = useState<"all" | FindingSeverity>("all");
  const [expandedId, setExpandedId] = useState<string | null>(analysis.findings[0]?.id ?? null);
  const findings = analysis.findings.filter((finding) => filter === "all" || finding.severity === filter);
  const counts = analysis.findings.reduce<Record<string, number>>((result, finding) => {
    result[finding.severity] = (result[finding.severity] ?? 0) + 1;
    return result;
  }, {});

  function copyFinding(finding: Finding) {
    const text = `${finding.title}\n\n${finding.explanation}\n\n${finding.evidence.map((line) => `${line.lineNumber}: ${line.text}`).join("\n")}`;
    void navigator.clipboard?.writeText(text);
    onNotify("Finding evidence copied locally.");
  }

  return (
    <div className="workspace-page analysis-page">
      <DemoNotice>Simulated result · the real diagnostic engine is intentionally not connected in this frontend milestone.</DemoNotice>
      <WorkspacePageHeader
        actions={<><Button onClick={() => onNavigate("/app/log-viewer")} variant="secondary" icon="file-code">Open log</Button><Button onClick={() => onNavigate("/app/verification")} icon="shield-check">Verify fix</Button></>}
        description="A structured view of the sanitized Node.js TypeScript fixture. Expand a finding to follow the evidence trail."
        eyebrow="Workbench / analysis results"
        title="Here is what the build is saying."
      />
      <div className="analysis-meta-bar">
        <div className="analysis-meta-left"><span><Icon name="file-code" size={15} /> {analysis.input.fileName}</span><span><Icon name="clock" size={15} /> {formatDate(analysis.analyzedAt)}</span><span><Icon name="layers" size={15} /> {formatBytes(analysis.input.byteCount)}</span></div>
        <Badge tone="accent" dot>demo-rules-1</Badge>
      </div>
      <div className="analysis-summary-grid">
        <Card className="analysis-root-card">
          <div className="analysis-root-label"><span className="severity-dot severity-error" /> Likely root cause <Badge tone="info">High confidence</Badge></div>
          <h2>{analysis.findings[0]?.title ?? "No supported signal"}</h2>
          <p>{analysis.findings[0]?.explanation}</p>
          <div className="root-card-footer"><span><Icon name="hash" size={14} /> line {analysis.findings[0]?.evidence[0]?.lineNumber ?? "—"}</span><Button onClick={() => setExpandedId(analysis.findings[0]?.id ?? null)} variant="quiet" size="sm" icon="arrow-down">Show evidence</Button></div>
        </Card>
        <div className="analysis-counts">
          <div className="count-card"><span>Findings</span><strong>{analysis.findings.length}</strong><small>in this demo result</small></div>
          <div className="count-card count-card-error"><span>Errors</span><strong>{counts.error ?? 0}</strong><small>need direct review</small></div>
          <div className="count-card count-card-warning"><span>Warnings</span><strong>{counts.warning ?? 0}</strong><small>likely downstream</small></div>
        </div>
      </div>
      <div className="findings-heading-row">
        <div><span className="panel-kicker">Diagnostic findings</span><h2>Follow the signal</h2></div>
        <div className="finding-filters" role="group" aria-label="Filter findings">
          {(["all", "error", "warning", "info"] as const).map((option) => <button className={filter === option ? "active" : ""} key={option} onClick={() => setFilter(option)} type="button">{option === "all" ? "All" : option}<span>{option === "all" ? analysis.findings.length : counts[option] ?? 0}</span></button>)}
        </div>
      </div>
      <div className="finding-list">
        {findings.length ? findings.map((finding) => <FindingCard finding={finding} expanded={expandedId === finding.id} key={finding.id} onCopy={() => copyFinding(finding)} onNavigate={onNavigate} onToggle={() => setExpandedId((id) => id === finding.id ? null : finding.id)} />) : <Card><EmptyState description="Try another severity filter or return to all findings." icon="filter" title="Nothing in this filter" /></Card>}
      </div>
      <Card className="analysis-next-card">
        <div className="analysis-next-icon"><Icon name="arrow-right" size={19} /></div>
        <div><span className="panel-kicker">Next useful move</span><h2>Compare a rerun after addressing the primary finding.</h2><p>The verification surface is interactive, but its result is explicitly simulated.</p></div>
        <Button onClick={() => onNavigate("/app/verification")} variant="secondary" icon="arrow-right" iconPosition="right">Open verification</Button>
      </Card>
    </div>
  );
}

function highlightText(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, "ig"));
  return parts.map((part, index) => part.toLowerCase() === query.trim().toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function LogViewerPage({ onNavigate, onNotify, currentLog }: WorkspacePageProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "errors">("all");
  const lines = (currentLog || DEMO_NODE_BUILD_LOG.text).split("\n");
  const filteredLines = lines.map((text, index) => ({ text, lineNumber: index + 1 })).filter((line) => {
    const matchesQuery = !query.trim() || line.text.toLowerCase().includes(query.trim().toLowerCase());
    const matchesMode = mode === "all" || /error|failed|TS\d+|npm error/i.test(line.text);
    return matchesQuery && matchesMode;
  });

  function copyLog() {
    void navigator.clipboard?.writeText(currentLog || DEMO_NODE_BUILD_LOG.text);
    onNotify("Demo log copied locally.");
  }

  return (
    <div className="workspace-page log-viewer-page">
      <DemoNotice>Line viewer uses the sanitized fixture text. Search and filters are working locally in the browser.</DemoNotice>
      <WorkspacePageHeader
        actions={<><Button onClick={copyLog} variant="secondary" icon="copy">Copy log</Button><Button onClick={() => onNavigate("/app/analysis")} icon="activity">Back to findings</Button></>}
        description="Keep the raw output in view while you investigate. Search is intentionally simple and does not interpret the log as markup."
        eyebrow="Workbench / log viewer"
        title="Stay close to the evidence."
      />
      <Card className="log-viewer-card">
        <div className="log-viewer-toolbar">
          <div className="log-file-title"><span className="log-file-icon"><Icon name="file-code" size={16} /></span><span><strong>{DEMO_NODE_BUILD_LOG.fileName}</strong><small>{lines.length} lines · {formatBytes(getUtf8ByteLength(currentLog || DEMO_NODE_BUILD_LOG.text))}</small></span></div>
          <div className="log-viewer-actions"><div className="log-search"><Icon name="search" size={15} /><input aria-label="Search log" onChange={(event) => setQuery(event.target.value)} placeholder="Find in log..." value={query} />{query ? <IconButton icon="x" label="Clear search" onClick={() => setQuery("")} size="sm" /> : null}</div><div className="segmented-control" role="group" aria-label="Log filter"><button className={mode === "all" ? "active" : ""} onClick={() => setMode("all")} type="button">All</button><button className={mode === "errors" ? "active" : ""} onClick={() => setMode("errors")} type="button">Errors only</button></div></div>
        </div>
        <div className="log-viewer-meta"><span><span className="status-pulse" /> Read-only evidence view</span><span>{filteredLines.length} of {lines.length} lines visible</span></div>
        <div className="log-code-window" role="region" aria-label="Build log lines" tabIndex={0}>
          {filteredLines.length ? filteredLines.map((line) => {
            const isError = /error|failed|TS\d+|npm error/i.test(line.text);
            return <div className={`log-code-line${isError ? " is-error" : ""}`} key={`${line.lineNumber}-${line.text}`}><span className="log-line-number">{String(line.lineNumber).padStart(2, "0")}</span><code>{highlightText(line.text, query)}</code></div>;
          }) : <EmptyState description="Try a different term or switch back to all lines." icon="search" title="No matching lines" />}
        </div>
      </Card>
      <div className="viewer-footer-note"><Icon name="info" size={14} /><span>Logs are shown as plain text. The future analyzer will own normalization and rule matching.</span><AppLink className="text-link" onNavigate={onNavigate} to="/documentation#architecture">See architecture <Icon name="arrow-right" size={14} /></AppLink></div>
    </div>
  );
}

function VerificationStateBadge({ state }: { state: VerificationFindingState }) {
  const tone = state === "resolved" ? "success" : state === "persistent" ? "warning" : "error";
  return <Badge tone={tone} dot>{state}</Badge>;
}

function VerificationResultCard({ result, onNavigate }: { result: ComparedDemoVerification; onNavigate: Navigate }) {
  return (
    <Card className="verification-result-card">
      <div className="verification-result-head"><div><span className="panel-kicker">Simulated comparison</span><h2>{result.outcome === "improved" ? "The rerun moved in the right direction." : "No change detected."}</h2></div><Badge tone={result.outcome === "improved" ? "success" : "warning"} dot>{result.outcome}</Badge></div>
      <p className="verification-message">{result.message}</p>
      <div className="verification-summary-grid"><div><strong>{result.summary.resolvedCount}</strong><span>Resolved</span></div><div><strong>{result.summary.persistentCount}</strong><span>Persistent</span></div><div><strong>{result.summary.newCount}</strong><span>New</span></div></div>
      <div className="comparison-list">
        {result.comparisons.map((comparison) => <div className="comparison-row" key={comparison.id}><span className="comparison-status-icon"><Icon name={comparison.state === "resolved" ? "check" : comparison.state === "persistent" ? "clock" : "circle-alert"} size={16} /></span><span className="comparison-copy"><strong>{comparison.title}</strong><small>{comparison.ruleId}</small></span><VerificationStateBadge state={comparison.state} /><Icon name="chevron-right" size={15} /></div>)}
      </div>
      <div className="verification-result-footer"><span><Icon name="lock" size={13} /> No commands executed</span><Button onClick={() => onNavigate("/app/analysis")} variant="secondary" size="sm" icon="arrow-right" iconPosition="right">Review findings</Button></div>
    </Card>
  );
}

export function VerificationPage({ onNavigate, onNotify }: WorkspacePageProps) {
  const [baseline, setBaseline] = useState(DEMO_NODE_BUILD_LOG.text);
  const [rerun, setRerun] = useState(DEMO_NODE_BUILD_LOG.text.replace("error TS2322: Type 'string | undefined' is not assignable to type 'string'.", "Build completed with 0 TypeScript errors.").replace("18   return formatLabel(config.label);", "18   return formatLabel(config.label ?? \"\");"));
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<ComparedDemoVerification | null>(null);
  const validation = validateVerificationLogs(baseline, rerun);

  function compare() {
    setTouched(true);
    if (!validation.valid) {
      onNotify(validation.errors[0]?.message ?? "Add both logs before comparing.");
      return;
    }
    setResult(DEMO_VERIFICATION_RESULT as ComparedDemoVerification);
    onNotify("Simulated verification result ready.");
  }

  function loadNoChange() {
    setRerun(baseline);
    setResult(null);
    onNotify("The rerun now matches the baseline for the no-change example.");
  }

  return (
    <div className="workspace-page verification-page">
      <DemoNotice>Verification is simulated with fixture results. The future engine will compare stable finding identities.</DemoNotice>
      <WorkspacePageHeader
        actions={<Button onClick={compare} icon="refresh">Compare demo rerun</Button>}
        description="Put the original failure next to a rerun. A useful comparison says what resolved, what persisted, and what appeared next."
        eyebrow="Workbench / verification"
        title="Did the fix actually help?"
      />
      <div className="verification-input-grid">
        <Card className="verification-input-card">
          <div className="verification-input-head"><span className="verification-step">01</span><div><span className="panel-kicker">Baseline</span><h2>Before the fix</h2></div><Badge tone="neutral">Original</Badge></div>
          <TextareaField error={touched && !validation.baseline.valid ? validation.baseline.error.message : undefined} id="baseline-log" label="Original build log" onBlur={() => setTouched(true)} onChange={(event) => setBaseline(event.target.value)} value={baseline} />
          <span className="verification-input-meta"><Icon name="file-code" size={13} /> {baseline.split("\n").length} lines · {formatBytes(getUtf8ByteLength(baseline))}</span>
        </Card>
        <div className="verification-connector" aria-hidden="true"><span>compare</span><Icon name="arrow-right" size={18} /></div>
        <Card className="verification-input-card">
          <div className="verification-input-head"><span className="verification-step verification-step-accent">02</span><div><span className="panel-kicker">Rerun</span><h2>After the fix</h2></div><Badge tone="accent">Simulated</Badge></div>
          <TextareaField error={touched && !validation.rerun.valid ? validation.rerun.error.message : undefined} id="rerun-log" label="Rerun build log" onBlur={() => setTouched(true)} onChange={(event) => setRerun(event.target.value)} value={rerun} />
          <span className="verification-input-meta"><Icon name="file-code" size={13} /> {rerun.split("\n").length} lines · {formatBytes(getUtf8ByteLength(rerun))}</span>
        </Card>
      </div>
      <div className="verification-actions"><Button onClick={compare} size="lg" icon="shield-check">Compare demo result</Button><Button onClick={loadNoChange} variant="quiet" size="sm" icon="refresh">Load no-change case</Button></div>
      {result ? <VerificationResultCard onNavigate={onNavigate} result={result} /> : <Card className="verification-empty-card"><EmptyState description="Submit both text areas to see the labeled simulated comparison." icon="shield-check" title="Waiting for a rerun" action={<span className="empty-state-meta"><Kbd>⌘</Kbd> <Kbd>↵</Kbd> compare when ready</span>} /></Card>}
    </div>
  );
}

export function HistoryPage({ onNavigate }: WorkspacePageProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "complete" | "no-match">("all");
  const filtered = DEMO_HISTORY.filter((entry) => (status === "all" || entry.status === status) && `${entry.label} ${entry.summary}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="workspace-page history-page">
      <DemoNotice>History rows are demonstration fixtures. The MVP does not persist raw logs or user sessions yet.</DemoNotice>
      <WorkspacePageHeader actions={<Button onClick={() => onNavigate("/app/new-analysis")} icon="plus">New analysis</Button>} description="A reviewable trail of sample runs, designed to become local history only after persistence decisions are made." eyebrow="Library / history" title="Keep the thread of the failure." />
      <Card className="history-table-card">
        <div className="history-toolbar"><div className="log-search"><Icon name="search" size={15} /><input aria-label="Search history" onChange={(event) => setQuery(event.target.value)} placeholder="Search analyses..." value={query} />{query ? <IconButton icon="x" label="Clear search" onClick={() => setQuery("")} size="sm" /> : null}</div><div className="segmented-control" role="group" aria-label="History status filter"><button className={status === "all" ? "active" : ""} onClick={() => setStatus("all")} type="button">All</button><button className={status === "complete" ? "active" : ""} onClick={() => setStatus("complete")} type="button">Findings</button><button className={status === "no-match" ? "active" : ""} onClick={() => setStatus("no-match")} type="button">No match</button></div></div>
        <div className="history-table-head"><span>Analysis</span><span>Source</span><span>Result</span><span>Opened</span><span /></div>
        {filtered.length ? <div className="history-table-body">{filtered.map((entry) => <button className="history-table-row" key={entry.id} onClick={() => onNavigate("/app/analysis")} type="button"><span className="history-table-name"><span className="history-row-icon"><Icon name="file-code" size={15} /></span><span><strong>{entry.label}</strong><small>{entry.summary}</small></span></span><span className="history-source"><Icon name={entry.source === "file" ? "file-code" : "terminal"} size={14} /> {formatSource(entry.source)}</span><span>{entry.status === "no-match" ? <Badge tone="success">No match</Badge> : <Badge tone="warning">{entry.findingCount} findings</Badge>}</span><span className="history-date">{formatDate(entry.createdAt)}</span><Icon name="chevron-right" size={15} /></button>)}</div> : <EmptyState description="No demo history entry matches this filter." icon="search" title="Nothing found" />}
      </Card>
    </div>
  );
}

function reportText(): string {
  return [
    "BUILDMEDIC DEMONSTRATION REPORT",
    "===============================",
    "",
    "Input: sanitized-node-build.log",
    "Status: Demonstration data · live engine not connected",
    "Rule catalog: demo-rules-1",
    "",
    "LIKELY ROOT CAUSE",
    "An optional value is used where a string is required",
    "Confidence: high",
    "",
    "EVIDENCE",
    "07: error TS2322: Type 'string | undefined' is not assignable to type 'string'.",
    "08: 18   return formatLabel(config.label);",
    "",
    "NEXT STEP",
    "Review the intended empty-label behavior and narrow config.label or provide a documented fallback.",
    "",
    "This report is a frontend preview. No live analysis or backend service produced it.",
  ].join("\n");
}

export function ReportsPage({ onNotify }: WorkspacePageProps) {
  const [tab, setTab] = useState<"overview" | "evidence" | "next">("overview");
  const report = reportText();

  async function copyReport() {
    await navigator.clipboard?.writeText(report);
    onNotify("Demonstration report copied locally.");
  }

  function downloadReport() {
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "buildmedic-demo-report.txt";
    link.click();
    URL.revokeObjectURL(url);
    onNotify("Demonstration report downloaded locally.");
  }

  return (
    <div className="workspace-page reports-page">
      <DemoNotice>Export is a local frontend preview. It contains sanitized fixture content and no private log data.</DemoNotice>
      <WorkspacePageHeader actions={<><Button onClick={copyReport} variant="secondary" icon="copy">Copy preview</Button><Button onClick={downloadReport} icon="arrow-down">Download text</Button></>} description="A compact, shareable shape for a future report export. Review the content before sharing any real log." eyebrow="Library / reports" title="Make the next step portable." />
      <div className="report-layout">
        <Card className="report-preview-card">
          <div className="report-preview-top"><div className="report-brand-lockup"><span className="brand-mark"><span /><span /><span /></span><span><strong>BuildMedic</strong><small>Demonstration report</small></span></div><Badge tone="accent" dot>Fixture</Badge></div>
          <div className="report-preview-content">
            <span className="panel-kicker">Root cause summary</span>
            <h2>An optional value is used where a string is required</h2>
            <p>The compiler diagnostic is the most useful place to start. The lifecycle message below it is a downstream summary.</p>
            <div className="report-preview-meta"><Badge tone="error">Error</Badge><Badge tone="info">High confidence</Badge><span>sanitized-node-build.log</span></div>
            <Divider />
            <div className="report-preview-section"><span className="panel-kicker">Evidence</span><code>07  error TS2322: Type 'string | undefined'</code><code>08  return formatLabel(config.label);</code></div>
            <div className="report-preview-action"><span className="report-preview-action-icon"><Icon name="lightbulb" size={16} /></span><span><strong>Suggested next step</strong><small>Handle the optional label, then rerun the same build.</small></span></div>
          </div>
          <div className="report-preview-footer"><span><Icon name="lock" size={13} /> Local preview only</span><span>Generated from demo-rules-1</span></div>
        </Card>
        <Card className="report-outline-card">
          <div className="panel-heading"><div><span className="panel-kicker">Report outline</span><h2>What gets shared</h2></div><Icon name="sliders" size={17} /></div>
          <div className="report-tabs" role="tablist" aria-label="Report sections"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")} type="button">Overview</button><button className={tab === "evidence" ? "active" : ""} onClick={() => setTab("evidence")} type="button">Evidence</button><button className={tab === "next" ? "active" : ""} onClick={() => setTab("next")} type="button">Next step</button></div>
          <div className="report-tab-content">{tab === "overview" ? <><span className="outline-number">01</span><h3>Diagnosis first</h3><p>Keep the likely cause, confidence, and input identity together at the top.</p></> : tab === "evidence" ? <><span className="outline-number">02</span><h3>Evidence stays inspectable</h3><p>Include only the relevant lines and make their source positions clear.</p></> : <><span className="outline-number">03</span><h3>Actions stay reviewable</h3><p>Export a suggestion, not an automatic fix or a command that runs silently.</p></>}</div>
          <Divider />
          <div className="report-outline-note"><Icon name="info" size={15} /><span>Live report generation is planned. This preview is generated from the fixture layer.</span></div>
        </Card>
      </div>
    </div>
  );
}

export function SettingsPage({ preferences, onPatchPreferences, theme, onSetTheme, onNotify }: WorkspacePageProps) {
  return (
    <div className="workspace-page settings-page">
      <DemoNotice>Preferences are frontend-only and contain no log content.</DemoNotice>
      <WorkspacePageHeader description="Tune the workspace for the way you investigate. These settings are intentionally small and local." eyebrow="System / settings" title="Make the workspace yours." />
      <div className="settings-layout">
        <Card className="settings-card">
          <div className="settings-card-heading"><div><span className="panel-kicker">Appearance</span><h2>Visual system</h2></div><Icon name="sun" size={18} /></div>
          <div className="theme-choice-grid">
            {(["dark", "light", "system"] as const).map((option) => <button className={`theme-choice${theme === option ? " active" : ""}`} key={option} onClick={() => onSetTheme(option)} type="button"><span className={`theme-choice-swatch theme-choice-${option}`} /> <span><strong>{option[0].toUpperCase() + option.slice(1)}</strong><small>{option === "system" ? "Follow browser preference" : `${option[0].toUpperCase() + option.slice(1)} workspace`}</small></span>{theme === option ? <Icon name="check-circle" size={16} /> : null}</button>)}
          </div>
          <Divider />
          <Toggle checked={preferences.reducedMotion} description="Use minimal transitions and no parallax response." label="Reduce motion" onChange={(checked) => onPatchPreferences({ reducedMotion: checked })} />
          <Toggle checked={preferences.showLineNumbers} description="Keep source positions visible in the log viewer." label="Show line numbers" onChange={(checked) => onPatchPreferences({ showLineNumbers: checked })} />
          <Toggle checked={preferences.showEvidenceContext} description="Include nearby context lines in finding cards." label="Show evidence context" onChange={(checked) => onPatchPreferences({ showEvidenceContext: checked })} />
        </Card>
        <Card className="settings-card">
          <div className="settings-card-heading"><div><span className="panel-kicker">Input defaults</span><h2>Start with the right surface</h2></div><Icon name="sliders" size={18} /></div>
          <div className="settings-option-group"><span className="settings-option-label">Default input mode</span><div className="settings-segmented"><button className={preferences.defaultInputMode === "paste" ? "active" : ""} onClick={() => onPatchPreferences({ defaultInputMode: "paste" })} type="button"><Icon name="terminal" size={15} /> Paste</button><button className={preferences.defaultInputMode === "file" ? "active" : ""} onClick={() => onPatchPreferences({ defaultInputMode: "file" })} type="button"><Icon name="file-code" size={15} /> File</button></div></div>
          <div className="settings-option-group"><span className="settings-option-label">Display density</span><div className="settings-segmented"><button className={preferences.displayDensity === "comfortable" ? "active" : ""} onClick={() => onPatchPreferences({ displayDensity: "comfortable" })} type="button">Comfortable</button><button className={preferences.displayDensity === "compact" ? "active" : ""} onClick={() => onPatchPreferences({ displayDensity: "compact" })} type="button">Compact</button></div></div>
          <div className="settings-safe-note"><Icon name="lock" size={15} /><span><strong>No raw logs are stored.</strong><small>Only these interface preferences may be retained locally.</small></span></div>
          <Button onClick={() => { onPatchPreferences({ theme: "system", defaultInputMode: "paste", displayDensity: "comfortable", reducedMotion: false, showLineNumbers: true, showEvidenceContext: true }); onNotify("Preferences reset to defaults."); }} variant="quiet" icon="refresh">Reset preferences</Button>
        </Card>
      </div>
    </div>
  );
}

export function HelpPage({ onNavigate, onNotify }: WorkspacePageProps) {
  const [openQuestion, setOpenQuestion] = useState<string | null>("demo");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const questions = [
    { id: "demo", question: "What is real in this workspace?", answer: "The navigation, input validation, local file reading, search, filters, theme preferences, copy/download actions, and empty states are frontend interactions. The diagnosis and verification responses are clearly labeled fixture data." },
    { id: "privacy", question: "Does BuildMedic upload my log?", answer: "The planned MVP is local-first and does not require a network request. This frontend does not send log text to a backend or external AI service." },
    { id: "engine", question: "When does live analysis arrive?", answer: "The analyzer and rule catalog are intentionally separate from this frontend milestone. Follow the repository roadmap for the implementation order." },
    { id: "share", question: "Can I share a report?", answer: "The Reports page can copy or download the sanitized demonstration preview locally. Review and redact real logs before sharing them." },
  ];
  return (
    <div className="workspace-page help-page">
      <DemoNotice>Help content describes the frontend milestone and planned product boundaries.</DemoNotice>
      <WorkspacePageHeader actions={<Button onClick={() => setShortcutsOpen(true)} variant="secondary" icon="command">Keyboard shortcuts</Button>} description="A short guide to the surfaces in BuildMedic Lab and what is intentionally simulated today." eyebrow="System / help" title="Find your way around." />
      <div className="help-layout">
        <Card className="help-getting-started"><div className="help-orbit" aria-hidden="true"><span /><span /><span /><span /></div><span className="eyebrow">First pass</span><h2>Start with a sanitized log.</h2><p>Open New analysis, load the sample, then follow the finding into the viewer or verification surface.</p><div className="help-steps"><div><span>01</span><strong>Load sample</strong></div><div><span>02</span><strong>Open findings</strong></div><div><span>03</span><strong>Compare rerun</strong></div></div><Button onClick={() => onNavigate("/app/new-analysis")} icon="arrow-right" iconPosition="right">Start a demo analysis</Button></Card>
        <Card className="help-faq-card"><div className="panel-heading"><div><span className="panel-kicker">Common questions</span><h2>Stay oriented</h2></div><Icon name="circle-help" size={18} /></div><div className="faq-list">{questions.map((item) => <div className={`faq-item${openQuestion === item.id ? " open" : ""}`} key={item.id}><button onClick={() => setOpenQuestion((current) => current === item.id ? null : item.id)} type="button"><span>{item.question}</span><Icon name={openQuestion === item.id ? "chevron-down" : "chevron-right"} size={15} /></button>{openQuestion === item.id ? <p>{item.answer}</p> : null}</div>)}</div></Card>
      </div>
      <Card className="help-contact-card"><span className="help-contact-icon"><Icon name="message-circle" size={20} /></span><div><span className="panel-kicker">Still have a question?</span><h2>Bring it to the repository.</h2><p>Open a focused, sanitized GitHub issue or read the project contribution guide.</p></div><div className="help-contact-actions"><a className="text-link" href="https://github.com/hussnainahmedd/BuildMedic/issues" rel="noreferrer" target="_blank">Open issues <Icon name="external-link" size={14} /></a><AppLink className="text-link" onNavigate={onNavigate} to="/documentation#contributing">Contribution guide <Icon name="arrow-right" size={14} /></AppLink></div></Card>
      <Modal description="These shortcuts are available in the frontend workspace." onClose={() => setShortcutsOpen(false)} open={shortcutsOpen} title="Keyboard shortcuts" size="sm"><div className="shortcut-list"><div><span>Open command center</span><Kbd>⌘ K</Kbd></div><div><span>Close dialog</span><Kbd>Esc</Kbd></div><div><span>Focus search on viewer</span><Kbd>/</Kbd></div><div><span>Copy selected evidence</span><Kbd>⌘ C</Kbd></div></div><Divider /><button className="command-note" onClick={() => onNotify("Shortcuts are designed to stay out of the way of investigation.")} type="button"><Icon name="info" size={15} /> More shortcuts will arrive with the live analyzer.</button></Modal>
    </div>
  );
}
