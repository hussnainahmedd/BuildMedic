import type { ThemeMode } from "./theme";

export type InputMode = "paste" | "file";

export type DisplayDensity = "comfortable" | "compact";

export interface UserPreferences {
  readonly theme: ThemeMode;
  readonly defaultInputMode: InputMode;
  readonly displayDensity: DisplayDensity;
  readonly reducedMotion: boolean;
  readonly showLineNumbers: boolean;
  readonly showEvidenceContext: boolean;
}

export const DEFAULT_USER_PREFERENCES: Readonly<UserPreferences> = {
  theme: "system",
  defaultInputMode: "paste",
  displayDensity: "comfortable",
  reducedMotion: false,
  showLineNumbers: true,
  showEvidenceContext: true,
};
