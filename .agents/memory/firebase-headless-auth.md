---
name: Firebase CLI headless auth via auth.firebase.tools
description: How to authenticate against Firebase without the CLI interactive flow, from a headless server.
---

## Rule

To POST to `auth.firebase.tools/attest` (step 1 of the headless PKCE login), include the Firebase CLI headers plus a persistent connection:

```
User-Agent: FirebaseCLI/15.22.4
X-Client-Version: FirebaseCLI/15.22.4
Connection: keep-alive
```

Without them, `/attest` can return an invalid attestation request.

**Why:** auth.firebase.tools validates the client version before issuing an attest token.

**Token exchange:** Use `oauth2.googleapis.com/token` with `code_verifier` (PKCE). The `redirect_uri` must be `https://auth.firebase.tools/complete`. Codes expire in ~5 minutes — exchange immediately after user pastes the code.

**Full token storage:** Always write the access token to a file (`/tmp/firebase_token.txt`) rather than reading it from stdout — terminal output truncates long tokens, causing silent 401 failures downstream.

**How to apply:** See `artifacts/paroisse-connect/scripts/deploy-rules.mjs` for the full implementation (`get-code` → `exchange` → `deployRules`).
