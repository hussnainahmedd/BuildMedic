import { useEffect, useMemo, useState } from "react";
import { LocalTaskClient, SMALL_INPUT_FALLBACK_BYTES, isLocalTaskAbort, localTaskMessage } from "./analysis-client";
import { DEFAULT_MAX_LOG_BYTES, inspectLogText } from "./validation";
import { compactInspection, type InputInspection } from "../workers/protocol";

const PENDING: InputInspection = { byteCount: 0, lineCount: 0, complete: false, normalizedNewlines: false, validation: { valid: false, error: { field: "log", code: "unreadable", message: "Checking input locally…" } } };

/** Small edits validate immediately; a large paste never scans on the UI thread. */
export function useLogInspection(text: string): InputInspection & { readonly pending: boolean } {
  const small = useMemo(() => text.length <= SMALL_INPUT_FALLBACK_BYTES ? compactInspection(inspectLogText(text)) : undefined, [text]);
  const [background, setBackground] = useState<{ text: string; inspection: InputInspection } | undefined>();
  useEffect(() => {
    setBackground(undefined);
    if (small) return;
    let active = true;
    const client = new LocalTaskClient();
    const timer = setTimeout(() => {
      void client.request("inspect", { text }).then((inspection) => {
        if (active) setBackground({ text, inspection });
      }).catch((error: unknown) => {
        if (active && !isLocalTaskAbort(error)) setBackground({ text, inspection: { ...PENDING, validation: { valid: false, error: {
          field: "log", code: text.length > DEFAULT_MAX_LOG_BYTES ? "too-large" : "unreadable", message: localTaskMessage(error),
        } } } });
      }).finally(() => client.dispose());
    }, 120);
    return () => { active = false; clearTimeout(timer); client.dispose(); };
  }, [small, text]);
  if (small) return { ...small, pending: false };
  if (background?.text === text) return { ...background.inspection, pending: false };
  return { ...PENDING, pending: true };
}
