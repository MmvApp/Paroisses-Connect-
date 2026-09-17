import { uploadToSupabase } from "@/lib/uploadToSupabase";

export type PublicationMediaData = {
  imageUrls?: unknown;
  imageUrl?: unknown;
};

export function normalizePublicationImageUrls(data: PublicationMediaData): string[] {
  const urls = Array.isArray(data.imageUrls)
    ? data.imageUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  if (urls.length > 0) return urls.slice(0, 2);
  return typeof data.imageUrl === "string" && data.imageUrl.trim()
    ? [data.imageUrl]
    : [];
}

export async function uploadPublicationImage(uri: string, folder: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  return uploadToSupabase(blob, path, { compress: false });
}

export async function uploadPublicationImages(uris: string[], folder: string): Promise<string[]> {
  return Promise.all(uris.slice(0, 2).map((uri) => uploadPublicationImage(uri, folder)));
}