export interface NavigationLinkItem {
  type: "link";
  id: string;
  href: string;
  label: string;
  shortLabel: string;
  tone?: "blue" | "mint" | "gold";
}

export interface NavigationMarkerItem {
  type: "marker";
  id: string;
  label: string;
}

export type NavigationWheelItem = NavigationLinkItem | NavigationMarkerItem;

export interface NavigationGroupSource {
  label: string;
  items: Omit<NavigationLinkItem, "type" | "id">[];
}

export function createNavigationWheelItems(groups: NavigationGroupSource[]): NavigationWheelItem[];
export function getInitialNavigationFocusIndex(items: NavigationWheelItem[], pathname: string): number;
export function moveNavigationFocusIndex(items: NavigationWheelItem[], focusIndex: number, delta: number): number;
