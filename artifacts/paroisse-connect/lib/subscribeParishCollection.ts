import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const IN_QUERY_LIMIT = 30;

type ContentSnapshot = QueryDocumentSnapshot<DocumentData>;

function parishValue(data: DocumentData): string | null {
  const value = data.parishId;
  return typeof value === "string" && value.trim() ? value : null;
}

function sortByCreatedAt(a: ContentSnapshot, b: ContentSnapshot): number {
  const aSeconds = a.data().createdAt?.seconds ?? 0;
  const bSeconds = b.data().createdAt?.seconds ?? 0;
  return bSeconds - aSeconds;
}

/**
 * Subscribes to content belonging to one parish.
 *
 * The first query uses the explicit parishId stored on new documents. The
 * authorId queries preserve legacy documents created before parishId was
 * stored, while the final guard excludes legacy-query results that explicitly
 * belong to another parish.
 */
export function subscribeToParishCollection(
  collectionName: string,
  parishId: string | null | undefined,
  onChange: (docs: ContentSnapshot[]) => void,
  onError: (error: Error) => void = () => {},
  includeAuthorId?: string | null,
  maxItems?: number,
): () => void {
  if (!parishId) {
    onChange([]);
    return () => {};
  }

  const explicitDocs = new Map<string, ContentSnapshot>();
  const legacyDocsByChunk = new Map<string, Map<string, ContentSnapshot>>();
  const memberIds = new Set<string>();
  const memberIdsByField = new Map<"parishId" | "priestParishId", Set<string>>();
  if (includeAuthorId) memberIds.add(includeAuthorId);
  const unsubscribers: Array<() => void> = [];
  let legacyUnsubscribers: Array<() => void> = [];
  let legacyKey = "";
  let disposed = false;

  const emit = () => {
    if (disposed) return;
    const merged = new Map<string, ContentSnapshot>(explicitDocs);
    for (const docs of legacyDocsByChunk.values()) {
      for (const [id, snapshot] of docs) merged.set(id, snapshot);
    }

    const docs = [...merged.values()]
        .filter((snapshot) => {
          const storedParishId = parishValue(snapshot.data());
          return !storedParishId || storedParishId === parishId;
        })
        .sort(sortByCreatedAt);
    onChange(typeof maxItems === "number" ? docs.slice(0, maxItems) : docs);
  };

  const rebuildLegacySubscriptions = () => {
    const ids = [...memberIds].sort();
    const nextKey = ids.join("|");
    if (nextKey === legacyKey) return;
    legacyKey = nextKey;

    legacyUnsubscribers.forEach((unsubscribe) => unsubscribe());
    legacyUnsubscribers = [];
    legacyDocsByChunk.clear();
    emit();

    for (let index = 0; index < ids.length; index += IN_QUERY_LIMIT) {
      const chunk = ids.slice(index, index + IN_QUERY_LIMIT);
      const chunkKey = chunk.join(",");
      const unsubscribe = onSnapshot(
        query(collection(db, collectionName), where("authorId", "in", chunk)),
        (snapshot) => {
          const docs = new Map<string, ContentSnapshot>();
          snapshot.docs.forEach((item) => docs.set(item.id, item));
          legacyDocsByChunk.set(chunkKey, docs);
          emit();
        },
        () => {
          // A strict parish rule may reject a legacy author query containing
          // a document with an explicit foreign parish. Keep scoped content
          // visible; legacy documents remain safely excluded in that case.
        },
      );
      legacyUnsubscribers.push(unsubscribe);
    }
  };

  const rebuildMemberIds = () => {
    memberIds.clear();
    if (includeAuthorId) memberIds.add(includeAuthorId);
    for (const ids of memberIdsByField.values()) {
      ids.forEach((id) => memberIds.add(id));
    }
    rebuildLegacySubscriptions();
  };

  const subscribeMembers = (field: "parishId" | "priestParishId") => {
    const unsubscribe = onSnapshot(
      query(collection(db, "users"), where(field, "==", parishId)),
      (snapshot) => {
        memberIdsByField.set(field, new Set(snapshot.docs.map((userSnapshot) => userSnapshot.id)));
        rebuildMemberIds();
      },
      onError,
    );
    unsubscribers.push(unsubscribe);
  };

  const unsubscribeExplicit = onSnapshot(
    query(collection(db, collectionName), where("parishId", "==", parishId)),
    (snapshot) => {
      explicitDocs.clear();
      snapshot.docs.forEach((item) => explicitDocs.set(item.id, item));
      emit();
    },
    onError,
  );
  unsubscribers.push(unsubscribeExplicit);

  subscribeMembers("parishId");
  subscribeMembers("priestParishId");
  rebuildLegacySubscriptions();

  return () => {
    disposed = true;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    legacyUnsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}