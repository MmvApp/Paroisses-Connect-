---
name: Group responsibility permissions
description: Durable data and security boundary for parish group leaders.
---

## Rule

Use the existing group `leaderUid` field as the canonical responsible-member identifier. Priests, parish admins, and `super_admin` may assign or clear it; a responsible member may manage members only inside that group and never gains parish-wide administration.

**Why:** The group leader role must remain distinct from parish roles while working across the same iPhone, Android, and web clients.

**How to apply:** Scope leader-management checks to the group’s `parishId`, allow leader-scoped member removal through an atomic member-delete plus counter-update write, and require `leaderUid` to reference a selected member in the UI.