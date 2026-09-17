import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

export interface AdminProfile {
  uid: string;
  displayName: string;
  email: string;
}

export interface ParishPermissions {
  userParishId: string | null;
  isSuperAdmin: boolean;
  isPriest: boolean;
  isParishAdmin: boolean;
  canManage: boolean;
  canManageAdmins: boolean;
  canViewClaims: boolean;
  canReviewClaims: boolean;
  claimsDelegatedToAdmins: boolean;
  priestId: string | null;
  parishAdmins: string[];
  parishAdminProfiles: AdminProfile[];
  loading: boolean;
}

/**
 * Centralise tous les droits paroissiaux.
 *
 * @param overrideParishId  Si fourni, observe CE document de paroisse pour
 *   récupérer priestId / parishAdmins — utile quand le super_admin consulte
 *   une paroisse différente de la sienne via ?parishId=…
 *   Sans override, observe la paroisse propre à l'utilisateur.
 */
export function useParishPermissions(overrideParishId?: string | null): ParishPermissions {
  const { user, profile } = useAuth();

  // Paroisse propre de l'utilisateur
  const ownParishId = profile?.parishId ?? profile?.priestParishId ?? null;
  // Paroisse à observer : priorité à l'override explicite
  const watchedParishId = overrideParishId !== undefined ? overrideParishId : ownParishId;

  const [priestId, setPriestId] = useState<string | null>(null);
  const [parishAdmins, setParishAdmins] = useState<string[]>([]);
  const [parishAdminProfiles, setParishAdminProfiles] = useState<AdminProfile[]>([]);
  const [claimsDelegatedToAdmins, setClaimsDelegatedToAdmins] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!watchedParishId) {
      setPriestId(null);
      setParishAdmins([]);
      setParishAdminProfiles([]);
      setClaimsDelegatedToAdmins(false);
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "parishes", watchedParishId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setPriestId(data.priestId ?? null);
          const admins = Array.isArray(data.parishAdmins) ? data.parishAdmins as string[] : [];
          const profiles = Array.isArray(data.parishAdminProfiles) ? data.parishAdminProfiles as AdminProfile[] : [];
          setParishAdmins(admins);
          setParishAdminProfiles(profiles);
          setClaimsDelegatedToAdmins(data.claimsDelegatedToAdmins === true);
        } else {
          setPriestId(null);
          setParishAdmins([]);
          setParishAdminProfiles([]);
          setClaimsDelegatedToAdmins(false);
        }
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsub;
  }, [watchedParishId]);

  const uid = user?.uid ?? null;

  // Les comptes historiques admin sans paroisse restent des administrateurs
  // globaux. Un compte admin rattaché à une paroisse est local.
  const isSuperAdmin =
    profile?.role === "super_admin" ||
    (profile?.role === "admin" && !ownParishId);

  // isPriest : utilise priestId du document comme source de vérité ;
  // repli sur role=priest uniquement pour la paroisse propre du compte.
  const isPriest = !!(
    uid &&
    (
      (priestId ? uid === priestId : false) ||
      (
        profile?.role === "priest" &&
        ownParishId != null &&
        ownParishId === watchedParishId
      )
    )
  );
  const isParishAdmin = !!(
    uid &&
    (
      parishAdmins.includes(uid) ||
      (
        profile?.role === "admin" &&
        ownParishId != null &&
        ownParishId === watchedParishId
      )
    )
  );

  // Le super_admin a toujours tous les droits, quels que soient les docs Firestore.
  const canManage      = isSuperAdmin || isPriest || isParishAdmin;
  const canManageAdmins = isSuperAdmin || isPriest;
  const canViewClaims = isSuperAdmin || isPriest || isParishAdmin;
  const canReviewClaims =
    isSuperAdmin ||
    isPriest ||
    (isParishAdmin && claimsDelegatedToAdmins);

  return {
    userParishId: ownParishId,   // paroisse propre — ne change pas avec l'override
    isSuperAdmin,
    isPriest,
    isParishAdmin,
    canManage,
    canManageAdmins,
    canViewClaims,
    canReviewClaims,
    claimsDelegatedToAdmins,
    priestId,
    parishAdmins,
    parishAdminProfiles,
    loading,
  };
}
