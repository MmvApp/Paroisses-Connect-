---
name: Parish content scoping
description: Constraint between parish-scoped Firestore queries and historical documents that lack parishId.
---

Les contenus récents peuvent être isolés proprement avec une requête `where(parishId == currentParishId)`. Les documents historiques sans `parishId` ne peuvent pas être scoping par paroisse dans une règle Firestore uniquement à partir de leur auteur sans garantie supplémentaire pour les requêtes.

**Why:** Firestore évalue les règles comme des contraintes de requête, pas comme un filtre client. Une requête legacy par `authorId` peut contenir des documents avec une paroisse explicite différente, ce qui rend un verrouillage strict incompatible avec le maintien automatique des documents non étiquetés.

**How to apply:** Pour préserver les données existantes sans les supprimer, filtrer les résultats legacy par les membres de la paroisse et exclure les `parishId` explicites étrangers. Pour une isolation backend stricte de tout l'historique, effectuer d'abord un backfill contrôlé de `parishId` à partir du profil auteur, puis supprimer le fallback legacy des règles et des requêtes.