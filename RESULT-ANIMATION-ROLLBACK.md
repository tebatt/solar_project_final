# Calculator result-card animation: how to remove it

Added on 2026-10-14: the five calculator result cards reveal one after another
using React Bits "Animated Content" (gsap).

## Files

New:
- `frontend/src/components/reactbits/AnimatedContent.tsx` (official React Bits TS source, unchanged)
- `frontend/src/test/setup.ts` (gives jsdom a `matchMedia`, which gsap needs in tests)

Changed:
- `frontend/src/components/calculator/SolarCalculator.tsx` (wraps the five cards, adds the replay key)
- `frontend/src/components/calculator/SolarCalculator.test.tsx` (2 new tests at the end)
- `frontend/vitest.config.ts` (adds `setupFiles`)
- `frontend/package.json`, `frontend/package-lock.json` (adds `gsap`)

## Remove only this change (keeps everything else)

From the folder that contains `.git`
(`~/Desktop/final/utu-solar_final_project/utu-solar-project-0.3-before-phase4`):

```bash
F=utu-solar-project-0.3-before-phase4/frontend
git restore --source=checkpoint/before-result-animation --worktree -- \
  $F/src/components/calculator/SolarCalculator.tsx \
  $F/src/components/calculator/SolarCalculator.test.tsx \
  $F/vitest.config.ts $F/package.json $F/package-lock.json
rm -r $F/src/components/reactbits $F/src/test
cd $F && npm install
```

`checkpoint/before-result-animation` is a snapshot of the whole project taken
just before this change; your branch and files were not touched by it. If
other edits are later made to these same files, restore by hand instead.

Without git: the original files are in `result-animation-backup-20261014-081214/`
next to `frontend/`. Copy `SolarCalculator.tsx` and `ResultStat.tsx` back to
`frontend/src/components/calculator/`, `package.json`, `package-lock.json` and
`vitest.config.ts` back to `frontend/`, delete the two new folders above and the
two tests at the end of `SolarCalculator.test.tsx`, then run `npm install`.
