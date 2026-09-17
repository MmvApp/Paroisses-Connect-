---
name: Expo i18n Babel transform
description: Contraintes de la transformation Babel qui localise les libellés statiques sans toucher aux contenus utilisateur.
---

La localisation automatique des textes statiques peut être faite à la frontière Babel : les textes JSX littéraux, les propriétés d’interface connues et les arguments littéraux d’alertes passent par `translateStatic`, tandis que les expressions dynamiques restent inchangées pour préserver les noms, messages et contenus Firestore.

**Pourquoi:** Expo inclut React Native Worklets dans la chaîne Babel. Les nœuds `ObjectMethod` construits à la main doivent contenir un `BlockStatement` avec `directives: []`; sinon le build peut échouer dans l’analyse Worklets avant même le bundling.

Le transformateur doit aussi ignorer explicitement `node_modules` et les builds générés. Sinon il peut injecter un alias `@/...` dans un fichier interne d’Expo Router, et le build de publication échoue alors que le build de développement paraît correct.

Un identifiant JSX ajouté par le transformateur peut être retiré par Metro comme import inutilisé, laissant une référence runtime non définie. Pour les textes littéraux, conserver le composant `Text` et injecter directement une expression `require(...).translateStatic(...)` est plus robuste qu’un composant JSX généré.

Le provider i18n doit traiter le français comme une valeur embarquée immédiatement disponible : la lecture AsyncStorage de la préférence est secondaire, enveloppée pour gérer les erreurs synchrones et asynchrones, et toute table ou clé invalide retourne la clé française/source.

**Comment appliquer:** Pour toute évolution du transformateur, tester un écran avec animations et un écran avec objets de configuration, puis vérifier typecheck et bundling Web/iOS/Android. Ne jamais transformer une expression dynamique contenant des données utilisateur, ni les dépendances externes.