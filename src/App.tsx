import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeLog } from "./analyzer";
import { PublicLayout, WorkspaceShell, type Navigate } from "./components/layout";
import { Toast } from "./components/ui";
import { DEMO_NODE_BUILD_LOG } from "./data";
import { LocalTaskClient, isLocalTaskAbort, localTaskMessage } from "./lib/analysis-client";
import { browserStorage, clearStoredHistory, makeHistoryEntry, MAX_HISTORY_ENTRIES, readHistory, readPreferences, whitelistPreferences, writeHistory, writePreferences } from "./lib/history";
import { SessionAnalysisCache } from "./lib/session-cache";
import {
  AboutPage,
  DocumentationPage,
  FeaturesPage,
  HomePage,
  HowItWorksPage,
  NotFoundPage,
  PrivacyPage,
  SecurityPage,
  SupportPage,
  type PublicPageProps,
} from "./pages/public";
import {
  AnalysisPage,
  HelpPage,
  HistoryPage,
  LogViewerPage,
  NewAnalysisPage,
  OverviewPage,
  ReportsPage,
  SettingsPage,
  VerificationPage,
  type WorkspacePageProps,
} from "./pages/workspace";
import type {
  AnalysisHistoryEntry,
  AnalysisResult,
  ThemeMode,
  UserPreferences,
  VerificationResult,
} from "./types";

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname || "/";
}

function useCurrentPath(): [string, Navigate] {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate: Navigate = (nextPath) => {
    if (/^(https?:|mailto:)/.test(nextPath)) {
      window.open(nextPath, "_blank", "noopener,noreferrer");
      return;
    }
    const normalized = normalizePath(nextPath.split("#")[0] || "/");
    if (normalized === normalizePath(window.location.pathname)) {
      if (nextPath.includes("#")) window.location.hash = nextPath.split("#")[1] ?? "";
      setPath(normalized);
      return;
    }
    window.history.pushState({}, "", nextPath);
    setPath(normalized);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return [path, navigate];
}

function emptyAnalysis(): AnalysisResult {
  return analyzeLog("");
}

function resolveColorScheme(theme: ThemeMode): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function usePageTitle(path: string) {
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "BuildMedic — Build failures, made legible.",
      "/features": "Features — BuildMedic",
      "/how-it-works": "How it works — BuildMedic",
      "/documentation": "Documentation — BuildMedic",
      "/about": "About — BuildMedic",
      "/support": "Support — BuildMedic",
      "/privacy": "Privacy — BuildMedic",
      "/security": "Security — BuildMedic",
      "/app/overview": "Overview — BuildMedic Lab",
      "/app/new-analysis": "New analysis — BuildMedic Lab",
      "/app/analysis": "Analysis results — BuildMedic Lab",
      "/app/log-viewer": "Log viewer — BuildMedic Lab",
      "/app/verification": "Verification — BuildMedic Lab",
      "/app/history": "History — BuildMedic Lab",
      "/app/reports": "Reports — BuildMedic Lab",
      "/app/settings": "Settings — BuildMedic Lab",
      "/app/help": "Help — BuildMedic Lab",
    };
    document.title = titles[path] ?? "BuildMedic — Developer diagnostics";
  }, [path]);
}

export function App() {
  const [path, navigate] = useCurrentPath();
  const [preferences, setPreferences] = useState<UserPreferences>(() => readPreferences(browserStorage()));
  const [currentLog, setCurrentLog] = useState("");
  const [currentFileName, setCurrentFileName] = useState<string | undefined>();
  const [analysis, setAnalysis] = useState<AnalysisResult>(emptyAnalysis);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly AnalysisHistoryEntry[]>(() => readHistory(browserStorage()));
  const sessionAnalyses = useRef(new SessionAnalysisCache());
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationInputs, setVerificationInputs] = useState<{ baseline: string; rerun: string } | undefined>();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const analysisTask = useRef<{ client: LocalTaskClient; controller: AbortController } | null>(null);
  const verificationTask = useRef<{ client: LocalTaskClient; controller: AbortController } | null>(null);
  const analysisRevision = useRef(0);
  const verificationRevision = useRef(0);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isWorkspace = path === "/app" || path.startsWith("/app/");
  usePageTitle(path);

  const resolvedScheme = useMemo(() => resolveColorScheme(preferences.theme), [preferences.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedScheme;
    document.documentElement.dataset.motion = preferences.reducedMotion ? "reduced" : "full";
    document.documentElement.dataset.density = preferences.displayDensity;
    writePreferences(browserStorage(), preferences);
  }, [preferences, resolvedScheme]);

  useEffect(() => {
    writeHistory(browserStorage(), history);
  }, [history]);

  useEffect(() => () => {
    analysisRevision.current += 1;
    verificationRevision.current += 1;
    analysisTask.current?.client.dispose();
    verificationTask.current?.client.dispose();
    sessionAnalyses.current.clear();
    clearTimeout(notificationTimer.current);
  }, []);

  const notify = (message: string) => {
    clearTimeout(notificationTimer.current);
    setToastMessage(message);
    notificationTimer.current = setTimeout(() => setToastMessage(null), 3600);
  };

  const invalidateVerification = () => {
    verificationRevision.current += 1;
    verificationTask.current?.controller.abort();
    verificationTask.current?.client.dispose();
    verificationTask.current = null;
    setVerification(null);
    setVerificationError(null);
    setIsVerifying(false);
  };

  const cancelAnalysis = () => {
    analysisRevision.current += 1;
    analysisTask.current?.controller.abort();
    analysisTask.current?.client.dispose();
    analysisTask.current = null;
    setIsAnalyzing(false);
    setAnalysisError("Analysis canceled. Your input is still available to edit or retry.");
  };

  const editInput = (text: string, source: "paste" | "file" = "paste", fileName?: string) => {
    analysisRevision.current += 1;
    analysisTask.current?.client.dispose();
    analysisTask.current = null;
    setIsAnalyzing(false);
    setCurrentLog(text);
    setCurrentFileName(source === "file" ? fileName : undefined);
    setAnalysis(emptyAnalysis());
    setActiveRunId(undefined);
    setAnalysisError(null);
    invalidateVerification();
    setVerificationInputs({ baseline: text, rerun: "" });
  };

  const openDemo = () => {
    editInput(DEMO_NODE_BUILD_LOG.text, "paste");
    navigate("/app/new-analysis");
  };

  const handleAnalyze = async (text: string, source: "paste" | "file" = "paste", fileName?: string) => {
    analysisTask.current?.client.dispose();
    const revision = ++analysisRevision.current;
    const task = { client: new LocalTaskClient(), controller: new AbortController() };
    analysisTask.current = task;
    setCurrentLog(text);
    setCurrentFileName(fileName);
    setAnalysisError(null);
    setIsAnalyzing(true);
    setAnalysis(emptyAnalysis());
    setActiveRunId(undefined);
    invalidateVerification();
    setVerificationInputs({ baseline: text, rerun: "" });
    try {
      const result = await task.client.request("analyze", { text, source, ...(fileName ? { fileName: fileName.slice(0, 255) } : {}) }, { signal: task.controller.signal });
      if (analysisRevision.current !== revision) return;
      const entry = makeHistoryEntry(result, source);
      setAnalysis(result);
      setActiveRunId(entry.analysisId);
      setHistory((current) => [entry, ...current].slice(0, MAX_HISTORY_ENTRIES));
      if (result.status !== "invalid") sessionAnalyses.current.put(entry.analysisId, { log: text, result, fileName }, result.input.byteCount);
      setVerification(null);
      setIsAnalyzing(false);
      notify(result.status === "complete"
        ? `Analysis complete: ${result.findings.length} ${result.findings.length === 1 ? "finding" : "findings"}.`
        : result.status === "no-match"
          ? "Analysis complete: no supported diagnostic matched this log."
          : result.error.message);
      navigate("/app/analysis");
    } catch (error) {
      if (analysisRevision.current !== revision || isLocalTaskAbort(error)) return;
      setIsAnalyzing(false);
      setAnalysisError(localTaskMessage(error));
    } finally {
      task.client.dispose();
      if (analysisTask.current === task) analysisTask.current = null;
    }
  };

  const clearActiveSession = () => {
    analysisRevision.current += 1;
    analysisTask.current?.client.dispose();
    analysisTask.current = null;
    invalidateVerification();
    sessionAnalyses.current.clear();
    setVerificationInputs(undefined);
    setCurrentLog("");
    setCurrentFileName(undefined);
    setAnalysis(emptyAnalysis());
    setActiveRunId(undefined);
    setAnalysisError(null);
    setVerification(null);
    setIsAnalyzing(false);
    setIsVerifying(false);
  };

  const handleCompareVerification = async (baseline: string, rerun: string) => {
    if (analysisTask.current) cancelAnalysis();
    invalidateVerification();
    setVerificationInputs({ baseline, rerun });
    const revision = ++verificationRevision.current;
    const task = { client: new LocalTaskClient(), controller: new AbortController() };
    verificationTask.current = task;
    setIsVerifying(true);
    setVerification(null);
    try {
      const comparison = await task.client.request("compare", { baseline, rerun }, { signal: task.controller.signal });
      if (verificationRevision.current !== revision) return;
      setVerification(comparison);
      setIsVerifying(false);
      notify(comparison.status === "compared"
        ? `Comparison ready: ${comparison.outcome}.`
        : comparison.status === "no-match"
          ? "Comparison is uncertain because one side has no supported diagnosis."
          : comparison.error.message);
    } catch (error) {
      if (verificationRevision.current !== revision || isLocalTaskAbort(error)) return;
      setIsVerifying(false);
      setVerificationError(localTaskMessage(error));
    } finally {
      task.client.dispose();
      if (verificationTask.current === task) verificationTask.current = null;
    }
  };

  const cancelVerification = () => {
    invalidateVerification();
    setVerificationError("Comparison canceled. Both inputs are still available to edit or retry.");
  };

  const clearHistory = () => {
    setHistory([]);
    clearActiveSession();
    clearStoredHistory(browserStorage());
    notify("Local history and cached session logs cleared.");
  };

  const openHistory = (analysisId: string) => {
    const record = sessionAnalyses.current.get(analysisId);
    if (!record) {
      notify("Only metadata for this analysis is available. Re-add the original log to reopen it.");
      return;
    }
    analysisRevision.current += 1;
    analysisTask.current?.client.dispose();
    analysisTask.current = null;
    setIsAnalyzing(false);
    setCurrentLog(record.log);
    setCurrentFileName(record.fileName);
    setAnalysis(record.result);
    setActiveRunId(analysisId);
    setAnalysisError(null);
    invalidateVerification();
    setVerificationInputs({ baseline: record.log, rerun: "" });
    navigate("/app/analysis");
  };

  const patchPreferences = (patch: Partial<UserPreferences>) => {
    setPreferences((current) => whitelistPreferences({ ...current, ...patch }));
  };

  const setTheme = (theme: ThemeMode) => patchPreferences({ theme });
  const toggleTheme = () => setTheme(resolvedScheme === "dark" ? "light" : "dark");

  const publicProps: PublicPageProps = { onNavigate: navigate, onNotify: notify, onOpenDemo: openDemo };
  const workspaceProps: WorkspacePageProps = {
    analysis,
    activeRunId,
    analysisError,
    history,
    isAnalyzing,
    isVerifying,
    currentLog,
    currentFileName,
    onAnalyze: handleAnalyze,
    onClearActive: clearActiveSession,
    onCancelAnalysis: cancelAnalysis,
    onEditInput: editInput,
    onCompareVerification: handleCompareVerification,
    onCancelVerification: cancelVerification,
    onVerificationInputChange: (baseline, rerun) => { invalidateVerification(); setVerificationInputs({ baseline, rerun }); },
    onClearHistory: clearHistory,
    onOpenHistory: openHistory,
    onNavigate: navigate,
    onNotify: notify,
    onPatchPreferences: patchPreferences,
    onSetTheme: setTheme,
    preferences,
    verification,
    verificationError,
    verificationInputs,
    theme: preferences.theme,
  };

  return (
    <div className="app-root">
      {isWorkspace ? (
        <WorkspaceShell onNavigate={navigate} onOpenToast={notify} onToggleTheme={toggleTheme} path={path} theme={preferences.theme}>
          {renderWorkspacePage(path, workspaceProps)}
        </WorkspaceShell>
      ) : (
        <PublicLayout onNavigate={navigate} onToggleTheme={toggleTheme} path={path} theme={preferences.theme}>
          {renderPublicPage(path, publicProps)}
        </PublicLayout>
      )}
      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
  );
}

function renderPublicPage(path: string, props: PublicPageProps) {
  switch (path) {
    case "/": return <HomePage {...props} />;
    case "/features": return <FeaturesPage {...props} />;
    case "/how-it-works": return <HowItWorksPage {...props} />;
    case "/documentation": return <DocumentationPage {...props} />;
    case "/about": return <AboutPage {...props} />;
    case "/support": return <SupportPage {...props} />;
    case "/privacy": return <PrivacyPage {...props} />;
    case "/security": return <SecurityPage {...props} />;
    default: return <NotFoundPage {...props} />;
  }
}

function renderWorkspacePage(path: string, props: WorkspacePageProps) {
  switch (path) {
    case "/app":
    case "/app/overview": return <OverviewPage {...props} />;
    case "/app/new-analysis": return <NewAnalysisPage {...props} />;
    case "/app/analysis": return <AnalysisPage {...props} />;
    case "/app/log-viewer": return <LogViewerPage {...props} />;
    case "/app/verification": return <VerificationPage {...props} />;
    case "/app/history": return <HistoryPage {...props} />;
    case "/app/reports": return <ReportsPage {...props} />;
    case "/app/settings": return <SettingsPage {...props} />;
    case "/app/help": return <HelpPage {...props} />;
    default: return <NotFoundPage {...props} onOpenDemo={() => props.onNavigate("/app/new-analysis")} />;
  }
}
