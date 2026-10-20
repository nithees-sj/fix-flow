# UI design system

FixFlow ships a **light theme only**. It is calm, high-contrast and information-dense where managers need it, and large-target and
simple on the technician's phone. Tokens are CSS variables declared in Tailwind 4's `@theme` (`apps/web/app/globals.css`),
with `color-scheme: light`. Components use **semantic** utilities (`bg-surface`, `text-ink-3`, `border-line`), never raw hex.

## Color tokens

| Token | Value | Use |
|---|---|---|
| `canvas` | `#f8fafc` | App background |
| `surface` | `#ffffff` | Cards, tables, dialogs |
| `surface-muted` / `surface-sunken` | `#f1f5f9` / `#f6f8fb` | Wells, sidebar, table headers |
| `line` / `line-subtle` / `line-strong` | `#e2e8f0` / `#edf1f6` / `#cbd5e1` | Borders and dividers |
| `ink` | `#0f172a` | Primary text |
| `ink-2` | `#334155` | Secondary text |
| `ink-3` | `#4b5a70` | Tertiary text and labels (≥ 4.5:1 on white) |
| `ink-4` | `#5f6f86` | Hints and meta text (≥ 4.5:1 on white) |
| `brand` / `brand-hover` / `brand-active` | `#2563eb` / `#1d4ed8` / `#1e40af` | Primary actions, focus, selection |
| `brand-soft` / `brand-ink` | `#eff6ff` / `#1d4ed8` | Selected rows and chips |
| `teal` / `teal-ink` | `#0d9488` / `#0f766e` | Secondary accent |
| `success` / `success-ink` / `success-soft` | `#16a34a` / `#15803d` / `#f0fdf4` | Met, approved, resolved |
| `warning` / `warning-ink` / `warning-soft` | `#d97706` / `#b45309` / `#fffbeb` | At risk, on hold |
| `danger` / `danger-ink` / `danger-soft` | `#dc2626` / `#b91c1c` / `#fef2f2` | Missed, critical, destructive |

`ink-3` and `ink-4` were raised from the Tailwind slate defaults after axe flagged contrast failures. Status color is
**never the only signal**: badges always carry text and an icon or dot.

## Typography

| Property | Value |
|---|---|
| Typeface | Geist Sans and Geist Mono (the `geist` package, self-hosted) |
| Base size | 14 px for the app |
| Type scale | 12 / 13 / 14 / 16 / 18 / 22 / 24 / 30 |
| Numerals | Tabular figures (`tabular-nums`) for metrics, times and ids |
| Work-order numbers and asset tags | Mono |

## Shape, depth and motion

| Property | Value |
|---|---|
| Radius | 4 / 6 / 8 / 12 / 16 px (`radius-xs` … `radius-xl`) |
| Shadows | Very soft (`shadow-xs` … `shadow-lg`); a focus ring as `shadow-focus` (3 px brand at 22%) |
| Spacing | 4 px grid. Cards use 20 px padding on desktop and 16 px on mobile |
| Motion | 150–300 ms ease-out (fade, slide-up). Disabled under `prefers-reduced-motion` |

## Status and priority language

| Status | Tone | | Priority | Indicator |
|---|---|---|---|---|
| Open | Blue | | Critical | 4 red bars |
| Assigned | Indigo | | High | 3 amber bars |
| In progress | Amber | | Medium | 2 blue bars |
| On hold | Slate | | Low | 1 slate bar |
| Pending verification | Violet | | | |
| Resolved | Green | | | |
| Closed | Neutral | | | |
| Cancelled | Neutral, struck | | | |

SLA clocks render as an icon plus text ("in 3h 10m", "Missed", "Met"), with the exact due time in a tooltip.

## Components (`apps/web/components/ui`)

Hand-written in the shadcn style on Radix primitives (the `radix-ui` umbrella package):
- `Button` (primary, secondary, ghost, danger; xs to lg; loading state), `Input`, `Textarea`, `NativeSelect`, `Field` (label, hint,
  error, optional marker)
- `Select`, `Combobox`, `FilterSelect`, `Checkbox`, `Switch`, `Progress` (requires `label`), `Dialog`, `Menu`, `Tooltip`
- `Card`, `CardHeader`, `Badge`, `Avatar`, `EmptyState`, `Skeleton`, `Alert`, `StatTile` (`role="group"` with a name), `Table`

App-level components:
- App shell: collapsible sidebar, top bar, org switcher, notification bell, ⌘K command palette, mobile bottom navigation for
  technicians and requesters
- Offline and sync banners

## Data visualization

Recharts 3, wrapped in `components/charts`:
- **Categorical palette:** `#2a78d6`, `#eb6834`, `#1baf7a`. It was validated for color-vision deficiency, and each series also differs
  by position or label.
- **`ChartFrame`:** every chart has a visible legend, a title and description, and a **table view toggle**, so the data is readable by
  screen readers and without color.
- Containers use `min-w-0` so charts shrink correctly in grid cells on mobile.

## Accessibility checklist

- Semantic landmarks, a skip link, one `h1` per page, breadcrumbs as `nav[aria-label="Breadcrumb"]`.
- Every control has a label (visible or `aria-label` matching visible text). Dialogs trap focus (Radix).
- Visible focus rings on every interactive element. Touch targets are at least 44 px on mobile.
- Toasts are announced (sonner, `aria-live`). Live status uses `role="status"`.
- `@axe-core/playwright` scans public and application pages in CI (`tests/e2e/specs/accessibility.spec.ts`).

## Visual QA

`pnpm qa:screens` captures every main page at 1440 px (desktop) and 390 px (mobile) into `tests/e2e/visual/screens/`;
add the 834 px tablet viewport with `VIEWPORTS=desktop,tablet,mobile`. After UI work, review
the PNGs for overflow, alignment, truncation and hierarchy before committing.
