---
name: Expo preview versus production
description: Différence entre le domaine de preview Expo Replit et l’URL publique déployée de Paroisse Connect.
---

Le preview web d’une application Expo est servi sur le domaine de développement `*.expo.picard.replit.dev`, tandis que les liens publics et les callbacks externes doivent utiliser l’URL `.replit.app` renvoyée par les informations de déploiement.

**Why:** Le domaine Expo de preview peut être ancien, indisponible ou différent de l’application publiée ; il ne constitue pas une URL publique stable.

**How to apply:** Pour un lien destiné à un utilisateur, Firebase ou un service externe, récupérer l’URL de production via les informations de déploiement et ne pas la reconstruire depuis `REPLIT_DEV_DOMAIN` ou `REPLIT_EXPO_DEV_DOMAIN`.