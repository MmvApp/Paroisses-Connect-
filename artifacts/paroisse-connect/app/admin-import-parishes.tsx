import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, getDocs, setDoc, doc, serverTimestamp } from "firebase/firestore";
import Animated, { FadeInDown } from "react-native-reanimated";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";

// ─── Palette ──────────────────────────────────────────────────────────────────
const DARK   = "#111111";
const GOLD   = "#C9A24A";
const CREAM  = "#FFF8EC";
const BORDER = "#EADFCB";
const MUTED  = "#666666";
const GREEN  = "#16A34A";
const RED    = "#DC2626";

// ─── Diocese mapping ──────────────────────────────────────────────────────────
const DIOCESE_BY_DEPT: Record<string, string> = {
  "01": "Diocèse de Belley-Ars",
  "02": "Diocèse de Soissons",
  "03": "Diocèse de Moulins",
  "04": "Diocèse de Digne",
  "05": "Diocèse de Gap",
  "06": "Diocèse de Nice",
  "07": "Diocèse de Viviers",
  "08": "Diocèse de Reims",
  "09": "Diocèse de Pamiers",
  "10": "Diocèse de Troyes",
  "11": "Diocèse de Carcassonne et Narbonne",
  "12": "Diocèse de Rodez",
  "13": "Diocèse de Marseille",
  "14": "Diocèse de Bayeux-Lisieux",
  "15": "Diocèse de Saint-Flour",
  "16": "Diocèse d'Angoulême",
  "17": "Diocèse de La Rochelle et Saintes",
  "18": "Diocèse de Bourges",
  "19": "Diocèse de Tulle",
  "2A": "Diocèse d'Ajaccio",
  "2B": "Diocèse d'Ajaccio",
  "21": "Diocèse de Dijon",
  "22": "Diocèse de Saint-Brieuc et Tréguier",
  "23": "Diocèse de Limoges",
  "24": "Diocèse de Périgueux et Sarlat",
  "25": "Diocèse de Besançon",
  "26": "Diocèse de Valence",
  "27": "Diocèse d'Évreux",
  "28": "Diocèse de Chartres",
  "29": "Diocèse de Quimper et Léon",
  "30": "Diocèse de Nîmes, Uzès et Alès",
  "31": "Diocèse de Toulouse",
  "32": "Diocèse d'Auch",
  "33": "Diocèse de Bordeaux",
  "34": "Diocèse de Montpellier",
  "35": "Diocèse de Rennes, Dol et Saint-Malo",
  "36": "Diocèse de Bourges",
  "37": "Diocèse de Tours",
  "38": "Diocèse de Grenoble-Vienne",
  "39": "Diocèse de Saint-Claude",
  "40": "Diocèse d'Aire et Dax",
  "41": "Diocèse de Blois",
  "42": "Diocèse de Saint-Étienne",
  "43": "Diocèse du Puy-en-Velay",
  "44": "Diocèse de Nantes",
  "45": "Diocèse d'Orléans",
  "46": "Diocèse de Cahors",
  "47": "Diocèse d'Agen",
  "48": "Diocèse de Mende",
  "49": "Diocèse d'Angers",
  "50": "Diocèse de Coutances et Avranches",
  "51": "Diocèse de Reims",
  "52": "Diocèse de Langres",
  "53": "Diocèse de Laval",
  "54": "Diocèse de Nancy et de Toul",
  "55": "Diocèse de Verdun",
  "56": "Diocèse de Vannes",
  "57": "Diocèse de Metz",
  "58": "Diocèse de Nevers",
  "59": "Diocèse de Lille",
  "60": "Diocèse de Beauvais, Noyon et Senlis",
  "61": "Diocèse de Sées",
  "62": "Diocèse d'Arras",
  "63": "Diocèse de Clermont",
  "64": "Diocèse de Bayonne, Lescar et Oloron",
  "65": "Diocèse de Tarbes et Lourdes",
  "66": "Diocèse de Perpignan-Elne",
  "67": "Diocèse de Strasbourg",
  "68": "Diocèse de Strasbourg",
  "69": "Diocèse de Lyon",
  "70": "Diocèse de Besançon",
  "71": "Diocèse d'Autun",
  "72": "Diocèse du Mans",
  "73": "Diocèse de Chambéry",
  "74": "Diocèse d'Annecy",
  "75": "Diocèse de Paris",
  "76": "Diocèse de Rouen",
  "77": "Diocèse de Meaux",
  "78": "Diocèse de Versailles",
  "79": "Diocèse de Poitiers",
  "80": "Diocèse d'Amiens",
  "81": "Diocèse d'Albi",
  "82": "Diocèse de Montauban",
  "83": "Diocèse de Fréjus-Toulon",
  "84": "Diocèse d'Avignon",
  "85": "Diocèse de Luçon",
  "86": "Diocèse de Poitiers",
  "87": "Diocèse de Limoges",
  "88": "Diocèse de Saint-Dié",
  "89": "Diocèse de Sens-Auxerre",
  "90": "Diocèse de Besançon",
  "91": "Diocèse d'Évry-Corbeil-Essonnes",
  "92": "Diocèse de Nanterre",
  "93": "Diocèse de Saint-Denis",
  "94": "Diocèse de Créteil",
  "95": "Diocèse de Pontoise",
  "971": "Diocèse de Pointe-à-Pitre",
  "972": "Diocèse de Fort-de-France",
  "973": "Diocèse de Cayenne",
  "974": "Diocèse de Saint-Denis de La Réunion",
  "976": "Diocèse de Mayotte",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

type Phase = "idle" | "fetching" | "deduping" | "saving" | "done" | "error";

interface ImportResult {
  added: number;
  skipped: number;
  errors: number;
  total: number;
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function buildOverpassQuery(dept: string): string {
  return `[out:json][timeout:90];
area["ref:INSEE"="${dept}"]["admin_level"="6"]->.dep;
(
  node["amenity"="place_of_worship"]["religion"="christian"]["denomination"="catholic"]["name"](area.dep);
  way["amenity"="place_of_worship"]["religion"="christian"]["denomination"="catholic"]["name"](area.dep);
  relation["amenity"="place_of_worship"]["religion"="christian"]["denomination"="catholic"]["name"](area.dep);
);
out center tags;`;
}

function osmElementToParish(
  el: OsmElement,
  dept: string,
  diocese: string,
) {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat ?? null;
  const lon = el.lon ?? el.center?.lon ?? null;
  const housenumber = t["addr:housenumber"] ?? "";
  const street      = t["addr:street"] ?? "";
  const address     = [housenumber, street].filter(Boolean).join(" ");

  return {
    name:        t["name"] ?? "",
    city:        t["addr:city"] ?? t["addr:hamlet"] ?? t["addr:village"] ?? "",
    address,
    postalCode:  t["addr:postcode"] ?? "",
    department:  dept,
    diocese,
    phone:       t["contact:phone"] ?? t["phone"] ?? "",
    email:       t["contact:email"] ?? t["email"] ?? "",
    website:     t["contact:website"] ?? t["website"] ?? t["url"] ?? "",
    latitude:    lat,
    longitude:   lon,
    osmId:       `osm_${el.type}_${el.id}`,
    source:      "openstreetmap" as const,
    description: "",
    memberCount: 0,
    isClaimed:   false,
    createdAt:   serverTimestamp(),
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function AdminImportParissesScreen() {
  const insets  = useSafeAreaInsets();
  const { profile } = useAuth();
  const { t } = useI18n();

  const [dept,        setDept]        = useState("59");
  const [phase,       setPhase]       = useState<Phase>("idle");
  const [statusText,  setStatusText]  = useState("");
  const [result,      setResult]      = useState<ImportResult | null>(null);
  const [errorMsg,    setErrorMsg]    = useState("");

  const diocese = DIOCESE_BY_DEPT[dept.trim().toUpperCase()] ?? null;
  const canImport = dept.trim().length >= 2 && diocese !== null && phase === "idle";

  const runImport = async () => {
    const deptClean = dept.trim();
    if (!deptClean || !DIOCESE_BY_DEPT[deptClean.toUpperCase()]) return;

    setPhase("fetching");
    setResult(null);
    setErrorMsg("");
    setStatusText("Interrogation d'OpenStreetMap…");

    let elements: OsmElement[] = [];

    try {
      const query = buildOverpassQuery(deptClean);
      const resp = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
      const json = await resp.json() as { elements: OsmElement[] };
      elements = (json.elements ?? []).filter((el) => el.tags?.name);
    } catch (err) {
      setPhase("error");
      setErrorMsg("Impossible de contacter OpenStreetMap. Vérifiez votre connexion et réessayez.");
      return;
    }

    if (elements.length === 0) {
      setPhase("done");
      setResult({ added: 0, skipped: 0, errors: 0, total: 0 });
      return;
    }

    // ── Deduplication ──────────────────────────────────────────────────────
    setPhase("deduping");
    setStatusText("Vérification des doublons…");

    let existingIds: Set<string>;
    try {
      const snap = await getDocs(collection(db, "parishes"));
      existingIds = new Set(snap.docs.map((d) => d.id));
    } catch {
      setPhase("error");
      setErrorMsg("Impossible de lire la base de données. Réessayez.");
      return;
    }

    const toAdd = elements.filter(
      (el) => !existingIds.has(`osm_${el.type}_${el.id}`),
    );
    const skipped = elements.length - toAdd.length;

    if (toAdd.length === 0) {
      setPhase("done");
      setResult({ added: 0, skipped, errors: 0, total: elements.length });
      return;
    }

    // ── Save ───────────────────────────────────────────────────────────────
    setPhase("saving");
    const dio = DIOCESE_BY_DEPT[deptClean.toUpperCase()] ?? "";
    let added  = 0;
    let errors = 0;
    const BATCH = 10;

    for (let i = 0; i < toAdd.length; i += BATCH) {
      const chunk = toAdd.slice(i, i + BATCH);
      setStatusText(`Enregistrement… ${Math.min(i + BATCH, toAdd.length)} / ${toAdd.length}`);

      await Promise.allSettled(
        chunk.map(async (el) => {
          try {
            const data = osmElementToParish(el, deptClean, dio);
            await setDoc(doc(db, "parishes", `osm_${el.type}_${el.id}`), data);
            added++;
          } catch {
            errors++;
          }
        }),
      );
    }

    setPhase("done");
    setResult({ added, skipped, errors, total: elements.length });
  };

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setErrorMsg("");
    setStatusText("");
  };

  const isBusy = phase === "fetching" || phase === "deduping" || phase === "saving";

  return (
    <View style={[s.root, { backgroundColor: "#F9F6F0" }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={DARK} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Importer des paroisses</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Intro */}
        <Animated.View entering={FadeInDown.delay(60).duration(340)} style={[s.card, s.introBanner]}>
          <View style={[s.introIconWrap, { backgroundColor: GOLD + "22" }]}>
            <Feather name="download-cloud" size={22} color={GOLD} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.introTitle}>Import OpenStreetMap</Text>
            <Text style={s.introSub}>
              Importe automatiquement les paroisses catholiques référencées sur OpenStreetMap pour un département donné.
            </Text>
          </View>
        </Animated.View>

        {/* Dept input */}
        <Animated.View entering={FadeInDown.delay(120).duration(340)} style={s.card}>
          <Text style={s.label}>Numéro de département</Text>
          <TextInput
            style={[s.input, !canImport && dept.trim().length > 0 && !diocese ? { borderColor: RED } : null]}
            value={dept}
            onChangeText={(v) => { setDept(v); reset(); }}
            placeholder="Ex. 59"
            placeholderTextColor="#9AA3B0"
            keyboardType="default"
            maxLength={3}
            autoCorrect={false}
            editable={!isBusy}
          />
          {diocese ? (
            <View style={s.dioceseRow}>
              <Feather name="map-pin" size={13} color={GOLD} />
              <Text style={s.dioceseText}>{diocese}</Text>
            </View>
          ) : dept.trim().length >= 2 ? (
            <Text style={s.inputError}>Département inconnu ou non supporté</Text>
          ) : null}
        </Animated.View>

        {/* Action / Status */}
        <Animated.View entering={FadeInDown.delay(180).duration(340)}>
          {isBusy ? (
            <View style={[s.card, s.statusCard]}>
              <ActivityIndicator color={GOLD} size="small" />
              <Text style={s.statusText}>{statusText}</Text>
            </View>
          ) : phase === "error" ? (
            <View style={[s.card, s.errorCard, { borderColor: RED + "44", backgroundColor: RED + "08" }]}>
              <Feather name="alert-circle" size={18} color={RED} />
              <Text style={[s.statusText, { color: RED, flex: 1 }]}>{errorMsg}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.importBtn, { backgroundColor: GOLD, opacity: canImport ? 1 : 0.45 }]}
              onPress={runImport}
              disabled={!canImport}
              activeOpacity={0.85}
            >
              <Feather name="download" size={18} color={DARK} />
              <Text style={s.importBtnText}>
                {t("Importer le département {dept}", { dept: dept.trim() || "…" })}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Results */}
        {phase === "done" && result !== null && (
          <Animated.View entering={FadeInDown.delay(0).duration(380)} style={s.card}>
            <View style={s.resultHeader}>
              <View style={[s.resultIconWrap, { backgroundColor: result.added > 0 ? GREEN + "18" : GOLD + "18" }]}>
                <Feather name={result.added > 0 ? "check-circle" : "info"} size={20} color={result.added > 0 ? GREEN : GOLD} />
              </View>
              <Text style={s.resultTitle}>
                {result.added > 0
                  ? `${result.added} paroisse${result.added > 1 ? "s" : ""} ajoutée${result.added > 1 ? "s" : ""}`
                  : "Aucune nouvelle paroisse"}
              </Text>
            </View>

            <View style={s.resultGrid}>
              <ResultStat value={result.total}   label="Trouvées sur OSM"      color={DARK}  />
              <ResultStat value={result.added}   label="Ajoutées"              color={GREEN} />
              <ResultStat value={result.skipped} label="Doublons ignorés"      color={GOLD}  />
              {result.errors > 0 && (
                <ResultStat value={result.errors} label="Erreurs d'écriture"   color={RED}   />
              )}
            </View>

            {result.added > 0 && (
              <Text style={s.resultHint}>
                Les paroisses importées sont maintenant visibles dans l'onglet Lieux, sur la carte et dans la recherche.
              </Text>
            )}

            <TouchableOpacity style={s.resetBtn} onPress={reset} activeOpacity={0.8}>
              <Text style={s.resetBtnText}>Importer un autre département</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Info note */}
        <View style={[s.note, { borderColor: BORDER, backgroundColor: CREAM }]}>
          <Feather name="info" size={13} color={GOLD} />
          <Text style={s.noteText}>
            Source : OpenStreetMap (licence ODbL). Les données sont contributives et peuvent être incomplètes. Les paroisses importées peuvent être enrichies manuellement.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ResultStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={rs.box}>
      <Text style={[rs.value, { color }]}>{value}</Text>
      <Text style={rs.label}>{label}</Text>
    </View>
  );
}

const rs = StyleSheet.create({
  box:   { flex: 1, alignItems: "center", paddingVertical: 12, gap: 3, borderTopWidth: 2, borderTopColor: BORDER },
  value: { fontSize: 22, fontFamily: "Inter_700Bold" },
  label: { fontSize: 10, fontFamily: "Inter_500Medium", color: MUTED, textAlign: "center" },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1 },
  header:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, backgroundColor: "#FFFFFF" },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: DARK },

  content: { padding: 16, gap: 14 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: BORDER, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 2,
  },

  introBanner: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  introIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 2 },
  introTitle:    { fontSize: 14, fontFamily: "Inter_700Bold", color: DARK },
  introSub:      { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 18 },

  label:      { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DARK, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 },
  input:      { borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 20, fontFamily: "Inter_700Bold", color: DARK, backgroundColor: "#FAFAFA", letterSpacing: 2 },
  dioceseRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  dioceseText:{ fontSize: 13, fontFamily: "Inter_500Medium", color: GOLD },
  inputError: { fontSize: 12, fontFamily: "Inter_400Regular", color: RED, marginTop: 6 },

  statusCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  errorCard:  { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  statusText: { fontSize: 14, fontFamily: "Inter_400Regular", color: MUTED },

  importBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16 },
  importBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: DARK },

  resultHeader:   { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  resultIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  resultTitle:    { fontSize: 16, fontFamily: "Inter_700Bold", color: DARK, flex: 1 },
  resultGrid:     { flexDirection: "row", marginBottom: 14 },
  resultHint:     { fontSize: 12, fontFamily: "Inter_400Regular", color: MUTED, lineHeight: 18, marginBottom: 14 },
  resetBtn:       { borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: CREAM, borderWidth: 1, borderColor: BORDER },
  resetBtnText:   { fontSize: 14, fontFamily: "Inter_600SemiBold", color: DARK },

  note:     { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  noteText: { fontSize: 11, fontFamily: "Inter_400Regular", color: MUTED, flex: 1, lineHeight: 17 },
});
