---
name: iOS AAB download
description: Reliable way to retrieve the Android release bundle from Safari on iPhone.
---

Safari on iPhone may reject a direct download of the AAB even when the server returns HTTP 200. A native download endpoint must serve the same bytes as `application/zip` and use a `.zip` filename; for large files, redirect that endpoint to an external signed storage URL because streaming through the API can be aborted after several minutes. Safari can then save the ZIP in Files, where the user renames or extracts the `.aab`.

**Why:** The direct AAB endpoint was reachable and correctly served, but Safari still reported “Download impossible” on the iPhone.

**How to apply:** Use the project’s mobile download page and ZIP-compatible endpoint for iPhone users. Keep large release bytes in external storage and let the API issue a short-lived signed redirect. Remove the download route and stored release after the Google Play upload is complete.