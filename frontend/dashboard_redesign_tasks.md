# Dashboard 3D Redesign — Task List

Color palette: `#041421` / `#042630` / `#4c7273` / `#86b9b0` / `#d0d6d6`
Libraries: `three` + `@react-three/fiber` + `@react-three/drei`

---

## Phase 1 — Install & Config

- [ ] **TASK-1** Install 3D packages: `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`
- [ ] **TASK-2** Update `next.config.ts` — add `transpilePackages: ['three']`

---

## Phase 2 — Color Foundation

- [ ] **TASK-3** Update `globals.css` — replace color tokens with teal palette, remove old orbs, add `.glow-border`, `.pulse-accent`, `.activity-timeline` utility classes
- [ ] **TASK-4** Update `layout.tsx` — change bg to `#041421`, inject `<ParticleBackground />`, update text color to `#d0d6d6`

---

## Phase 3 — Component Redesigns (no Three.js yet)

- [ ] **TASK-5** Redesign `Sidebar.tsx` — `#042630` bg, teal active border, muted teal inactive text
- [ ] **TASK-6** Redesign `KpiCard.tsx` — `rounded-2xl`, teal border/colors, `text-3xl font-black`, icon bg update
- [ ] **TASK-7** Redesign `RevenueBar.tsx` — teal gradient fill, glow shadow, milestone tick marks at 25/50/75%
- [ ] **TASK-8** Redesign `DomainStatusGrid.tsx` — horizontal pill cards with `flex-wrap`, glowing status dots
- [ ] **TASK-9** Redesign `ActivityFeed.tsx` — vertical timeline with connector line, animated node dots, teal text colors

---

## Phase 4 — New Three.js Components

- [ ] **TASK-10** Create `src/components/three/TiltCard.tsx` — CSS `perspective(1000px)` tilt wrapper, mouse-tracking ±15° rotation + glow
- [ ] **TASK-11** Create `src/components/three/ParticleField.tsx` — Three.js fixed-bg canvas, 180 teal particles, slow drift animation
- [ ] **TASK-12** Create `src/components/three/HeroMesh.tsx` — Three.js torus knot with `MeshDistortMaterial`, `<Float>` wrapper, teal emissive glow
- [ ] **TASK-13** Create `src/components/three/SceneLoader.tsx` — `dynamic()` SSR-safe wrappers for ParticleField and HeroMesh
- [ ] **TASK-14** Create `src/components/ParticleBackground.tsx` — `'use client'` wrapper so `layout.tsx` (server component) can safely include it

---

## Phase 5 — Dashboard Layout Restructure

- [ ] **TASK-15** Rewrite `_dashboard.tsx` — bento 12-col grid, hero header with `DynamicHeroMesh`, `SectionLabel` component, `TiltCard` wrapping each KPI, `HealthChip` teal colors

---

## Phase 6 — Verification

- [ ] **TASK-16** Run `npm run build` — must pass with zero SSR/Three.js errors
- [ ] **TASK-17** Run `npx tsc --noEmit` — zero TypeScript errors
- [ ] **TASK-18** Manual smoke test — all 12 routes load, API refetch intervals intact, KPI tilt works, particles visible, torus knot animates

---

## Files Created (new)
- `src/components/three/TiltCard.tsx`
- `src/components/three/ParticleField.tsx`
- `src/components/three/HeroMesh.tsx`
- `src/components/three/SceneLoader.tsx`
- `src/components/ParticleBackground.tsx`

## Files Modified
- `frontend/package.json`
- `frontend/next.config.ts`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/_dashboard.tsx`
- `src/components/Sidebar.tsx`
- `src/components/KpiCard.tsx`
- `src/components/DomainStatusGrid.tsx`
- `src/components/ActivityFeed.tsx`
- `src/components/RevenueBar.tsx`

## Files NOT touched
- `src/lib/api.ts`, `constants.ts`, `utils.ts`
- All domain pages (`/gmail`, `/whatsapp`, `/linkedin`, etc.)
- `src/components/ui/` (shadcn primitives)
- `src/app/page.tsx`
