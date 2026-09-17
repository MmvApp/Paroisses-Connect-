/**
 * Upload d'images vers Supabase Storage via signed URLs.
 *
 * Architecture : l'app utilise Firebase Auth (pas Supabase Auth), donc la clé
 * anon seule est bloquée par RLS. Solution : l'API Server génère une signed URL
 * avec la clé service — le client fait ensuite un PUT direct vers Supabase.
 *
 * Formats supportés : JPG, PNG, HEIC/HEIF (converti en JPEG via Canvas sur web).
 */

// URL de base de l'API Server — même logique que parish-admin.tsx / parishes.tsx
const API_BASE: string =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_URL) ||
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "");

const SUPABASE_URL: string = (
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_URL) ||
  "https://utjacnntveobvvaghcmg.supabase.co"
).replace(/\/$/, "");  // enlève le slash final si présent

const BUCKET = "avatars";

// ─── Compression web ─────────────────────────────────────────────────────────

/**
 * Compresse un Blob en JPEG via Canvas HTML5 (web uniquement).
 * Safari charge les HEIC/HEIF nativement dans <img> → conversion transparente.
 * Limite : 1400 px max, qualité 0.82 par défaut → ~5–20× plus léger.
 */
export function toJpegBlob(source: Blob, maxDim = 1_400, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img  = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else        { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas indisponible")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => b
          ? resolve(b)
          : reject(new Error("Compression image échouée (canvas.toBlob null)")),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Format image non reconnu. Utilisez JPG, PNG ou HEIC."));
    };
    img.src = url;
  });
}

// ─── Helpers publics ──────────────────────────────────────────────────────────

/**
 * Convertit une chaîne base64 en Blob sans aucun accès réseau.
 * Obligatoire sur iOS Safari PWA où fetch(blob:URL) se fige silencieusement.
 */
export function base64ToBlob(b64: string, mime = "image/jpeg"): Blob {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Téléverse un Blob vers Supabase Storage via signed URL et retourne l'URL publique.
 *
 * Flux :
 *   1. Compression JPEG (Canvas) — gère HEIC/HEIF iPhone
 *   2. POST /api/storage/sign-upload → signed URL (service key côté serveur)
 *   3. PUT blob → signed URL Supabase (aucun RLS, aucune clé exposée)
 *   4. Retourne l'URL publique avec paramètre anti-cache
 *
 * @param blob        Blob à téléverser (HEIC, PNG, JPG — tout format)
 * @param storagePath Chemin dans le bucket, ex. "uid/profile.jpg"
 * @param compress    Compresser en JPEG via Canvas (défaut: true sur web)
 * @param maxDim      Dimension max en pixels (défaut: 1400)
 * @param quality     Qualité JPEG 0–1 (défaut: 0.82)
 * @returns           URL publique avec paramètre anti-cache
 */
export async function uploadToSupabase(
  blob: Blob,
  storagePath: string,
  { compress = true, maxDim = 1_400, quality = 0.82 } = {},
): Promise<string> {
  const isWeb = typeof document !== "undefined";

  // Étape 1 : compression JPEG (web uniquement — Canvas disponible)
  const finalBlob = (compress && isWeb)
    ? await toJpegBlob(blob, maxDim, quality)
    : blob;

  const contentType = (compress && isWeb) ? "image/jpeg" : (finalBlob.type || "image/jpeg");

  // Étape 2 : obtenir une signed URL depuis l'API Server (clé service côté serveur)
  let signedUrl: string;
  try {
    const signRes = await fetch(`${API_BASE}/api/storage/sign-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: storagePath }),
    });

    if (!signRes.ok) {
      const body = await signRes.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Erreur serveur (${signRes.status}).`);
    }

    const json = await signRes.json() as { signedUrl: string };
    signedUrl = json.signedUrl;
  } catch (err) {
    if (err instanceof Error && (err.message.includes("serveur") || err.message.includes("autorisé"))) {
      throw err;
    }
    throw new Error("Impossible de contacter le serveur. Vérifiez votre connexion.");
  }

  // Étape 3 : PUT direct vers Supabase avec la signed URL (contourne RLS)
  const uploadRes = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: finalBlob,
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => "");
    const low  = body.toLowerCase() + uploadRes.status.toString();
    if (low.includes("size") || low.includes("too large") || low.includes("413"))
      throw new Error("Image trop volumineuse. Choisissez une image plus petite (max 5 Mo).");
    if (low.includes("mime") || low.includes("type") || low.includes("415"))
      throw new Error("Format non supporté. Utilisez JPG, PNG ou HEIC.");
    throw new Error(`Téléversement échoué (HTTP ${uploadRes.status}).`);
  }

  // Étape 4 : URL publique (le bucket est public)
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  return `${publicUrl}?t=${Date.now()}`;
}
