---
name: Firebase emulator runtime
description: Conditions nécessaires pour exécuter les tests Firestore locaux de Paroisse Connect.
---

Les émulateurs Firebase CLI récents exigent Java 21 ou supérieur. Dans cet environnement, il faut aussi forcer les hôtes des émulateurs à `127.0.0.1` lorsque la résolution IPv6 `::1` n’est pas disponible.

**Why:** Un test de suppression Firestore peut échouer avant d’exécuter le code si le runtime Java est trop ancien ou si Firebase tente d’écouter sur IPv6.

**How to apply:** Pour les tests locaux Auth + Firestore, utiliser Java 21+, des ports libres et une configuration d’émulateur avec `host: "127.0.0.1"`.