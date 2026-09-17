---
name: Firestore nested comments
description: Access-control rule for comment subcollections attached to parish publications.
---

Dans Firestore, les règles d’un document parent ne s’appliquent pas automatiquement à ses sous-collections. Toute publication qui expose des commentaires doit déclarer explicitement les règles de lecture, création et suppression pour sa sous-collection `comments`, en vérifiant aussi le lien avec le document parent et l’auteur du commentaire.

**Why:** Une interface peut écrire dans le chemin correct et recevoir un échec silencieux si seule la publication parente est autorisée. Cela bloque à la fois l’enregistrement, le listener temps réel et l’affichage après reconnexion.

**How to apply:** Lorsqu’une nouvelle publication devient commentable, ajouter son match Firestore dédié directement à l’intérieur du bon match parent, limiter la lecture à la paroisse de la publication, exiger `authorId == request.auth.uid` à la création et conserver la suppression à l’auteur ou aux modérateurs autorisés. Une compilation réussie ne garantit pas que le match imbriqué est rattaché à la bonne collection ; vérifier son emplacement et faire un test d’écriture réel.