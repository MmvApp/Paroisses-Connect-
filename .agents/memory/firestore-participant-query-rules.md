---
name: Firestore participant query rules
description: Security rules for real-time conversation lists queried with array-contains.
---

Les règles Firestore d’une liste `array-contains` doivent rester démontrables à partir de la requête : vérifier l’appartenance de l’utilisateur dans `participants`, mais ne pas ajouter une contrainte indépendante comme une taille exacte qui peut faire refuser toute la requête.

**Why:** Firestore traite les règles comme des contraintes de requête et non comme un filtre client ; une condition supplémentaire non déductible peut masquer toutes les conversations légitimes.

**How to apply:** Conserver les contraintes de structure stricte sur les créations ou mises à jour, et limiter la lecture temps réel à `uid() in resource.data.participants`.