import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function useUnreadNotifCount(uid: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCount(0);
      return;
    }
    return onSnapshot(
      query(collection(db, "notifications", uid, "items"), where("read", "==", false)),
      (snapshot) => setCount(snapshot.size),
      () => setCount(0),
    );
  }, [uid]);

  return count;
}