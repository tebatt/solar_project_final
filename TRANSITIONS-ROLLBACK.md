# Soft transitions: how to turn off or remove

Added on 2026-10-14: soft blends at the three dark/light boundaries of the
homepage (calculator → "how it works", payments → companies, FAQ → footer) and
a 300 ms fade when moving between pages.

Not part of this change: the lighter payments section and footer (`bg-dusk`)
and the calculator changes made earlier the same day.

## Option A: switch it off (quick)

In `frontend/src/theme/softTransitions.ts` set:

```ts
export const SOFT_TRANSITIONS_ENABLED = false;
```

Save; the dev server reloads. The homepage gets back its original divider and
gradient strips, and pages switch without a fade.

To compare without editing anything (dev server only): open
`http://127.0.0.1:5173/?transitions=off` or `?transitions=on`.

## Option B: remove the code completely

A snapshot of the whole project from just before this change is on the git
branch `checkpoint/before-transitions` (your current branch and files were not
touched). From the folder that contains `.git`
(`~/Desktop/final/utu-solar_final_project/utu-solar-project-0.3-before-phase4`):

```bash
F=utu-solar-project-0.3-before-phase4/frontend
git restore --source=checkpoint/before-transitions --worktree -- \
  $F/src/App.tsx $F/src/pages/HomePage.tsx $F/src/pages/HomePage.test.tsx
rm $F/src/theme/softTransitions.ts $F/src/styles/soft-transitions.css
rm -r $F/src/components/transitions
```

This only replaces those three files and deletes the four new ones; nothing
else changes.

Without git: copies of the three original files are in
`transitions-backup-20261014-073019/` next to `frontend/`. Copy them back
(`App.tsx` → `frontend/src/`, `HomePage.tsx` and `HomePage.test.tsx` →
`frontend/src/pages/`) and delete the four new files above.
