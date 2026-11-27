# Components

**One way to draw one thing.** Every feature is built from these blocks; a feature that needs
something they can't do adds a variant here first. These are the target: the blocks arrive in
phase 1 of the [overhaul plan](overhaul-plan.md) (`DeviceRow`, `StatusTile`, the new button sizes
and dialog sizes don't exist before it), and what's marked retired goes as each phase lands.

## The blocks

### Section

A screen's group (Lighting, Security, Climate): the one `SectionHeader` (a neutral icon, the title,
its actions), then its content on one surface. **No second header inside a section**: a group in it
gets a plain overline ("Doors", "Garage", "Main floor"), with the group's own actions at its end
(Open all / Close all). Replaces today's cards-with-headers inside
sections (Thermostats, Scent, Curtains, Fan, Cameras).

### Tile

A square-ish squircle for something spatial or frequent: a room, a favorite, a status.

- **Anatomy:** an icon tile (top left), the name, one status line. Nothing else.
- **One tap target:** the whole tile. What a tap does is the tile's one job: a room's tile opens the
  room; a favorite runs. A second control inside a tile (today's power circle) splits the target
  and draws the eye; the room's power lives in its dialog, with **All off** for the house.
- **On** is the icon tile's fill (the lights' colors for a room) and the status line; the tile
  itself stays a neutral surface.
- **Grid:** equal widths that fill the row (two across on a phone and a 10.5" panel, three on wider);
  no half-empty rows of fixed-width tiles.
- Starts from `lighting/RoomTiles.tsx`.

### StatusTile

The house's state at a glance: the alarm, the doors, the climate. An icon, a state word, one line
of detail, and at most one action, **secondary** when the state is good ("Armed · Disarm" is a quiet
button) and **primary** only when the state needs action ("Disarmed · Arm"). A choice of actions that
won't fit beside the state (the alarm's Arm Home and Arm Away), a countdown or an error goes on its
own full-width row under it. The detail is cut to one line, except where it must be read whole (a
refusal to arm, naming what Arm anyway would bypass), and turns amber, keeping its words, when it
warns (open doors). The alarm card is one now; its full-width red Disarm was the loudest thing on
screen while the house was safe.

### DeviceRow

A device in a section or dialog: an icon tile, its name, one status line, and **one** trailing
control from a fixed set:

| Trailing control | For |
| :--- | :--- |
| Switch | Something on or off (a light, a fan, a room's lights) |
| Stepper (− value +) | A setpoint |
| One labeled button | One action (Lock, Open, Quick scent) |
| Chevron | Opens its dialog (everything else) |

- Tapping the row's name opens its dialog (dimmer, color, mode, position, speed…).
- The icon tile is left out only where the trailing control needs the row's room (a thermostat's
  stepper in a narrow column).
- 56px tall on wall panels, 48px elsewhere.
- **A state is never shown as a button label**: "Locked" is the status line; the button says what
  it does ("Unlock"), the way today's "Open door" does.
- Replaces the light, lock, garage, thermostat, curtain, fan and scent rows (five patterns today).
  Starts from `ui/switch-row.tsx` and `lighting/LightRow.tsx`.

### Button

Three sizes and four roles, instead of today's ten sizes and `outline` on two-thirds of all buttons.

| Size | Height | For |
| :--- | :--- | :--- |
| `md` / `icon-md` | 44px | Most buttons |
| `action` / `icon-action` | 52px (56px on panels) | A dialog's main action, a header tile |
| `pad` | 64px (phones: up to 88px) | The PIN pad's keys |

(Named so they sit beside today's sizes, `sm` to `2xl`, until those go.)

| Role | Variant | Look | For |
| :--- | :--- | :--- | :--- |
| Primary | `default` | Filled `primary` (+ the brand edge) | The one main action in view |
| Secondary | `secondary` | Tonal: the inset fill, no border | Everything else |
| Quiet | `ghost` | Ghost | Low-emphasis actions, toolbars |
| Danger | `destructive` | Filled `destructive` | Destroying something, and only then |

Every button has a label (icon-only: Close). `loading` stays. Header buttons are plain secondary
icons (`icon-xl`), named by their tooltip and `aria-label`; the phone header's launchers keep their
labels. `outline` remains as a name only: it draws as the tonal secondary, so the
buttons and chips written with it took the design at once; new code says `secondary`. `warning`
is tonal too, tinted amber.

### CheckRow

One of several things to pick (the speakers an announcement plays on, the people a message goes
to): the name, a muted word ("Off", "Playing"), and a check at the end, an empty ring until picked;
the whole row is the target (`ui/check-row.tsx`). Rows stack on one surface in a `SectionGroup`,
whose actions are All / None. Picking many is a check, never a radio circle.

### Chips and segmented choices

- **A chip** (a quick message, Play on's speaker, a filter, a person): tonal, filled with `primary`
  while picked: a Button `outline` / `default` pair, or a ToggleGroup item with `variant: 'chip'`
  for one on its own. No borders, so a row of them reads as one quiet line with the pick standing
  out.
- **One segmented control** for choosing a view or a mode (tabs, Home / Away / Sleep, Today /
  Week / Month): `Tabs`, or a `ToggleGroup` with `variant="outline"`, drawn the same way: a muted
  track with the picked one raised on the card color (and the brand edge). The screen's width on
  a phone, its items' own from `sm`; full width only where it heads its own column.

### Dialog

Three sizes, one anatomy (`ui/dialog.tsx` keeps its history, focus trap and idle close):

| Size | Width | For |
| :--- | :--- | :--- |
| `detail` | 480px; a bottom sheet on phones, dragged down to close (and sliding away however it's closed) | A room, a device, a confirmation, a picker |
| `workspace` | Most of the screen | Music, cameras, to-do, calendar, energy |
| `fullscreen` | The screen | Party mode, a camera full screen |

Anatomy: a header (icon tile, title, one line, Close); the content; a footer with the primary
action on the right (on phones, full width at the bottom), secondary on the left. Rarely more than
three regions; a long list collapses to a summary with "Show all".

On a phone, `detail` (and the older `sheet`) is shadcn's Drawer, after Vaul: a handle on top, and
the sheet follows a finger dragging it down, the backdrop fading with it. Let go past a quarter of
its height, or flicked down, it slides away and closes; short of that it springs back. Up and
sideways stay the content's (a scroll, a slider, a swiped row), as does a drag that starts on a
field, a slider or the wheel picker, or on anything marked `data-sheet-no-drag`, or while what's
under the finger is scrolled down. Vaul itself isn't used: it's built on Radix's Dialog, whose
focus trap doesn't work inside the card's ShadowRoot, and it's no longer maintained; the gesture is
`lib/sheet-drag.ts`, tested on its own, and `useSheetDrag` in `ui/dialog.tsx` moves the sheet.

### NumberFlow

A number that changes in place rolls to its new value like a mechanical counter: `NumberFlow` (a
value, `Intl.NumberFormat` options, a prefix or suffix), `NumberFlowClock` (seconds as "3:05") and
`Degrees` (a temperature, "—" for none), on NumberFlow's framework-free `<number-flow>` element. Its
React wrapper isn't used: under preact/compat it hands the element a JSON string where it expects an
object. The element is labelled with the whole value for screen readers, and keeps still under
reduced motion: a device's own setting, or a card set to `motion: reduced` (`lessMotion()`).

A roll restyles its digits every frame of its 0.9s, about 60ms of the main thread per change where
it was measured, so it's kept for the numbers people adjust or watch, not the ones that change with
whatever happens in the house ([Performance](../performance.md)).

Where it rolls:

| What | Where |
| :--- | :--- |
| Temperatures | The header's, the Weather dialog's and the Daily brief's; a thermostat's setpoint |
| Levels | A pet's food and water, a person's phone battery, a curtain's position and a fan's speed (in their dialogs) |
| Power | The Energy dialog's Using now and Always on |
| Countdowns | The alarm's exit and entry delay, the Timer dialog's clock |

Where it doesn't:

- **Counts**: `CountBadge`, Music's "playing" count, All off (n), the To-do filters' open counts and
  "n selected", the keypad's system check (ready/total), a pet's visits today. They change with what
  happens in the house, a light or a door, often several at once: they just change.
- **A readout that follows a finger**: a slider's percentage (volume, a theme's corners), and a
  curtain's or fan's while it's dragged (`animated={false}`); a curtain's while it moves, too, a new
  estimate every 100ms.
- **Steady motion at a panel's edge**: the header's timer and live power (a new reading every few
  seconds), the panel's clock.
- **What plays**: a track's or clip's position, a recording's length: they count every second and
  follow the seek bar.
- **Numbers in words or in lists that don't change in place**: status lines ("1 on", "69° inside"),
  the forecast, chart axes and tooltips.

### Also kept

`Slider`, `Switch`, `Tabs` / `ToggleGroup` (segmented choices), `Avatar`, `CountBadge` (the one
badge; its count rolls), `ChipRow`, `SwipeRow`, `StableLabel`, `ConfirmButton`, `EmptyState`, `WheelPicker`,
`MonthSwiper`: their behavior is sound; they take the new tokens.

## Retired

- Cards with their own header inside a section (`ClimateSection`, `DiffuserCard`, `CoverCard`,
  `FanCard`, `CamerasCard`).
- Each feature's own row (lock, curtain, scent, fan).
- `outline` as the default button; sizes `sm`, `lg`, `xl`, `tile`, `icon-*` as separate looks.
- Arbitrary values: `text-[10px]`, `text-[11px]`, `rounded-[22%]`, `rounded-[calc(…)]`, raw palette
  colors.
- Unlabeled icon controls (the curtain's ‹› / ›‹, the palette button, the holiday mute beside the
  date).
