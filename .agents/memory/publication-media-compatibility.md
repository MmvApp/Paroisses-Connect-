---
name: Publication media compatibility
description: Règle de stockage et d’affichage des photos facultatives des publications.
---

Les nouvelles publications stockent au maximum deux URLs dans `imageUrls`, tout en conservant `imageUrl` comme première URL pour la compatibilité avec les anciens documents. La lecture doit normaliser `imageUrls` puis retomber sur `imageUrl` uniquement si le tableau est absent ou vide. Une carte de publication sans photo ne rend aucun média et ne doit jamais utiliser la couverture de la paroisse comme fallback.

**Why:** Les anciennes publications et les événements peuvent contenir une seule photo volontaire, tandis que plusieurs écrans affichaient auparavant une image de paroisse uniquement comme fallback visuel.

**How to apply:** Réutiliser le sélecteur et l’upload Supabase partagés, limiter les nouvelles sélections à deux photos, et ne supprimer une URL existante que lorsque l’auteur la retire explicitement.