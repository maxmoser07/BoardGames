# BoardGames – Design System

Rebuild of the complete front-end surface on one token set. The shell, forms,
cards and every application screen draw from the same palette, radii, elevation
and interaction patterns; screen CSS no longer defines its own theme.

- **Brand base:** `#4f46e5` (indigo)
- **Scale generator:** [uicolors.app](https://uicolors.app) → Tailwind indigo
- **Stack:** React 19 · Vite 8 · TypeScript · plain CSS + Tailwind v4
- **Source of truth:** `frontend/src/index.css` (tokens + component layer) and
  `frontend/src/tailwind.css` (Tailwind bridge)

---

## 1. Palette

The full 50–950 ramp is exported twice, in the format each layer expects:

| Export | File | Form |
| --- | --- | --- |
| Plain CSS | `frontend/src/index.css` | `--brand-50 … --brand-950` custom properties |
| Tailwind v4 | `frontend/src/tailwind.css` | `@theme inline { --color-brand-50 … }` → `bg-brand-600`, `text-brand-700`, … |

| Step | Hex | Typical role |
| --- | --- | --- |
| 50 | `#eef2ff` | page tint, selected rows, avatar background |
| 100 | `#e0e7ff` | soft accent, hover wash |
| 200 | `#c7d2fe` | accent borders, focus-adjacent hairlines |
| 300 | `#a5b4fc` | dark-mode accent text, decorative gradient |
| 400 | `#818cf8` | focus border, dark-mode links |
| 500 | `#6366f1` | brand surfaces, gradient start, ring base |
| 600 | `#4f46e5` | **primary interactive** (buttons, active nav, links) |
| 700 | `#4338ca` | hover / pressed, strong text on tint |
| 800 | `#3730a3` | gradient end, deep text |
| 900 | `#312e81` | brand illustrations, dark panels |
| 950 | `#1e1b4b` | deepest ink, shadows |

Neutral companion: Tailwind **slate** (`--slate-50 … --slate-950`) for text,
borders and quiet surfaces, so the brand stays an accent rather than a wash.

### Why 600 for buttons, not 500

White on `#6366f1` measures **4.47:1** — just below WCAG AA for normal text.
The primary button therefore uses a `600 → 700` gradient (6.29–7.90:1), while
500 remains available for non-text brand surfaces and gradients. The button
component keeps its Uiverse-inspired sheen and expanding radial glow.

---

## 2. Semantic roles

Light mode:

| Token | Value | Used for |
| --- | --- | --- |
| `--bg` | mix of brand-50 + white | page background |
| `--surface`, `--surface-elevated` | `#ffffff` | cards, panels, dialogs |
| `--surface-2` | slate-50 | inputs, list rows, quiet blocks |
| `--surface-3` | slate-100 | chips, skeletons, avatars |
| `--border` | slate-200 | default hairlines |
| `--border-strong` | slate-300 | hover edges, dashed empty states |
| `--border-accent` | brand-200 | selected / accented edges |
| `--text` | slate-900 | headings and body |
| `--text-muted` | slate-600 | secondary copy |
| `--text-dim` | slate-500 | meta, captions, placeholder |
| `--accent` | brand-600 | links, active states, focus outline |
| `--accent-strong` | brand-700 | hover |
| `--accent-soft` | brand-50 | tinted backgrounds |
| `--accent-ring` | brand-500 @ 32 % | 4 px focus glow |
| `--success` | `#15803d` | live / win / resolved |
| `--warn` | `#b45309` | paused / open / pending |
| `--danger` | `#b91c1c` | errors, aborted, destructive |
| `--info` | brand-700 | neutral status, done |

Dark mode (`prefers-color-scheme: dark`) remaps the same names to deep
blue-slate surfaces (`#0a0f1d`, `#111a2c`, `#16213a`, `#1d2a45`), light text
(`#e9eefb`, `#b3c0d6`, `#93a2bb`) and lightened accents (`brand-300/400`).
Components never branch on colour scheme — only tokens change.

### Contrast check (WCAG 2.1)

| Pair | Ratio | AA normal text |
| --- | --- | --- |
| `#ffffff` on brand-600 | 6.29:1 | pass |
| `#ffffff` on brand-700 | 7.90:1 | pass |
| brand-600 on `#ffffff` | 6.29:1 | pass |
| brand-700 on brand-50 | 7.07:1 | pass |
| slate-900 on `#ffffff` | 17.85:1 | pass |
| slate-600 on `#ffffff` | 7.58:1 | pass |
| slate-500 on `#ffffff` | 4.76:1 | pass |
| Light tile accents (blue/amber/red/violet/teal/rose) on white | 5.02–6.47:1 | pass |
| Dark text `#e9eefb` on `#111a2c` | 14.97:1 | pass |
| Dark muted `#b3c0d6` on `#111a2c` | 9.46:1 | pass |
| Dark dim `#93a2bb` on `#111a2c` | 6.73:1 | pass |
| brand-400 on `#111a2c` | 5.83:1 | pass |
| brand-300 on `#111a2c` | 8.72:1 | pass |
| Dark tile accents (lightened) on `#111a2c` | 9.16–12.06:1 | pass |

The dark-mode tile accents are deliberately overridden (`brand-300`, `#fca5a5`,
`#fcd34d`, `#c4b5fd`, `#5eead4`, `#fda4af`); the light values would fall to
2.7–3.5:1 on the dark card surface.

---

## 3. Shape, type, motion

| Area | Tokens |
| --- | --- |
| Type | `--font-sans` Inter/system, `--font-mono`; h1 `clamp(1.65rem … 2.15rem)` |
| Radii | `--radius-xs 6px`, `sm 10px`, `md 14px` (default), `lg 20px`, `xl 28px`, `pill 999px` |
| Spacing | `--space-1 … --space-7` (4 px → 48 px) |
| Elevation | `--shadow-xs/sm/md/lg`, `--shadow-accent` (indigo-tinted) |
| Focus | 2 px `--accent` outline + 4 px `--accent-ring` on controls |
| Motion | `--speed 160ms`, `--ease cubic-bezier(.2,.7,.2,1)`; all animation disabled under `prefers-reduced-motion` |

Background uses two fixed radial glows over `--bg`; cards add a masked 1 px
gradient edge so the surface reads as layered without heavy glassmorphism.

---

## 4. Components (Uiverse sources → implementation)

| Component | Uiverse source | Adaptation |
| --- | --- | --- |
| Buttons | [cssbuttons-io/weak-firefox-5](https://uiverse.io/cssbuttons-io/weak-firefox-5) | Expanding radial glow pseudo-element, sheen on primary, pressed translate. Classes: `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--danger`, `.btn--danger-ghost`, `.btn--sm`. |
| Inputs | [ozgeozkaraa01/sharp-rattlesnake-74](https://uiverse.io/ozgeozkaraa01/sharp-rattlesnake-74) | Filled field, transparent 2 px border, indigo glow ring on focus, icon and trailing-action slots. Classes: `.input`, `.input-wrap`, `.input--with-icon`, `.input--with-action`, `.select`, `.textarea`. |
| Cards | [Yaya12085/mean-vampirebat-50](https://uiverse.io/Yaya12085/mean-vampirebat-50), [LilaRest/quick-dragonfly-7](https://uiverse.io/LilaRest/quick-dragonfly-7) | Pricing-card anatomy (head / body / foot) without fixed dark colours; masked gradient hairline on `.card`, `.panel`, `.result`, `.replay__stage`, `.hero`, `.auth__card`. |
| Switch | [mobinkakei/strong-lizard-79](https://uiverse.io/mobinkakei/strong-lizard-79) | Only the structural idea (label + control + hint) is reused for the rated/casual radio cards (`.mode__option`); the whimsical moon/star skin is not. |
| Checkbox | [catraco/brown-dodo-68](https://uiverse.io/catraco/brown-dodo-68) | Concept only. Native `<input type="checkbox">` with `accent-color: var(--accent)` is kept for keyboard and screen-reader fidelity (`.checkbox`, `.game-editor__check`). |
| Loader | [JkHuger/new-deer-97](https://uiverse.io/JkHuger/new-deer-97) | Not used: too heavy for an app spinner. `.spinner` uses a single rotating `LoaderCircle`; `.skeleton` uses a moving shimmer gradient. |

The project deliberately styles with shared CSS classes rather than a new
component framework, so each Uiverse snippet is adapted into the existing class
API (`.btn`, `.input`, `.card`, …). React wrappers already exist where the app
needs behaviour (`components/ui.tsx`, `components/ui/*`, `AppShell`,
`AuthLayout`); screens keep using semantic HTML plus those classes.

Additional primitives: `.badge` + tone modifiers, `.chip` + role modifiers,
`.avatar`, `.side__dot`, `.notice` + tones, `.empty`, `.list`,
`.search`, `.table`-style `.meta-list`/`.rating-row`, `.tile`, `.session`,
`.game`, `.viz__*`, `.share-qr-dialog`.

### Token usage examples

```tsx
<button className="btn btn--primary">Partie starten</button>
<button className="btn btn--ghost btn--sm">Abbrechen</button>

<label className="field">
  <span className="label">Spiel suchen</span>
  <input className="input" type="search" />
</label>

<section className="card auth__card">
  <h2 className="section-title">Rangliste</h2>
  <span className="badge badge--live">Laufend</span>
</section>
```

```css
/* New screen-specific CSS should read tokens, never literal colours */
.my-block {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
}
```

---

## 5. Screen mapping

| Route / screen | Shell | Key components |
| --- | --- | --- |
| `/` catalog | `AppShell` | `.hero` + `.stat`, `.search`, `.tiles` → `GameTile`, `.catalog-notes` |
| `/login`, `/signup` | `AuthLayout` | `.auth` split layout, `.auth__card`, `.auth__social`, `.input-wrap`, `.field__error`, `.checkbox`, `.btn--primary` |
| `/auth/callback` | `AuthLayout`-style solo | `.auth--solo`, `.auth__status-icon`, spinner/alert states |
| `/games/:name` setup | window header | `.detail-head`, `.panel`, `.mode__option`, `.picker`, `.rules`, `.form` |
| `/play`, `/play/:name` | window header | `.tiles` with play CTA, `.notice--info`, game board + side panels |
| `/sessions` | `AppShell` | `.hero`, `.panel`, `.session`, `.moves`, `.preview`, `.badge--*` |
| `/replays`, `/replays/:id` | `AppShell` | `.replay`, `.replay__stage`, `.replay__moves`, `.replay__scrubber`, `.panel` |
| `/ratings` | `AppShell` | `.hero`, `.rating-row`, `.rating-tier--*`, `.rating-reset` |
| `/profile` | `AppShell` | `.detail-head`, `.card`, `.rating`, `.friend-row`, `.friend-block`, `.list` |
| `/reports` | `AppShell` | `.hero`, `.panel`, `ReportVisualisation` (`.viz__*`) |
| `/admin/games` | `AppShell` | `.game-form`, `.game-editor`, `.list`, `.badge` |
| `/camera` | `AppShell` | `.camera-*` (CameraView.css), `.board-game` |
| game window `/:game/:id` | `.window` | `.window__*`, `.player`, `.board`, board styles from `games.css` / `ConnectFour.css` |

`frontend/src/ConnectFour.tsx`, `useConnectFour.ts` and `ConnectFour.css` remain
untouched as required; they consume the same global tokens and therefore follow
the new palette automatically.

---

## 6. Layout & responsiveness

- Shell: sticky translucent header (`backdrop-filter`), brand, pill navigation,
  user block, footer. ≤1100 px the navigation moves to its own row; ≤720 px it
  becomes a dropdown opened by the **Menü** button (`aria-expanded`,
  `aria-controls`, Escape closes it).
- Auth: two-column split above 1024 px (form left, brand panel right); the brand
  panel is removed below that width, the form stays fully usable.
- Content grids collapse from `0.9fr / 1.1fr` to one column at 900 px; tiles use
  `auto-fill minmax(19rem, 1fr)`, stat rows wrap, tables become stacked rows.
- Touch targets: shell controls are at least 2.5rem tall, mobile navigation
  rows 2.75rem, inputs 2.4rem; icon-only actions keep `aria-label`/`title`.
- Long lists (`.list`, `.moves`, `.replay__moves`) scroll internally on desktop
  and expand on mobile.

---

## 7. Accessibility

- Global `:focus-visible` outline plus a 4 px ring on buttons/inputs; focus is
  never removed without a replacement.
- Navigation exposes `aria-current="page"`; the mobile trigger exposes
  `aria-expanded` and `aria-controls`.
- Every status has text, not only colour (`Beendet`, `Rot gewinnt`, `Läuft`,
  `in Arbeit`, role chips). Red/yellow sides always carry a written label.
- Forms keep `<label for>`, `aria-invalid`, `aria-describedby` and
  `role="alert"` error text; password visibility is a real button with
  `aria-pressed` and a changing label.
- Spinners announce via `role="status"`; destructive notices use
  `role="alert"`.
- Decorative SVG/icons/art are `aria-hidden`; QR dialogs and navigation keep
  visible headings and labels.
- `prefers-reduced-motion` collapses all transitions/animations to 0.01 ms.
- System dark mode is fully supported through the same semantic tokens.

---

## 8. Files changed

| File | Purpose |
| --- | --- |
| `frontend/src/index.css` | reset, brand + neutral scales, semantic tokens, light/dark, component layer, shell, screens, responsive rules |
| `frontend/src/tailwind.css` | `@theme inline` brand scale, shadcn `--ui-*` bridge for the existing `components/ui/*` primitives |
| `frontend/src/components/AppShell.tsx` | rebuilt header, responsive nav, mobile menu, user block, footer |
| `frontend/src/Catalog.tsx` | rebuilt hero, stats, search, tile grid, notes |
| `frontend/src/components/GameTile.tsx` | unchanged API, now rendered by the new tile component layer |
| `frontend/src/pages/AuthLayout.tsx` | new shared split-screen auth frame |
| `frontend/src/pages/Login.tsx` | German copy, token-based form, accessible OAuth buttons |
| `frontend/src/pages/SignUp.tsx` | German copy, token-based form, password confirmation |
| `frontend/src/pages/OAuthCallback.tsx` | token-based callback state instead of ad-hoc Tailwind |
| `frontend/src/lib/format.ts` | hardened `initials()` for missing usernames |
| `DESIGN-SYSTEM.md` | this document |

Verification: `npm run lint` and `npm run build` in `frontend/` both pass.
