---
name: implement-task
description: Full cycle for one task from docs/tasks/BACKLOG.md — plan, scaffold via generator, implement, verify, hand off for review. Use when the user names a BACKLOG.md task (e.g. "do T-012") or describes work that matches one.
---

1. **Find the task.** Locate it in `docs/tasks/BACKLOG.md`; if it's substantial enough to
   warrant its own file, copy `docs/tasks/_template.md` to `docs/tasks/T-NNN-slug.md` and fill
   it in before writing code.
2. **Plan.** For anything touching more than one file or one package, use the `architect` agent
   (`Task` tool, `subagent_type: architect`) with the task's FR IDs and a pointer to its
   BACKLOG.md row. Skip this for a genuinely small, single-file change.
3. **Scaffold.** If the plan calls for a new module/feature/entity/contract/theme, run the
   matching `pnpm gen <generator>` command (see CLAUDE.md's table) before writing files by hand.
4. **Implement.** Use `backend-dev` and/or `frontend-dev` (in parallel if the task genuinely
   splits cleanly across both — most don't) for the actual code, following the plan.
5. **Verify.** `pnpm check:changed` from repo root. Fix anything red — don't hand off a failing
   state.
6. **Review.** Use the `reviewer` agent against the diff before considering the task done.
7. **Close out.** Check off the task in `docs/tasks/BACKLOG.md` (or mark its own file `done`).
   If a non-obvious architectural choice was made along the way, add an ADR
   (`docs/adr/NNNN-title.md`, copy `docs/adr/_template.md`) instead of letting it live only in
   the diff.

Don't skip step 5 or step 7 to save time — an unverified "done" or an unrecorded decision costs
more tokens later, in whoever (human or agent) has to rediscover it.
