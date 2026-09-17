---
name: Claim role compatibility
description: Règles durables pour faire évoluer les revendications et la séparation des rôles paroissiaux.
---

Une revendication historique sans `requestedRole` doit être interprétée comme une demande de prêtre. Les nouvelles demandes distinguent explicitement le prêtre du rôle d’administrateur paroissial.

**Why:** Les anciennes données utilisent un document de revendication par paroisse et ne portent pas le rôle demandé. Les relire comme des demandes d’admin pourrait donner un droit trop élevé, tandis que les traiter comme invalides casserait le flux existant.

**How to apply:** Toute nouvelle logique de lecture, de validation ou de migration doit appliquer le fallback `priest`, limiter les admins paroissiaux aux demandes simples autorisées et conserver la validation d’un prêtre par un prêtre déjà rattaché à la paroisse ou par un Super Admin.