// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { analyzeLog } from "../../src/analyzer";
import {
  HISTORY_STORAGE_KEY, MAX_HISTORY_ENTRIES, MAX_HISTORY_STORAGE_CHARACTERS, PREFERENCES_STORAGE_KEY,
  makeHistoryEntry, readHistory, readPreferences, whitelistHistoryEntry, writeHistory, writePreferences,
} from "../../src/lib/history";
import { MAX_SESSION_LOG_BYTES, MAX_SESSION_RESULTS, SessionAnalysisCache } from "../../src/lib/session-cache";
import { DEFAULT_USER_PREFERENCES } from "../../src/types/preferences";

function store(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const result = analyzeLog({ text: "error TS2322: token=private-fixture", source: "file", fileName: "private-customer.log" }, { timestampFactory: () => "2026-10-16T10:00:00.000Z" });

describe("schema-whitelisted local metadata", () => {
  it("persists generic labels and random run IDs without text, tokens, filenames, extras, or engine hashes", () => {
    const storage = store();
    const entry = makeHistoryEntry(result, "file");
    expect(entry.analysisId).toMatch(/^run-[a-f0-9]{32}$/);
    expect(makeHistoryEntry(result, "file").analysisId).not.toBe(entry.analysisId);
    writeHistory(storage, [{ ...entry, label: "private-customer.log", summary: "token=private-fixture", rawLog: "private raw text", topFindingId: "private-diagnostic", nested: { token: "private-fixture" } } as never]);
    const json = storage.getItem(HISTORY_STORAGE_KEY)!;
    for (const secret of ["private-customer", "private-fixture", "private raw text", "rawLog", "nested", "topFindingId", result.id]) expect(json).not.toContain(secret);
    expect(readHistory(storage)).toEqual([entry]);
    expect(JSON.parse(json)[0].label).toBe("Uploaded build log");
  });

  it("caps before JSON.parse and safely rejects malformed, old, fractional, and invalid metadata", () => {
    const parse = vi.spyOn(JSON, "parse");
    expect(readHistory(store({ [HISTORY_STORAGE_KEY]: "x".repeat(MAX_HISTORY_STORAGE_CHARACTERS + 1) }))).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
    for (const raw of ["not-json", "null", "{}", '[{"id":"old-log-hash","rawLog":"private"}]']) expect(readHistory(store({ [HISTORY_STORAGE_KEY]: raw }))).toEqual([]);
    const entry = makeHistoryEntry(result, "paste");
    for (const patch of [{ analysisId: result.id }, { id: "bad" }, { createdAt: "2026-02-30T10:00:00.000Z" }, { createdAt: "tomorrow" }, { inputBytes: -1 }, { inputBytes: Infinity }, { findingCount: 1.5 }, { findingCount: 257 }, { status: "no-match", findingCount: 1 }]) expect(whitelistHistoryEntry({ ...entry, ...patch })).toBeUndefined();
    const entries = Array.from({ length: 40 }, () => makeHistoryEntry(result, "paste"));
    writeHistory(store(), entries);
    expect(readHistory(store({ [HISTORY_STORAGE_KEY]: JSON.stringify(entries) }))).toHaveLength(MAX_HISTORY_ENTRIES);
  });

  it("whitelists preferences and tolerates blocked or quota-limited storage", () => {
    const storage = store({ [PREFERENCES_STORAGE_KEY]: JSON.stringify({ ...DEFAULT_USER_PREFERENCES, theme: "dark", reducedMotion: "yes", token: "private", logs: "private" }) });
    const preferences = readPreferences(storage);
    expect(preferences.reducedMotion).toBe(false);
    writePreferences(storage, { ...preferences, extra: "private" } as never);
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).not.toContain("private");
    expect(Object.keys(preferences)).toEqual(Object.keys(DEFAULT_USER_PREFERENCES));
    for (const raw of ["null", "[]", "bad-json", "x".repeat(2049)]) expect(readPreferences(store({ [PREFERENCES_STORAGE_KEY]: raw }))).toEqual(DEFAULT_USER_PREFERENCES);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(readHistory(blocked)).toEqual([]);
    expect(readPreferences(blocked)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(() => writeHistory(blocked, [makeHistoryEntry(result, "file")])).not.toThrow();
    expect(() => writePreferences(blocked, preferences)).not.toThrow();
  });
});

describe("transient raw-log cache", () => {
  it("evicts by explicit count and clears every raw record", () => {
    const cache = new SessionAnalysisCache();
    for (let index = 0; index < 6; index += 1) cache.put(String(index), { log: `raw-${index}`, result });
    expect(cache.size).toBe(MAX_SESSION_RESULTS);
    expect(cache.get("0")).toBeUndefined();
    expect(cache.get("5")?.log).toBe("raw-5");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.totalBytes).toBe(0);
    expect(cache.get("5")).toBeUndefined();
  });
  it("bounds aggregate UTF-8 bytes, including multibyte text and replacements", () => {
    const cache = new SessionAnalysisCache();
    const log = "é".repeat(Math.floor(MAX_SESSION_LOG_BYTES / 4) + 1);
    cache.put("first", { log, result });
    cache.put("second", { log, result });
    expect(cache.get("first")).toBeUndefined();
    expect(cache.totalBytes).toBeLessThanOrEqual(MAX_SESSION_LOG_BYTES);
    cache.put("second", { log: "small", result });
    expect(cache.totalBytes).toBe(5);
    cache.clear();
  });
});
