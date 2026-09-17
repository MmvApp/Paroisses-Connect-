---
name: Firebase Auth email configuration
description: Limites de configuration des modèles et gestionnaires d’e-mails Firebase pour Paroisse Connect.
---

Pour ce projet Firebase Authentication standard, l’API Identity Toolkit permet de lire la configuration et d’ajouter un domaine autorisé, mais refuse la modification du modèle d’e-mail et de `callbackUri` avec `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. Ces réglages doivent être faits dans Firebase Console, dans Authentication > Templates.

**Why:** Les champs visibles dans la configuration REST ne sont pas tous modifiables par API pour un projet Firebase Auth standard. Réessayer un PATCH identique ne changera pas le résultat.

**How to apply:** Utiliser l’API pour vérifier les domaines et la configuration effective. Pour un gestionnaire d’action personnalisé, enregistrer l’URL dans le modèle Firebase Console. Pour un bouton HTML et une meilleure délivrabilité, utiliser le modèle Console ou un fournisseur SMTP/domaine vérifié avec SPF, DKIM et DMARC.