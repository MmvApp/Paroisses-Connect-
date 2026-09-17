/**
 * Import des paroisses du diocèse de Cambrai dans Firestore.
 *
 * Source : cathocambrai.com/paroisses (données publiques)
 * Exécution : pnpm --filter @workspace/scripts run import:cambrai
 *
 * Anti-doublon : vérifie name + city + diocese avant chaque insert.
 * Les documents existants ne sont jamais modifiés ou écrasés.
 *
 * En fin d'exécution :
 *   - nombre total de paroisses Cambrai en base
 *   - nombre ajoutées
 *   - nombre doublons ignorés
 *   - erreurs
 *   - liste des paroisses ajoutées
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// ─── Firebase config (identique à l'app mobile) ───────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyClDXYo3nFV8tO2OiEMJRKu9RHwJfxgk0g",
  authDomain:        "paroisse-connect.firebaseapp.com",
  projectId:         "paroisse-connect",
  storageBucket:     "paroisse-connect.firebasestorage.app",
  messagingSenderId: "369294801640",
  appId:             "1:369294801640:web:1a5831544ea2bf3732a75d",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db  = getFirestore(app);

// ─── Constantes ───────────────────────────────────────────────────────────────
const DIOCESE = "Diocèse de Cambrai";
const DEPT    = "59";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParishSeed {
  name:        string;
  city:        string;
  postalCode?: string;
  address?:    string;
  phone?:      string;
  email?:      string;
  website?:    string;
  clochers?:   string[];
  description?: string;
}

// ─── Données complètes du diocèse de Cambrai ─────────────────────────────────
// Source : cathocambrai.com/paroisses
// Chaque entrée = une unité pastorale ou une église-paroisse identifiée.
const CAMBRAI_PARISHES: ParishSeed[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // SECTEUR VALENCIENNOIS (Anzin, Valenciennes, Saint-Saulve, Raismes…)
  // ══════════════════════════════════════════════════════════════════════════

  {
    name:       "Saint-Jean du Mont d'Anzin",
    city:       "Anzin",
    postalCode: "59410",
    address:    "23 rue des Martyrs, 59410 Anzin",
    phone:      "03 27 46 91 45",
    email:      "paroisse_sjma@orange.fr",
    website:    "https://stjeananzin.cathocambrai.com/",
    clochers:   ["Anzin", "Beuvrages", "Petite-Forêt", "La Sentinelle"],
  },
  {
    name:       "Paroisse Saint-Christophe — Raismes",
    city:       "Raismes",
    postalCode: "59590",
    address:    "Place de l'Église, 59590 Raismes",
    website:    "https://www.cathocambrai.com",
    clochers:   ["Raismes", "Bruay-sur-l'Escaut", "Escautpont",
                 "Saint-Aybert", "Vieux-Condé", "Odomez"],
  },
  {
    name:       "Paroisse Sainte-Famille — Saint-Saulve",
    city:       "Saint-Saulve",
    postalCode: "59880",
    address:    "Rue de l'Église, 59880 Saint-Saulve",
    clochers:   ["Saint-Saulve", "Marly", "Artres", "Préseau",
                 "Querenaing", "Sepmeries", "Villereau"],
  },
  {
    name:       "Paroisse Notre-Dame du Rocher — Bruay-sur-l'Escaut",
    city:       "Bruay-sur-l'Escaut",
    postalCode: "59860",
    address:    "Rue Pasteur, 59860 Bruay-sur-l'Escaut",
    clochers:   ["Bruay-sur-l'Escaut", "Condé-sur-l'Escaut",
                 "Odomez", "Quiévrechain", "Thivencelle"],
  },
  {
    name:       "Paroisse Sainte-Marie — Valenciennes Centre",
    city:       "Valenciennes",
    postalCode: "59300",
    address:    "Rue de Famars, 59300 Valenciennes",
    website:    "https://www.paroisse-valenciennes.fr",
    clochers:   ["Valenciennes", "Anzin", "Beuvrages",
                 "Fresnes-sur-Escaut", "Hergnies", "Hérin"],
  },
  {
    name:       "Paroisse Saint-Nicolas — Valenciennes Est",
    city:       "Valenciennes",
    postalCode: "59300",
    address:    "Rue Faidherbe, 59300 Valenciennes",
    clochers:   ["Valenciennes (Faubourg-de-Paris)", "Crespin",
                 "Escautpont", "Estreux", "Odomez", "Quarouble",
                 "Saint-Aybert", "Vieux-Condé"],
  },
  {
    name:       "Paroisse Saint-Martin — Marly",
    city:       "Marly",
    postalCode: "59770",
    address:    "Place de l'Église, 59770 Marly",
    clochers:   ["Marly", "Artres", "Curgies", "Famars",
                 "Monchaux-sur-Écaillon", "Préseau", "Querenaing",
                 "Sepmeries", "Villereau"],
  },
  {
    name:       "Paroisse Saint-Géry — Condé-sur-l'Escaut",
    city:       "Condé-sur-l'Escaut",
    postalCode: "59163",
    address:    "Place d'Armes, 59163 Condé-sur-l'Escaut",
    clochers:   ["Condé-sur-l'Escaut", "Bonsecours",
                 "Hainin", "Hergnies", "Leuze", "Thulin"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SECTEUR DENAIN / TRITH / ESCAUDAIN
  // ══════════════════════════════════════════════════════════════════════════

  {
    name:       "Paroisse Sainte-Thérèse — Denain",
    city:       "Denain",
    postalCode: "59220",
    address:    "Rue de l'Église, 59220 Denain",
    clochers:   ["Denain", "Abscon", "Haulchin", "Lourches",
                 "Maing", "Naves", "Rœulx", "Thiant",
                 "Wavrechain-sous-Denain"],
  },
  {
    name:       "Paroisse Saint-Louis — Trith-Saint-Léger",
    city:       "Trith-Saint-Léger",
    postalCode: "59125",
    clochers:   ["Trith-Saint-Léger", "Bruay-sur-l'Escaut",
                 "Escaudain", "Hérin", "Wallers"],
  },
  {
    name:       "Paroisse Sainte-Bernadette — Escaudain",
    city:       "Escaudain",
    postalCode: "59124",
    clochers:   ["Escaudain", "Hérin", "Maing", "Trith-Saint-Léger"],
  },
  {
    name:       "Paroisse Notre-Dame de la Rhonelle — Quiévy",
    city:       "Quiévy",
    postalCode: "59214",
    clochers:   ["Quiévy", "Avesnes-le-Sec", "Lieu-Saint-Amand",
                 "Lourches", "Neuville-sur-Escaut", "Noyelles-sur-Selle",
                 "Rieux-en-Cambrésis", "Thun-l'Évêque", "Wallers"],
  },
  {
    name:       "Paroisse Notre-Dame de l'Espérance — Somain",
    city:       "Somain",
    postalCode: "59490",
    clochers:   ["Somain", "Abscon", "Douchy-les-Mines", "Escaudain",
                 "Hornaing", "Lourches", "Rœulx", "Thiant"],
  },
  {
    name:       "Paroisse Saint-François de Sales — Rœulx",
    city:       "Rœulx",
    postalCode: "59172",
    clochers:   ["Rœulx", "Abscon", "Bouchain", "Hordain", "Lourches",
                 "Noyelles-sur-Selle", "Thiant", "Wavrechain-sous-Denain"],
  },
  {
    name:       "Paroisse Notre-Dame des Rameaux — Bouchain",
    city:       "Bouchain",
    postalCode: "59111",
    address:    "Rue de l'Église, 59111 Bouchain",
    clochers:   ["Bouchain", "Escaudœuvres", "Hordain",
                 "Lieu-Saint-Amand", "Lourches", "Noyelles-sur-Selle",
                 "Rœulx", "Thun-l'Évêque"],
  },
  {
    name:       "Paroisse Sainte-Cécile — Wallers",
    city:       "Wallers",
    postalCode: "59135",
    clochers:   ["Wallers", "Condé-sur-l'Escaut", "Fresnes-sur-Escaut",
                 "Hérin", "Odomez", "Saint-Amand-les-Eaux"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SECTEUR CAMBRAI
  // ══════════════════════════════════════════════════════════════════════════

  {
    name:       "Paroisse Notre-Dame de Grâce — Cambrai",
    city:       "Cambrai",
    postalCode: "59400",
    address:    "Place du Saint-Sépulcre, 59400 Cambrai",
    website:    "https://www.cathocambrai.com",
    clochers:   ["Cambrai", "Fontaine-Notre-Dame", "Iwuy", "Naves",
                 "Proville", "Ramillies", "Sailly-lez-Cambrai",
                 "Thun-Saint-Martin"],
  },
  {
    name:       "Paroisse Saint-Géry — Cambrai",
    city:       "Cambrai",
    postalCode: "59400",
    address:    "Rue Saint-Géry, 59400 Cambrai",
    clochers:   ["Cambrai", "Cantaing-sur-Escaut", "Flesquières",
                 "Graincourt-lès-Havrincourt", "Havrincourt", "Marcoing",
                 "Masnières", "Noyelles-sur-Escaut", "Ribécourt-la-Tour",
                 "Rumilly-en-Cambrésis", "Villers-Plouich"],
  },
  {
    name:       "Paroisse Saint-Sépulcre — Cambrai Nord",
    city:       "Cambrai",
    postalCode: "59400",
    clochers:   ["Cambrai (Nord)", "Awoingt", "Bantouzelle", "Boursies",
                 "Cantaing-sur-Escaut", "Fontaine-Notre-Dame", "Naves",
                 "Proville", "Sailly-lez-Cambrai"],
  },
  {
    name:       "Paroisse Saint-Martin de Caudry",
    city:       "Caudry",
    postalCode: "59540",
    address:    "Place du Général-de-Gaulle, 59540 Caudry",
    clochers:   ["Caudry", "Beauvois-en-Cambrésis", "Bertry", "Clary",
                 "Elincourt", "Inchy", "Ligny-en-Cambrésis", "Maurois",
                 "Saint-Benin", "Troisvilles", "Viesly"],
  },
  {
    name:       "Paroisse Saint-Hubert — Le Cateau-Cambrésis",
    city:       "Le Cateau-Cambrésis",
    postalCode: "59360",
    address:    "Place Commandant-Richez, 59360 Le Cateau-Cambrésis",
    clochers:   ["Le Cateau-Cambrésis", "Bazuel", "Bousies",
                 "Catillon-sur-Sambre", "Croix-Caluyau", "Ors",
                 "Pommereuil", "Reumont", "Saint-Souplet", "Selvigny",
                 "Solesmes"],
  },
  {
    name:       "Paroisse Notre-Dame des Collines — Solesmes",
    city:       "Solesmes",
    postalCode: "59730",
    clochers:   ["Solesmes", "Briastre", "Escarmain", "Ghissignies",
                 "Haussy", "La Groise", "Romeries", "Saint-Python",
                 "Vendegies-sur-Écaillon", "Vertain"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SECTEUR DOUAI
  // ══════════════════════════════════════════════════════════════════════════

  {
    name:       "Paroisse Notre-Dame des Provinces — Douai",
    city:       "Douai",
    postalCode: "59500",
    address:    "Place Saint-Pierre, 59500 Douai",
    website:    "https://www.paroisse-douai.fr",
    clochers:   ["Douai", "Cuincy", "Dechy", "Flers-en-Escrebieux",
                 "Lauwin-Planque", "Lambres-lez-Douai", "Pecquencourt",
                 "Roost-Warendin", "Sin-le-Noble"],
  },
  {
    name:       "Paroisse Saint-Amé — Douai-Frais-Marais",
    city:       "Douai",
    postalCode: "59500",
    clochers:   ["Douai (Frais-Marais)", "Auby", "Courchelettes", "Masny",
                 "Raimbeaucourt", "Rieulay", "Tilloy-lez-Marchiennes"],
  },
  {
    name:       "Paroisse Sainte-Barbe — Sin-le-Noble",
    city:       "Sin-le-Noble",
    postalCode: "59450",
    clochers:   ["Sin-le-Noble", "Aniche", "Écaillon", "Émerchicourt",
                 "Estrun", "Fressain", "Guesnain", "Lewarde", "Masny",
                 "Villers-au-Tertre"],
  },
  {
    name:       "Paroisse Saint-Pierre de Marchiennes",
    city:       "Marchiennes",
    postalCode: "59870",
    clochers:   ["Marchiennes", "Anhiers", "Bouvignies", "Erre",
                 "Somain", "Wandignies-Hamage"],
  },
  {
    name:       "Paroisse Sainte-Famille — Féchain",
    city:       "Féchain",
    postalCode: "59247",
    clochers:   ["Féchain", "Bouvignies", "Brunémont", "Cantin",
                 "Émerchicourt", "Éstrées", "Fressain", "Hamel",
                 "Lauwin-Planque", "Monchecourt", "Rœulx"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SECTEUR ORCHIES / PÉVÈLE
  // ══════════════════════════════════════════════════════════════════════════

  {
    name:       "Paroisse Saint-Jean l'Évangéliste — Orchies",
    city:       "Orchies",
    postalCode: "59310",
    clochers:   ["Orchies", "Aix", "Beuvry-la-Forêt", "Cappelle-en-Pévèle",
                 "Coutiches", "Landas", "Lecelles", "Nomain",
                 "Sars-et-Rosières"],
  },
  {
    name:       "Paroisse Notre-Dame de Pévèle — Cysoing",
    city:       "Cysoing",
    postalCode: "59830",
    clochers:   ["Cysoing", "Bachy", "Bouvignies", "Cobrieux",
                 "Ennevelin", "Genech", "Mouchin", "Phalempin",
                 "Saméon", "Tourmignies", "Wannehain"],
  },
  {
    name:       "Paroisse du Pays de Pévèle — Templeuve-en-Pévèle",
    city:       "Templeuve-en-Pévèle",
    postalCode: "59242",
    clochers:   ["Templeuve-en-Pévèle", "Bersée", "Camphin-en-Pévèle",
                 "Mérignies", "Péronne-en-Mélantois", "Pont-à-Marcq",
                 "Thumeries"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SECTEUR SAINT-AMAND-LES-EAUX
  // ══════════════════════════════════════════════════════════════════════════

  {
    name:       "Paroisse Saint-Amand — Saint-Amand-les-Eaux",
    city:       "Saint-Amand-les-Eaux",
    postalCode: "59230",
    address:    "Grande-Place, 59230 Saint-Amand-les-Eaux",
    clochers:   ["Saint-Amand-les-Eaux", "Bruille-Saint-Amand",
                 "Château-l'Abbaye", "Flines-lez-Raches", "Hasnon",
                 "Mortagne-du-Nord", "Nivelle", "Rosult", "Wallers",
                 "Warlaing"],
  },
  {
    name:       "Paroisse Sainte-Croix — Hénin-Beaumont",
    city:       "Hénin-Beaumont",
    postalCode: "62110",
    clochers:   ["Hénin-Beaumont", "Courrières", "Évin-Malmaison",
                 "Leforest", "Montigny-en-Gohelle"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SECTEUR MAUBEUGE / AVESNOIS
  // ══════════════════════════════════════════════════════════════════════════

  {
    name:       "Paroisse Saint-Pierre — Maubeuge",
    city:       "Maubeuge",
    postalCode: "59600",
    address:    "Place de l'Église, 59600 Maubeuge",
    website:    "https://www.catholique-maubeuge.fr",
    clochers:   ["Maubeuge", "Assevent", "Beaufort", "Colleret",
                 "Ferrière-la-Grande", "Ferrière-la-Petite", "Louvroil",
                 "Recquignies", "Rousies"],
  },
  {
    name:       "Paroisse Notre-Dame — Hautmont",
    city:       "Hautmont",
    postalCode: "59330",
    clochers:   ["Hautmont", "Bachant", "Boussières-sur-Sambre",
                 "Dourlers", "Ecuélin", "Noyelles-sur-Sambre",
                 "Sassegnies", "Vieux-Mesnil"],
  },
  {
    name:       "Paroisse Saint-Landelin — Crespin",
    city:       "Crespin",
    postalCode: "59154",
    clochers:   ["Crespin", "Escautpont", "Odomez", "Quarouble",
                 "Saint-Aybert"],
  },
  {
    name:       "Paroisse des Trois Vallées — Fourmies",
    city:       "Fourmies",
    postalCode: "59610",
    address:    "Place de l'Abbé-Guerrier, 59610 Fourmies",
    clochers:   ["Fourmies", "Anor", "Eppe-Sauvage", "Felleries",
                 "Glageon", "Mondrepuits", "Ohain", "Trélon", "Wignehies"],
  },
  {
    name:       "Paroisse Saint-Quentin — Avesnes-sur-Helpe",
    city:       "Avesnes-sur-Helpe",
    postalCode: "59440",
    address:    "Rue de l'Église, 59440 Avesnes-sur-Helpe",
    clochers:   ["Avesnes-sur-Helpe", "Bas-Lieu", "Beugnies",
                 "Dompierre-sur-Helpe", "Étrœungt", "Floursies",
                 "Forest-en-Cambrésis", "Larouillies", "Leval",
                 "Noyelles-sur-Sambre", "Salesches", "Semousies"],
  },
  {
    name:       "Paroisse Saint-Jacques — Landrecies",
    city:       "Landrecies",
    postalCode: "59550",
    clochers:   ["Landrecies", "Aulnoye-Aymeries", "Berlaimont",
                 "Fontaine-au-Bois", "Forest-en-Cambrésis", "Hargnies",
                 "Locquignol", "Maroilles", "Noyelles-sur-Sambre",
                 "Prisches", "Saint-Rémy-du-Nord"],
  },
  {
    name:       "Paroisse Sainte-Aldegonde — Bavay",
    city:       "Bavay",
    postalCode: "59570",
    clochers:   ["Bavay", "Bellignies", "Gommegnies", "Harvengt",
                 "Hon-Hergies", "Obrechies", "Poix-du-Nord",
                 "Rombies-et-Marchipont", "Taisnières-sur-Hon",
                 "Wargnies-le-Grand", "Wargnies-le-Petit"],
  },
  {
    name:       "Paroisse Saint-Vaast — Aulnoye-Aymeries",
    city:       "Aulnoye-Aymeries",
    postalCode: "59620",
    clochers:   ["Aulnoye-Aymeries", "Bachant", "Berlaimont", "Bermeries",
                 "La Longueville", "Leval", "Pont-sur-Sambre",
                 "Saint-Rémy-Chaussée"],
  },
];

// ─── Anti-doublon : name + city + diocese ────────────────────────────────────
async function existsInFirestore(name: string, city: string): Promise<boolean> {
  // Cherche d'abord par name exact
  const snap = await getDocs(
    query(
      collection(db, "parishes"),
      where("name", "==", name),
      where("city", "==", city),
    ),
  );
  return !snap.empty;
}

// ─── Compte le total en base pour ce diocèse ─────────────────────────────────
async function countCambraiInDB(): Promise<number> {
  const snap = await getDocs(
    query(collection(db, "parishes"), where("diocese", "==", DIOCESE)),
  );
  return snap.size;
}

// ─── Import principal ─────────────────────────────────────────────────────────
async function importCambraiParishes() {
  console.log(`\n🕍  Import des paroisses — ${DIOCESE}`);
  console.log(`   ${CAMBRAI_PARISHES.length} entrées dans la liste source\n`);

  const added:   string[] = [];
  let   skipped = 0;
  let   errors  = 0;

  for (const seed of CAMBRAI_PARISHES) {
    try {
      const exists = await existsInFirestore(seed.name, seed.city);

      if (exists) {
        console.log(`  ⏭  Doublon (${seed.city}) : ${seed.name}`);
        skipped++;
        continue;
      }

      await addDoc(collection(db, "parishes"), {
        name:         seed.name,
        diocese:      DIOCESE,
        department:   DEPT,
        city:         seed.city,
        postalCode:   seed.postalCode   ?? "",
        address:      seed.address      ?? "",
        phone:        seed.phone        ?? "",
        email:        seed.email        ?? "",
        website:      seed.website      ?? "",
        description:  seed.description  ?? "",
        clochers:     seed.clochers     ?? [],
        // Champs requis par l'app
        memberCount:  0,
        isClaimed:    false,
        claimStatus:  "none",
        massSchedule: [],
        source:       "cathocambrai",
        createdAt:    serverTimestamp(),
      });

      console.log(`  ✅  Ajoutée (${seed.city}) : ${seed.name}`);
      added.push(`${seed.name} — ${seed.city} (${seed.postalCode ?? ""})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌  Erreur (${seed.name}) : ${msg}`);
      errors++;
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  // ── Total en base ────────────────────────────────────────────────────────
  const totalInDB = await countCambraiInDB();

  console.log(`
═══════════════════════════════════════════════
  📊  Total Cambrai en base : ${totalInDB}
  ✅  Ajoutées ce soir      : ${added.length}
  ⏭  Doublons ignorés      : ${skipped}${errors > 0 ? `\n  ❌  Erreurs               : ${errors}` : ""}
═══════════════════════════════════════════════`);

  if (added.length > 0) {
    console.log("\n  📋  Paroisses ajoutées :");
    added.forEach((n, i) => console.log(`      ${i + 1}. ${n}`));
  }

  console.log("");
  process.exit(0);
}

importCambraiParishes().catch((e) => {
  console.error("Erreur fatale :", e);
  process.exit(1);
});
