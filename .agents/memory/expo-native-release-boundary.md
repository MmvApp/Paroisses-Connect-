---
name: Expo native release boundary
description: Distinction entre le bundle Web publié et les binaires iOS/Android installés.
---

Une publication Replit du bundle Web ne modifie pas automatiquement une application iOS ou Android déjà installée. Les corrections natives doivent être livrées par une mise à jour Expo compatible ou par un nouveau build distribué.

**Why:** Une correction peut être présente et validée dans le projet tout en restant invisible sur le téléphone si celui-ci exécute encore un ancien bundle natif.

**How to apply:** Lorsqu’un utilisateur fournit une capture native après une correction mobile, vérifier la version du bundle installée et prévoir une livraison Expo native en plus de la publication Web.