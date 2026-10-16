import type { AnalysisResult } from "../types";
import { getUtf8ByteLength } from "./validation";

export const MAX_SESSION_RESULTS = 4;
export const MAX_SESSION_LOG_BYTES = 25 * 1024 * 1024;
export interface SessionAnalysisRecord {
  readonly log: string;
  readonly result: AnalysisResult;
  readonly fileName?: string;
}

/** Transient FIFO cache, bounded by both result count and aggregate UTF-8 bytes. */
export class SessionAnalysisCache {
  private records = new Map<string, { record: SessionAnalysisRecord; bytes: number }>();
  private bytes = 0;
  get size() { return this.records.size; }
  get totalBytes() { return this.bytes; }
  get(id: string): SessionAnalysisRecord | undefined { return this.records.get(id)?.record; }
  put(id: string, record: SessionAnalysisRecord, inspectedUtf8Bytes?: number) {
    const previous = this.records.get(id);
    if (previous) { this.bytes -= previous.bytes; this.records.delete(id); }
    if (record.log.length > MAX_SESSION_LOG_BYTES) return;
    // The app supplies the worker's complete validation count, avoiding a second
    // large-log scan on the main thread. Other callers are counted here.
    const bytes = inspectedUtf8Bytes !== undefined && Number.isSafeInteger(inspectedUtf8Bytes) && inspectedUtf8Bytes >= record.log.length
      ? inspectedUtf8Bytes : getUtf8ByteLength(record.log);
    if (bytes > MAX_SESSION_LOG_BYTES) return;
    this.records.set(id, { record, bytes });
    this.bytes += bytes;
    while (this.records.size > MAX_SESSION_RESULTS || this.bytes > MAX_SESSION_LOG_BYTES) {
      const first = this.records.entries().next().value;
      if (!first) break;
      this.records.delete(first[0]);
      this.bytes -= first[1].bytes;
    }
  }
  clear() { this.records.clear(); this.bytes = 0; }
}
