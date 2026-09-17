---
name: Expo AsyncStorage browser tests
description: Isolation nécessaire pour les tests headless de persistance de locale dans l’application Expo Web.
---

Les tests Chromium de Paroisse Connect doivent démarrer avec un profil utilisateur neuf lorsqu’ils vérifient la locale persistée.

**Why:** AsyncStorage sur le Web persiste dans IndexedDB ; `localStorage.clear()` ne supprime pas sa valeur. Un profil réutilisé peut donc faire démarrer un test en anglais alors que le scénario demande le français.

**How to apply:** supprimer ou isoler le `user-data-dir` Chromium avant chaque scénario de persistance, puis vérifier séparément le changement de locale, la fermeture du modal et le rechargement.