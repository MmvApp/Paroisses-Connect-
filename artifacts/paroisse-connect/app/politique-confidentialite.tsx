import { LegalLayout } from "@/components/LegalLayout";

const SECTIONS = [
  {
    title: "1. Responsable du traitement",
    content:
      "L'équipe Paroisse Connect est responsable du traitement de vos données personnelles au sens du Règlement Général sur la Protection des Données (RGPD – Règlement UE 2016/679).\n\nContact : support@paroisseconnect.fr",
  },
  {
    title: "2. Données collectées",
    content:
      "Lors de votre utilisation de Paroisse Connect, nous collectons les données suivantes :\n\n• Données d'identification : prénom, nom d'affichage, adresse e-mail\n• Photo de profil (facultative)\n• Appartenance paroissiale\n• Contenus publiés : annonces, événements, intentions de prière, messages de groupe\n• Données de messagerie directe\n• Données de covoiturage (facultatif)\n• Données techniques : identifiant Firebase, date de création du compte",
  },
  {
    title: "3. Finalités du traitement",
    content:
      "Vos données sont utilisées pour :\n• créer et gérer votre compte utilisateur ;\n• vous permettre d'accéder aux services de la paroisse ;\n• afficher votre profil aux autres membres de votre paroisse ;\n• envoyer et recevoir des messages au sein des groupes et en direct ;\n• assurer la sécurité et la modération du service.",
  },
  {
    title: "4. Base légale du traitement",
    content:
      "Le traitement de vos données repose sur :\n• votre consentement donné lors de l'inscription (Art. 6(1)(a) RGPD) ;\n• l'exécution du contrat d'utilisation de l'application (Art. 6(1)(b) RGPD) ;\n• l'intérêt légitime de Paroisse Connect à assurer la sécurité et la modération du service (Art. 6(1)(f) RGPD).",
  },
  {
    title: "5. Durée de conservation",
    content:
      "Vos données sont conservées :\n• tant que votre compte est actif ;\n• jusqu'à 3 ans après votre dernière connexion pour les comptes inactifs ;\n• ou jusqu'à la suppression de votre compte à votre demande.\n\nAprès suppression, vos données personnelles sont définitivement effacées de nos systèmes dans un délai de 30 jours.",
  },
  {
    title: "6. Destinataires et sous-traitants",
    content:
      "Vos données peuvent être transmises à nos sous-traitants techniques :\n\n• Google LLC (Firebase) – authentification, base de données, stockage des photos\n\nCe sous-traitant est soumis à des clauses contractuelles types garantissant un niveau de protection adéquat conformément au RGPD.\n\nNous ne vendons jamais vos données à des tiers à des fins commerciales.",
  },
  {
    title: "7. Vos droits",
    content:
      "Conformément au RGPD, vous disposez des droits suivants :\n\n• Droit d'accès : obtenir une copie de vos données\n• Droit de rectification : corriger des données inexactes\n• Droit à l'effacement (« droit à l'oubli ») : supprimer votre compte et vos données\n• Droit à la limitation du traitement\n• Droit à la portabilité : recevoir vos données dans un format structuré\n• Droit d'opposition : vous opposer à certains traitements\n\nPour exercer ces droits : support@paroisseconnect.fr\n\nVous pouvez supprimer votre compte directement depuis Profil → Confidentialité → Supprimer mon compte.",
  },
  {
    title: "8. Sécurité",
    content:
      "Nous mettons en œuvre des mesures techniques et organisationnelles adaptées pour protéger vos données contre tout accès non autorisé, perte ou destruction :\n• chiffrement des données en transit (HTTPS/TLS) ;\n• authentification sécurisée via Firebase Auth ;\n• accès aux données restreint aux personnes habilitées.",
  },
  {
    title: "9. Réclamation",
    content:
      "Si vous estimez que vos droits ne sont pas respectés, vous avez le droit d'introduire une réclamation auprès de la Commission Nationale de l'Informatique et des Libertés (CNIL) :\n\nCNIL — 3 Place de Fontenoy, 75007 Paris\nhttps://www.cnil.fr",
  },
  {
    title: "10. Modifications",
    content:
      "La présente politique de confidentialité peut être mise à jour à tout moment. Toute modification significative vous sera notifiée via l'application.\n\nVersion en vigueur : Juillet 2026\nContact : support@paroisseconnect.fr",
  },
];

export default function PolitiqueConfidentialiteScreen() {
  return (
    <LegalLayout
      title="Politique de confidentialité"
      updatedAt="Juillet 2026"
      sections={SECTIONS}
    />
  );
}
