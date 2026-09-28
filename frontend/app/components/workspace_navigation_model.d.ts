export type WorkspaceNavigationItem = {
  href: string;
  label: string;
  shortLabel: string;
  tone?: "blue" | "mint" | "gold";
};

export type WorkspaceNavigationGroup = {
  label: string;
  items: WorkspaceNavigationItem[];
};

export const workspaceNavigationGroups: WorkspaceNavigationGroup[];
export function getWorkspaceLocation(pathname: string): {
  activeHref: string | null;
  label: string;
  parentHref: string | null;
  parentLabel: string | null;
};
