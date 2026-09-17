---
name: Mutual aid private contact data
description: Privacy boundary used by the mutual-aid publication and interest flows.
---

Les publications d’entraide publiques doivent contenir uniquement les informations nécessaires au matching : profil auteur, type de besoin ou d’aide, message, disponibilité et état. Les coordonnées saisies dans un formulaire vont dans une sous-collection privée réservée à l’auteur et aux responsables autorisés.

**Why:** Les anciennes publications stockaient le téléphone dans un document lisible par toute la paroisse. Firestore ne masque pas des champs individuellement ; la séparation des documents et une version publique explicite évitent de réexposer ces données.

**How to apply:** Toute nouvelle publication doit utiliser le schéma public version 2 et les intérêts déterministes. Ne pas ajouter de téléphone, adresse ou autre coordonnée privée au document public ; passer par la sous-collection privée et conserver les décisions d’intérêt dans une collection limitée aux deux participants.