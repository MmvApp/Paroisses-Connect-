import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Text, type TextProps } from "react-native";
import { GENERATED_TRANSLATIONS } from "./translationCatalog";
import { DYNAMIC_TRANSLATIONS } from "./dynamicTranslations";

export const SUPPORTED_LOCALES = ["fr", "ro", "it", "de", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_STORAGE_KEY = "@paroisse-connect/locale";
const DEFAULT_LOCALE: Locale = "fr";

type TranslationTable = Record<string, string>;

const translations: Record<Locale, TranslationTable> = {
  fr: {},
  ro: {
    ...GENERATED_TRANSLATIONS.ro,
    ...DYNAMIC_TRANSLATIONS.ro,
    Accueil: "Acasă", Actu: "Noutăți", Prières: "Rugăciuni", Agenda: "Agendă", Lieux: "Locuri",
    "Ma paroisse": "Parohia mea", Messages: "Mesaje", Amis: "Prieteni", Chat: "Chat", "Covoit'": "Transport", Profil: "Profil",
    "Connexion impossible": "Conectarea nu este posibilă", Réessayer: "Încearcă din nou",
    "Connexion requise": "Conectare necesară", "Connectez-vous pour accéder à votre profil.": "Conectați-vă pentru a vă accesa profilul.",
    Notifications: "Notificări", Confidentialité: "Confidențialitate", "Aide & Support": "Ajutor și asistență",
    "À propos": "Despre", "Se déconnecter": "Deconectare", "Se déconnecter ?": "Deconectați-vă?",
    "Voulez-vous vraiment vous déconnecter ?": "Sigur doriți să vă deconectați?",
    "Oui, se déconnecter": "Da, deconectare", Annuler: "Anulează", Enregistrer: "Salvează",
    "Modifier le profil": "Editează profilul", "Nom affiché": "Nume afișat", "Votre nom": "Numele dvs.",
    "Ce nom sera visible dans l’application.": "Acest nume va fi vizibil în aplicație.",
    "Prendre une photo": "Fă o fotografie", "Bibliothèque photo": "Biblioteca foto",
    "Changer la photo de profil": "Schimbă fotografia de profil", "Téléversement en cours…": "Se încarcă…",
    "Le nom affiché est obligatoire.": "Numele afișat este obligatoriu.", "Utilisateur": "Utilizator",
    "Super Administrateur": "Super administrator", Administrateur: "Administrator", Prêtre: "Preot",
    Modérateur: "Moderator", "Membre de la paroisse": "Membru al parohiei", Membre: "Membru",
    "Panneau Super Admin": "Panou super administrator", "Gérer ma paroisse": "Gestionează parohia mea",
    "Administration avancée": "Administrare avansată", "Infos du compte": "Informații cont", "Changer la langue": "Schimbați limba",
    "Nom complet": "Nume complet", Rôle: "Rol", Paroisse: "Parohie",
    "Paramètres": "Setări", Langue: "Limbă", "Language": "Limbă",
    "Choisissez la langue de l’interface": "Alegeți limba interfeței",
    "Français": "Franceză", Roumain: "Română", Italien: "Italiană", Allemand: "Germană", Anglais: "Engleză",
    "Groupes": "Grupuri", "Mes groupes": "Grupurile mele", Rejoindre: "Alătură-te",
    "Quitter le groupe": "Părăsește grupul", "Créer un groupe": "Creează un grup",
    "Conversation": "Conversație", "Envoyer": "Trimite", "Message au groupe…": "Mesaj către grup…",
    "Aucun message": "Niciun mesaj", "Écrire un message…": "Scrie un mesaj…",
    "Accès impossible": "Acces imposibil", "Accès refusé": "Acces refuzat", "Erreur": "Eroare",
    "Impossible de se déconnecter. Réessayez.": "Deconectarea nu este posibilă. Încercați din nou.",
    "Réunions": "Întâlniri", Responsable: "Responsabil", Membres: "Membri", Description: "Descriere",
    "Envoyer une demande": "Trimite o cerere", "Voir tout": "Vezi tot",
    "Aucun événement à venir": "Niciun eveniment viitor", "Créer le premier événement": "Creează primul eveniment",
    "Chargement…": "Se încarcă…", "Aucune donnée": "Nicio dată", "Retour": "Înapoi",
  },
  it: {
    ...GENERATED_TRANSLATIONS.it,
    ...DYNAMIC_TRANSLATIONS.it,
    Accueil: "Home", Actu: "Novità", Prières: "Preghiere", Agenda: "Agenda", Lieux: "Luoghi",
    "Ma paroisse": "La mia parrocchia", Messages: "Messaggi", Amis: "Amici", Chat: "Chat", "Covoit'": "Car pooling", Profil: "Profil",
    "Connexion impossible": "Connessione impossibile", Réessayer: "Riprova",
    "Connexion requise": "Accesso richiesto", "Connectez-vous pour accéder à votre profil.": "Accedi per vedere il tuo profilo.",
    Notifications: "Notifiche", Confidentialité: "Privacy", "Aide & Support": "Aiuto e supporto",
    "À propos": "Informazioni", "Se déconnecter": "Esci", "Se déconnecter ?": "Vuoi uscire?",
    "Voulez-vous vraiment vous déconnecter ?": "Vuoi davvero uscire?",
    "Oui, se déconnecter": "Sì, esci", Annuler: "Annulla", Enregistrer: "Salva",
    "Modifier le profil": "Modifica profilo", "Nom affiché": "Nome visualizzato", "Votre nom": "Il tuo nome",
    "Ce nom sera visible dans l’application.": "Questo nome sarà visibile nell’app.",
    "Prendre une photo": "Scatta una foto", "Bibliothèque photo": "Libreria foto",
    "Changer la photo de profil": "Cambia foto profilo", "Téléversement en cours…": "Caricamento…",
    "Le nom affiché est obligatoire.": "Il nome visualizzato è obbligatorio.", Utilisateur: "Utente",
    "Super Administrateur": "Super amministratore", Administrateur: "Amministratore", Prêtre: "Sacerdote",
    Modérateur: "Moderatore", "Membre de la paroisse": "Membro della parrocchia", Membre: "Membro",
    "Panneau Super Admin": "Pannello super amministratore", "Gérer ma paroisse": "Gestisci la mia parrocchia",
    "Administration avancée": "Amministrazione avanzata", "Infos du compte": "Informazioni account",
    "Nom complet": "Nome completo", Rôle: "Ruolo", Paroisse: "Parrocchia",
    Paramètres: "Impostazioni", Langue: "Lingua", Language: "Lingua", "Changer la langue": "Cambia lingua",
    "Choisissez la langue de l’interface": "Scegli la lingua dell’interfaccia",
    "Français": "Francese", Roumain: "Rumeno", Italien: "Italiano", Allemand: "Tedesco", Anglais: "Inglese",
    Groupes: "Gruppi", "Mes groupes": "I miei gruppi", Rejoindre: "Partecipa",
    "Quitter le groupe": "Lascia il gruppo", "Créer un groupe": "Crea un gruppo",
    Conversation: "Conversazione", Envoyer: "Invia", "Message au groupe…": "Messaggio al gruppo…",
    "Aucun message": "Nessun messaggio", "Écrire un message…": "Scrivi un messaggio…",
    "Accès impossible": "Accesso impossibile", "Accès refusé": "Accesso negato", Erreur: "Errore",
    "Impossible de se déconnecter. Réessayez.": "Impossibile uscire. Riprova.",
    Réunions: "Riunioni", Responsable: "Responsabile", Membres: "Membri", Description: "Descrizione",
    "Envoyer une demande": "Invia una richiesta", "Voir tout": "Vedi tutto",
    "Aucun événement à venir": "Nessun evento in programma", "Créer le premier événement": "Crea il primo evento",
    "Chargement…": "Caricamento…", "Aucune donnée": "Nessun dato", Retour: "Indietro",
  },
  de: {
    ...GENERATED_TRANSLATIONS.de,
    ...DYNAMIC_TRANSLATIONS.de,
    Accueil: "Startseite", Actu: "Neuigkeiten", Prières: "Gebete", Agenda: "Kalender", Lieux: "Orte",
    "Ma paroisse": "Meine Gemeinde", Messages: "Nachrichten", Amis: "Freunde", Chat: "Chat", "Covoit'": "Fahrgemeinschaft", Profil: "Profil",
    "Connexion impossible": "Verbindung nicht möglich", Réessayer: "Erneut versuchen",
    "Connexion requise": "Anmeldung erforderlich", "Connectez-vous pour accéder à votre profil.": "Melden Sie sich an, um Ihr Profil zu öffnen.",
    Notifications: "Benachrichtigungen", Confidentialité: "Datenschutz", "Aide & Support": "Hilfe und Support",
    "À propos": "Über uns", "Se déconnecter": "Abmelden", "Se déconnecter ?": "Abmelden?",
    "Voulez-vous vraiment vous déconnecter ?": "Möchten Sie sich wirklich abmelden?",
    "Oui, se déconnecter": "Ja, abmelden", Annuler: "Abbrechen", Enregistrer: "Speichern",
    "Modifier le profil": "Profil bearbeiten", "Nom affiché": "Anzeigename", "Votre nom": "Ihr Name",
    "Ce nom sera visible dans l’application.": "Dieser Name wird in der App angezeigt.",
    "Prendre une photo": "Foto aufnehmen", "Bibliothèque photo": "Fotobibliothek",
    "Changer la photo de profil": "Profilbild ändern", "Téléversement en cours…": "Wird hochgeladen…",
    "Le nom affiché est obligatoire.": "Der Anzeigename ist erforderlich.", Utilisateur: "Benutzer",
    "Super Administrateur": "Superadministrator", Administrateur: "Administrator", Prêtre: "Priester",
    Modérateur: "Moderator", "Membre de la paroisse": "Gemeindemitglied", Membre: "Mitglied",
    "Panneau Super Admin": "Superadmin-Bereich", "Gérer ma paroisse": "Meine Gemeinde verwalten",
    "Administration avancée": "Erweiterte Verwaltung", "Infos du compte": "Kontoinformationen", "Changer la langue": "Sprache ändern",
    "Nom complet": "Vollständiger Name", Rôle: "Rolle", Paroisse: "Gemeinde",
    Paramètres: "Einstellungen", Langue: "Sprache", Language: "Sprache",
    "Choisissez la langue de l’interface": "Wählen Sie die Sprache der Benutzeroberfläche",
    "Français": "Französisch", Roumain: "Rumänisch", Italien: "Italienisch", Allemand: "Deutsch", Anglais: "Englisch",
    Groupes: "Gruppen", "Mes groupes": "Meine Gruppen", Rejoindre: "Beitreten",
    "Quitter le groupe": "Gruppe verlassen", "Créer un groupe": "Gruppe erstellen",
    Conversation: "Unterhaltung", Envoyer: "Senden", "Message au groupe…": "Nachricht an die Gruppe…",
    "Aucun message": "Keine Nachrichten", "Écrire un message…": "Nachricht schreiben…",
    "Accès impossible": "Zugriff nicht möglich", "Accès refusé": "Zugriff verweigert", Erreur: "Fehler",
    "Impossible de se déconnecter. Réessayez.": "Abmelden nicht möglich. Bitte erneut versuchen.",
    Réunions: "Treffen", Responsable: "Verantwortlich", Membres: "Mitglieder", Description: "Beschreibung",
    "Envoyer une demande": "Anfrage senden", "Voir tout": "Alle anzeigen",
    "Aucun événement à venir": "Keine bevorstehenden Veranstaltungen", "Créer le premier événement": "Erste Veranstaltung erstellen",
    "Chargement…": "Wird geladen…", "Aucune donnée": "Keine Daten", Retour: "Zurück",
  },
  en: {
    ...GENERATED_TRANSLATIONS.en,
    ...DYNAMIC_TRANSLATIONS.en,
    Accueil: "Home", Actu: "News", Prières: "Prayers", Agenda: "Calendar", Lieux: "Places",
    "Ma paroisse": "My parish", Messages: "Messages", Amis: "Friends", Chat: "Chat", "Covoit'": "Carpool", Profil: "Profile",
    "Connexion impossible": "Connection unavailable", Réessayer: "Try again",
    "Connexion requise": "Sign-in required", "Connectez-vous pour accéder à votre profil.": "Sign in to access your profile.",
    Notifications: "Notifications", Confidentialité: "Privacy", "Aide & Support": "Help & Support",
    "À propos": "About", "Se déconnecter": "Sign out", "Se déconnecter ?": "Sign out?",
    "Voulez-vous vraiment vous déconnecter ?": "Are you sure you want to sign out?",
    "Oui, se déconnecter": "Yes, sign out", Annuler: "Cancel", Enregistrer: "Save",
    "Modifier le profil": "Edit profile", "Nom affiché": "Display name", "Votre nom": "Your name",
    "Ce nom sera visible dans l’application.": "This name will be visible in the app.",
    "Prendre une photo": "Take a photo", "Bibliothèque photo": "Photo library",
    "Changer la photo de profil": "Change profile photo", "Téléversement en cours…": "Uploading…",
    "Le nom affiché est obligatoire.": "Display name is required.", Utilisateur: "User",
    "Super Administrateur": "Super administrator", Administrateur: "Administrator", Prêtre: "Priest",
    Modérateur: "Moderator", "Membre de la paroisse": "Parish member", Membre: "Member",
    "Panneau Super Admin": "Super admin panel", "Gérer ma paroisse": "Manage my parish",
    "Administration avancée": "Advanced administration", "Infos du compte": "Account information", "Changer la langue": "Change language",
    "Nom complet": "Full name", Rôle: "Role", Paroisse: "Parish",
    Paramètres: "Settings", Langue: "Language", Language: "Language",
    "Choisissez la langue de l’interface": "Choose the interface language",
    "Français": "French", Roumain: "Romanian", Italien: "Italian", Allemand: "German", Anglais: "English",
    Groupes: "Groups", "Mes groupes": "My groups", Rejoindre: "Join",
    "Quitter le groupe": "Leave group", "Créer un groupe": "Create a group",
    Conversation: "Conversation", Envoyer: "Send", "Message au groupe…": "Message the group…",
    "Aucun message": "No messages", "Écrire un message…": "Write a message…",
    "Accès impossible": "Access unavailable", "Accès refusé": "Access denied", Erreur: "Error",
    "Impossible de se déconnecter. Réessayez.": "Unable to sign out. Please try again.",
    Réunions: "Meetings", Responsable: "Leader", Membres: "Members", Description: "Description",
    "Envoyer une demande": "Send a request", "Voir tout": "See all",
    "Aucun événement à venir": "No upcoming events", "Créer le premier événement": "Create the first event",
    "Chargement…": "Loading…", "Aucune donnée": "No data", Retour: "Back",
  },
};

function normalizeLocale(value: string | null | undefined): Locale {
  const base = (value ?? "").toLowerCase().split(/[-_]/)[0] as Locale;
  return SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
}

function getTranslationTable(locale: string | null | undefined): TranslationTable {
  const normalized = normalizeLocale(locale);
  return translations[normalized] ?? translations[DEFAULT_LOCALE];
}

let activeLocale: Locale = DEFAULT_LOCALE;

export function translateStatic(source: string): string {
  try {
    return getTranslationTable(activeLocale)[source] ?? source;
  } catch {
    return source;
  }
}

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (source: string, variables?: Record<string, string | number>) => string;
  ready: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  // French is bundled and available synchronously. Loading the saved
  // preference must never gate the first render or the native splash screen.
  const [ready, setReady] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Start the storage read on the next microtask so even a synchronous
    // native-storage exception is handled by the same fallback path.
    Promise.resolve()
      .then(() => AsyncStorage.getItem(LOCALE_STORAGE_KEY))
      .then((stored) => {
        if (!mounted) return;
        const next = normalizeLocale(stored);
        activeLocale = next;
        setLocaleState(next);
      })
      .catch(() => {
        if (!mounted) return;
        activeLocale = DEFAULT_LOCALE;
        setLocaleState(DEFAULT_LOCALE);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    const normalized = normalizeLocale(next);
    activeLocale = normalized;
    setLocaleState(normalized);
    try {
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, normalized);
    } catch {
      // A storage failure must not leave the app in a broken locale state.
      activeLocale = DEFAULT_LOCALE;
      setLocaleState(DEFAULT_LOCALE);
    }
  }, []);

  const t = useCallback((source: string, variables?: Record<string, string | number>) => {
    try {
      let result = getTranslationTable(locale)[source] ?? source;
      Object.entries(variables ?? {}).forEach(([key, value]) => {
        result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
      });
      return result;
    } catch {
      return source;
    }
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, ready }), [locale, setLocale, t, ready]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

type I18nTextProps = Omit<TextProps, "children"> & { children: string };

export function I18nText({ children, ...props }: I18nTextProps) {
  const { t } = useI18n();
  return <Text {...props}>{t(children)}</Text>;
}

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: "Français",
  ro: "Română",
  it: "Italiano",
  de: "Deutsch",
  en: "English",
};