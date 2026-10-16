import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import { sanitizeEvidenceLine } from "../analyzer";
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
import { DEMO_NODE_BUILD_LOG } from "../data";
import { formatBytes, formatCategory, formatDate, formatNumber, formatSource } from "../lib/format";
import { LocalTaskClient, SMALL_INPUT_FALLBACK_BYTES, isLocalTaskAbort, localTaskMessage } from "../lib/analysis-client";
import { buildAnalysisReport, NO_BUILD_DISCLAIMER, REPORT_FILE_NAME, REPORT_REDACTION_NOTICE, reportStatus, safeReportText } from "../lib/report";
import { useTabKeyboard } from "../lib/tab-keyboard";
import { useLogInspection } from "../lib/use-log-inspection";
import { VIEWER_PAGE_SIZE, type ViewerPage } from "../workers/protocol";
import {
  validateFile,
  validateLogText,
} from "../lib/validation";
import type {
  AnalysisHistoryEntry,
  AnalysisResult,
  AnalysisSource,
  Finding,
  FindingSeverity,
  UserPreferences,
  VerificationFindingState,
  VerificationResult,
} from "../types";

type ComparedVerification = Extract<VerificationResult, { status: "compared" }>;
type FindingFilter = "all" | FindingSeverity;
type FindingSort = "rank" | "severity" | "line";
type HistoryFilter = "all" | "complete" | "no-match" | "invalid";

const FINDING_SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

const FINDING_FILTERS: readonly FindingFilter[] = ["all", "critical", "error", "warning", "info"];
const LOG_PAGE_SIZE = VIEWER_PAGE_SIZE;

export interface WorkspacePageProps {
  onNavigate: Navigate;
  onNotify: (message: string) => void;
  currentLog: string;
  currentFileName?: string;
  analysis: AnalysisResult;
  activeRunId?: string;
  analysisError: string | null;
  history: readonly AnalysisHistoryEntry[];
  isAnalyzing: boolean;
  isVerifying: boolean;
  verification: VerificationResult | null;
  verificationError?: string | null;
  verificationInputs?: { readonly baseline: string; readonly rerun: string };
  onAnalyze: (text: string, source?: AnalysisSource, fileName?: string) => void;
  onClearActive: () => void;
  onCancelAnalysis?: () => void;
  onEditInput?: (text: string, source?: AnalysisSource, fileName?: string) => void;
  onCompareVerification: (baseline: string, rerun: string) => void;
  onCancelVerification?: () => void;
  onVerificationInputChange?: (baseline: string, rerun: string) => void;
  onOpenHistory: (analysisId: string) => void;
  preferences: UserPreferences;
  onPatchPreferences: (patch: Partial<UserPreferences>) => void;
  theme: UserPreferences["theme"];
  onSetTheme: (theme: UserPreferences["theme"]) => void;
  onClearHistory?: () => void;
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

function StatusRow({ children }: { children: ReactNode }) {
  return <div className="demo-status-row"><span className="status-pulse" />{children}</div>;
}

function hasSubmittedInput(analysis: AnalysisResult): boolean {
  return analysis.status === "complete" || analysis.status === "no-match";
}

function hasInvalidInput(analysis: AnalysisResult, currentLog: string): boolean {
  return currentLog.length > 0 && analysis.status === "invalid" && analysis.input.byteCount > 0;
}

function statusTone(status: AnalysisResult["status"]): "success" | "warning" | "error" | "neutral" {
  if (status === "complete") return "warning";
  if (status === "no-match") return "success";
  return "error";
}

function verificationTone(outcome: ComparedVerification["outcome"]): "success" | "warning" | "error" | "info" {
  if (outcome === "improved") return "success";
  if (outcome === "regressed") return "error";
  if (outcome === "changed") return "info";
  return "warning";
}

function verificationOutcomeLabel(result: VerificationResult | null): string {
  if (!result) return "No comparison";
  if (result.status === "invalid") return "Invalid comparison";
  if (result.status === "no-match") return "No supported match";
  return result.outcome;
}

function PartialAnalysisNotice({ analysis }: { analysis: AnalysisResult }) {
  if (!analysis.metadata?.partial) return null;
  const omitted = analysis.metadata.omittedFindingCount;
  const detail = omitted === undefined ? "Some safety limits were reached." : `${omitted} additional finding${omitted === 1 ? "" : "s"} may be omitted.`;
  return <div className="analysis-partial-notice" role="status"><Icon name="info" size={14} /> {detail} Review the visible evidence as a bounded result, not an exhaustive log report.</div>;
}

function LargeLogNotice({ warning }: { warning: boolean }) {
  return warning ? <div className="analysis-partial-notice" role="status"><Icon name="info" size={14} /> Large log: local processing may take several seconds and use significant memory. You can cancel processing; reducing the log may help on smaller devices.</div> : null;
}

function safeEvidenceText(text: string): string {
  return sanitizeEvidenceLine(text, 2048).text;
}

function safeDisplayName(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const basename = value.split(/[\\/]/).pop() ?? value;
  return sanitizeEvidenceLine(basename, 160).text || fallback;
}

async function copyPlainText(value: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function OverviewPage({ onNavigate, onNotify, onOpenHistory, analysis, activeRunId, analysisError, currentLog, currentFileName, history, isAnalyzing, isVerifying, verification }: WorkspacePageProps) {
  const hasAnalysis = !isAnalyzing && hasSubmittedInput(analysis);
  const hasInvalid = !isAnalyzing && hasInvalidInput(analysis, currentLog);
  const latest = history.find((entry) => entry.analysisId === (activeRunId ?? analysis.id)) ?? history[0];
  const topFinding = analysis.status === "complete" ? analysis.findings[0] : undefined;
  const findings = analysis.status === "complete" ? analysis.findings : [];
  const reviewCount = findings.filter((finding) => finding.severity === "critical" || finding.severity === "error").length;
  const inputName = safeDisplayName(currentFileName || analysis.input.fileName, analysis.input.source === "file" ? "Uploaded build log" : "Pasted build log");
  const activity = history.slice(0, 5);

  return (
    <div className="workspace-page overview-page">
      <WorkspacePageHeader
        actions={<Button onClick={() => onNavigate("/app/new-analysis")} icon="plus">New analysis</Button>}
        description="A local view of the latest diagnostic signal, evidence, and verification activity."
        eyebrow="Workspace pulse"
        title="Good morning, builder."
      />
      {analysisError ? <div className="field-error" role="alert"><Icon name="circle-alert" size={14} /> {analysisError}</div> : null}
      <div className="stats-grid">
        <StatCard detail={hasAnalysis ? "From the active analysis" : "Run an analysis to populate"} icon="activity" label="Current findings" tone="accent" value={hasAnalysis ? formatNumber(findings.length) : "—"} />
        <StatCard detail={hasAnalysis ? "Critical and error severity" : "No active result"} icon="circle-alert" label="Needs review" tone="error" value={hasAnalysis ? formatNumber(reviewCount) : "—"} />
        <StatCard detail={isVerifying ? "Local comparison in progress" : verification ? "From the latest comparison" : "Compare a rerun to populate"} icon="shield-check" label="Verification" tone="success" value={isVerifying ? "Comparing…" : verification ? verificationOutcomeLabel(verification) : "—"} />
        <StatCard detail={latest ? "Latest recorded metadata" : "No analyses recorded"} icon="clock" label="Last opened" value={latest ? formatDate(latest.createdAt) : "—"} />
      </div>
      <div className="overview-grid">
        <Card className="overview-primary-card">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Latest analysis</span>
              <h2>{hasAnalysis ? (latest?.label ?? inputName) : "No analysis yet"}</h2>
            </div>
            {hasAnalysis ? <Badge tone={statusTone(analysis.status)} dot>{analysis.status === "complete" ? "Findings" : "No match"}</Badge> : null}
          </div>
          {isAnalyzing ? (
            <EmptyState description="The local analyzer is processing the current input. The result will appear here when it completes." icon="activity" title="Analysis in progress" />
          ) : hasAnalysis ? (
            <>
              <div className="latest-analysis-meta">
                <span><Icon name="file-code" size={15} /> {inputName}</span>
                <span><Icon name="clock" size={15} /> {formatDate(analysis.analyzedAt)}</span>
                <span><Icon name="layers" size={15} /> {findings.length} {findings.length === 1 ? "finding" : "findings"}</span>
              </div>
              {topFinding ? (
                <div className="root-cause-callout">
                  <span className="root-cause-icon"><Icon name="circle-alert" size={20} /></span>
                  <div>
                    <span className="panel-kicker">Highest-ranked finding</span>
                    <h3>{topFinding.title}</h3>
                    <p>{topFinding.explanation}</p>
                  </div>
                  <Badge tone="info">{topFinding.confidence} confidence</Badge>
                </div>
              ) : (
                <EmptyState description={analysis.status === "no-match" ? analysis.message : "No finding signal is available for this result."} icon="check-circle" title="No supported diagnostic matched" />
              )}
              <div className="overview-primary-footer">
                <StatusRow>{analysis.ruleCatalogVersion} · local analyzer · no commands executed</StatusRow>
                <Button onClick={() => onNavigate("/app/analysis")} variant="secondary" icon="arrow-right" iconPosition="right" size="sm">Open result</Button>
              </div>
            </>
          ) : (
            <EmptyState
              action={<Button onClick={() => onNavigate("/app/new-analysis")} icon="upload-cloud">Bring in a log</Button>}
              description={hasInvalid && analysis.status === "invalid" ? analysis.error.message : "Paste or upload a build log to create the first local analysis."}
              icon={hasInvalid ? "circle-alert" : "file-text"}
              title={hasInvalid ? "The active input is invalid" : "Start with a build log"}
            />
          )}
        </Card>
        <Card className="overview-side-card">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Verification</span>
              <h2>Rerun signal</h2>
            </div>
            <IconButton icon="more-horizontal" label="More verification actions" onClick={() => onNotify("Open Verification to compare a baseline with a rerun.")} size="sm" />
          </div>
          {isVerifying ? (
            <StatusRow>Comparing analyzer findings from the baseline and rerun…</StatusRow>
          ) : verification?.status === "compared" ? (
            <>
              <div className="verification-ring-wrap">
                <div className="verification-ring"><strong>{verification.summary.resolvedCount}</strong><span>resolved</span></div>
                <div className="verification-ring-copy">
                  <Badge tone={verificationTone(verification.outcome)} dot>{verification.outcome}</Badge>
                  <p>{verification.message ?? "The comparison reports analyzer finding transitions only."}</p>
                </div>
              </div>
              <Divider />
              <div className="side-card-row"><span>Persistent</span><strong>{verification.summary.persistentCount}</strong></div>
              <div className="side-card-row"><span>New signals</span><strong>{verification.summary.newCount}</strong></div>
              <div className="side-card-row"><span>Uncertain</span><strong>{verification.summary.uncertainCount ?? 0}</strong></div>
            </>
          ) : (
            <EmptyState
              description={verification?.status === "no-match" ? verification.message : "Compare the current log with a rerun to see resolved, persistent, new, or uncertain findings."}
              icon={verification?.status === "invalid" ? "circle-alert" : "shield-check"}
              title={verification?.status === "invalid" ? "Comparison needs attention" : "No comparison yet"}
            />
          )}
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
            {activity.length ? activity.map((entry) => <HistoryRow entry={entry} key={entry.id} onClick={() => onOpenHistory(entry.analysisId)} />) : <EmptyState description="Completed analysis metadata will appear here. Raw logs are not persisted in history." icon="history" title="No recent sessions" />}
          </div>
        </Card>
        <Card className="quick-start-card">
          <div className="quick-start-orbit" aria-hidden="true"><span /><span /><span /></div>
          <span className="panel-kicker">Quick start</span>
          <h2>Have a build log nearby?</h2>
          <p>Paste or upload a local log, then review the analyzer’s evidence before deciding on a fix.</p>
          <Button onClick={() => onNavigate("/app/new-analysis")} icon="upload-cloud" iconPosition="left">Bring in a log</Button>
          <span className="quick-start-note"><Icon name="lock" size={13} /> Log text stays in this browser session.</span>
        </Card>
      </div>
    </div>
  );
}

function historyStatusLabel(status: AnalysisHistoryEntry["status"]): string {
  if (status === "complete") return "Findings";
  if (status === "no-match") return "No match";
  return "Invalid";
}

function historyStatusTone(status: AnalysisHistoryEntry["status"]): "success" | "warning" | "error" {
  if (status === "complete") return "warning";
  if (status === "no-match") return "success";
  return "error";
}

function HistoryRow({ entry, onClick }: { entry: AnalysisHistoryEntry; onClick: () => void }) {
  return (
    <button className="history-row" onClick={onClick} type="button">
      <span className="history-row-icon"><Icon name={entry.status === "no-match" ? "check-circle" : entry.status === "invalid" ? "circle-alert" : "file-code"} size={16} /></span>
      <span className="history-row-main"><strong>{entry.label}</strong><small>{entry.summary}</small></span>
      <span className="history-row-meta"><Badge tone={historyStatusTone(entry.status)}>{entry.status === "complete" ? `${entry.findingCount} ${entry.findingCount === 1 ? "finding" : "findings"}` : historyStatusLabel(entry.status)}</Badge><small>{formatDate(entry.createdAt)}</small></span>
      <Icon name="chevron-right" size={15} />
    </button>
  );
}

export function NewAnalysisPage({ onNotify, currentLog, currentFileName, onAnalyze, onClearActive, onCancelAnalysis, onEditInput, preferences, analysisError, isAnalyzing }: WorkspacePageProps) {
  const [inputMode, setInputMode] = useState<AnalysisSource>(preferences.defaultInputMode);
  const [text, setText] = useState(() => currentLog);
  const [fileName, setFileName] = useState(() => currentFileName ?? "");
  const [touched, setTouched] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | undefined>();
  const [isExampleInput, setIsExampleInput] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const readerRef = useRef<FileReader | null>(null);
  const readRevision = useRef(0);
  const fileInspection = useRef<LocalTaskClient | null>(null);
  const inspection = useLogInspection(text);
  const validation = inspection.validation;
  const byteCount = inspection.byteCount;

  function abortRead() {
    readRevision.current += 1;
    const reader = readerRef.current;
    readerRef.current = null;
    if (reader?.readyState === 1) reader.abort();
    fileInspection.current?.dispose();
    fileInspection.current = null;
    setIsReading(false);
  }
  useEffect(() => () => {
    readRevision.current += 1;
    if (readerRef.current?.readyState === 1) readerRef.current.abort();
    fileInspection.current?.dispose();
  }, []);

  function loadExample() {
    if (isAnalyzing) return;
    abortRead();
    setText(DEMO_NODE_BUILD_LOG.text);
    setFileName("");
    setInputMode("paste");
    setTouched(false);
    setFileError(undefined);
    setIsExampleInput(true);
    onEditInput?.(DEMO_NODE_BUILD_LOG.text, "paste");
    onNotify("Example input loaded. Review it before starting analysis.");
  }

  function submit() {
    setTouched(true);
    if (fileError) { onNotify(fileError); document.getElementById("log-file")?.focus(); return; }
    if (!validation.valid) {
      onNotify(validation.error.message);
      document.getElementById("analysis-log")?.focus();
      return;
    }
    if (isAnalyzing || isReading || inspection.pending) return;
    onAnalyze(text, inputMode, inputMode === "file" && fileName ? fileName : undefined);
  }

  function reportFileError(message: string) {
    setFileError(message);
    setTouched(true);
    onNotify(message);
  }

  function readFile(file: File) {
    if (isAnalyzing) return;
    abortRead();
    const revision = readRevision.current;
    setFileError(undefined);
    const fileValidation = validateFile(file);
    setTouched(true);
    if (!fileValidation.valid) {
      reportFileError(fileValidation.error.message);
      return;
    }

    const reader = new FileReader();
    readerRef.current = reader;
    setIsReading(true);
    reader.onload = async () => {
      if (readRevision.current !== revision) return;
      if (typeof reader.result !== "string") {
        setIsReading(false);
        reportFileError("We could not read this input as text.");
        return;
      }
      const content = reader.result;
      const client = new LocalTaskClient();
      fileInspection.current = client;
      try {
        const contentValidation = content.length <= SMALL_INPUT_FALLBACK_BYTES ? validateLogText(content)
          : (await client.request("inspect", { text: content })).validation;
        if (readRevision.current !== revision) return;
        setIsReading(false);
        if (!contentValidation.valid) { reportFileError(contentValidation.error.message); return; }
      } catch (error) {
        if (readRevision.current !== revision || isLocalTaskAbort(error)) return;
        setIsReading(false);
        reportFileError(localTaskMessage(error));
        return;
      } finally {
        client.dispose();
        if (fileInspection.current === client) fileInspection.current = null;
      }
      readerRef.current = null;
      const selectedName = (file.name || "selected-build.log").slice(0, 255);
      setText(content);
      setFileName(selectedName);
      setInputMode("file");
      setTouched(false);
      setFileError(undefined);
      setIsExampleInput(false);
      onEditInput?.(content, "file", selectedName);
      onNotify("Local text file is ready for analysis.");
    };
    reader.onerror = () => {
      if (readRevision.current !== revision) return;
      setIsReading(false);
      reportFileError("We could not read this input as text.");
    };
    try {
      reader.readAsText(file);
    } catch {
      if (readRevision.current !== revision) return;
      setIsReading(false);
      reportFileError("We could not read this input as text.");
    }
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

  function clearInput() {
    if (isAnalyzing) { onCancelAnalysis?.(); return; }
    abortRead();
    setText("");
    setFileName("");
    setTouched(false);
    setFileError(undefined);
    setIsExampleInput(false);
    onClearActive();
  }

  return (
    <div className="workspace-page new-analysis-page">
      <DemoNotice>Example input is optional and loads only when you choose it. All analysis uses the local engine.</DemoNotice>
      <WorkspacePageHeader
        actions={<Button disabled={isAnalyzing} onClick={loadExample} variant="secondary" icon="refresh">Load example input</Button>}
        description="Start with a local build log. The analyzer reads text only; it never executes commands from the input."
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
            <div>
              {isExampleInput ? <Badge tone="info" dot>Example input</Badge> : null}
              <Badge tone={validation.valid ? "success" : "neutral"} dot>{validation.valid ? "Ready" : "Waiting for input"}</Badge>
            </div>
          </div>
          <div className="input-mode-tabs" role="group" aria-label="Input mode">
            <button disabled={isAnalyzing} aria-pressed={inputMode === "paste"} className={inputMode === "paste" ? "active" : ""} onClick={() => { abortRead(); setInputMode("paste"); setFileName(""); onEditInput?.(text, "paste"); }} type="button"><Icon name="terminal" size={15} /> Paste text</button>
            <button disabled={isAnalyzing} aria-pressed={inputMode === "file"} className={inputMode === "file" ? "active" : ""} onClick={() => { abortRead(); setInputMode("file"); onEditInput?.(text, "file", fileName || undefined); }} type="button"><Icon name="upload-cloud" size={15} /> Upload file</button>
          </div>
          <TextareaField
            aria-busy={isAnalyzing}
            counter={inspection.pending ? "Checking input locally…" : `${formatBytes(byteCount)} · ${inspection.lineCount} lines${inspection.complete ? "" : " (bounded count)"}`}
            disabled={isAnalyzing}
            error={(touched || !inspection.complete) && !isReading && !fileError && !inspection.pending && !validation.valid ? validation.error.message : undefined}
            hint="Text is treated as untrusted evidence and stays in this browser session."
            id="analysis-log"
            label="Build log"
            onBlur={() => setTouched(true)}
            onChange={(event) => { abortRead(); setText(event.target.value); setIsExampleInput(false); setFileError(undefined); onEditInput?.(event.target.value, inputMode, inputMode === "file" ? fileName || undefined : undefined); }}
            placeholder="$ npm run build\nPaste the relevant output here..."
            value={text}
          />
          {fileError ? <div className="field-error" id="file-read-error" role="alert"><Icon name="circle-alert" size={14} /> {fileError}</div> : null}
          {analysisError ? <div className="field-error" role="alert"><Icon name="circle-alert" size={14} /> {analysisError}</div> : null}
          <LargeLogNotice warning={!inspection.pending && validation.valid && validation.warning} />
          {isAnalyzing ? <div aria-live="polite" className="demo-status-row"><span className="status-pulse" />Analyzing with the local rule catalog…</div> : null}
          {isReading ? <div role="status" className="demo-status-row">Reading and validating local text file…</div> : null}
          <div className="input-card-actions">
            <Button disabled={isAnalyzing || isReading || inspection.pending} onClick={submit} size="lg" icon="sparkles" iconPosition="left">{isAnalyzing ? "Analyzing…" : "Analyze log"}</Button>
            <Button onClick={clearInput} variant="quiet" icon="x">{isAnalyzing ? "Cancel" : "Clear"}</Button>
          </div>
          <div className="input-limit-row">
            <span><Icon name="shield-check" size={14} /> Up to 25 MiB</span>
            <span><Icon name="lock" size={14} /> No commands executed</span>
          </div>
        </Card>
        <div className="input-side-column">
          <Card className={`upload-card${dragActive ? " drag-active" : ""}`}>
            <div className="upload-card-icon"><Icon name="upload-cloud" size={22} /></div>
            <h2>Drop a text log</h2>
            <p>Drag a .txt, .log, .json, .ndjson, or other readable text file here.</p>
            <div
              className="drop-zone"
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <input disabled={isAnalyzing} accept=".txt,.log,.json,.ndjson,text/plain,application/json" id="log-file" onChange={handleFileInput} type="file" aria-describedby={fileError ? "file-read-error" : undefined} aria-invalid={Boolean(fileError)} />
              <label htmlFor="log-file"><span>Choose a file</span> or drag it in</label>
            </div>
            {fileName ? <div className="selected-file"><Icon name="file-code" size={15} /><span>{safeDisplayName(fileName, "Selected build log")}</span><Icon name="check" size={14} /></div> : null}
            {isExampleInput ? <div className="selected-file"><Icon name="file-text" size={15} /><span>Example input · {DEMO_NODE_BUILD_LOG.fileName}</span></div> : null}
          </Card>
          <Card className="input-safety-card">
            <div className="panel-heading"><span className="panel-kicker">Good to know</span><Icon name="info" size={16} /></div>
            <ul className="plain-list">
              <li>The local analyzer parses text only; it does not run commands.</li>
              <li>Evidence shown in results, logs, and reports is sanitized before display.</li>
              <li>History stores metadata so older raw logs are not persisted.</li>
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

function FindingCard({ finding, expanded, showEvidence, showEvidenceContext, onToggle, onCopy, onNavigate }: { finding: Finding; expanded: boolean; showEvidence: boolean; showEvidenceContext: boolean; onToggle: () => void; onCopy: () => void; onNavigate: Navigate }) {
  const visibleEvidence = showEvidenceContext ? finding.evidence : finding.evidence.filter((evidence) => evidence.role !== "context");
  return (
    <Card className={`finding-card finding-card-${finding.severity}${expanded ? " expanded" : ""}`}>
      <button aria-expanded={expanded} className="finding-card-header" onClick={onToggle} type="button">
        <span className={`finding-severity-icon finding-severity-${finding.severity}`}><Icon name={finding.severity === "info" ? "info" : "circle-alert"} size={18} /></span>
        <span className="finding-heading-copy"><span className="panel-kicker">{formatCategory(finding.category)} · {finding.ruleId}</span><strong>{finding.title}</strong></span>
        <span className="finding-heading-badges"><Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge><Badge tone="info">{finding.confidence} confidence</Badge><Icon name={expanded ? "chevron-down" : "chevron-right"} size={17} /></span>
      </button>
      <div className="finding-summary"><p>{finding.explanation}</p><span className="finding-evidence-count"><Icon name="hash" size={13} /> {visibleEvidence.length} evidence {visibleEvidence.length === 1 ? "line" : "lines"}</span></div>
      {expanded ? (
        <div className="finding-expanded">
          {showEvidence ? (
            <div className="finding-section">
              <div className="finding-section-heading"><span>Evidence</span><Button onClick={onCopy} variant="quiet" size="sm" icon="copy">Copy</Button></div>
              <div className="evidence-list">
                {visibleEvidence.map((evidence, index) => {
                  const safe = sanitizeEvidenceLine(evidence.text, 2048);
                  return <code className={`evidence-line evidence-line-${evidence.role ?? "context"}`} key={`${finding.id}-${evidence.lineNumber}-${index}`}><span>{String(evidence.lineNumber).padStart(2, "0")}</span><span>{safe.text}</span></code>;
                })}
              </div>
            </div>
          ) : null}
          <div className="finding-action-row">
            <span className="finding-action-icon"><Icon name="lightbulb" size={17} /></span>
            <span><strong>{finding.suggestedActions.length > 1 ? "Suggested next steps" : "Suggested next step"}</strong><small>{finding.suggestedActions[0]?.description ?? "Review the evidence and rerun the build after making a deliberate change."}</small></span>
            <Button onClick={() => onNavigate("/app/verification")} variant="secondary" size="sm" icon="arrow-right" iconPosition="right">Verify later</Button>
          </div>
          {finding.suggestedActions.length > 1 ? <ul className="plain-list">{finding.suggestedActions.slice(1).map((action) => <li key={action.id}><strong>{action.label}:</strong> {action.description}</li>)}</ul> : null}
          <div className="finding-verification-hint"><Icon name="check-circle" size={14} /> {finding.verificationHint}</div>
        </div>
      ) : null}
    </Card>
  );
}

export function AnalysisPage({ onNavigate, onNotify, analysis, currentLog, currentFileName, analysisError, isAnalyzing, preferences }: WorkspacePageProps) {
  const [filter, setFilter] = useState<FindingFilter>("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<FindingSort>("rank");
  const [showEvidence, setShowEvidence] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(() => analysis.status === "complete" ? analysis.findings[0]?.id ?? null : null);
  const completeFindings = useMemo(() => analysis.status === "complete" ? analysis.findings : [], [analysis]);
  const counts = completeFindings.reduce<Record<FindingSeverity, number>>((result, finding) => {
    result[finding.severity] = (result[finding.severity] ?? 0) + 1;
    return result;
  }, { critical: 0, error: 0, warning: 0, info: 0 });
  const findings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return completeFindings
      .map((finding, rank) => ({ finding, rank }))
      .filter(({ finding }) => filter === "all" || finding.severity === filter)
      .filter(({ finding }) => {
        if (!normalizedQuery) return true;
        const evidence = finding.evidence.map((line) => safeEvidenceText(line.text)).join(" ");
        return `${finding.title} ${finding.explanation} ${finding.ruleId} ${finding.category} ${evidence}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (sortBy === "severity") return FINDING_SEVERITY_ORDER[left.finding.severity] - FINDING_SEVERITY_ORDER[right.finding.severity] || left.rank - right.rank;
        if (sortBy === "line") return (left.finding.evidence[0]?.lineNumber ?? Number.POSITIVE_INFINITY) - (right.finding.evidence[0]?.lineNumber ?? Number.POSITIVE_INFINITY) || left.rank - right.rank;
        return left.rank - right.rank;
      });
  }, [completeFindings, filter, query, sortBy]);

  async function copyFinding(finding: Finding) {
    const evidence = preferences.showEvidenceContext ? finding.evidence : finding.evidence.filter((line) => line.role !== "context");
    const text = `${finding.title}\n\n${finding.explanation}\n\n${evidence.map((line) => `${line.lineNumber}: ${safeEvidenceText(line.text)}`).join("\n")}`;
    const copied = await copyPlainText(text);
    onNotify(copied ? "Finding evidence copied locally." : "Could not copy finding evidence. Check clipboard permissions and try again.");
  }

  const hasNoAnalysis = !hasSubmittedInput(analysis) && !hasInvalidInput(analysis, currentLog);
  const inputName = safeDisplayName(currentFileName || analysis.input.fileName, analysis.input.source === "file" ? "Uploaded build log" : "Pasted build log");

  return (
    <div className="workspace-page analysis-page">
      <WorkspacePageHeader
        actions={<><Button onClick={() => onNavigate("/app/log-viewer")} variant="secondary" icon="file-code">Open log</Button><Button disabled={!hasSubmittedInput(analysis)} onClick={() => onNavigate("/app/verification")} icon="shield-check">Verify fix</Button></>}
        description="Review ranked findings, their source evidence, and the next diagnostic step produced by the local rule catalog."
        eyebrow="Workbench / analysis results"
        title="Here is what the build is saying."
      />
      {analysisError ? <div className="field-error" role="alert"><Icon name="circle-alert" size={14} /> {analysisError}</div> : null}
      {isAnalyzing ? (
        <Card><EmptyState description="The local analyzer is processing the current input. Findings will appear here when it completes." icon="activity" title="Analysis in progress" /></Card>
      ) : hasNoAnalysis ? (
        <Card><EmptyState action={<Button onClick={() => onNavigate("/app/new-analysis")} icon="plus">Start an analysis</Button>} description="There is no active result yet. Paste or upload a build log to begin." icon="file-text" title="No analysis yet" /></Card>
      ) : analysis.status === "invalid" ? (
        <Card><EmptyState action={<Button onClick={() => onNavigate("/app/new-analysis")} icon="refresh">Return to input</Button>} description={analysis.error.message} icon="circle-alert" title="Analysis could not be completed" /></Card>
      ) : analysis.status === "no-match" ? (
        <>
            <div className="analysis-meta-bar">
            <div className="analysis-meta-left"><span><Icon name="file-code" size={15} /> {inputName}</span><span><Icon name="clock" size={15} /> {formatDate(analysis.analyzedAt)}</span><span><Icon name="layers" size={15} /> {formatBytes(analysis.input.byteCount)}</span></div>
            <Badge tone="success" dot>{analysis.ruleCatalogVersion}</Badge>
            </div>
            <PartialAnalysisNotice analysis={analysis} />
            <Card><EmptyState action={<Button onClick={() => onNavigate("/app/log-viewer")} variant="secondary" icon="file-code">Open log</Button>} description={analysis.message} icon="search" title="No supported diagnostic matched" /></Card>
        </>
      ) : (
        <>
           <div className="analysis-meta-bar">
            <div className="analysis-meta-left"><span><Icon name="file-code" size={15} /> {inputName}</span><span><Icon name="clock" size={15} /> {formatDate(analysis.analyzedAt)}</span><span><Icon name="layers" size={15} /> {formatBytes(analysis.input.byteCount)}</span></div>
            <Badge tone="accent" dot>{analysis.ruleCatalogVersion}</Badge>
           </div>
           <PartialAnalysisNotice analysis={analysis} />
           <div className="analysis-summary-grid">
            <Card className="analysis-root-card">
              <div className="analysis-root-label"><span className={`severity-dot severity-${analysis.findings[0]?.severity ?? "info"}`} /> Highest-ranked finding {analysis.findings[0] ? <Badge tone="info">{analysis.findings[0].confidence} confidence</Badge> : null}</div>
              <h2>{analysis.findings[0]?.title ?? "No supported signal"}</h2>
              <p>{analysis.findings[0]?.explanation ?? "The local analyzer did not return a finding."}</p>
              <div className="root-card-footer"><span><Icon name="hash" size={14} /> line {analysis.findings[0]?.evidence[0]?.lineNumber ?? "—"}</span><Button disabled={!analysis.findings[0]} onClick={() => { setExpandedId(analysis.findings[0]?.id ?? null); setShowEvidence(true); }} variant="quiet" size="sm" icon="arrow-down">Show evidence</Button></div>
            </Card>
            <div className="analysis-counts">
              <div className="count-card"><span>Findings</span><strong>{analysis.findings.length}</strong><small>returned by this analysis</small></div>
              <div className="count-card count-card-error"><span>Errors</span><strong>{counts.critical + counts.error}</strong><small>critical and error severity</small></div>
              <div className="count-card count-card-warning"><span>Warnings</span><strong>{counts.warning}</strong><small>review with the evidence</small></div>
            </div>
          </div>
          <div className="findings-heading-row">
            <div><span className="panel-kicker">Diagnostic findings</span><h2>Follow the signal</h2></div>
            <div className="finding-filters" role="group" aria-label="Filter findings">
              {FINDING_FILTERS.map((option) => <button aria-pressed={filter === option} className={filter === option ? "active" : ""} key={option} onClick={() => setFilter(option)} type="button">{option === "all" ? "All" : option}<span>{option === "all" ? analysis.findings.length : counts[option]}</span></button>)}
            </div>
          </div>
          <div className="log-viewer-actions" role="group" aria-label="Findings tools">
            <div className="log-search"><Icon name="search" size={15} /><input aria-label="Search findings" onChange={(event) => setQuery(event.target.value)} placeholder="Search findings..." value={query} />{query ? <IconButton icon="x" label="Clear finding search" onClick={() => setQuery("")} size="sm" /> : null}</div>
            <label className="settings-option-label" htmlFor="finding-sort">Sort</label>
            <select aria-label="Sort findings" id="finding-sort" onChange={(event) => setSortBy(event.target.value as FindingSort)} value={sortBy}><option value="rank">Rank</option><option value="severity">Severity</option><option value="line">Source line</option></select>
            <Button aria-pressed={showEvidence} onClick={() => setShowEvidence((visible) => !visible)} variant="quiet" size="sm" icon="file-text">{showEvidence ? "Hide evidence" : "Show evidence"}</Button>
          </div>
          <div className="finding-list">
            {findings.length ? findings.map(({ finding }) => <FindingCard finding={finding} expanded={expandedId === finding.id} key={finding.id} onCopy={() => { void copyFinding(finding); }} onNavigate={onNavigate} onToggle={() => setExpandedId((id) => id === finding.id ? null : finding.id)} showEvidence={showEvidence} showEvidenceContext={preferences.showEvidenceContext} />) : <Card><EmptyState description="Try another severity filter, search term, or sort order." icon="filter" title="Nothing in this filter" /></Card>}
          </div>
          <Card className="analysis-next-card">
            <div className="analysis-next-icon"><Icon name="arrow-right" size={19} /></div>
            <div><span className="panel-kicker">Next useful move</span><h2>{analysis.findings[0]?.suggestedActions[0]?.label ?? "Review the evidence before changing the build"}</h2><p>{analysis.findings[0]?.verificationHint ?? "Use Verification to compare this result with a later analyzer run."}</p></div>
            <Button onClick={() => onNavigate("/app/verification")} variant="secondary" icon="arrow-right" iconPosition="right">Open verification</Button>
          </Card>
        </>
      )}
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

export function LogViewerPage({ onNavigate, onNotify, currentLog, currentFileName, analysis, preferences }: WorkspacePageProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"all" | "errors">("all");
  const [page, setPage] = useState(0);
  const hasLog = currentLog.length > 0;
  const [prepared, setPrepared] = useState<{ log: string; client: LocalTaskClient; busy: boolean; queued?: () => void } | null>(null);
  const [display, setDisplay] = useState<{ log: string; result: ViewerPage } | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(hasLog);
  const [isCopying, setIsCopying] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable], [role='textbox']"));
    const focusSearch = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat) return;
      if (isTyping(event.target) || isTyping(document.activeElement)) return;
      const search = searchRef.current;
      if (!search || search.closest("[inert], [hidden], [aria-hidden='true']")) return;
      event.preventDefault();
      search.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  useEffect(() => {
    setDisplay(null);
    setPrepared(null);
    setViewerError(null);
    setIsLoading(Boolean(currentLog));
    if (!currentLog) return;
    let active = true;
    const client = new LocalTaskClient();
    setIsLoading(true);
    setViewerError(null);
    setDisplay(null);
    setPrepared(null);
    void client.request("viewer-prepare", { text: currentLog }).then(() => {
      if (active) setPrepared({ log: currentLog, client, busy: false });
    }).catch((error: unknown) => {
      if (active && !isLocalTaskAbort(error)) { setViewerError(localTaskMessage(error)); setIsLoading(false); }
    });
    return () => { active = false; client.dispose(); };
  }, [currentLog, retry]);
  useEffect(() => {
    if (!prepared || prepared.log !== currentLog) return;
    let active = true;
    const dispatch = () => {
      if (!active) return;
      // Coalesce rapid searches into one latest queued request. Never queue logs.
      if (prepared.busy) { prepared.queued = dispatch; return; }
      prepared.busy = true;
      setIsLoading(true);
      void prepared.client.request("viewer-page", { query: query.slice(0, 256), mode, page }).then((result) => {
        if (active) { setDisplay({ log: currentLog, result }); setViewerError(null); }
      }).catch((error: unknown) => {
        if (active && !isLocalTaskAbort(error)) setViewerError(localTaskMessage(error));
      }).finally(() => {
        if (active) setIsLoading(false);
        prepared.busy = false;
        const next = prepared.queued;
        prepared.queued = undefined;
        next?.();
      });
    };
    const timer = setTimeout(dispatch, query ? 100 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [currentLog, mode, page, prepared, query]);
  const result = display?.log === currentLog ? display.result : undefined;
  const evidenceLines = useMemo(() => new Set(
    analysis.status === "complete" ? analysis.findings.flatMap((finding) => finding.evidence.map((line) => line.lineNumber)) : [],
  ), [analysis]);
  const pageCount = result?.pageCount ?? 1;
  const currentPage = result?.page ?? 0;
  const visibleLines = result?.lines ?? [];
  const filteredCount = result?.matchingCount ?? 0;
  const fileName = safeDisplayName(currentFileName || analysis.input.fileName, "Current build log");

  async function copyLog() {
    if (!hasLog || !prepared || prepared.log !== currentLog) {
      onNotify("There is no active log to copy.");
      return;
    }
    setIsCopying(true);
    try {
      const copy = await prepared.client.request("viewer-copy", {});
      const text = copy.truncated ? `${copy.text}\n[Sanitized copy truncated to bounded display/copy limits.]` : copy.text;
      const copied = await copyPlainText(text);
      onNotify(copied ? copy.truncated ? "Sanitized log copied locally (truncated to bounded display/copy limits)." : "Sanitized log copied locally." : "Could not copy the sanitized log. Check clipboard permissions and try again.");
    } catch (error) { if (!isLocalTaskAbort(error)) onNotify(localTaskMessage(error)); }
    finally { setIsCopying(false); }
  }

  function updateQuery(value: string) {
    setQuery(value.slice(0, 256));
    setPage(0);
  }

  function updateMode(nextMode: "all" | "errors") {
    setMode(nextMode);
    setPage(0);
  }

  return (
    <div className="workspace-page log-viewer-page">
      <WorkspacePageHeader
        actions={<><Button disabled={!hasLog || !prepared || prepared.log !== currentLog || isCopying} onClick={() => { void copyLog(); }} variant="secondary" icon="copy">{isCopying ? "Copying sanitized log…" : "Copy sanitized log"}</Button><Button onClick={() => onNavigate("/app/analysis")} icon="activity">Back to findings</Button></>}
        description="Keep the current log in view while you investigate. Displayed and copied lines are sanitized plain text."
        eyebrow="Workbench / log viewer"
        title="Stay close to the evidence."
      />
      <Card className="log-viewer-card">
        <div className="log-viewer-toolbar">
          <div className="log-file-title"><span className="log-file-icon"><Icon name="file-code" size={16} /></span><span><strong>{fileName}</strong><small>{result?.lineCount ?? 0} lines · {formatBytes(result?.inputBytes ?? 0)}</small></span></div>
          <div className="log-viewer-actions"><div className="log-search"><Icon name="search" size={15} /><input aria-label="Search log" aria-keyshortcuts="/" maxLength={256} onChange={(event) => updateQuery(event.target.value)} placeholder="Find in log..." ref={searchRef} value={query} />{query ? <IconButton icon="x" label="Clear search" onClick={() => { updateQuery(""); searchRef.current?.focus(); }} size="sm" /> : null}</div><div className="segmented-control" role="group" aria-label="Log filter"><button aria-pressed={mode === "all"} className={mode === "all" ? "active" : ""} onClick={() => updateMode("all")} type="button">All</button><button aria-pressed={mode === "errors"} className={mode === "errors" ? "active" : ""} onClick={() => updateMode("errors")} type="button">Errors only</button></div></div>
        </div>
        <div className="log-viewer-meta"><span><span className="status-pulse" /> Sanitized read-only evidence{result?.truncated ? " · long lines truncated" : ""}</span><span>{filteredCount ? `${currentPage * LOG_PAGE_SIZE + 1}–${currentPage * LOG_PAGE_SIZE + visibleLines.length}` : 0} of {filteredCount} matching lines · {result?.lineCount ?? 0} total</span></div>
        {viewerError ? <div className="field-error" role="alert">{viewerError} <Button onClick={() => setRetry((value) => value + 1)} variant="quiet" size="sm">Retry log display</Button></div> : null}
        {isLoading && hasLog ? <div role="status" className="demo-status-row">Preparing sanitized evidence locally…</div> : null}
        {pageCount > 1 ? <div className="segmented-control" role="group" aria-label="Log pages"><button disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} type="button">Previous</button><span aria-live="polite">Page {currentPage + 1} of {pageCount}</span><button disabled={currentPage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} type="button">Next</button></div> : null}
        <div className="log-code-window" role="region" aria-label="Build log lines" aria-busy={isLoading && hasLog} tabIndex={0}>
          {visibleLines.length ? visibleLines.map((line) => {
            const isError = /error|failed|TS\d+|npm error/i.test(line.text);
            const isEvidence = evidenceLines.has(line.lineNumber);
            return <div className={`log-code-line${isError || isEvidence ? " is-error" : ""}${isEvidence ? " is-evidence" : ""}${preferences.showLineNumbers ? "" : " no-line-number"}`} key={`${line.lineNumber}-${line.text}`}>{preferences.showLineNumbers ? <span className="log-line-number">{String(line.lineNumber).padStart(2, "0")}</span> : null}<code>{highlightText(line.text, query)}</code></div>;
          }) : !isLoading || !hasLog ? <EmptyState description={hasLog ? "Try a different term or switch back to all lines." : "Analyze or open a log to inspect sanitized evidence here."} icon={hasLog ? "search" : "file-text"} title={hasLog ? "No matching lines" : "No active log"} /> : null}
        </div>
      </Card>
      <div className="viewer-footer-note"><Icon name="info" size={14} /><span>Line numbers remain one-based. Finding evidence is highlighted when the active analysis provides source positions.</span><AppLink className="text-link" onNavigate={onNavigate} to="/app/analysis">See findings <Icon name="arrow-right" size={14} /></AppLink></div>
    </div>
  );
}

function VerificationStateBadge({ state }: { state: VerificationFindingState }) {
  const tone = state === "resolved" ? "success" : state === "persistent" ? "warning" : state === "new" ? "error" : "info";
  return <Badge tone={tone} dot>{state}</Badge>;
}

function VerificationResultCard({ result, onNavigate }: { result: ComparedVerification; onNavigate: Navigate }) {
  const title = result.outcome === "improved"
    ? "Fewer matching diagnostics in the rerun."
    : result.outcome === "regressed"
      ? "The rerun introduced new diagnostics."
      : result.outcome === "changed"
        ? "The diagnostic set changed between runs."
        : result.outcome === "uncertain"
          ? "Some diagnostic transitions are uncertain."
          : "The same diagnostics remain.";

  return (
    <Card className="verification-result-card">
      <div className="verification-result-head"><div><span className="panel-kicker">Finding comparison</span><h2>{title}</h2></div><Badge tone={verificationTone(result.outcome)} dot>{result.outcome}</Badge></div>
      <p className="verification-message">{result.message ?? "This compares analyzer finding identities only; it does not claim that a build passed."}</p>
      <div className="verification-summary-grid"><div><strong>{result.summary.resolvedCount}</strong><span>Resolved</span></div><div><strong>{result.summary.persistentCount}</strong><span>Persistent</span></div><div><strong>{result.summary.newCount}</strong><span>New</span></div><div><strong>{result.summary.uncertainCount ?? 0}</strong><span>Uncertain</span></div></div>
      <div className="comparison-list">
        {result.comparisons.length ? result.comparisons.map((comparison) => <div className="comparison-row" key={comparison.id}><span className="comparison-status-icon"><Icon name={comparison.state === "resolved" ? "check" : comparison.state === "persistent" ? "clock" : comparison.state === "uncertain" ? "circle-help" : "circle-alert"} size={16} /></span><span className="comparison-copy"><strong>{comparison.title}</strong><small>{comparison.ruleId}</small></span><VerificationStateBadge state={comparison.state} /><Icon name="chevron-right" size={15} /></div>) : <EmptyState description="No transition rows were returned by the comparison." icon="layers" title="No finding transitions" />}
      </div>
      <div className="verification-result-footer"><span><Icon name="lock" size={13} /> Analyzer findings only · no commands executed</span><Button onClick={() => onNavigate("/app/analysis")} variant="secondary" size="sm" icon="arrow-right" iconPosition="right">Review findings</Button></div>
    </Card>
  );
}

function VerificationNoMatchCard({ result }: { result: Extract<VerificationResult, { status: "no-match" }> }) {
  return (
    <Card className="verification-result-card">
      <div className="verification-result-head"><div><span className="panel-kicker">Uncertain comparison</span><h2>No supported diagnostic to compare</h2></div><Badge tone="warning" dot>uncertain</Badge></div>
      <p className="verification-message">{result.message}</p>
      <div className="verification-summary-grid"><div><strong>{result.summary.resolvedCount}</strong><span>Resolved</span></div><div><strong>{result.summary.persistentCount}</strong><span>Persistent</span></div><div><strong>{result.summary.newCount}</strong><span>New</span></div><div><strong>{result.summary.uncertainCount ?? 0}</strong><span>Uncertain</span></div></div>
      <div className="comparison-list">
        {result.comparisons.length ? result.comparisons.map((comparison) => <div className="comparison-row" key={comparison.id}><span className="comparison-status-icon"><Icon name="circle-help" size={16} /></span><span className="comparison-copy"><strong>{comparison.title}</strong><small>{comparison.ruleId}</small></span><VerificationStateBadge state={comparison.state} /><Icon name="chevron-right" size={15} /></div>) : <EmptyState description="No transition was labeled because the input did not provide a supported diagnostic match." icon="search" title="No transition rows" />}
      </div>
      <div className="verification-result-footer"><span><Icon name="lock" size={13} /> No build outcome inferred</span></div>
    </Card>
  );
}

export function VerificationPage({ onNavigate, onNotify, onCompareVerification, onCancelVerification, onVerificationInputChange, currentLog, verification, verificationError, verificationInputs, isVerifying }: WorkspacePageProps) {
  const [baseline, setBaseline] = useState(() => verificationInputs?.baseline ?? currentLog);
  const [rerun, setRerun] = useState(() => verificationInputs?.rerun ?? "");
  const [touched, setTouched] = useState(false);
  const [inputsChanged, setInputsChanged] = useState(false);
  const baselineInspection = useLogInspection(baseline);
  const rerunInspection = useLogInspection(rerun);
  const pending = baselineInspection.pending || rerunInspection.pending;
  const baselineValidation = baselineInspection.validation;
  const rerunValidation = rerunInspection.validation;
  const baselineError = !baselineValidation.valid ? baselineValidation.error.code === "required" ? "Add the original build log before verifying a fix." : baselineValidation.error.message : undefined;
  const rerunError = !rerunValidation.valid ? rerunValidation.error.code === "required" ? "Add the rerun build log before verifying a fix." : rerunValidation.error.message : undefined;
  const visibleVerification = inputsChanged ? null : verification;
  function changeInputs(nextBaseline: string, nextRerun: string) {
    setBaseline(nextBaseline);
    setRerun(nextRerun);
    setInputsChanged(true);
    onVerificationInputChange?.(nextBaseline, nextRerun);
  }

  function compare() {
    setTouched(true);
    if (isVerifying || pending) return;
    if (!baselineValidation.valid || !rerunValidation.valid) {
      onNotify(baselineError ?? rerunError ?? "Add both logs before comparing.");
      document.getElementById(!baselineValidation.valid ? "baseline-log" : "rerun-log")?.focus();
      return;
    }
    setInputsChanged(false);
    onCompareVerification(baseline, rerun);
  }

  function handleCompareShortcut(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.defaultPrevented || event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.altKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!event.repeat) compare();
  }

  return (
    <div className="workspace-page verification-page">
      <WorkspacePageHeader
        actions={<Button disabled={isVerifying || pending} onClick={compare} icon="refresh">{isVerifying ? "Comparing…" : "Compare findings"}</Button>}
        description="Put the original failure next to a rerun. The comparison labels analyzer finding transitions and does not run the build."
        eyebrow="Workbench / verification"
        title="Did the fix change the diagnostics?"
      />
      <div className="verification-input-grid">
        <Card className="verification-input-card">
          <div className="verification-input-head"><span className="verification-step">01</span><div><span className="panel-kicker">Baseline</span><h2>Before the fix</h2></div><Badge tone="neutral">Current log</Badge></div>
          <TextareaField disabled={isVerifying} aria-busy={isVerifying || baselineInspection.pending} aria-keyshortcuts="Control+Enter Meta+Enter" error={touched && !baselineInspection.pending ? baselineError : undefined} id="baseline-log" label="Original build log" onBlur={() => setTouched(true)} onChange={(event) => changeInputs(event.target.value, rerun)} onKeyDown={handleCompareShortcut} value={baseline} />
          <span className="verification-input-meta"><Icon name="file-code" size={13} /> {baselineInspection.pending ? "Checking input locally…" : `${baselineInspection.lineCount} lines · ${formatBytes(baselineInspection.byteCount)}`}</span>
          <LargeLogNotice warning={!baselineInspection.pending && baselineValidation.valid && baselineValidation.warning} />
        </Card>
        <div className="verification-connector" aria-hidden="true"><span>compare</span><Icon name="arrow-right" size={18} /></div>
        <Card className="verification-input-card">
          <div className="verification-input-head"><span className="verification-step verification-step-accent">02</span><div><span className="panel-kicker">Rerun</span><h2>After the fix</h2></div><Badge tone="accent">New input</Badge></div>
          <TextareaField disabled={isVerifying} aria-busy={isVerifying || rerunInspection.pending} aria-keyshortcuts="Control+Enter Meta+Enter" error={touched && !rerunInspection.pending ? rerunError : undefined} id="rerun-log" label="Rerun build log" onBlur={() => setTouched(true)} onChange={(event) => changeInputs(baseline, event.target.value)} onKeyDown={handleCompareShortcut} value={rerun} />
          <span className="verification-input-meta"><Icon name="file-code" size={13} /> {rerunInspection.pending ? "Checking input locally…" : `${rerunInspection.lineCount} lines · ${formatBytes(rerunInspection.byteCount)}`}</span>
          <LargeLogNotice warning={!rerunInspection.pending && rerunValidation.valid && rerunValidation.warning} />
        </Card>
      </div>
      <div className="verification-actions"><Button disabled={isVerifying || pending} onClick={compare} size="lg" icon="shield-check">{isVerifying ? "Comparing…" : "Compare findings"}</Button>{isVerifying && onCancelVerification ? <Button onClick={onCancelVerification} variant="quiet" icon="x">Cancel comparison</Button> : null}</div>
      {!inputsChanged && verificationError ? <div className="field-error" role="alert">{verificationError}</div> : null}
      {isVerifying ? <Card className="verification-empty-card"><StatusRow>Analyzing baseline and rerun locally…</StatusRow></Card> : visibleVerification?.status === "invalid" ? <Card className="verification-empty-card"><EmptyState description={visibleVerification.error.message} icon="circle-alert" title="Comparison could not be completed" /></Card> : visibleVerification?.status === "no-match" ? <VerificationNoMatchCard result={visibleVerification} /> : visibleVerification?.status === "compared" ? <VerificationResultCard onNavigate={onNavigate} result={visibleVerification} /> : <Card className="verification-empty-card"><EmptyState description="Enter a rerun log, then compare the analyzer findings. No build result is inferred from an empty comparison." icon="shield-check" title="Waiting for a rerun" action={<span className="empty-state-meta"><Kbd>Ctrl/Cmd</Kbd> <Kbd>Enter</Kbd> compare when ready</span>} /></Card>}
    </div>
  );
}

export function HistoryPage({ onNavigate, history, onOpenHistory, onClearHistory }: WorkspacePageProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<HistoryFilter>("all");
  const normalizedQuery = query.toLowerCase();
  const filtered = history.filter((entry) => (status === "all" || entry.status === status) && `${entry.label} ${entry.summary} ${entry.analysisId} ${formatSource(entry.source)}`.toLowerCase().includes(normalizedQuery));

  return (
    <div className="workspace-page history-page">
      <WorkspacePageHeader actions={<Button onClick={() => onNavigate("/app/new-analysis")} icon="plus">New analysis</Button>} description="Review metadata from analyses in this workspace. Older entries do not retain raw logs; in-session logs can be reopened when available." eyebrow="Library / history" title="Keep the thread of the failure." />
      <Card className="history-table-card">
        <div className="history-toolbar"><div className="log-search"><Icon name="search" size={15} /><input aria-label="Search history" onChange={(event) => setQuery(event.target.value)} placeholder="Search analyses..." value={query} />{query ? <IconButton icon="x" label="Clear history search" onClick={() => setQuery("")} size="sm" /> : null}</div><div className="segmented-control" role="group" aria-label="History status filter"><button aria-pressed={status === "all"} className={status === "all" ? "active" : ""} onClick={() => setStatus("all")} type="button">All</button><button aria-pressed={status === "complete"} className={status === "complete" ? "active" : ""} onClick={() => setStatus("complete")} type="button">Findings</button><button aria-pressed={status === "no-match"} className={status === "no-match" ? "active" : ""} onClick={() => setStatus("no-match")} type="button">No match</button><button aria-pressed={status === "invalid"} className={status === "invalid" ? "active" : ""} onClick={() => setStatus("invalid")} type="button">Invalid</button></div></div>
        <div className="history-table-head"><span>Analysis</span><span>Source</span><span>Result</span><span>Opened</span><span /></div>
        {filtered.length ? <div className="history-table-body">{filtered.map((entry) => <button className="history-table-row" key={entry.id} onClick={() => onOpenHistory(entry.analysisId)} type="button"><span className="history-table-name"><span className="history-row-icon"><Icon name={entry.status === "invalid" ? "circle-alert" : "file-code"} size={15} /></span><span><strong>{entry.label}</strong><small>{entry.summary}</small></span></span><span className="history-source"><Icon name={entry.source === "file" ? "file-code" : "terminal"} size={14} /> {formatSource(entry.source)}</span><span><Badge tone={historyStatusTone(entry.status)}>{entry.status === "complete" ? `${entry.findingCount} ${entry.findingCount === 1 ? "finding" : "findings"}` : historyStatusLabel(entry.status)}</Badge></span><span className="history-date">{formatDate(entry.createdAt)}</span><Icon name="chevron-right" size={15} /></button>)}</div> : <EmptyState description={history.length ? "No metadata entry matches this filter." : "Run an analysis to create metadata for this list."} icon="search" title="Nothing found" />}
        <div className="viewer-footer-note"><Icon name="info" size={14} /><span>History metadata includes status, source, size, and counts. Raw logs are not persisted.</span>{onClearHistory && history.length ? <Button onClick={onClearHistory} variant="quiet" size="sm" icon="x">Clear history</Button> : null}</div>
      </Card>
    </div>
  );
}

export function ReportsPage({ onNotify, analysis, currentLog, currentFileName }: WorkspacePageProps) {
  const [tab, setTab] = useState<"overview" | "evidence" | "next">("overview");
  const { tabProps, panelProps } = useTabKeyboard(["overview", "evidence", "next"] as const, tab, setTab);
  const hasInput = hasSubmittedInput(analysis) || hasInvalidInput(analysis, currentLog);
  const report = useMemo(() => buildAnalysisReport(analysis, hasInput), [analysis, hasInput]);
  const activeFinding = analysis.status === "complete" ? analysis.findings[0] : undefined;
  const status = reportStatus(analysis, hasInput);

  async function copyReport() {
    const copied = await copyPlainText(report);
    onNotify(copied ? "Report copied locally." : "Could not copy the report. Check clipboard permissions and try again.");
  }

  function downloadReport() {
    let url: string | undefined;
    let link: HTMLAnchorElement | undefined;
    try {
      const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
      url = URL.createObjectURL(blob);
      link = document.createElement("a");
      link.href = url;
      link.download = REPORT_FILE_NAME;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      onNotify(`Report download prepared as ${REPORT_FILE_NAME}.`);
    } catch {
      onNotify("Could not download the report in this browser.");
    } finally {
      link?.remove();
      // Allow the browser to consume the Blob before revocation, including slow
      // download dispatch. This timer captures no input or component state.
      if (url) { const objectUrl = url; setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000); }
    }
  }

  const nextStep = activeFinding?.suggestedActions[0];

  return (
    <div className="workspace-page reports-page">
      <WorkspacePageHeader actions={<><Button onClick={() => { void copyReport(); }} variant="secondary" icon="copy">Copy report</Button><Button onClick={downloadReport} icon="arrow-down">Download text</Button></>} description="Generate a plain-text report from the current analyzer result. Review sanitized evidence before sharing it." eyebrow="Library / reports" title="Make the next step portable." />
      <div className="report-layout">
        <Card className="report-preview-card">
          <div className="report-preview-top"><div className="report-brand-lockup"><span className="brand-mark"><span /><span /><span /></span><span><strong>BuildMedic</strong><small>Local analysis report</small></span></div><Badge tone={analysis.status === "complete" ? "accent" : analysis.status === "no-match" ? "success" : "neutral"} dot>{status}</Badge></div>
          <div className="report-preview-content">
            <span className="panel-kicker">{activeFinding ? "Highest-ranked finding" : "Analysis summary"}</span>
            <h2>{activeFinding ? safeReportText(activeFinding.title) : status}</h2>
            <p>{activeFinding ? safeReportText(activeFinding.explanation) : !hasInput ? "Run an analysis to populate this report." : analysis.status === "no-match" ? safeReportText(analysis.message) : analysis.status === "invalid" ? safeReportText(analysis.error.message) : "Run an analysis to populate this report."}</p>
            <div className="report-preview-meta">{activeFinding ? <><Badge tone={severityTone(activeFinding.severity)}>{activeFinding.severity}</Badge><Badge tone="info">{activeFinding.confidence} confidence</Badge></> : null}<span>{safeDisplayName(currentFileName || analysis.input.fileName, "Current input")}</span></div>
            <Divider />
            <div className="report-preview-section"><span className="panel-kicker">Evidence</span>{activeFinding?.evidence.length ? activeFinding.evidence.slice(0, 4).map((line, index) => <code key={`${line.lineNumber}-${index}`}>{String(line.lineNumber).padStart(2, "0")}  {safeEvidenceText(line.text)}</code>) : <p>{analysis.status === "complete" ? "No evidence lines were returned." : "Evidence will appear after a supported diagnostic is found."}</p>}</div>
            {nextStep ? <div className="report-preview-action"><span className="report-preview-action-icon"><Icon name="lightbulb" size={16} /></span><span><strong>{safeReportText(nextStep.label)}</strong><small>{safeReportText(nextStep.description)}</small></span></div> : null}
            <PartialAnalysisNotice analysis={analysis} />
          </div>
          <div className="report-preview-footer"><span><Icon name="lock" size={13} /> Sanitized plain text</span><span>Rule catalog {analysis.ruleCatalogVersion}</span></div>
        </Card>
        <Card className="report-outline-card">
          <div className="panel-heading"><div><span className="panel-kicker">Report outline</span><h2>What gets shared</h2></div><Icon name="sliders" size={17} /></div>
          <div className="report-tabs" role="tablist" aria-label="Report sections"><button {...tabProps("overview")} className={tab === "overview" ? "active" : ""} type="button">Overview</button><button {...tabProps("evidence")} className={tab === "evidence" ? "active" : ""} type="button">Evidence</button><button {...tabProps("next")} className={tab === "next" ? "active" : ""} type="button">Next step</button></div>
          <div {...panelProps("overview")} className="report-tab-content"><span className="outline-number">01</span><h3>Diagnosis first</h3><p>{activeFinding ? `${safeReportText(activeFinding.title)} is ranked first by the analyzer with ${activeFinding.confidence} confidence. All ${analysis.findings.length} bounded findings are included in the full report.` : "The current analyzer status and input metadata stay together at the top."}</p></div>
          <div {...panelProps("evidence")} className="report-tab-content"><span className="outline-number">02</span><h3>Evidence stays inspectable</h3><p>{activeFinding ? "Sanitized source evidence from every bounded finding is included with one-based positions." : "No diagnostic evidence is available for this result."}</p></div>
          <div {...panelProps("next")} className="report-tab-content"><span className="outline-number">03</span><h3>Actions stay reviewable</h3><p>{nextStep ? `${safeReportText(nextStep.label)}: ${safeReportText(nextStep.description)}` : "No suggested action is available until a supported finding is returned."}</p></div>
          <Divider />
          <div className="report-outline-note"><Icon name="info" size={15} /><span>{NO_BUILD_DISCLAIMER} {REPORT_REDACTION_NOTICE}</span></div>
        </Card>
      </div>
      <Card className="report-full-text"><details><summary>Full sanitized report{analysis.status === "complete" ? ` · ${analysis.findings.length} bounded findings` : ""}</summary><pre aria-label="Full sanitized report">{report}</pre></details></Card>
    </div>
  );
}

export function SettingsPage({ preferences, onPatchPreferences, theme, onSetTheme, onNotify, analysis, isAnalyzing, analysisError }: WorkspacePageProps) {
  const engineLabel = isAnalyzing ? "Analyzing" : analysisError ? "Needs attention" : "Available";
  const engineTone = isAnalyzing ? "warning" : analysisError ? "error" : "success";
  return (
    <div className="workspace-page settings-page">
      <WorkspacePageHeader description="Tune the workspace for the way you investigate. Preferences apply locally and contain no log content." eyebrow="System / settings" title="Make the workspace yours." />
      <div className="settings-layout">
        <Card className="settings-card">
          <div className="settings-card-heading"><div><span className="panel-kicker">Appearance</span><h2>Visual system</h2></div><Icon name="sun" size={18} /></div>
          <div className="theme-choice-grid">
              {(["dark", "light", "system"] as const).map((option) => <button aria-pressed={theme === option} className={`theme-choice${theme === option ? " active" : ""}`} key={option} onClick={() => onSetTheme(option)} type="button"><span className={`theme-choice-swatch theme-choice-${option}`} /> <span><strong>{option[0].toUpperCase() + option.slice(1)}</strong><small>{option === "system" ? "Follow browser preference" : `${option[0].toUpperCase() + option.slice(1)} workspace`}</small></span>{theme === option ? <Icon name="check-circle" size={16} /> : null}</button>)}
          </div>
          <Divider />
          <Toggle checked={preferences.reducedMotion} description="Use minimal transitions and no parallax response." label="Reduce motion" onChange={(checked) => onPatchPreferences({ reducedMotion: checked })} />
          <Toggle checked={preferences.showLineNumbers} description="Keep source positions visible in the log viewer." label="Show line numbers" onChange={(checked) => onPatchPreferences({ showLineNumbers: checked })} />
          <Toggle checked={preferences.showEvidenceContext} description="Include nearby context lines in finding cards." label="Show evidence context" onChange={(checked) => onPatchPreferences({ showEvidenceContext: checked })} />
        </Card>
        <Card className="settings-card">
          <div className="settings-card-heading"><div><span className="panel-kicker">Input defaults</span><h2>Start with the right surface</h2></div><Icon name="sliders" size={18} /></div>
          <div className="settings-option-group"><span className="settings-option-label">Default input mode</span><div className="settings-segmented" role="group" aria-label="Default input mode"><button aria-pressed={preferences.defaultInputMode === "paste"} className={preferences.defaultInputMode === "paste" ? "active" : ""} onClick={() => onPatchPreferences({ defaultInputMode: "paste" })} type="button"><Icon name="terminal" size={15} /> Paste</button><button aria-pressed={preferences.defaultInputMode === "file"} className={preferences.defaultInputMode === "file" ? "active" : ""} onClick={() => onPatchPreferences({ defaultInputMode: "file" })} type="button"><Icon name="file-code" size={15} /> File</button></div></div>
          <div className="settings-option-group"><span className="settings-option-label">Display density</span><div className="settings-segmented"><button aria-pressed={preferences.displayDensity === "comfortable"} className={preferences.displayDensity === "comfortable" ? "active" : ""} onClick={() => onPatchPreferences({ displayDensity: "comfortable" })} type="button">Comfortable</button><button aria-pressed={preferences.displayDensity === "compact"} className={preferences.displayDensity === "compact" ? "active" : ""} onClick={() => onPatchPreferences({ displayDensity: "compact" })} type="button">Compact</button></div></div>
          <div className="settings-safe-note"><Icon name="shield-check" size={15} /><span><strong>Local analyzer {engineLabel.toLowerCase()}</strong><small>Rule catalog {analysis.ruleCatalogVersion}. No command execution or network request is required.</small></span><Badge tone={engineTone} dot>{engineLabel}</Badge></div>
          <Button onClick={() => { onPatchPreferences({ theme: "system", defaultInputMode: "paste", displayDensity: "comfortable", reducedMotion: false, showLineNumbers: true, showEvidenceContext: true }); onNotify("Preferences reset to defaults."); }} variant="quiet" icon="refresh">Reset preferences</Button>
        </Card>
      </div>
    </div>
  );
}

export function HelpPage({ onNavigate, onNotify, analysis, analysisError, isAnalyzing, verification }: WorkspacePageProps) {
  const [openQuestion, setOpenQuestion] = useState<string | null>("engine");
  const faqId = useId();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const questions = [
    { id: "engine", question: "What powers an analysis?", answer: isAnalyzing ? "The local rule catalog is analyzing the current text now." : `The browser-local analyzer is ${analysisError ? "reporting an engine error" : "available"} and identifies supported diagnostics without executing the log. Its current catalog is ${analysis.ruleCatalogVersion}.` },
    { id: "input", question: "What happens to my log?", answer: "Pasted and uploaded text stays in the current browser session. The viewer and report sanitize displayed evidence, and history keeps metadata rather than raw log text." },
    { id: "verification", question: "What does verification mean?", answer: verification ? "Verification compares finding identities between the baseline and rerun. Resolved, persistent, new, and uncertain labels describe those transitions; they do not claim that a build passed." : "Verification analyzes a baseline and rerun separately, then compares supported finding identities. It does not run either build or infer a pass." },
    { id: "example", question: "What is the example input?", answer: "The example input is a synthetic, sanitized build log that you can load explicitly from New analysis. It is an input convenience, not a precomputed result." },
  ];

  return (
    <div className="workspace-page help-page">
      <WorkspacePageHeader actions={<Button onClick={(event) => { event.currentTarget.focus(); setShortcutsOpen(true); }} variant="secondary" icon="command">Keyboard shortcuts</Button>} description="A short guide to the real local analyzer, evidence surfaces, and comparison labels in BuildMedic Lab." eyebrow="System / help" title="Find your way around." />
      <div className="help-layout">
        <Card className="help-getting-started"><div className="help-orbit" aria-hidden="true"><span /><span /><span /><span /></div><span className="eyebrow">First pass</span><h2>Start with a local log.</h2><p>Open New analysis, paste or upload text, then follow the returned evidence into the viewer or verification surface.</p><div className="help-steps"><div><span>01</span><strong>Paste or upload</strong></div><div><span>02</span><strong>Analyze log</strong></div><div><span>03</span><strong>Review evidence</strong></div></div><Button onClick={() => onNavigate("/app/new-analysis")} icon="arrow-right" iconPosition="right">Start an analysis</Button></Card>
        <Card className="help-faq-card"><div className="panel-heading"><div><span className="panel-kicker">Common questions</span><h2>Stay oriented</h2></div><Icon name="circle-help" size={18} /></div><div className="faq-list">{questions.map((item) => <div className={`faq-item${openQuestion === item.id ? " open" : ""}`} key={item.id}><button aria-expanded={openQuestion === item.id} aria-controls={`${faqId}-${item.id}-answer`} onClick={() => setOpenQuestion((current) => current === item.id ? null : item.id)} type="button"><span>{item.question}</span><Icon name={openQuestion === item.id ? "chevron-down" : "chevron-right"} size={15} /></button><p hidden={openQuestion !== item.id} id={`${faqId}-${item.id}-answer`}>{item.answer}</p></div>)}</div></Card>
      </div>
      <Card className="help-contact-card"><span className="help-contact-icon"><Icon name="message-circle" size={20} /></span><div><span className="panel-kicker">Need a closer look?</span><h2>Keep the evidence inspectable.</h2><p>Use the log viewer for sanitized source lines, Analysis for ranked findings, and Reports for a plain-text summary.</p></div><div className="help-contact-actions"><AppLink className="text-link" onNavigate={onNavigate} to="/app/log-viewer">Open log viewer <Icon name="arrow-right" size={14} /></AppLink><AppLink className="text-link" onNavigate={onNavigate} to="/app/reports">Open reports <Icon name="arrow-right" size={14} /></AppLink></div></Card>
      <Modal description="These shortcuts keep navigation and review local to the workspace." onClose={() => setShortcutsOpen(false)} open={shortcutsOpen} title="Keyboard shortcuts" size="sm"><div className="shortcut-list"><div><span>Open command center</span><Kbd>Ctrl/Cmd K</Kbd></div><div><span>Close dialog</span><Kbd>Esc</Kbd></div><div><span>Focus search on viewer</span><Kbd>/</Kbd></div><div><span>Compare verification inputs</span><Kbd>Ctrl/Cmd Enter</Kbd></div><div><span>Copy selected evidence</span><Kbd>Ctrl/Cmd C</Kbd></div></div><Divider /><button className="command-note" onClick={() => onNotify("Use the visible controls to review evidence and comparison results.")} type="button"><Icon name="info" size={15} /> Shortcuts never execute build commands.</button></Modal>
    </div>
  );
}
