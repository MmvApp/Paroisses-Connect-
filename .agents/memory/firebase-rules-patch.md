---
name: Firebase Rules REST API PATCH format
description: The PATCH body for updating a Firestore release must wrap the release in a 'release' key.
---

## Rule

When applying a ruleset to a Firestore release via REST API (`PATCH /v1/projects/{id}/releases/cloud.firestore`), the request body must wrap the release object:

```json
{ "release": { "name": "projects/.../releases/cloud.firestore", "rulesetName": "projects/.../rulesets/..." } }
```

**Why:** The Firebase Rules REST API (v1) `releases.patch` method expects a `Release`-typed wrapper. Sending the fields flat returns `400 INVALID_ARGUMENT: Unknown name "rulesetName"`. Source confirmed in `firebase-tools/lib/gcp/rules.js` line 141.

**How to apply:** In `artifacts/paroisse-connect/scripts/deploy-rules.mjs`, the `deployRules` function already uses this format. For POST (create), the wrapper is NOT used — fields go flat. See line 128 of the same firebase-tools source.
