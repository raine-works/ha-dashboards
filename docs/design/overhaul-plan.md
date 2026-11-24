# Overhaul plan

Where the dashboards are (November 2026) against [the principles](principles.md), and how to get to
the design in these pages without a big-bang rewrite. Each phase is its own pull requests, released
and lived with before the next.

## What's wrong today

From an audit of the code and screenshots of a real house (the kitchen panel at 1280×800, the
basement at 960×600, a desktop and a phone).

| # | Problem | Where | Direction |
| :--- | :--- | :--- | :--- |
| 1 | **The header is overloaded**: about 17 targets of equal weight (clock, date, weather, seven buttons, six avatars) | Every header | Three zones: status (time, weather), at most three quick actions, one overflow; people and pets into the status |
| 2 | **The phone's first screen is all header**: 12 controls in 165px before the first light; settings (Theme, Alerts) mixed with live status | Phone | One compact header row; launchers in a sheet or tab; settings in one place |
| 3 | **Disarm is the loudest thing on screen while the house is safe**: a full-width red button | Security | A StatusTile; Disarm quiet while armed (it already asks for the PIN) |
| 4 | **Five row patterns for one idea**, a controllable device | Security, Climate, room dialog | One DeviceRow |
| 5 | **Climate is four stacked cards with their own headers** and doesn't fit the panel | Climate | One section: a thermostat summary, then DeviceRows |
| 6 | **Two header levels** (sections, then cards) and a third (floor overlines) | Everywhere | One SectionHeader; overlines for groups |
| 7 | **Color is overloaded**: amber for on and for warning, green for armed and for "Good", blue for info and for categories, Assist's own rainbow | Everywhere | The [color](color.md) budget: neutral, a light's color, one status, the brand edge |
| 8 | **Room tiles waste space and split the tap**: fixed widths leave half-empty rows; a bright power circle draws the eye and competes with the tile | Lighting | Equal-width tiles filling the row; one tap target |
| 9 | **No shape system**: four radii on one screen, no squircles | Everywhere | The radius scale and `corner-shape` |
| 10 | **No type scale**: 70% of text is 12–14px; status lines are 12px muted grey | Everywhere | The type scale; 14px minimum on panels |
| 11 | **Buttons: ten sizes, one look**; primary, toggle, status and navigation all outline | Everywhere | Three sizes, four roles |
| 12 | **Lock rows mix state and action** ("Locked" is a state, "Open door" an action, in the same slot); rows 46px | Security | DeviceRow: state in the line, action on the button; 56px |
| 13 | **Dialog sizes are arbitrary** and their anatomy varies | Dialogs | Three sizes, one anatomy |
| 14 | **The bedtime dialog has seven regions** and switches that read backwards | Bedtime | What happens as a summary; the house option as a choice at the top; the primary action leads |
| 15 | **Unlabeled icon controls**: the curtain's ‹› / ›‹, the palette button, the holiday mute by the date | Climate, Lighting, header | Labels, or into the dialog |

Also: dark surfaces barely separate from the page (1.10:1); status colors in themes other than
Raineworks fail contrast in dark mode; four different reds mean danger; about twenty raw palette
colors bypass the tokens. The lists of dialogs (to-do, music, TVs, the brief) weren't audited
visually yet and get their pass in phase 4.

## Phase 1: foundations (no visible redesign yet)

Tokens and primitives, so every later change is small.

- **Color:** the neutral and status tokens in [Color](color.md); `alarm` = `destructive`; every
  preset passing; a contrast test per theme and mode; a lint against raw palette classes.
- **Shape:** the radius tokens and the `corner-shape` block; check the panels' WebView version.
- **Space:** density tokens (`--pad`, `--gap`) per surface.
- **Type:** the scale as Tailwind theme sizes; arbitrary sizes removed.
- **Primitives:** `Button` roles and sizes (old sizes mapped, so nothing breaks), `Section`,
  `Tile`, `StatusTile`, `DeviceRow`, the `detail` dialog size; each in the demo house.

## Phase 2: the wall panels

The shared, most-seen surface; 960×600 is the hardest size, so it's the test.

- Header in three zones; the two-second status (secure, needs me, what's on, time and temperature).
- Lighting: equal tiles, one tap target.
- Security: the alarm as a StatusTile; doors and garage as DeviceRows in two groups.
- Climate: one section, a thermostat summary, DeviceRows.
- Night level on Home Bedtime.
- Check: walk past the kitchen panel; the 960×600 panel fits without scrolling Security or Climate.

## Phase 3: the phone and desktop

- Phone: one header row; launchers off the first screen; the tab bar unchanged (it works); sheets
  for every detail dialog.
- Desktop: the panel layout with more room for status, not more content.

## Phase 4: the dialogs

The workspace dialogs (music, cameras, to-do, calendar, weather, energy, TVs, the brief, messages)
and the confirmations (bedtime, the keypad) rebuilt on the dialog anatomy, the button roles and
DeviceRows; an audit of each first ([The dialogs](dialogs.md): what they had in common, and each
one's plan).

## Phase 5: polish

Motion per [Motion](shape-space-type.md#motion); empty and error states; microcopy pass; the
holiday eggs and Assist on the new tokens; screenshots in the docs.

## How we'll know

- **The two-second test** on the kitchen and hallway panels, with someone who didn't build it.
- **Five-person walk-past** after phase 2: can each say whether the house is secure and what's on?
- **Targets:** none under 44px (48px on panels), checked in the demo house by a test.
- **Contrast:** the per-theme test passes.
- **Counts:** on a first screen, at most three hues, one header level, one row pattern.

## Open questions

- **Room power on the tile, or only in the dialog?** The research says one tap target per tile;
  a one-tap way to turn a room off from the first screen is also valuable. Options: long-press
  to toggle (with a visible hint), or keep only All off. Try both on the panels.
- **Which three quick actions** belong in the panel header? Likely Assist, Cameras and Music, with
  the rest in More; confirm by what the household uses.
- **The panels' WebView version** (squircles need Chromium 139 or later).
- **Squircles on iPhones:** accept rounded corners there (recommended), or a clip-path on a few
  large static shapes (costly; not recommended).
