import { existsSync } from "node:fs";
import path from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router: IRouter = Router();

const fileName = "paroisse-connect-release-1.0.1-build2-new-upload-key.aab";
const iosFileName = fileName.replace(/\.aab$/i, ".zip");
const releaseBucket = "android-releases";
const releaseObjectPath = iosFileName;
const releaseStorage =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;
const filePathCandidates = [
  path.resolve(
    process.cwd(),
    "artifacts/paroisse-connect/downloads",
    fileName,
  ),
  path.resolve(
    process.cwd(),
    "../../artifacts/paroisse-connect/downloads",
    fileName,
  ),
];

const filePath = filePathCandidates.find((candidate) => existsSync(candidate));

router.get("/downloads", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(`<!doctype html>
<html lang="fr">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#123c66">
    <title>Télécharger Paroisse Connect</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; }
      body { margin: 0; min-height: 100vh; background: #f3f6fa; color: #15324b; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
      main { width: min(100%, 440px); background: #fff; border-radius: 24px; padding: 28px 22px; box-shadow: 0 12px 40px rgba(20, 52, 80, .12); text-align: center; }
      .mark { width: 64px; height: 64px; margin: 0 auto 18px; border-radius: 18px; background: #123c66; color: #fff; display: grid; place-items: center; font-size: 30px; }
      h1 { margin: 0 0 10px; font-size: 24px; }
      p { margin: 8px 0; color: #5b6d7e; line-height: 1.45; }
      .download-button { display: block; width: 100%; box-sizing: border-box; border-radius: 14px; padding: 16px 18px; margin-top: 20px; background: #123c66; color: #fff; font-size: 17px; font-weight: 700; text-decoration: none; -webkit-tap-highlight-color: transparent; }
      .fallback { display: inline-block; margin-top: 14px; color: #123c66; font-size: 14px; }
      .hint { margin-top: 22px; padding: 14px; border-radius: 14px; background: #eef4f9; font-size: 14px; text-align: left; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">↓</div>
      <h1>Paroisse Connect</h1>
      <p>Enregistre le fichier Android dans l’application <strong>Fichiers</strong> de ton iPhone.</p>
      <a class="download-button" href="./downloads/${iosFileName}" download>Enregistrer dans Fichiers</a>
      <a class="fallback" href="./downloads/${fileName}">Essayer le téléchargement direct</a>
      <div class="hint">Le bouton télécharge une archive compatible avec Safari. Dans <strong>Fichiers</strong>, ouvre son menu, choisis <strong>Renommer</strong> et remplace seulement <strong>.zip</strong> par <strong>.aab</strong>.</div>
    </main>
  </body>
</html>`);
});

const redirectToIosDownload = async (_req: Request, res: Response) => {
  if (!releaseStorage) {
    res.status(503).json({ error: "Release storage is not configured" });
    return;
  }

  const { data, error } = await releaseStorage.storage
    .from(releaseBucket)
    .createSignedUrl(releaseObjectPath, 3600);

  if (error || !data?.signedUrl) {
    res.status(503).json({ error: "Release download is temporarily unavailable" });
    return;
  }

  res.redirect(302, data.signedUrl);
};

router.get("/downloads/ios", redirectToIosDownload);
router.get(`/downloads/${iosFileName}`, redirectToIosDownload);

router.get(`/downloads/${fileName}`, (_req, res) => {
  if (!filePath) {
    res.status(404).json({ error: "Download not found" });
    return;
  }

  res.download(filePath, fileName, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/octet-stream",
    },
  });
});

export default router;