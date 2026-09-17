import { LegalLayout } from "@/components/LegalLayout";

const SECTIONS = [
  {
    title: "Éditeur de l'application",
    content:
      "L'application Paroisse Connect est éditée à titre bénévole par l'équipe Paroisse Connect, dans le but de soutenir les communautés paroissiales catholiques.\n\nContact éditeur : support@paroisseconnect.fr",
  },
  {
    title: "Responsable de publication",
    content:
      "Le responsable de la publication est l'équipe Paroisse Connect, joignable à l'adresse : support@paroisseconnect.fr.",
  },
  {
    title: "Hébergement",
    content:
      "Les données sont hébergées par :\n\n• Google LLC (Firebase Auth, Firestore, Firebase Storage)\n  1600 Amphitheatre Parkway\n  Mountain View, CA 94043 — États-Unis\n  https://firebase.google.com\n\nCet hébergeur est soumis aux clauses contractuelles types de la Commission européenne garantissant un niveau de protection adéquat des données personnelles.",
  },
  {
    title: "Propriété intellectuelle",
    content:
      "Le code source, le design et les éléments graphiques de l'application Paroisse Connect sont la propriété exclusive de leurs auteurs. Toute reproduction, distribution ou utilisation à des fins commerciales est interdite sans autorisation écrite préalable.\n\nLes contenus publiés par les utilisateurs (textes, photos, intentions de prière, annonces) restent la propriété de leurs auteurs. En les publiant, ils accordent à Paroisse Connect une licence d'affichage non exclusive, limitée au fonctionnement de l'application.",
  },
  {
    title: "Limitation de responsabilité",
    content:
      "Paroisse Connect met tout en œuvre pour assurer le bon fonctionnement de l'application. Cependant, nous ne pouvons garantir une disponibilité permanente et ininterrompue du service.\n\nParoisse Connect ne saurait être tenu responsable :\n• des contenus publiés par les utilisateurs ;\n• de l'utilisation frauduleuse des identifiants ;\n• des dommages indirects liés à l'utilisation de l'application.",
  },
  {
    title: "Cookies et traceurs",
    content:
      "L'application n'utilise pas de cookies de pistage à des fins publicitaires. Des données techniques peuvent être collectées par Firebase à des fins de sécurité et de performances (jetons d'authentification, sessions).",
  },
  {
    title: "Droit applicable",
    content:
      "Les présentes mentions légales sont soumises au droit français. En cas de litige, les tribunaux français sont seuls compétents.",
  },
];

export default function MentionsLegalesScreen() {
  return (
    <LegalLayout
      title="Mentions légales"
      updatedAt="Juillet 2026"
      sections={SECTIONS}
    />
  );
}
