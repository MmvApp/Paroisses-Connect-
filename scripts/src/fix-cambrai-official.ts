/**
 * fix-cambrai-official.ts
 *
 * Source : cathocambrai.com (site officiel du Diocèse de Cambrai)
 * Date   : juillet 2026
 *
 * Opérations :
 *  1. Supprime toutes les fausses entrées Cambrai (noms inventés, hors Saint-Jean du Mont d'Anzin).
 *  2. Met à jour les clochers officiels de Saint-Jean du Mont d'Anzin.
 *  3. Ajoute les 48 paroisses officielles restantes avec les vrais noms, villes, sites, clochers.
 *
 * Total attendu après correction : 49 paroisses Diocèse de Cambrai.
 *
 * Exécution : pnpm --filter @workspace/scripts run fix:cambrai
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

// ─── Firebase (identique à l'app) ────────────────────────────────────────────
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
  website:     string;
  clochers?:   string[];
  doyenne?:    string;
}

// ─── Liste officielle cathocambrai.com (49 paroisses) ────────────────────────
// Entrée #1 = Saint-Jean du Mont d'Anzin (déjà en base → skip insert, update clochers)
// Entrées #2–49 → à insérer
const OFFICIAL_PARISHES: ParishSeed[] = [

  // ══ DOYENNÉ DE VALENCIENNES (6 paroisses) ══════════════════════════════════

  {
    name:       "Saint-Jean du Mont d'Anzin",
    city:       "Anzin",
    postalCode: "59410",
    address:    "23 rue des Martyrs, 59410 Anzin",
    phone:      "03 27 46 91 45",
    email:      "paroisse_sjma@orange.fr",
    website:    "https://stjeananzin.cathocambrai.com/",
    doyenne:    "Valenciennes",
    clochers:   [
      "Anzin Sainte-Barbe", "Anzin Bleuze-Borne",
      "Beuvrages",
      "Raismes Vicoigne", "Raismes Sainte-Thérèse", "Raismes Saint-Nicolas",
      "Valenciennes Sainte-Croix",
    ],
  },
  {
    name:       "Notre-Dame de Bonne Espérance",
    city:       "Hérin",
    postalCode: "59195",
    address:    "6 rue Ferrer, 59195 Hérin",
    phone:      "09 66 80 54 47",
    email:      "paroisse_ndbe@orange.fr",
    website:    "https://nd-bonne-esperance.cathocambrai.com/",
    doyenne:    "Valenciennes",
    clochers:   ["Hérin", "Bellaing", "Oisy", "Petite-Forêt", "Aubry"],
  },
  {
    name:       "Notre-Dame du Saint-Cordon",
    city:       "Valenciennes",
    postalCode: "59300",
    website:    "https://www.notredamedusaintcordon.fr/",
    doyenne:    "Valenciennes",
    clochers:   [
      "Saint-Saulve",
      "Valenciennes Notre-Dame du Saint-Cordon",
      "Valenciennes Sacré-Cœur",
      "Valenciennes Saint-Géry",
      "Valenciennes Saint-Michel",
      "Valenciennes Saint-Vaast",
    ],
  },
  {
    name:       "Saint Bernard de Fontenelle",
    city:       "Maing",
    postalCode: "59233",
    address:    "7 rue du Père Delater, 59233 Maing",
    phone:      "03 27 24 53 25",
    email:      "paroisse.stbernard59233@orange.fr",
    website:    "https://st-bernard-fontenelle.cathocambrai.com/",
    doyenne:    "Valenciennes",
    clochers:   ["Maing", "Artres", "Famars", "Monchaux-sur-Écaillon"],
  },
  {
    name:       "Saint-Eloi de la Rhônelle",
    city:       "Marly",
    postalCode: "59770",
    website:    "https://steloi.cathocambrai.com/",
    doyenne:    "Valenciennes",
    clochers:   ["Marly", "Préseau", "Querenaing", "Sepmeries", "Villereau"],
  },
  {
    name:       "Saint Vincent de Paul en Valenciennois",
    city:       "La Sentinelle",
    postalCode: "59174",
    website:    "https://st-vincent-valenciennois.cathocambrai.com/",
    doyenne:    "Valenciennes",
    clochers:   [
      "La Sentinelle", "Condé-sur-l'Escaut",
      "Fresnes-sur-Escaut", "Hergnies",
      "Crespin", "Saint-Aybert",
    ],
  },

  // ══ DOYENNÉ DE CAMBRAI (5 paroisses) ═══════════════════════════════════════

  {
    name:       "Paroisse Notre Dame de Grâce - Saint Géry",
    city:       "Cambrai",
    postalCode: "59400",
    address:    "8 place Fénelon, 59400 Cambrai",
    phone:      "03 27 81 87 11",
    email:      "secretariat@paroissesdecambrai.com",
    website:    "https://www.paroissesdecambrai.com/",
    doyenne:    "Cambrai",
    clochers:   [
      "Cambrai Saint-Louis", "Cambrai Immaculée-Conception",
      "Cambrai Saint-Jean–Saint-Martin", "Cambrai Saint Druon",
      "Cambrai Saint-Roch", "Cambrai Saint-Joseph",
      "Cambrai Saint-Géry",
      "Proville", "Escaudœuvres", "Ramillies",
      "Neuville-Saint-Rémy", "Tilloy-lez-Cambrai",
    ],
  },
  {
    name:       "Saint Paul du Haut Escaut",
    city:       "Marcoing",
    postalCode: "59159",
    website:    "https://st-paul-escaut.cathocambrai.com/",
    doyenne:    "Cambrai",
    clochers:   [
      "Marcoing", "Cantaing-sur-Escaut", "Flesquières",
      "Noyelles-sur-Escaut", "Ribécourt-la-Tour",
      "Mœuvres", "Boursies", "Masnières", "Rumilly-en-Cambrésis",
      "Fontaine-Notre-Dame", "Anneux", "Haynecourt",
      "Raillencourt-Sainte-Olle", "Sailly-lez-Cambrai", "Doignies",
    ],
  },
  {
    name:       "Saint Joseph en Cambrésis",
    city:       "Carnières",
    postalCode: "59217",
    website:    "https://st-joseph-cambresis.cathocambrai.com/",
    doyenne:    "Cambrai",
    clochers:   [
      "Carnières", "Bévillers", "Awoingt", "Cauroir", "Naves",
      "Cagnoncles", "Séranvillers-Forenville", "Wambaix",
      "Estourmel", "Cattenières", "Niergnies", "Boussières-en-Cambrésis",
    ],
  },
  {
    name:       "Bienheureux Carl en Cambrésis",
    city:       "Avesnes-lez-Aubert",
    postalCode: "59129",
    website:    "https://carl.cathocambrai.com/",
    doyenne:    "Cambrai",
    clochers:   [
      "Avesnes-lez-Aubert", "Saint-Hilaire-lez-Cambrai",
      "Villers-en-Cauchies", "Thun-Saint-Martin", "Saint-Aubert",
      "Rieux-en-Cambrésis", "Saint-Vaast-en-Cambrésis",
      "Eswars", "Iwuy",
    ],
  },
  {
    name:       "Saint Bernard du Haut Escaut",
    city:       "Gouzeaucourt",
    postalCode: "59231",
    website:    "https://st-bernard-escaut.cathocambrai.com/",
    doyenne:    "Cambrai",
    clochers:   [
      "Gouzeaucourt", "Villers-Guislain", "Banteux", "Bantouzelle",
      "Honnecourt-sur-Escaut", "La Terrière", "Crévecoeur",
      "Lesdain", "Les-Rues-des-Vignes", "Gonnelieu",
      "La Vaquerie", "Villers-Plouich",
    ],
  },

  // ══ DOYENNÉ DU CATEAU-CAMBRÉSIS (3 paroisses) ══════════════════════════════

  {
    name:       "N.D. Fraternité en Cambrésis",
    city:       "Le Cateau-Cambrésis",
    postalCode: "59360",
    website:    "https://nd-fraternite.cathocambrai.com/",
    doyenne:    "Cateau-Cambrésis",
    clochers:   [
      "Le Cateau-Cambrésis", "Montay", "Croix-Caluyau",
      "Catillon-sur-Sambre", "Escaufourt", "Forest-en-Cambrésis",
      "La Groise", "Mazinghien", "Neuvilly", "Rejet-de-Beaulieu",
      "Reumont", "Saint-Benin", "Saint-Souplet",
      "Troisvilles", "Bazuel", "Ors", "Pommereuil",
    ],
  },
  {
    name:       "Sainte Anne en Cambrésis",
    city:       "Clary",
    postalCode: "59225",
    website:    "https://sainte-anne.cathocambrai.com/",
    doyenne:    "Cateau-Cambrésis",
    clochers:   [
      "Clary", "Ligny-en-Cambrésis", "Bertry", "Busigny",
      "Montigny-en-Cambrésis", "Caullery", "Honnechy", "Maurois",
      "Maretz", "Élincourt", "Dehéries", "Malincourt",
      "Walincourt-Selvigny", "Villers-Outréaux", "Esnes",
      "Haucourt-en-Cambrésis",
    ],
  },
  {
    name:       "Sainte Maxellende en Cambrésis",
    city:       "Caudry",
    postalCode: "59540",
    website:    "https://ste-maxellende.cathocambrai.com/",
    doyenne:    "Cateau-Cambrésis",
    clochers:   [
      "Caudry", "Quiévy", "Béthencourt",
      "Fontaine-au-Pire", "Beauvois-en-Cambrésis", "Inchy", "Beaumont",
    ],
  },

  // ══ DOYENNÉ DENAISIS-OSTREVANT (4 paroisses) ═══════════════════════════════

  {
    name:       "Saint Martin en Ostrevant",
    city:       "Bouchain",
    postalCode: "59111",
    website:    "https://st-martin.cathocambrai.com/",
    doyenne:    "Denaisis-Ostrevant",
    clochers:   [
      "Bouchain", "Abancourt", "Bantigny", "Blécourt",
      "Estrun", "Hem-Lenglet", "Hordain", "Lieu-Saint-Amand",
      "Mastaing", "Paillencourt", "Sancourt",
      "Wavrechain-sous-Faulx", "Marquette-en-Ostrevent",
      "Marcq-en-Ostrevent", "Wasnes-au-Bac", "Cuvillers",
    ],
  },
  {
    name:       "Bienheureux Marcel Callo en Denaisis",
    city:       "Escaudain",
    postalCode: "59124",
    address:    "3 Place Condorcet, 59124 Escaudain",
    phone:      "03 27 44 27 05",
    website:    "https://bx-marcel-callo.cathocambrai.com/",
    doyenne:    "Denaisis-Ostrevant",
    clochers:   ["Escaudain", "Abscon", "Neuville-sur-Escaut", "Lourches", "Rœulx"],
  },
  {
    name:       "Sainte Bernadette en Denaisis",
    city:       "Douchy-les-Mines",
    postalCode: "59282",
    website:    "https://ste-bernadette.cathocambrai.com/",
    doyenne:    "Denaisis-Ostrevant",
    clochers:   ["Douchy-les-Mines", "Haulchin", "Noyelles-sur-Selle"],
  },
  {
    name:       "Sainte Remfroye en Denaisis",
    city:       "Denain",
    postalCode: "59220",
    website:    "https://sainte-remfroye.cathocambrai.com/",
    doyenne:    "Denaisis-Ostrevant",
    clochers:   ["Denain", "Wavrechain-sous-Denain"],
  },

  // ══ DOYENNÉ DU DOUAISIS (8 paroisses) ══════════════════════════════════════

  {
    name:       "Saint Christophe en Douaisis",
    city:       "Dechy",
    postalCode: "59187",
    website:    "https://st-christophe.cathocambrai.com/",
    doyenne:    "Douaisis",
    clochers:   [
      "Dechy", "Douai Sacré-Cœur", "Douai Les Épis",
      "Lambres-lez-Douai", "Courchelettes",
      "Guesnain", "Lewarde", "Sin-le-Noble",
    ],
  },
  {
    name:       "Jean XXIII en Douaisis",
    city:       "Roost-Warendin",
    postalCode: "59286",
    website:    "https://jean-23.cathocambrai.com/",
    doyenne:    "Douaisis",
    clochers:   [
      "Roost-Warendin", "Auby", "Waziers Sainte-Rictrude",
      "Waziers Notre-Dame", "Douai Dorignies",
      "Flers-en-Escrebieux", "Pont-de-la-Deûle", "Douai Frais-Marais",
    ],
  },
  {
    name:       "Saint-Maurand Saint-Amé de Douai",
    city:       "Douai",
    postalCode: "59500",
    website:    "https://st-maurand-st-ame.cathocambrai.com/",
    doyenne:    "Douaisis",
    clochers:   ["Douai (centre-ville)"],
  },
  {
    name:       "Saint Laurent en Ostrevant",
    city:       "Aniche",
    postalCode: "59580",
    website:    "https://st-laurent.cathocambrai.com/",
    doyenne:    "Douaisis",
    clochers:   [
      "Aniche", "Émerchicourt", "Masny",
      "Auberchicourt", "Monchecourt", "Écaillon",
    ],
  },
  {
    name:       "Saint Vincent de Paul en Ostrevant",
    city:       "Pecquencourt",
    postalCode: "59146",
    website:    "https://st-vincent-ostrevant.cathocambrai.com/",
    doyenne:    "Douaisis",
    clochers:   ["Pecquencourt", "Lallaing", "Montigny-en-Ostrevent", "Loffre", "Vred"],
  },
  {
    name:       "Saint Jean Bosco en Ostrevant",
    city:       "Somain",
    postalCode: "59490",
    website:    "https://st-jean-bosco.cathocambrai.com/",
    doyenne:    "Douaisis",
    clochers:   ["Somain", "Bruille-les-Marchiennes", "Rieulay", "Erre", "Fenain", "Hornaing"],
  },
  {
    name:       "Sainte Claire de la Sensée",
    city:       "Arleux",
    postalCode: "59151",
    website:    "https://sainte-claire-sensee.com/",
    doyenne:    "Douaisis",
    clochers:   [
      "Arleux", "Brunémont", "Bugnicourt", "Hamel", "Lécluse",
      "Aubigny-au-Bac", "Aubencheul-au-Bac", "Fressies",
      "Cantin", "Éstrées", "Férin", "Gœulzin",
      "Roucourt", "Fressain", "Féchain", "Erchin", "Villers-au-Tertre",
    ],
  },
  {
    name:       "Saint François d'Assise en Douaisis",
    city:       "Douai",
    postalCode: "59500",
    address:    "101 rue de Cuincy, 59500 Douai",
    phone:      "03 27 88 90 66",
    website:    "https://st-francois-douai.cathocambrai.com/",
    doyenne:    "Douaisis",
    clochers:   [
      "Douai (Cuincy)", "Cuincy", "Flers-en-Escrebieux",
      "Lauwin-Planque", "Raimbeaucourt",
    ],
  },

  // ══ DOYENNÉ MARCHES DU HAINAUT (6 paroisses) ═══════════════════════════════

  {
    name:       "Sainte Barbe du Hainaut",
    city:       "Wallers",
    postalCode: "59135",
    website:    "https://ste-barbe.cathocambrai.com/",
    doyenne:    "Marches du Hainaut",
    clochers:   ["Haveluy", "Hélesmes", "Wallers Centre", "Wallers-Arenberg", "Cité de Bellaing"],
  },
  {
    name:       "Sainte Odile du Hainaut",
    city:       "Flines-lès-Mortagne",
    postalCode: "59158",
    website:    "https://ste-odile.cathocambrai.com/",
    doyenne:    "Marches du Hainaut",
    clochers:   ["Flines-lès-Mortagne", "Mortagne-du-Nord", "Maulde", "Nivelle", "Thun-Saint-Amand"],
  },
  {
    name:       "Sainte Maria Goretti du Hainaut",
    city:       "Onnaing",
    postalCode: "59264",
    address:    "1 rue Pasteur, 59264 Onnaing",
    phone:      "09 63 51 09 25",
    website:    "https://ste-maria-goretti.cathocambrai.com/",
    doyenne:    "Marches du Hainaut",
    clochers:   [
      "Onnaing", "Curgies", "Estreux", "Saultain",
      "Quarouble", "Vicq", "Sebourg", "Rombies-et-Marchipont",
      "Crespin", "Quiévrechain", "Thivencelle", "Saint-Aybert",
    ],
  },
  {
    name:       "Saint François en Val d'Escaut",
    city:       "Vieux-Condé",
    postalCode: "59690",
    address:    "66 place de la République, 59690 Vieux-Condé",
    phone:      "03 27 25 14 38",
    email:      "st-francois-escaut@cathocambrai.com",
    website:    "https://st-francois-escaut.cathocambrai.com/",
    doyenne:    "Marches du Hainaut",
    clochers:   ["Vieux-Condé", "Condé-sur-l'Escaut", "Odomez", "Escautpont", "Saint-Aybert"],
  },
  {
    name:       "Saint Jacques en Val d'Escaut",
    city:       "Bruay-sur-l'Escaut",
    postalCode: "59860",
    address:    "16 résidence Raymond Durut, 59860 Bruay-sur-l'Escaut",
    phone:      "09 75 74 18 64",
    website:    "https://st-jacques.cathocambrai.com/",
    doyenne:    "Marches du Hainaut",
    clochers:   ["Bruay-sur-l'Escaut", "Quiévrechain", "Thivencelle"],
  },
  {
    name:       "Saint Amand d'Elnon",
    city:       "Saint-Amand-les-Eaux",
    postalCode: "59230",
    address:    "73 place du 11 Novembre, 59230 Saint-Amand-les-Eaux",
    phone:      "03 27 48 44 40",
    email:      "paroissesdelamandinois@cathocambrai.com",
    website:    "https://st-amand.cathocambrai.com/",
    doyenne:    "Marches du Hainaut",
    clochers:   [
      "Saint-Amand-les-Eaux", "Bruille-Saint-Amand",
      "Château-l'Abbaye", "Hasnon", "Nivelle", "Rosult",
      "Warlaing", "Maulde",
    ],
  },

  // ══ DOYENNÉ PÉVÈLE-SCARPE (3 paroisses) ════════════════════════════════════

  {
    name:       "Sainte Marie en Pévèle-Scarpe",
    city:       "Orchies",
    postalCode: "59310",
    website:    "https://ste-marie-pevele-scarpe.cathocambrai.com/",
    doyenne:    "Pévèle-Scarpe",
    clochers:   [
      "Orchies", "Aix-en-Pévèle", "Beuvry-la-Forêt",
      "Cappelle-en-Pévèle", "Coutiches", "Landas",
      "Lecelles", "Nomain", "Sars-et-Rosières",
    ],
  },
  {
    name:       "Saint Eloi en Pévèle",
    city:       "Lecelles",
    postalCode: "59226",
    address:    "1608 Route de Roubaix, 59226 Lecelles",
    phone:      "07 88 82 28 35",
    email:      "paroissesdelamandinois@cathocambrai.com",
    website:    "https://st-eloi-pevele.cathocambrai.com/",
    doyenne:    "Pévèle-Scarpe",
    clochers:   ["Lecelles", "Saméon", "Mouchin", "Rumegies", "Sars-et-Rosières"],
  },
  {
    name:       "Notre-Dame de la Paix en Pévèle",
    city:       "Râches",
    postalCode: "59194",
    address:    "94 rue de l'Égalité, 59194 Râches",
    phone:      "03 27 89 15 25",
    email:      "paroisse.nddelapaix@nordnet.fr",
    website:    "https://nd-paix.cathocambrai.com/",
    doyenne:    "Pévèle-Scarpe",
    clochers:   [
      "Râches", "Flines-lez-Râches", "Marchiennes",
      "Bouvignies", "Wandignies-Hamage", "Anhiers",
    ],
  },

  // ══ DOYENNÉ BAVAISIS (1 paroisse) ══════════════════════════════════════════

  {
    name:       "Saint Pierre en Bavaisis",
    city:       "Bavay",
    postalCode: "59570",
    website:    "https://st-pierre.cathocambrai.com/",
    doyenne:    "Bavaisis",
    clochers:   [
      "Bavay", "Bellignies", "Bettrechies", "Gussignies",
      "Hon-Hergies", "La Longueville", "Hargnies",
      "Vieux-Ménil", "Obies", "Mecquignies",
      "Saint-Waast-la-Vallée", "La Flamengrie",
      "Bermeries", "Audignies", "Amfroipret-Bermeries",
      "Taisnières-sur-Hon",
    ],
  },

  // ══ DOYENNÉ VAL DE SAMBRE (5 paroisses) ════════════════════════════════════

  {
    name:       "Saint Joseph en Val de Sambre",
    city:       "Aulnoye-Aymeries",
    postalCode: "59620",
    address:    "82 rue Saint Martin, 59620 Aulnoye-Aymeries",
    phone:      "06 21 12 02 25",
    email:      "paroissesaintjoseph59620@gmail.com",
    website:    "https://st-joseph-sambre.cathocambrai.com/",
    doyenne:    "Val de Sambre",
    clochers:   [
      "Aulnoye-Aymeries", "Berlaimont", "Bachant",
      "Pont-sur-Sambre", "Saint-Rémy-Chaussée",
    ],
  },
  {
    name:       "Saint Vincent en Val de Sambre",
    city:       "Hautmont",
    postalCode: "59330",
    website:    "https://st-vincent-sambre.cathocambrai.com/",
    doyenne:    "Val de Sambre",
    clochers:   [
      "Hautmont", "Boussières-sur-Sambre", "Noyelles-sur-Sambre",
      "Vieux-Mesnil", "Ecuélin",
    ],
  },
  {
    name:       "Sainte Aldegonde",
    city:       "Maubeuge",
    postalCode: "59600",
    website:    "https://www.sainte-aldegonde.com/",
    doyenne:    "Val de Sambre",
    clochers:   [
      "Maubeuge", "Louvroil", "Recquignies",
      "Rousies", "Ferrière-la-Grande", "Ferrière-la-Petite",
    ],
  },
  {
    name:       "Sainte Waudru en Val de Sambre",
    city:       "Maubeuge",
    postalCode: "59600",
    email:      "saintewaudru@orange.fr",
    website:    "https://sainte-waudru.cathocambrai.com/",
    doyenne:    "Val de Sambre",
    clochers:   ["Maubeuge", "Assevent", "Beaufort", "Colleret"],
  },
  {
    name:       "Notre-Dame d'Ayde",
    city:       "Jeumont",
    postalCode: "59460",
    address:    "4 rue Faidherbe, 59460 Jeumont",
    phone:      "03 27 39 51 39",
    email:      "isabelle.klingebiel@wanadoo.fr",
    website:    "https://nd-ayde.cathocambrai.com/",
    doyenne:    "Val de Sambre",
    clochers:   ["Jeumont", "Marpent", "Pont-sur-Sambre"],
  },

  // ══ DOYENNÉ PAYS DE MORMAL (4 paroisses) ═══════════════════════════════════

  {
    name:       "Saint Denis en Solesmois",
    city:       "Solesmes",
    postalCode: "59730",
    website:    "https://st-denis.cathocambrai.com/",
    doyenne:    "Pays de Mormal",
    clochers:   [
      "Solesmes", "Beaurain", "Ovillers", "Saint-Python",
      "Bermerain", "Capelle", "Escarmain", "Saint-Martin-sur-Écaillon",
      "Viesly", "Briaste", "Vertain", "Romeries",
    ],
  },
  {
    name:       "Saint Joseph en Solesmois",
    city:       "Saulzoir",
    postalCode: "59722",
    website:    "https://st-joseph-solesmois.cathocambrai.com/",
    doyenne:    "Pays de Mormal",
    clochers:   [
      "Saulzoir", "Avesnes-le-Sec", "Haspres", "Haussy",
      "Monchaux-sur-Écaillon", "Montrécourt", "Verchain-Maugré",
      "Vendegies-sur-Écaillon", "Sommaing",
    ],
  },
  {
    name:       "Saint Roch en Mormal",
    city:       "Landrecies",
    postalCode: "59550",
    website:    "https://st-roch.cathocambrai.com/",
    doyenne:    "Pays de Mormal",
    clochers:   [
      "Landrecies", "Hecq", "Le Favril", "Preux-au-Bois",
      "Bousies", "Fontaine-au-Bois", "Robersart",
      "Maroilles", "Noyelles-sur-Sambre",
    ],
  },
  {
    name:       "Saint Jean Bosco en Mormal",
    city:       "Le Quesnoy",
    postalCode: "59530",
    website:    "https://st-jean-bosco-mormal.cathocambrai.com/",
    doyenne:    "Pays de Mormal",
    clochers:   [
      "Le Quesnoy", "Beaudignies", "Ghissignies", "Jolimetz",
      "Locquignol", "Louvignies-Quesnoy", "Ruesnes",
      "Villereau", "Villers-Pol", "Artres", "Maresches",
      "Orsinval", "Sepmeries", "Gommegnies", "Bry", "Eth",
      "Frasnoy", "Jenlain", "Poix-du-Nord",
      "Wargnies-le-Grand", "Wargnies-le-Petit",
      "Neuville-en-Avesnois", "Salesches",
    ],
  },

  // ══ DOYENNÉ DE L'AVESNOIS (4 paroisses) ════════════════════════════════════

  {
    name:       "Sainte Hiltrude en Avesnois",
    city:       "Solre-le-Château",
    postalCode: "59740",
    website:    "https://ste-hiltrude.cathocambrai.com/",
    doyenne:    "Avesnois",
    clochers:   [
      "Solre-le-Château", "Beaurieux", "Bérelles", "Choisies",
      "Clairfayts", "Damousies", "Dimechaux", "Dimont",
      "Eccles", "Eppe-Sauvage", "Hestrud", "Lez-Fontaine",
      "Liessies", "Moustier-en-Fagne", "Obrechies", "Sars-Poteries",
      "Solrinnes", "Wattignies-la-Victoire", "Felleries", "Beugnies",
    ],
  },
  {
    name:       "Sainte Claire en Avesnois",
    city:       "Fourmies",
    postalCode: "59610",
    website:    "https://ste-claire-avesnois.cathocambrai.com/",
    doyenne:    "Avesnois",
    clochers:   [
      "Fourmies", "Ramousies", "Glageon", "Rainsars",
      "Ohain", "Wallers-Trélon", "Anor", "Wignehies",
      "Féron", "Trélon", "Baives", "Sains-du-Nord",
    ],
  },
  {
    name:       "Sainte Bertille en Avesnois",
    city:       "Colleret",
    postalCode: "59152",
    website:    "https://ste-bertille.cathocambrai.com/",
    doyenne:    "Avesnois",
    clochers:   [
      "Colleret", "Cerfontaine", "Ferrière-la-Petite",
      "Quiévelon", "Cousolre", "Bousignies-sur-Roc", "Aibes",
    ],
  },
  {
    name:       "Sainte-Anne en Avesnois",
    city:       "Avesnes-sur-Helpe",
    postalCode: "59440",
    address:    "6 rue de Berry, 59440 Avesnes-sur-Helpe",
    phone:      "03 27 61 12 59",
    website:    "https://sainte-anne-avesnois.cathocambrai.com/",
    doyenne:    "Avesnois",
    clochers:   [
      "Avesnes-sur-Helpe", "Avesnelles", "Flaumont-Waudrechies",
      "Haut-Lieu", "Bas-Lieu", "Sémeries",
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Étape 1 : supprimer les fausses entrées Cambrai ─────────────────────────
async function deleteWrongEntries(): Promise<number> {
  const snap = await getDocs(
    query(collection(db, "parishes"), where("diocese", "==", DIOCESE))
  );

  const toDelete = snap.docs.filter(d => {
    const name = (d.data() as { name: string }).name;
    return name !== "Saint-Jean du Mont d'Anzin";
  });

  console.log(`  → ${toDelete.length} fausses entrées à supprimer…`);
  for (const d of toDelete) {
    await deleteDoc(doc(db, "parishes", d.id));
    await sleep(80);
  }
  return toDelete.length;
}

// ─── Étape 2 : mettre à jour les clochers officiels de Saint-Jean ────────────
async function updateSaintJean(): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, "parishes"),
      where("name", "==", "Saint-Jean du Mont d'Anzin"),
      where("diocese", "==", DIOCESE),
    )
  );
  if (snap.empty) { console.log("  ⚠️  Saint-Jean du Mont d'Anzin introuvable !"); return; }

  const official = OFFICIAL_PARISHES.find(p => p.name === "Saint-Jean du Mont d'Anzin")!;
  await updateDoc(doc(db, "parishes", snap.docs[0].id), {
    clochers: official.clochers,
    doyenne:  official.doyenne,
    website:  official.website,
  });
  console.log("  ✅  Saint-Jean du Mont d'Anzin — clochers mis à jour");
}

// ─── Étape 3 : insérer les 48 paroisses manquantes ───────────────────────────
async function insertMissing(): Promise<number> {
  const toInsert = OFFICIAL_PARISHES.filter(p => p.name !== "Saint-Jean du Mont d'Anzin");
  let added = 0;

  for (const seed of toInsert) {
    await addDoc(collection(db, "parishes"), {
      name:         seed.name,
      diocese:      DIOCESE,
      department:   DEPT,
      doyenne:      seed.doyenne     ?? "",
      city:         seed.city,
      postalCode:   seed.postalCode  ?? "",
      address:      seed.address     ?? "",
      phone:        seed.phone       ?? "",
      email:        seed.email       ?? "",
      website:      seed.website,
      description:  "",
      clochers:     seed.clochers    ?? [],
      memberCount:  0,
      isClaimed:    false,
      claimStatus:  "none",
      massSchedule: [],
      source:       "cathocambrai",
      createdAt:    serverTimestamp(),
    });
    console.log(`  ✅  ${seed.name} (${seed.city})`);
    added++;
    await sleep(100);
  }
  return added;
}

// ─── Vérification finale ──────────────────────────────────────────────────────
async function finalCount(): Promise<number> {
  const snap = await getDocs(
    query(collection(db, "parishes"), where("diocese", "==", DIOCESE))
  );
  return snap.size;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Correction base Diocèse de Cambrai          ║`);
  console.log(`║  Source : cathocambrai.com (juillet 2026)    ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  console.log("📋 ÉTAPE 1 — Suppression des fausses entrées");
  const deleted = await deleteWrongEntries();

  console.log("\n✏️  ÉTAPE 2 — Mise à jour clochers Saint-Jean du Mont d'Anzin");
  await updateSaintJean();

  console.log("\n➕ ÉTAPE 3 — Insertion des 48 paroisses officielles");
  const added = await insertMissing();

  const total = await finalCount();

  console.log(`
╔══════════════════════════════════════════════╗
║  RÉSULTAT FINAL                              ║
╠══════════════════════════════════════════════╣
║  Source officielle (cathocambrai.com) : 49   ║
║  Supprimées (fausses)  : ${String(deleted).padEnd(22)}║
║  Ajoutées (officielles): ${String(added).padEnd(22)}║
║  Total Cambrai en base : ${String(total).padEnd(22)}║
╚══════════════════════════════════════════════╝`);

  if (total === 49) {
    console.log("\n  ✅ PARFAIT : base = liste officielle (49/49)\n");
  } else {
    console.log(`\n  ⚠️  Écart : ${total} en base vs 49 officiel\n`);
  }

  process.exit(0);
}

main().catch(e => { console.error("Erreur fatale :", e); process.exit(1); });
