# Projects marquee (Magic UI): how to remove it

Added on 2026-10-14: homepage project cards scroll in the Magic UI Marquee.

## Files

New:
- `frontend/src/components/magicui/marquee.tsx` (official Magic UI source, adapted to Tailwind 3 and the project's `cn`)
- `frontend/src/sections/Projects.reducedMotion.test.tsx`

Changed:
- `frontend/src/sections/Projects.tsx` (marquee on the homepage; grid kept for the gallery page and reduced motion)
- `frontend/src/sections/Projects.test.tsx` (tests follow the marquee)
- `frontend/tailwind.config.cjs` (adds the `marquee` keyframes and animation)

No dependencies were added and the backend was not touched.

## Remove only this change

From the folder that contains `.git`
(`~/Desktop/final/utu-solar_final_project/utu-solar-project-0.3-before-phase4`):

```bash
F=utu-solar-project-0.3-before-phase4/frontend
git restore --source=checkpoint/before-marquee --worktree -- \
  $F/src/sections/Projects.tsx $F/src/sections/Projects.test.tsx $F/tailwind.config.cjs
rm -r $F/src/components/magicui
rm $F/src/sections/Projects.reducedMotion.test.tsx
```

`checkpoint/before-marquee` is a snapshot of the whole project taken just
before this change; your branch and files were not touched by it.

Without git: the three original files are in `marquee-backup-20261014-094832/`
next to `frontend/`. Copy them back (`Projects.tsx` and `Projects.test.tsx` to
`frontend/src/sections/`, `tailwind.config.cjs` to `frontend/`) and delete the
two new files above.
