# Color

**Neutral by default; color means something.** The house theme (Raineworks) is raineworks.com's:
shadcn's black and white, with one brand accent, a peach-to-teal gradient (`#ea9a7e` → `#2998ad`,
blended in oklab), used only as decoration. Every color on a dashboard is one of:

1. **A neutral**: surfaces, text, controls.
2. **A light's own color**: inside light tiles and rows only.
3. **A status**: success, warning, info, danger, for real states.
4. **The brand gradient**: decoration only (an edge, a glow, a hairline).

Tokens are OKLCH (perceptually even, so equal lightness steps look equal:
[Ottosson](https://bottosson.github.io/posts/oklab/),
[Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)). Contrast is
WCAG 2.2: 4.5:1 for text, 3:1 for controls and focus rings.

## At most three hues at once

On any screen:

1. **One status color in the chrome**: the most important active one (danger over warning over info
   over success).
2. **Light colors**, inside light tiles.
3. **The brand gradient**, on one element in view.

Everything else is neutral. Today's kitchen panel shows six or seven unrelated hues (a peach light,
teal and blue icons, Assist's violet-pink ring, green, amber, red), so none of them means
anything. Section and card icons are neutral unless they show a state.

## Neutrals

Roles, not raw steps (the model is [Radix's 12-step scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)):

| Token | Light | Dark | Role |
| :--- | :--- | :--- | :--- |
| `background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | The page |
| `card` / `popover` | `oklch(1 0 0)` | `oklch(0.19 0 0)` / `oklch(0.22 0 0)` | Level 1 surface / floating |
| `secondary`, `muted`, `accent` | `oklch(0.97 0 0)` | `oklch(0.25 0 0)` | Controls and chips inside a surface |
| `foreground` | `oklch(0.145 0 0)` | `oklch(0.94 0 0)` | Text (0.94, not 0.985: less glare) |
| `muted-foreground` | `oklch(0.50 0 0)` | `oklch(0.72 0 0)` | Secondary text (≥ 5.3:1 / 6:1) |
| `border` | `oklch(0.92 0 0)` | `oklch(1 0 0 / 9%)` | Hairlines (decorative, 1.2:1) |
| `input` | `oklch(0.60 0 0)` | `oklch(1 0 0 / 38%)` | A control's edge (≥ 3:1) |
| `primary` / `-foreground` | `oklch(0.205 0 0)` / `oklch(0.985 0 0)` | `oklch(0.93 0 0)` / `oklch(0.205 0 0)` | The main action; and "on" |

**Dark elevation is lightness, not shadow** (shadows don't show on dark; Material 3 and Apple raise
a surface's lightness instead): page 0.145, card 0.19, floating 0.22. Before these, the card was 1.10:1
from the page and only the hairline separated them.

## The brand gradient

- Decoration only: the primary button's edge, a selected toggle's edge, the focus edge, the glow
  under the main action, one hairline per page, the sidebar's selection.
- **Never a state**: not success, not "on", not selected-as-meaning.
- **Never text.** Where text must be tinted, the teal ink `#1f7f92` (4.66:1 on white).
- **One gradient element in view.**
- **Assist uses the gradient**, not its own blue-violet-pink, so it adds no hue.

## Status colors

Hues chosen to stay apart for color-blind eyes (below): a bluish green, a true yellow-amber, a
blue, a red. Each has a **solid** (badges, toasts, a status button; with its `-foreground`), a
**tint** (10% in light, 14% in dark, mixed in oklab over the surface), and **text on the tint** in
the status color itself.

| Token | Light | Dark | Light: text on bg / on tint / white on solid | Dark: text on card / on tint / dark text on solid |
| :--- | :--- | :--- | :--- | :--- |
| `success` | `oklch(0.50 0.12 160)` | `oklch(0.76 0.14 170)` | ~5.7 / 4.9 / 5.7 | 8.9 / 7.1 / 9.8 |
| `warning` | `oklch(0.50 0.11 65)` | `oklch(0.85 0.16 88)` | 6.2 / 5.3 / 6.2 | 11.3 / 8.7 / 12.4 |
| `info` | `oklch(0.50 0.14 250)` | `oklch(0.72 0.13 255)` | 6.0 / 5.2 / 6.0 | 7.2 / 5.9 / 8.0 |
| `destructive` = `alarm` | `oklch(0.52 0.21 27)` | `oklch(0.68 0.20 22)` | 6.2 / 5.3 / 6.2 | ~5.6 / ~4.8 / ~6.3 |

Contrast computed by the color research (WCAG 2.x, with APCA as a cross-check); the values marked ~
were estimated; `contrast.test.ts` now holds every one at 4.5:1 or more.

- **`alarm` is `destructive`**: one red for danger. There were four different reds across light
  and dark, some outside what a screen can show.
- **Every theme** gets status colors that pass, not only Raineworks: they're the Neutral preset's,
  which every other theme inherits (its dark status solids were 3.0–3.5:1).
- **No raw palette classes** (`text-violet-*`, `sky`, `indigo`, `cyan`, `emerald`, `amber`): about
  twenty uses today compete with the status tokens.

## "On"

- **A light is its own color**, as a small fill (the icon tile, the dimmer's track), never a whole
  card.
- **Everything else that's on** (a fan, a speaker, a diffuser, a switch) is **neutral "on"**: the
  `primary` fill (black in light, near-white in dark) on its icon tile, with a word ("On · 60%").
  Not green, not blue: green means success, blue means info.
- **Off** is a neutral tile with the icon muted.

## Night

Wall panels are LCD tablets in hallways and kitchens, used at night.

- **Near-black, not black:** `oklch(0.145 0 0)`. Pure black beside bright elements shows the
  backlight bleeding, and black with white text (21:1) glares worst at night.
- **Text at 0.94, not white.**
- **A night level, driven by Home Bedtime** (the panels' status lights already dim to 10% then):
  surfaces and text 0.03–0.05 darker, the brand glow off, status chroma capped at about 0.13, the
  alarm alone at full strength. Contrast still at least 4.5:1.
- **No large bright areas:** an on-light fills its icon tile, not its card.

## Color blindness

Never color alone (WCAG 1.4.1): every status has an icon and a word; charts have labels or
patterns. Simulated (Machado 2009) on today's dark status colors, success and warning nearly
merge for protan and deutan (ΔE 6.6 / 7.5), success and alarm for deutan (6.9), and success and info
for tritan (4.1). The hues above roughly double the weakest pairs (success / warning ≥ 12.8,
success / danger ≥ 10.7). Success and info stay close for tritan (~6.5), which is inherent to blue
against blue-green, so they always differ by icon (a check against an "i"). See also the
[Okabe-Ito](https://jfly.uni-koeln.de/color/) and [IBM](https://carbondesignsystem.com/data-visualization/color-palettes/)
palettes, which avoid red-green for the same reason. Chart series keep their validated
`--chart-1…7`.

## Tests

A test computes the contrast of every status pair (text on background, on tint, foreground on
solid) for every theme and both modes, and fails below 4.5:1; another fails on raw palette classes
in components.
