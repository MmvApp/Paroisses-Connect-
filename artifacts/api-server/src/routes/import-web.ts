/**
 * POST /api/parishes/import-web
 *
 * Crawl multi-pages du site officiel d'une paroisse.
 * Extrait : nom, description, téléphone, e-mail, adresse, site, curé,
 *           horaires de messes / confessions / adoration / permanences, églises.
 *
 * Stratégie :
 *  1. Récupère la page principale
 *  2. Score les liens internes par mots-clés paroissiaux
 *  3. Récupère en parallèle les 5 meilleures sous-pages
 *  4. Extrait directement tel:, mailto:, JSON-LD de chaque page HTML brut
 *  5. Envoie tout à Gemini en une seule requête avec attribution de source
 *
 * Aucun annuaire externe. Uniquement des liens internes au domaine officiel.
 */

import { Router, type Request, type Response } from "express";

const router = Router();

const GOOGLE_KEY   = process.env.GOOGLE_API_KEY ?? "";
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_KEY}`;

const MAX_PAGES      = 6;    // page principale + 5 sous-pages max
const MAX_CHARS_PAGE = 3_500; // texte par page envoyé à Gemini
const FETCH_TIMEOUT  = 12_000;

// ─── Types ────────────────────────────────────────────────────────────────────

type Confidence = "fiable" | "à vérifier" | "incertain";

interface ValueField {
  value:      string;
  confidence: Confidence;
  sourceUrl?: string;
}

interface MassField {
  entries:    Array<{ day: string; time: string; type: string }>;
  confidence: Confidence;
  sourceUrl?: string;
}

interface LinkField {
  label:      string;
  url:        string;
  confidence: Confidence;
  sourceUrl?: string;
}

interface GeminiImportResult {
  parishName?:          ValueField   | null;
  description?:         ValueField   | null;
  phones?:              ValueField[] | null;
  emails?:              ValueField[] | null;
  address?:             ValueField   | null;
  website?:             ValueField   | null;
  churchNames?:         ValueField[] | null;
  priestName?:          ValueField   | null;
  massSchedule?:        MassField    | null;
  massSchedulesText?:   ValueField   | null;
  confessionSchedules?: ValueField   | null;
  adorationSchedules?:  ValueField   | null;
  permanenceSchedules?: ValueField   | null;
  usefulLinks?:         LinkField[]  | null;
}

// ─── Extraction directe depuis HTML brut ─────────────────────────────────────

interface DirectContacts { phones: string[]; emails: string[]; jsonLd: string }

function extractDirectContacts(html: string): DirectContacts {
  const phones: string[] = [];
  const emails: string[] = [];

  // tel: links (fiables — données structurées)
  const telRe = /href=["']tel:([^"'\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = telRe.exec(html)) !== null) {
    const raw = m[1].trim();
    // Normaliser : garder chiffres, +, espaces, tirets, parenthèses
    const p = raw.replace(/[^\d+\s\-().]/g, "").trim();
    if (p.length >= 8 && !phones.includes(p)) phones.push(p);
    if (phones.length >= 6) break;
  }

  // mailto: links
  const mailRe = /href=["']mailto:([^"'?\s]+)/gi;
  while ((m = mailRe.exec(html)) !== null) {
    const e = m[1].trim().toLowerCase();
    if (e.includes("@") && !emails.includes(e)) emails.push(e);
    if (emails.length >= 6) break;
  }

  // JSON-LD (schema.org, données structurées)
  const jsonLdParts: string[] = [];
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim());
      jsonLdParts.push(JSON.stringify(obj, null, 2).slice(0, 2_000));
    } catch { /* JSON invalide, ignorer */ }
    if (jsonLdParts.length >= 4) break;
  }

  return { phones, emails, jsonLd: jsonLdParts.join("\n") };
}

// ─── Score des liens internes ─────────────────────────────────────────────────

const PRIORITY_KW = [
  "contact", "coordonnées", "coordonnees", "coordonnee", "joindre",
  "equipe", "équipe", "pastorale", "pretre", "prêtre", "cure", "curé",
  "eglise", "église", "chapelle", "paroisse",
  "horaire", "messe", "confession", "adoration", "permanence",
  "agenda", "calendrier", "sacrement", "bapteme", "mariage",
  "presentation", "présentation", "qui-sommes", "qui sommes",
  "infos", "information", "annuaire",
];

const EXCLUDE_PATTERNS = [
  "/wp-admin", "/wp-login", "/wp-json", "/feed", "/rss", "/sitemap",
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".mp4", ".zip",
  "/tag/", "/category/", "/page/", "?p=", "&p=", "?replytocom",
  "facebook.com", "twitter.com", "instagram.com", "youtube.com",
  "tiktok.com", "linkedin.com",
  "pagesjaunes", "messes.info", "eglise.catholique.fr/agenda", "annuaire-mairie",
  "google.com", "apple.com", "maps.google",
  "/mentions-legales", "/politique-de-confidentialite", "/cgu",
  "mailto:", "tel:", "javascript:",
];

function scoreLink(label: string, url: string): number {
  const combined = (label + " " + url).toLowerCase();
  for (const p of EXCLUDE_PATTERNS) {
    if (combined.includes(p)) return -100;
  }
  let score = 0;
  for (const kw of PRIORITY_KW) {
    if (combined.includes(kw)) score += 10;
  }
  if (url.includes("?") && !url.includes("?lang")) score -= 3;
  if (url.length > 130) score -= 3;
  try {
    const path  = new URL(url).pathname;
    const depth = path.split("/").filter(Boolean).length;
    if (depth === 1) score += 4;
    else if (depth === 2) score += 2;
    else if (depth >= 5) score -= 4;
  } catch { /* ignore */ }
  return score;
}

// ─── Fetch + extraction d'une page ───────────────────────────────────────────

interface PageResult {
  url:    string;
  text:   string;
  links:  Array<{ label: string; url: string; score: number }>;
  direct: DirectContacts;
}

async function fetchPage(rawUrl: string, baseOrigin: string): Promise<PageResult | null> {
  try {
    const res = await fetch(rawUrl, {
      signal:  AbortSignal.timeout(FETCH_TIMEOUT),
      headers: {
        "User-Agent":     "Mozilla/5.0 (compatible; ParoisseConnect/1.0; +https://paroisseconnect.app)",
        "Accept":         "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":"fr-FR,fr;q=0.9,en;q=0.5",
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || (!contentType.includes("html") && !contentType.includes("xml"))) return null;

    const html     = await res.text();
    const finalUrl = res.url || rawUrl;
    const direct   = extractDirectContacts(html);

    // ── Liens internes ──────────────────────────────────────────────────────
    const linkRe = /<a\s[^>]*href=["']([^"'>]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const links:  Array<{ label: string; url: string; score: number }> = [];
    const seen    = new Set<string>();
    let m: RegExpExecArray | null;

    while ((m = linkRe.exec(html.slice(0, 400_000))) !== null) {
      let href = m[1].trim();
      const rawLabel = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) continue;
      if (!href.startsWith("http")) {
        try { href = new URL(href, finalUrl).href; } catch { continue; }
      }
      try { if (new URL(href).origin !== baseOrigin) continue; }
      catch { continue; }
      const key = href.toLowerCase().replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      const sc = scoreLink(rawLabel, href);
      if (sc > -100) links.push({ label: rawLabel, url: href, score: sc });
    }
    links.sort((a, b) => b.score - a.score);

    // ── Texte lisible (préserve structure des tableaux) ──────────────────────
    const text = html
      .slice(0, 400_000)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi,   "")
      .replace(/<!--[\s\S]*?-->/g,             "")
      .replace(/<\/tr>/gi,  "\n")
      .replace(/<\/td>/gi,  " | ")
      .replace(/<\/th>/gi,  " | ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi,   "\n")
      .replace(/<\/li>/gi,  "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<[^>]+>/g,  " ")
      .replace(/&amp;/g,  "&").replace(/&lt;/g,  "<").replace(/&gt;/g,  ">")
      .replace(/&nbsp;/g, " ").replace(/&[a-zA-Z0-9#]+;/g, " ")
      .replace(/[ \t]{3,}/g, "  ")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, MAX_CHARS_PAGE);

    return { url: finalUrl, text, links, direct };
  } catch {
    return null;
  }
}

// ─── Crawl multi-pages ────────────────────────────────────────────────────────

interface CrawlResult {
  pages:    Array<{ url: string; text: string; direct: DirectContacts }>;
}

async function crawlParishWebsite(startUrl: string): Promise<CrawlResult> {
  let baseOrigin: string;
  try { baseOrigin = new URL(startUrl).origin; }
  catch { throw new Error("URL invalide"); }

  const pages:   Array<{ url: string; text: string; direct: DirectContacts }> = [];
  const visited  = new Set<string>();

  // ── Page principale ──────────────────────────────────────────────────────
  const home = await fetchPage(startUrl, baseOrigin);
  if (!home) throw new Error("Impossible d'accéder au site.");
  pages.push({ url: home.url, text: home.text, direct: home.direct });
  visited.add(home.url.toLowerCase().replace(/\/$/, ""));

  // ── Sélection des sous-pages par score ──────────────────────────────────
  const candidates = home.links
    .filter(l => l.score > 0)
    .slice(0, MAX_PAGES - 1);

  // Fetch par lots de 3 en parallèle
  const BATCH = 3;
  for (let i = 0; i < candidates.length && pages.length < MAX_PAGES; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(l => {
        const key = l.url.toLowerCase().replace(/\/$/, "");
        if (visited.has(key)) return Promise.resolve(null);
        visited.add(key);
        return fetchPage(l.url, baseOrigin);
      }),
    );
    for (const r of results) {
      if (r && pages.length < MAX_PAGES) {
        pages.push({ url: r.url, text: r.text, direct: r.direct });
      }
    }
  }

  return { pages };
}

// ─── Extraction via Gemini 1.5 Flash ─────────────────────────────────────────

async function extractWithGemini(
  crawl: CrawlResult,
  parishName: string,
): Promise<GeminiImportResult> {
  if (!GOOGLE_KEY) return {};

  // Contacts directs (données structurées, fiables)
  const allPhones = [...new Set(crawl.pages.flatMap(p => p.direct.phones))];
  const allEmails = [...new Set(crawl.pages.flatMap(p => p.direct.emails))];
  const allJsonLd = crawl.pages.map(p => p.direct.jsonLd).filter(Boolean).join("\n").slice(0, 4_000);

  const directSection = [
    allPhones.length ? `Téléphones extraits des liens tel: : ${allPhones.join(", ")}` : "",
    allEmails.length ? `E-mails extraits des liens mailto: : ${allEmails.join(", ")}` : "",
    allJsonLd         ? `Données structurées JSON-LD :\n${allJsonLd}` : "",
  ].filter(Boolean).join("\n");

  const pagesContent = crawl.pages
    .map((p, i) => `=== PAGE ${i + 1} — ${p.url} ===\n${p.text}`)
    .join("\n\n");

  const prompt = `Tu es un expert en extraction d'informations pour les paroisses catholiques françaises.

Ci-dessous le contenu de ${crawl.pages.length} page(s) du site officiel de "${parishName}".
Pour chaque information, indique dans "sourceUrl" l'URL exacte de la page (telle qu'indiquée dans les en-têtes === PAGE N — URL ===) où l'information a été trouvée.

${directSection ? `─── DONNÉES DIRECTES (haute fiabilité) ───\n${directSection}\n\n` : ""}─── CONTENU DES PAGES ───
${pagesContent}

Réponds UNIQUEMENT avec du JSON valide, sans texte avant ni après, sans balises markdown.

Niveaux de confiance :
- "fiable"     : information clairement présente, sans ambiguïté
- "à vérifier" : probable mais partielle ou ambiguë
- "incertain"  : peu clair, à confirmer manuellement

JSON attendu (toutes les clés sont optionnelles — retourne null si absent) :
{
  "parishName":  {"value": "Paroisse Sainte-Claire en Avesnois", "confidence": "fiable", "sourceUrl": "https://..."},
  "description": {"value": "Présentation en 2-4 phrases.", "confidence": "à vérifier", "sourceUrl": "https://..."},
  "phones":      [{"value": "+33 3 27 XX XX XX", "confidence": "fiable", "sourceUrl": "https://..."}],
  "emails":      [{"value": "contact@paroisse.fr", "confidence": "fiable", "sourceUrl": "https://..."}],
  "address":     {"value": "12 rue de la Paix, 59600 Maubeuge", "confidence": "fiable", "sourceUrl": "https://..."},
  "website":     {"value": "https://www.paroisse.fr", "confidence": "fiable", "sourceUrl": "https://..."},
  "churchNames": [{"value": "Église Saint-Nicolas", "confidence": "fiable", "sourceUrl": "https://..."}],
  "priestName":  {"value": "Père Jean Martin", "confidence": "à vérifier", "sourceUrl": "https://..."},
  "massSchedule": {
    "confidence": "fiable", "sourceUrl": "https://...",
    "entries": [{"day": "Dimanche", "time": "10:30", "type": "Messe dominicale"}]
  },
  "massSchedulesText":   {"value": "Texte fidèle des horaires.", "confidence": "fiable", "sourceUrl": "https://..."},
  "confessionSchedules": {"value": "Samedi 16h–17h", "confidence": "à vérifier", "sourceUrl": "https://..."},
  "adorationSchedules":  {"value": "Jeudi 9h–10h", "confidence": "incertain", "sourceUrl": "https://..."},
  "permanenceSchedules": {"value": "Mardi 9h–12h", "confidence": "fiable", "sourceUrl": "https://..."},
  "usefulLinks": [{"label": "Horaires des messes", "url": "https://...", "confidence": "fiable", "sourceUrl": "https://..."}]
}

Règles impératives :
- NE JAMAIS inventer. Si une donnée est absente, retourne null pour ce champ.
- IGNORE publicités, annuaires externes (pagesjaunes, messes.info…), réseaux sociaux, CGU.
- phones / emails : contacts officiels de la paroisse uniquement (secrétariat, bureau paroissial).
  Priorité absolue aux valeurs extraites des liens tel: et mailto: ci-dessus.
- parishName : nom officiel complet de la paroisse (ex. "Paroisse Saint-Paul de Lyon"), pas le nom d'une seule église.
- description : 2-4 phrases décrivant la paroisse. Fidèle au texte du site. Pas d'invention.
- churchNames : noms exacts des églises et chapelles rattachées (liste complète).
- massSchedule.entries : UNIQUEMENT les créneaux avec un JOUR et une HEURE clairement identifiés.
  Jours valides : Lundi Mardi Mercredi Jeudi Vendredi Samedi Dimanche.
- massSchedulesText : résumé textuel fidèle des horaires (copie le texte du site si possible).
- website : URL du site officiel de la paroisse, tel qu'indiqué sur le site.
- sourceUrl : URL exacte parmi celles listées ci-dessus (copie-la à l'identique).
- Réponds UNIQUEMENT avec le JSON.`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.05, maxOutputTokens: 5_000 },
  };

  const res = await fetch(GEMINI_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(50_000),
  });

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const raw       = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};

  try { return JSON.parse(jsonMatch[0]) as GeminiImportResult; }
  catch { return {}; }
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/parishes/import-web", async (req: Request, res: Response) => {
  const { websiteUrl, parishName } = req.body as {
    websiteUrl?: string;
    parishName?: string;
  };

  if (!websiteUrl?.trim()) {
    res.status(400).json({ error: "Le champ websiteUrl est requis." });
    return;
  }

  try {
    const u = new URL(websiteUrl.trim());
    if (!["http:", "https:"].includes(u.protocol)) throw new Error();
  } catch {
    res.status(400).json({ error: "URL invalide. Elle doit commencer par https://" });
    return;
  }

  if (!GOOGLE_KEY) {
    res.status(503).json({ error: "Clé API non configurée sur le serveur." });
    return;
  }

  const fetchedAt = new Date().toISOString();
  let crawlResult: CrawlResult;

  try {
    crawlResult = await crawlParishWebsite(websiteUrl.trim());
    console.log(`[import-web] Crawled ${crawlResult.pages.length} page(s) for ${websiteUrl}`);
  } catch (err) {
    console.warn("[import-web] crawl error:", (err as Error).message);
    res.status(502).json({
      error: "Impossible d'accéder au site. Vérifiez l'URL enregistrée pour cette paroisse.",
    });
    return;
  }

  let extracted: GeminiImportResult = {};
  try {
    extracted = await extractWithGemini(
      crawlResult,
      (parishName ?? "").trim() || "la paroisse",
    );
  } catch (err) {
    console.warn("[import-web] Gemini error:", (err as Error).message);
    // On renvoie quand même les données partielles
  }

  res.json({
    ...extracted,
    _sourceUrl:  crawlResult.pages[0]?.url ?? websiteUrl.trim(),
    _pagesCount: crawlResult.pages.length,
    _pageUrls:   crawlResult.pages.map(p => p.url),
    _fetchedAt:  fetchedAt,
  });
});

export default router;
