---
name: Group membership source of truth
description: Durable Firestore membership synchronization rule for group access and chat.
---

## Rule

The deterministic membership document `groupMembers/{groupId}_{uid}` is the source of truth for whether a user belongs to a group. Screens that display group membership or group chat access should listen to that document directly, not rebuild membership state only from a broad `where(userId == uid)` query.

**Why:** A broad listener can deliver an intermediate or stale result during reconnects or after a group update and overwrite a confirmed membership locally. Direct document listeners also make access, routing, and group-chat security use the same identifier.

**How to apply:** Enumerate groups from the authenticated user's parish, then attach a direct membership listener for each group. Attach the group conversation listener only while the membership document exists. Keep confirmed state on transient listener errors; only a confirmed document deletion should remove membership.

Legacy groups may lack ownership metadata such as `createdBy`; membership rules must guard optional fields before evaluating owner checks. Counter writes should still normalize an absent or invalid `memberCount` to zero.

**Why:** Existing seeded groups can predate ownership and counter fields. Reading a missing owner field during the group update rule can reject an otherwise valid atomic membership write before the member document is created.

**How to apply:** Guard optional map fields with `keys().hasAny(...)`, use an atomic transaction that reads the group and member document, write the deterministic membership and explicit normalized count together, and keep `existsAfter` checks in the rules.