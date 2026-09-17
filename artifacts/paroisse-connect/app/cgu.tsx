import { LegalLayout } from "@/components/LegalLayout";

const SECTIONS = [
  {
    title: "1. Objet",
    content:
      "Les présentes Conditions Générales d'Utilisation (CGU) définissent les règles d'utilisation de l'application Paroisse Connect, disponible sur iOS, Android et Web.\n\nEn créant un compte, l'utilisateur accepte sans réserve les présentes CGU. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser l'application.",
  },
  {
    title: "2. Création de compte",
    content:
      "L'utilisation de Paroisse Connect nécessite la création d'un compte avec une adresse e-mail valide et un mot de passe.\n\nL'utilisateur s'engage à :\n• fournir des informations exactes, complètes et à jour ;\n• choisir un mot de passe robuste et le garder confidentiel ;\n• ne pas créer de compte pour une autre personne sans son consentement ;\n• ne pas créer plusieurs comptes pour contourner une suspension.\n\nToute utilisation du compte est sous la responsabilité exclusive de son titulaire.",
  },
  {
    title: "3. Utilisation conforme",
    content:
      "Paroisse Connect est une application à caractère religieux et communautaire destinée aux paroisses catholiques. L'utilisateur s'engage à utiliser l'application dans le respect des valeurs chrétiennes, de la dignité humaine et de la loi française.",
  },
  {
    title: "4. Contenus interdits",
    content:
      "Il est strictement interdit de publier des contenus :\n• contraires à la morale, à l'ordre public ou aux bonnes mœurs ;\n• à caractère haineux, discriminatoire, raciste ou antisémite ;\n• portant atteinte à la vie privée, à l'honneur ou à la réputation d'autrui ;\n• à caractère pornographique, violent ou terroriste ;\n• constituant du spam, de la publicité commerciale non autorisée ;\n• portant atteinte aux droits de propriété intellectuelle d'un tiers.\n\nTout contenu contraire à ces règles pourra être supprimé sans préavis.",
  },
  {
    title: "5. Modération",
    content:
      "Paroisse Connect se réserve le droit de modérer, supprimer ou restreindre tout contenu ou compte ne respectant pas les présentes CGU, sans obligation de motiver sa décision.\n\nLes administrateurs paroissiaux disposent de droits de modération pour les contenus publiés au sein de leur paroisse.",
  },
  {
    title: "6. Propriété intellectuelle",
    content:
      "L'utilisateur conserve la propriété des contenus qu'il publie. En publiant sur Paroisse Connect, il accorde à l'application une licence mondiale, non exclusive et gratuite d'affichage et de distribution de ces contenus dans le cadre du fonctionnement du service.",
  },
  {
    title: "7. Disponibilité du service",
    content:
      "Paroisse Connect s'efforce d'assurer une disponibilité maximale du service. Des interruptions ponctuelles peuvent survenir pour maintenance ou en cas d'incident technique.\n\nParoisse Connect ne pourra être tenu responsable des interruptions de service ou des pertes de données.",
  },
  {
    title: "8. Modification des CGU",
    content:
      "Paroisse Connect se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront informés par notification dans l'application. La poursuite de l'utilisation du service après modification vaut acceptation des nouvelles conditions.",
  },
  {
    title: "9. Résiliation",
    content:
      "L'utilisateur peut à tout moment supprimer son compte depuis Profil → Confidentialité → Supprimer mon compte.\n\nParoisse Connect peut résilier un compte en cas de violation des présentes CGU, sans préavis ni indemnité.",
  },
  {
    title: "10. Droit applicable",
    content:
      "Les présentes CGU sont soumises au droit français. Tout litige relatif à leur application ou interprétation relève de la compétence exclusive des tribunaux français.\n\nContact : support@paroisseconnect.fr",
  },
];

export default function CguScreen() {
  return (
    <LegalLayout
      title="Conditions d'utilisation"
      updatedAt="Juillet 2026"
      sections={SECTIONS}
    />
  );
}
