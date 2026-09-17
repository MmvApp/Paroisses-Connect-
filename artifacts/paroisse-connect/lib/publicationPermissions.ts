export type PublicationRole = "member" | "admin" | "priest" | "super_admin";

export interface PublicationIdentity {
  userId: string | undefined;
  role: PublicationRole | undefined;
  parishId?: string | null;
  legacyParishId?: string | null;
}

export interface DeletablePublication {
  authorId?: string | null;
  parishId?: string | null;
}

/**
 * Client-side visibility helper for the delete action.
 * Firestore rules remain the source of truth and enforce the same policy.
 */
export function canDeletePublication(
  identity: PublicationIdentity,
  publication: DeletablePublication,
): boolean {
  if (!identity.userId) return false;

  // Keep the existing global admin behavior and give super_admin full access.
  if (identity.role === "admin" || identity.role === "super_admin") return true;

  // Every authenticated role may remove their own publication.
  if (publication.authorId === identity.userId) return true;

  // A priest may moderate publications belonging to their own parish only.
  return (
    identity.role === "priest" &&
    !!identity.parishId &&
    (publication.parishId || identity.legacyParishId) === identity.parishId
  );
}