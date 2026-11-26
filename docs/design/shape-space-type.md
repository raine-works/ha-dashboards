# Shape, space and type

## Squircles

A rounded rectangle joins a straight edge to a circular arc: the curvature jumps at the join and
the eye catches the seam. A **squircle** (a superellipse, Apple's "continuous corner") ramps the
curvature up and down, so the shape reads as one object rather than a square with its corners cut
off ([Figma](https://www.figma.com/blog/desperately-seeking-squircles/); iOS's corners match
Figma's 60% smoothing). It shows most on large shapes: tiles, cards, dialogs.

**How:** CSS `corner-shape` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/corner-shape)).
`border-radius` still sets the corner's size; `corner-shape: squircle` (= `superellipse(2)`) sets its
curve. Borders, outlines, focus rings, shadows, backgrounds and `overflow` all follow it, which
is why it beats clip-path masks.

```css
/* theme.css: the radii are the design; the squircle is a bonus where it's drawn */
@supports (corner-shape: squircle) {
	:host, :root { --corner-cap: 1000; } /* corners rounder than the default only here (below) */
	* { corner-shape: squircle; }
	::before, ::after { corner-shape: inherit; } /* a ring around a circle stays a circle */
	.rounded-full, .assist-orb { corner-shape: round; } /* avatars, round keys and the orb stay circles */
}
```

| Where | Squircles? |
| :--- | :--- |
| Chrome, Edge, Android WebView (the wall panels, the Android app) | Yes, from Chromium 139, Aug 2025 ([web.dev](https://web.dev/blog/web-platform-08-2025)), if the WebView is that recent. The ROAMiQ panels' isn't (Nov 2026): rounded corners |
| Safari, the iOS app (WKWebView) | Not as of Safari 26: rounded corners |
| Firefox | Not reliably: rounded corners |

- **The design must stand on plain rounded corners**; squircles make it better where they're drawn.
- **Rounder than the default only as squircles.** A round corner half a shape's height makes it a
  circle (Raineworks' icon tiles and header buttons were circles on the wall panels). So the radii
  take a theme's corners above the default (`--corner-scale` over 1, or `--radius` over 0.625rem)
  only where the browser draws squircles: elsewhere `--corner-cap` (1, lifted in the `@supports`
  block) holds them at the default, rounded squares (`theme.css`, tested in `contrast.test.ts`).
  A component drawing its own corners off `--radius` (the color ring around a light's icon, the
  toasts) caps it the same way, `min(var(--radius), 0.625rem * var(--corner-cap, 1))`; a test fails
  on an uncapped one.
- **No clip-path or mask fallback**: it cuts off shadows, borders and focus rings and needs script
  on every resize.
- **Check the panels' WebView version** before relying on it there.
- `@supports` and `corner-shape` work inside the Shadow DOM; nothing here needs `@property`.
- A squircle at the same radius looks slightly larger; trim about 10% only if a shape looks bloated.
- **Nested shapes:** inner radius = outer radius − padding, never under 6px.

### Radius scale

Set by role (`rounded-chip`, `rounded-control`, `rounded-control-lg`, `rounded-icon`,
`rounded-tile`, `rounded-dialog`), each scaled by the theme's corners (`--corner-scale`: the theme
editor's **Corners** ÷ 0.625rem, pixels times it, since Home Assistant's rem is 14px), so a theme
shapes everything in proportion. Raineworks, the default, uses
1rem: the icon tiles and the big buttons are full squircles (a corner about half their height), the
look of an app icon. Where squircles aren't drawn, it falls back to the × 1 column. The other
presets keep 0.625rem.

| Role | Base | At 0.625rem (× 1) | Raineworks (1rem, × 1.6) |
| :--- | :--- | :--- | :--- |
| Chip, badge, small input (≤ 32px tall) | 8px | 8px | 12.8px |
| Button, 36–44px | 12px | 12px | 19.2px |
| Button, 48–56px | 16px | 16px | 25.6px |
| Icon tile, 40–48px | 14px | 14px | 22.4px |
| Card, room tile | 20px (24px on wall panels) | 20px (24px) | 32px (38.4px) |
| Dialog; a phone sheet's top corners | 28px | 28px | 44.8px |
| Slider, switch, progress (`rounded-md`) | `--radius` − 2px | 6.75px | 12px |
| Avatar, the PIN pad's keys | A circle (faces read as circles) | | |

## Spacing

**A 4px base on an 8px rhythm.** The steps are **4, 8, 12, 16, 24, 32, 48**; anything else (6, 10,
14, 20 as a gap) goes. Space between groups is clearly larger than space inside them, at least 2:1
(Refactoring UI).

| Where | Rule |
| :--- | :--- |
| Icon to label | 8px (6 when compact) |
| A control's side padding | 16px (12px on an icon-only side) |
| Inside a card | 16px phone, 20px desktop, 24px wall panel; header to content 12px |
| Items in a group (rows) | 8px, or a hairline with 12px padding |
| Unrelated groups | 24px |
| Section gutters; page edge | 16px phone, 24px desktop and panel; plus safe areas |
| Tiles in a grid | 12px phone, 16px elsewhere |

**Density per surface**, as tokens (`--pad`, `--gap`; `p-pad`, `gap-gap`) set in theme.css by the
surface (the wall panels' `data-touch`) and its width, so components never hard-code their padding:

| Surface | Density | Pad / gap | Smallest target |
| :--- | :--- | :--- | :--- |
| Wall panel, 1280×800 | comfortable | 24 / 16 | 48px |
| Wall panel, 960×600 | compact | 16 / 12 | 48px: padding gives way, targets don't |
| Phone | compact | 16 / 12 | 44px |
| Desktop | standard | 20 / 16 | 44px |

**Grids:** wall panels three columns (24px gutters at 1280, 16px at 960); phone one column with
tiles two across; desktop up to 1600px wide.

## Typography

**Geist** for everything (raineworks.com's face), Geist Mono only for codes. Changing numbers use
`tabular-nums`. A scale of about 1.2, as Tailwind sizes carrying their line height, weight and
tracking (`text-display`, `text-figure`, `text-heading`, `text-title`, `text-body`, `text-label`,
`text-caption`, `text-overline`, in the table's order):

| Role | Size / line height | Weight | Tracking |
| :--- | :--- | :--- | :--- |
| Clock (wall panel) | 64–72 / 1.0 (48 at 960) | 300 | −0.03em |
| Big number (temperature, setpoint) | 40–48 / 1.0 | 400 | −0.02em |
| Page title | 28 / 1.2 | 600 | −0.02em |
| Section / card title | 18–20 / 1.3 | 600 | −0.01em |
| Body | 16 / 1.5 (14 / 1.45 on a dense desktop) | 400 | 0 |
| Control label | 14–16 / 1.2 | 500 | 0 |
| Caption, status line | 13–14 / 1.4 (14 on wall panels) | 400 | 0 |
| Overline (a floor's name) | 12 / 1.2 | 600, uppercase | +0.04em |

- **Nothing a user reads on a wall panel under 14px**; nothing anywhere under 12px. Today 70% of
  all text is 12–14px and the status lines are 12px muted grey, too small and faint at 2m.
- At 960×600 only the display sizes shrink; body doesn't.
- **Weights:** 400 body, 500 labels, 600 titles; no 700 (muddy at small sizes on dark). Big
  numbers light (300–400): large and heavy shouts.
- Tighter tracking as size grows; looser for uppercase.
- No arbitrary sizes (`text-[10px]`, `text-[11px]`).

## Depth and surfaces

Fills first, then hairlines, shadows only for what floats.

| Level | For | How |
| :--- | :--- | :--- |
| 0 Page | The background | `background` |
| 1 Surface | Sections, tiles | One fill step up; no border (a 1px hairline in light mode only) |
| 2 Inset | Controls inside a surface | One more fill step; no border |
| 3 Floating | Popovers, toasts, dialogs | Fill + a soft shadow + a hairline (dark: a lighter fill and a 10% white hairline) |

- **No card inside a card.** A section is a surface; what's inside it is rows, separated by space or
  a hairline.
- **"On" is luminance, not hue:** the icon tile goes from the inset fill to `primary`; off is muted.
  A light's own color is the one exception, and only on its icon tile and slider.
- One shadow recipe for what floats; none on cards in the flow.

## Icons

[Lucide](https://lucide.dev), one stroke per surface: 1.75 at 20px and up, 2 at 16px.

- **Sizes:** 16 in text, 20 in controls, 24 in tiles and navigation, 28–32 in big status tiles.
- **With a label:** centered, 8px gap, 16px icons with 14px text and 20px with 16px.
- **Icon tiles:** 40 / 44 / 48px, a squircle at about 28%, the icon half the tile; neutral inset
  fill off, `primary` (or a light's color) on.
- **Icon-only** only for Close; it still has an `aria-label` and a 44px target.

## Motion

| What | How long | Easing |
| :--- | :--- | :--- |
| Press, hover, a color change | 100–150ms | ease-out |
| A toggle, chip or tile changing state | 150–200ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Dialog or popover in | 200ms (scale from 0.96 + fade) | the same |
| Dialog out | 150ms | `cubic-bezier(0.3, 0, 1, 1)` |
| Sheet | 320ms | `cubic-bezier(0.32, 0.72, 0, 1)` (already in theme.css) |
| A sheet dragged down, let go | 320ms, sliding away or back | the sheet's curve (`lib/sheet-drag.ts`) |
| A sheet closed otherwise (a tap outside, its X, Back) | 320ms, sliding away | the sheet's curve (`lib/sheet-drag.ts`) |
| A swipe settling | 450ms | `ease-spring` (already in theme.css) |
| A number changing (`NumberFlow`) | 900ms roll | NumberFlow's own |

- Only `transform` and `opacity` (the panels are slow); never `corner-shape`, blur or shadow spread.
- Ambient motion only for alerts and what's playing; one or two things moving on a screen at most.
  A number rolls when it changes because someone changed it or it's news (a setpoint, the
  temperature, a count), never steadily at the edge of the screen: the header's timer and live
  power count in plain digits, the Timer dialog's clock rolls. A countdown that's an alert (the
  alarm's exit and entry delay) rolls where the eye already is. See
  [NumberFlow](components.md#numberflow).
- `prefers-reduced-motion`: no movement or scaling; opacity fades at 100ms; spinners stay.
