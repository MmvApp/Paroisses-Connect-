export type MutualAidKind = "offer" | "request";

export interface MutualAidPublication {
  id: string;
  kind: MutualAidKind;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string | null;
  parishId?: string | null;
  title: string;
  body: string;
  availability?: string;
  category?: string;
  serviceTitle?: string;
  imageUrls?: string[];
  status: "open" | "closed";
  createdAt: { seconds: number } | null;
}

export interface MutualAidInterest {
  id: string;
  targetType: MutualAidKind;
  targetId: string;
  targetAuthorId: string;
  interestedUid: string;
  interestedName: string;
  interestedPhotoURL?: string | null;
  status: "pending" | "accepted" | "refused";
  createdAt: { seconds: number } | null;
}