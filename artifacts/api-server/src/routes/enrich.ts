/**
 * POST /api/parishes/enrich
 *
 * Récupère automatiquement les informations publiques d'une paroisse catholique :
 * 1. Google Places API  → nom officiel, adresse, téléphone, site web
 * 2. Fetch du site web → extraction du texte brut
 * 3. Gemini 1.5 Flash  → extraction structurée (curé, horaires, e-mail…)
 *
 * Toutes les étapes sont indépendamment protégées contre les erreurs :
 * si une étape échoue, on continue avec ce qu'on a.
 */

import { Router, type Request, type Response } from "express";

const router = Router();

const GOOGLE_KEY = process.env.GOOGLE_API_KEY ?? "";
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_KEY}`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaceCandidate {
  place_id: string;
  name: string;
}

interface PlaceDetails {
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  website?: string;
}

interface GeminiExtraction {
  priestName?: string | null;
  email?: string | null;
  confessionSchedules?: string | null;
  adorationSchedules?: string | null;
  permanenceSchedules?: string | null;
  massSchedule?: Array<{ day: string; time: string; type: string }> | null;
  massSchedulesText?: string | null;
}

// ─── Étape 1 : Google Places – Recherche texte ────────────────────────────────

async function findPlaceId(
  query: string
): Promise<PlaceCandidate | null> {
  if (!GOOGLE_KEY) return null;
  const url =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name&key=${GOOGLE_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  const data = (await res.json()) as { candidates?: PlaceCandidate[] };
  return data.candidates?.[0] ?? null;
}

// ─── Étape 2 : Google Places – Détails ───────────────────────────────────────

async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const fields = "name,formatted_address,formatted_phone_number,website";
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${placeId}&fields=${fields}&key=${GOOGLE_KEY}&language=fr`;
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  const data = (await res.json()) as { result?: PlaceDetails };
  return data.result ?? {};
}

// ─── Étape 3 : Extraction du texte du site web ───────────────────────────────

async function fetchWebsiteText(websiteUrl: string): Promise<string> {
  const res = await fetch(websiteUrl, {
    signal: AbortSignal.timeout(12000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ParoisseConnect/1.0; +https://paroisseconnect.app)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
  });
  const html = await res.text();

  // Supprimer les scripts, styles, commentaires HTML, puis les balises
  const text = html
    .substring(0, 250_000)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-zA-Z0-9#]+;/g, " ")
    .replace(/[ \t]{3,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Garder les 9 000 premiers caractères pour Gemini (environ 2 250 tokens)
  return text.substring(0, 9000);
}

// ─── Étape 4 : Extraction structurée via Gemini ──────────────────────────────

async function extractWithGemini(
  websiteText: string,
  parishName: string
): Promise<GeminiExtraction> {
  if (!GOOGLE_KEY || !websiteText.trim()) return {};

  const prompt = `Tu es un assistant spécialisé dans l'extraction d'informations de paroisses catholiques françaises.

Voici le texte extrait du site web de la paroisse "${parishName}" :

${websiteText}

Extrais les informations suivantes. Réponds UNIQUEMENT avec un JSON valide, sans texte avant ni après, sans balises markdown :

{
  "priestName": "Prénom Nom du curé ou prêtre responsable, ou null si absent",
  "email": "adresse e-mail de contact de la paroisse (pas une adresse personnelle), ou null si absente",
  "confessionSchedules": "horaires des confessions en texte libre (ex: 'Samedi 16h-17h, sur rendez-vous'), ou null si absents",
  "adorationSchedules": "horaires de l'adoration eucharistique en texte libre, ou null si absents",
  "permanenceSchedules": "horaires du secrétariat / permanences en texte libre, ou null si absents",
  "massSchedule": [{"day": "Dimanche", "time": "10:30", "type": "Messe dominicale"}],
  "massSchedulesText": "description complète des horaires de messes en texte libre si le tableau ci-dessus est incomplet, ou null"
}

Règles impératives :
- Jours en français uniquement : Lundi, Mardi, Mercredi, Jeudi, Vendredi, Samedi, Dimanche
- massSchedule ne contient QUE les créneaux avec un jour ET une heure clairement identifiés
- Si les horaires sont complexes ou mal structurés, laisse massSchedule vide et utilise massSchedulesText
- Si une information est absente ou incertaine, retourne null pour ce champ
- Réponds UNIQUEMENT avec le JSON, rien d'autre`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1800 },
  };

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};

  try {
    return JSON.parse(jsonMatch[0]) as GeminiExtraction;
  } catch {
    return {};
  }
}

// ─── Route principale ─────────────────────────────────────────────────────────

router.post("/parishes/enrich", async (req: Request, res: Response) => {
  const { parishName, city, postalCode } = req.body as {
    parishName?: string;
    city?: string;
    postalCode?: string;
  };

  if (!parishName?.trim()) {
    res.status(400).json({ error: "Le champ parishName est requis." });
    return;
  }

  if (!GOOGLE_KEY) {
    res.status(503).json({ error: "Clé Google API non configurée sur le serveur." });
    return;
  }

  // Construire la requête de recherche
  const searchQuery = [
    "paroisse catholique",
    parishName.trim(),
    city?.trim(),
    postalCode?.trim(),
    "France",
  ]
    .filter(Boolean)
    .join(" ");

  let placeName: string | null = null;
  let address: string | null = null;
  let phone: string | null = null;
  let website: string | null = null;
  let gemini: GeminiExtraction = {};

  // ── Étape 1 & 2 : Google Places ──
  try {
    const candidate = await findPlaceId(searchQuery);
    if (candidate) {
      const details = await getPlaceDetails(candidate.place_id);
      placeName = details.name ?? null;
      address   = details.formatted_address ?? null;
      phone     = details.formatted_phone_number ?? null;
      website   = details.website ?? null;
    }
  } catch (err) {
    // Google Places non disponible : on continue sans
    console.warn("[enrich] Google Places error:", (err as Error).message);
  }

  // ── Étapes 3 & 4 : site web + Gemini ──
  if (website) {
    try {
      const websiteText = await fetchWebsiteText(website);
      gemini = await extractWithGemini(websiteText, parishName.trim());
    } catch (err) {
      // Site non accessible ou Gemini indisponible : on continue sans
      console.warn("[enrich] Website/Gemini error:", (err as Error).message);
    }
  }

  res.json({
    name:                 placeName,
    address,
    phone,
    website,
    email:                gemini.email               ?? null,
    priestName:           gemini.priestName          ?? null,
    confessionSchedules:  gemini.confessionSchedules ?? null,
    adorationSchedules:   gemini.adorationSchedules  ?? null,
    permanenceSchedules:  gemini.permanenceSchedules ?? null,
    massSchedule:         gemini.massSchedule        ?? [],
    massSchedulesText:    gemini.massSchedulesText   ?? null,
    _source: website ? "google_places+gemini" : "google_places",
    _searchQuery: searchQuery,
  });
});

export default router;
