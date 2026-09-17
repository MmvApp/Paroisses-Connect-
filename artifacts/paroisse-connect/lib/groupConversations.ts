import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function ensureGroupConversation({
  groupId,
  parishId,
  groupName,
}: {
  groupId: string;
  parishId: string;
  groupName: string;
}): Promise<string> {
  if (!groupId || !parishId || !groupName.trim()) {
    throw new Error("invalid-group-conversation");
  }

  const conversationRef = doc(db, "groupConversations", groupId);
  await setDoc(
    conversationRef,
    {
      groupId,
      parishId,
      name: groupName.trim(),
    },
    { merge: true },
  );
  return groupId;
}