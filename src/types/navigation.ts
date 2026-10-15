/**
 * Stable destinations understood by the planned browser workspace.
 *
 * These are contracts only. They do not create routes or UI components.
 */
export const NAVIGATION_ROUTE_IDS = [
  "analyze",
  "history",
  "verify",
  "settings",
] as const;

export type NavigationRouteId = (typeof NAVIGATION_ROUTE_IDS)[number];

export type NavigationItemKind = "primary" | "secondary";

export interface NavigationItem {
  readonly id: NavigationRouteId;
  readonly label: string;
  readonly description: string;
  readonly href: string;
  readonly kind: NavigationItemKind;
}

export interface NavigationState {
  readonly activeRoute: NavigationRouteId;
  readonly isSidebarCollapsed: boolean;
}
