---
name: update-codeflow
description: Update docs/CODEFLOW.md after any major change (endpoint, schema, state machine, supplier contract, payment/refund/cancel flow, design decision). Use before finishing such a task.
---

# Update CODEFLOW

1. Read docs/CODEFLOW.md and `git diff` to see what changed.
2. Update only the sections affected:
   - **Request flows**: for each endpoint, the call chain (route → service → gateway/adapter → DB) and the state changes.
   - **State machines**: the transition table, if statuses or transitions changed.
   - **Data model**: tables and columns, if a migration was added.
   - **Supplier flow**: adapter interface or mock scenarios, if changed.
   - **Decisions log**: append `YYYY-MM-DD | Phase N | decision | why`.
   - **Changelog**: one line per major change.
3. Keep it short: no code dumps, use file paths and function names. Replace stale text instead of stacking new text on top.
4. If nothing major changed, do nothing and say so.
5. End your reply with which sections you updated.