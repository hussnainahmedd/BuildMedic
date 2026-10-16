import type { AnalysisHistoryEntry, AnalysisResult, AnalysisSource, UserPreferences } from "../types";
import { DEFAULT_USER_PREFERENCES } from "../types/preferences";
import { DEFAULT_MAX_LOG_BYTES } from "./validation";

export const PREFERENCES_STORAGE_KEY = "buildmedic.preferences.v1";
export const HISTORY_STORAGE_KEY = "buildmedic.history.v1";
export const MAX_HISTORY_ENTRIES = 24;
export const MAX_HISTORY_STORAGE_CHARACTERS = 32 * 1024;
const RUN_ID = /^run-[a-f0-9]{32}$/;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function browserStorage(): Store | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function integer(value: unknown, ceiling: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= ceiling; }
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
function sourceLabel(source: AnalysisSource) { return source === "file" ? "Uploaded build log" : "Pasted build log"; }
function summary(status: AnalysisHistoryEntry["status"], count: number) {
  return status === "complete" ? `${count} ${count === 1 ? "finding" : "findings"} from local deterministic rules.`
    : status === "no-match" ? "No supported diagnostic matched this log." : "Input did not pass local validation.";
}

/** Reconstruct from a schema: filenames, free text, engine hashes, and extras cannot survive. */
export function whitelistHistoryEntry(value: unknown): AnalysisHistoryEntry | undefined {
  if (!object(value) || typeof value.analysisId !== "string" || !RUN_ID.test(value.analysisId) || value.id !== `history-${value.analysisId}`
    || !validDate(value.createdAt) || (value.source !== "paste" && value.source !== "file")
    || (value.status !== "complete" && value.status !== "no-match" && value.status !== "invalid")
    || !integer(value.inputBytes, DEFAULT_MAX_LOG_BYTES) || !integer(value.findingCount, 256)
    || (value.status !== "complete" && value.findingCount !== 0)) return undefined;
  return {
    id: value.id as string, analysisId: value.analysisId, createdAt: value.createdAt,
    source: value.source, status: value.status, inputBytes: value.inputBytes, findingCount: value.findingCount,
    label: sourceLabel(value.source), summary: summary(value.status, value.findingCount),
  };
}
export function whitelistHistory(values: readonly unknown[]): readonly AnalysisHistoryEntry[] {
  const seen = new Set<string>();
  const entries: AnalysisHistoryEntry[] = [];
  for (const value of values.slice(0, MAX_HISTORY_ENTRIES)) {
    const entry = whitelistHistoryEntry(value);
    if (entry && !seen.has(entry.id)) { entries.push(entry); seen.add(entry.id); }
  }
  return entries;
}
export function readHistory(storage?: Store): readonly AnalysisHistoryEntry[] {
  try {
    const raw = storage?.getItem(HISTORY_STORAGE_KEY);
    if (!raw || raw.length > MAX_HISTORY_STORAGE_CHARACTERS) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? whitelistHistory(value) : [];
  } catch { return []; }
}
export function writeHistory(storage: Store | undefined, entries: readonly AnalysisHistoryEntry[]): void {
  try { storage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(whitelistHistory(entries))); } catch { /* Optional browser convenience. */ }
}
export function clearStoredHistory(storage?: Store): void {
  try { storage?.removeItem(HISTORY_STORAGE_KEY); } catch { /* Analysis also works when storage is blocked. */ }
}
export function createRunId(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return `run-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
export function makeHistoryEntry(result: AnalysisResult, source: AnalysisSource, runId = createRunId()): AnalysisHistoryEntry {
  const count = result.status === "complete" ? result.findings.length : 0;
  return {
    id: `history-${runId}`, analysisId: runId, label: sourceLabel(source), createdAt: result.analyzedAt,
    source, status: result.status, inputBytes: result.input.byteCount, findingCount: count, summary: summary(result.status, count),
  };
}

export function whitelistPreferences(value: unknown): UserPreferences {
  const input = object(value) ? value : {};
  return {
    theme: input.theme === "light" || input.theme === "dark" || input.theme === "system" ? input.theme : DEFAULT_USER_PREFERENCES.theme,
    defaultInputMode: input.defaultInputMode === "file" ? "file" : "paste",
    displayDensity: input.displayDensity === "compact" ? "compact" : "comfortable",
    reducedMotion: input.reducedMotion === true,
    showLineNumbers: input.showLineNumbers !== false,
    showEvidenceContext: input.showEvidenceContext !== false,
  };
}
export function readPreferences(storage?: Store): UserPreferences {
  try {
    const raw = storage?.getItem(PREFERENCES_STORAGE_KEY);
    return raw && raw.length <= 2048 ? whitelistPreferences(JSON.parse(raw)) : whitelistPreferences(undefined);
  } catch { return whitelistPreferences(undefined); }
}
export function writePreferences(storage: Store | undefined, preferences: UserPreferences): void {
  try { storage?.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(whitelistPreferences(preferences))); } catch { /* Optional. */ }
}
