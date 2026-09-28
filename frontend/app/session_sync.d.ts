export type SessionChangeKind = "signed-in" | "signed-out" | "expired";
export function publishSessionChange(kind: SessionChangeKind): void;
export function subscribeToSessionChanges(onChange: (kind: SessionChangeKind) => void): () => void;
