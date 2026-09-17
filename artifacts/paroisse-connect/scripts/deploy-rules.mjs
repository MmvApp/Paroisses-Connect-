#!/usr/bin/env node
/**
 * Firebase Firestore Rules Deployer
 * Usage:
 *   node scripts/deploy-rules.mjs get-code
 *   node scripts/deploy-rules.mjs exchange <code>
 *   node scripts/deploy-rules.mjs deploy-with-sa
 */
import https from "https";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
// The secret may be stored as "    FIREBASE_PROJECT_ID     paroisse-connect" — extract the last token
const _rawPid = (process.env.FIREBASE_PROJECT_ID || "paroisse-connect").trim();
const PROJECT_ID = _rawPid.includes(" ")
  ? _rawPid.split(/\s+/).filter(Boolean).pop()
  : _rawPid;
const RULES_FILE = path.join(__dirname, "..", "firestore.rules");
const STATE_FILE = "/tmp/firebase_auth_state.json";
const TOKEN_FILE = "/tmp/firebase_token.txt";

const CLIENT_ID     = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";
const AUTH_PROXY    = "auth.firebase.tools";
const CLI_UA        = "FirebaseCLI/15.22.4";

// ── HTTP ─────────────────────────────────────────────────────────────────────

function req(method, hostname, urlPath, body, token, form = false) {
  return new Promise((resolve, reject) => {
    const encoded = form
      ? new URLSearchParams(body).toString()
      : JSON.stringify(body);
    const hdrs = {
      "Content-Type"    : form ? "application/x-www-form-urlencoded" : "application/json",
      "Content-Length"  : Buffer.byteLength(encoded),
      "Connection"      : "keep-alive",
      "User-Agent"      : CLI_UA,
      "X-Client-Version": CLI_UA,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const r = https.request({ hostname, path: urlPath, method, headers: hdrs }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on("error", reject);
    r.write(encoded);
    r.end();
  });
}

function b64url(s) {
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── get-code ──────────────────────────────────────────────────────────────────

async function getCode() {
  const sessionId     = crypto.randomUUID();
  const codeVerifier  = crypto.randomBytes(32).toString("hex");
  const codeChallenge = b64url(crypto.createHash("sha256").update(codeVerifier).digest("base64"));

  const attest = await req("POST", AUTH_PROXY, "/attest", { session_id: sessionId }, null);
  if (!attest.body?.token) {
    console.error("Erreur attest:", JSON.stringify(attest.body));
    process.exit(1);
  }

  const loginUrl = `https://${AUTH_PROXY}/login?code_challenge=${codeChallenge}&session=${sessionId}&attest=${attest.body.token}`;

  fs.writeFileSync(STATE_FILE, JSON.stringify({
    sessionId, codeVerifier, codeChallenge, createdAt: Date.now(),
  }));

  console.log("\n════════════════════════════════════════════════════");
  console.log("  Ouvre ce lien :");
  console.log("\n  " + loginUrl + "\n");
  console.log("  Session : " + sessionId.substring(0, 5).toUpperCase());
  console.log("════════════════════════════════════════════════════");
  console.log("  Connecte-toi → copie le code affiché → colle-le ici.\n");
}

// ── exchange ──────────────────────────────────────────────────────────────────

async function exchange(code) {
  if (!fs.existsSync(STATE_FILE)) { console.error("Lance d'abord get-code."); process.exit(1); }
  const { codeVerifier } = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));

  console.log("🔄 Échange du code...");

  // Try 4 combinations: 2 endpoints × with/without PKCE
  const attempts = [
    ["oauth2.googleapis.com", "/token",           codeVerifier],
    ["accounts.google.com",   "/o/oauth2/token",  codeVerifier],
    ["oauth2.googleapis.com", "/token",           null],
    ["accounts.google.com",   "/o/oauth2/token",  null],
  ];

  let token = null;
  for (const [host, p, verifier] of attempts) {
    const params = {
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      redirect_uri: `https://${AUTH_PROXY}/complete`,
      grant_type: "authorization_code",
      ...(verifier ? { code_verifier: verifier } : {}),
    };
    const r = await req("POST", host, p, params, null, true);
    const ok = !!r.body.access_token;
    console.log(`  ${ok ? "✅" : "❌"} ${host}${p}${verifier ? " +PKCE" : ""} → ${r.status}`);
    if (ok) { token = r.body.access_token; break; }
  }

  if (!token) { console.error("❌ Tous les essais ont échoué."); process.exit(1); }

  // Save full token to file (avoids terminal truncation)
  fs.writeFileSync(TOKEN_FILE, token);
  fs.unlinkSync(STATE_FILE);
  console.log("✅ Token sauvegardé.\n");

  await deployRules(token);
}

// ── deploy-with-sa ────────────────────────────────────────────────────────────

async function deployWithServiceAccount() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!saJson) { console.error("FIREBASE_SERVICE_ACCOUNT_JSON manquant."); process.exit(1); }

  const sa  = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  };
  const header    = b64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64"));
  const body      = b64url(Buffer.from(JSON.stringify(payload)).toString("base64"));
  const unsigned  = `${header}.${body}`;
  const sign      = crypto.createSign("SHA256");
  sign.update(unsigned);
  const jwt       = `${unsigned}.${b64url(sign.sign(sa.private_key, "base64"))}`;

  const tokenRes  = await req("POST", "oauth2.googleapis.com", "/token",
    { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }, null, true);

  if (!tokenRes.body.access_token) {
    console.error("❌ SA token error:", JSON.stringify(tokenRes.body)); process.exit(1);
  }
  console.log("✅ Authentifié via Service Account.\n");
  await deployRules(tokenRes.body.access_token);
}

// ── core deploy ───────────────────────────────────────────────────────────────

async function deployRules(token) {
  const content = fs.readFileSync(RULES_FILE, "utf8");

  // 1. Create ruleset
  console.log("📤 Création du ruleset...");
  const rs = await req("POST", "firebaserules.googleapis.com",
    `/v1/projects/${PROJECT_ID}/rulesets`,
    { source: { files: [{ name: "firestore.rules", content }] } },
    token);

  if (rs.status !== 200) {
    console.error("❌ Création ruleset:", JSON.stringify(rs.body, null, 2)); process.exit(1);
  }
  const rulesetName = rs.body.name;
  console.log("   Ruleset créé :", rulesetName);

  // 2. Apply to Firestore release
  // PATCH wraps payload in { release: { ... } } — firebase-tools gcp/rules.js line 141
  // POST (create) does NOT wrap — line 128
  console.log("🔗 Application du ruleset...");
  const releaseName = `projects/${PROJECT_ID}/releases/cloud.firestore`;

  let rel = await req("PATCH", "firebaserules.googleapis.com",
    `/v1/projects/${PROJECT_ID}/releases/cloud.firestore`,
    { release: { name: releaseName, rulesetName } },
    token);

  if (rel.status === 404) {
    console.log("   Release inexistante, création...");
    rel = await req("POST", "firebaserules.googleapis.com",
      `/v1/projects/${PROJECT_ID}/releases`,
      { name: releaseName, rulesetName },
      token);
  }

  if (rel.status !== 200) {
    console.error("❌ Application ruleset:", JSON.stringify(rel.body, null, 2)); process.exit(1);
  }

  console.log("\n🎉 Règles Firestore déployées avec succès !");
  console.log("   Release :", rel.body.name);
  console.log("   Ruleset  :", rel.body.rulesetName, "\n");
}

// ── entry ─────────────────────────────────────────────────────────────────────

const [,, cmd, arg] = process.argv;
if      (cmd === "get-code")    getCode().catch(console.error);
else if (cmd === "exchange")    exchange(arg).catch(console.error);
else if (cmd === "deploy-with-sa") deployWithServiceAccount().catch(console.error);
else if (cmd === "deploy-with-token") {
  if (!fs.existsSync(TOKEN_FILE)) { console.error("Token introuvable. Lance d'abord get-code + exchange."); process.exit(1); }
  const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  deployRules(token).catch(console.error);
}
else { console.log("Usage: node scripts/deploy-rules.mjs [get-code | exchange <code> | deploy-with-sa | deploy-with-token]"); process.exit(1); }
