import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function conversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

export async function ensureConversation({
  currentUid,
  currentName,
  currentPhotoURL,
  targetUid,
  targetName,
  targetPhotoURL,
}: {
  currentUid: string;
  currentName: string;
  currentPhotoURL?: string | null;
  targetUid: string;
  targetName: string;
  targetPhotoURL?: string | null;
}): Promise<string> {
  if (!currentUid || !targetUid || currentUid === targetUid) {
    throw new Error("invalid-conversation-participants");
  }

  const id = conversationId(currentUid, targetUid);
  const conversationRef = doc(db, "conversations", id);

  // Keep this merge-only metadata update free of lastMessageAt: opening an
  // existing conversation must not make it look newly active, and a missing
  // document can still be created without a preliminary read permission.
  await setDoc(
    conversationRef,
    {
      participants: [currentUid, targetUid].sort(),
      participantNames: {
        [currentUid]: currentName,
        [targetUid]: targetName,
      },
      participantPhotos: {
        [currentUid]: currentPhotoURL ?? null,
        [targetUid]: targetPhotoURL ?? null,
      },
    },
    { merge: true },
  );
  return id;
}