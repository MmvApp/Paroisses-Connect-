/**
 * /api/storage/sign-upload
 *
 * Génère une URL d'upload signée vers Supabase Storage avec la clé service.
 * Contourne le RLS — l'app utilise Firebase Auth, pas Supabase Auth.
 * Le client fait ensuite un PUT direct vers l'URL signée (aucune clé exposée).
 */
import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_KEY ?? "",
);

const BUCKET = "avatars";

// Chemins autorisés — évite l'utilisation abusive du signed URL pour écraser
// des fichiers arbitraires en dehors des répertoires prévus.
const ALLOWED_PREFIXES = [
  /^[^/]+\/profile\.jpg$/,           // uid/profile.jpg
  /^parishes\/[^/]+\//,              // parishes/{id}/...
  /^announcements\//,                // announcements/...
  /^events\//,                       // events/...
  /^parish-claims\/[^/]+\//,         // parish-claims/{id}/...
];

function isPathAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some((re) => re.test(path));
}

router.post("/storage/sign-upload", async (req: Request, res: Response) => {
  const { path } = req.body as { path?: unknown };

  if (typeof path !== "string" || !path || path.includes("..") || path.startsWith("/")) {
    res.status(400).json({ error: "Chemin invalide." });
    return;
  }

  if (!isPathAllowed(path)) {
    res.status(403).json({ error: "Chemin non autorisé." });
    return;
  }

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    res.status(500).json({ error: error?.message ?? "Erreur serveur." });
    return;
  }

  res.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
});

export default router;
