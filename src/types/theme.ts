export const THEME_MODES = ["light", "dark", "system"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

export type ThemeColorScheme = "light" | "dark";

export interface ThemeDefinition {
  readonly id: Exclude<ThemeMode, "system">;
  readonly label: string;
  readonly colorScheme: ThemeColorScheme;
}
