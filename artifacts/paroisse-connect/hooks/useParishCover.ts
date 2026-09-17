import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "@/lib/firebase";

/**
 * Reads the existing parish cover photo in real time.
 * The caller remains responsible for the fallback image through PublicationCard.
 */
export function useParishCover(parishId?: string | null): string | null {
  const [coverPhotoURL, setCoverPhotoURL] = useState<string | null>(null);

  useEffect(() => {
    setCoverPhotoURL(null);
    if (!parishId) return;

    return onSnapshot(
      doc(db, "parishes", parishId),
      (snapshot) => {
        const value = snapshot.exists()
          ? snapshot.data().coverPhotoURL
          : null;
        setCoverPhotoURL(typeof value === "string" && value.trim() ? value : null);
      },
      () => setCoverPhotoURL(null),
    );
  }, [parishId]);

  return coverPhotoURL;
}