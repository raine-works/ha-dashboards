# The dialogs: audit and plan

Phase 4 of the [overhaul](overhaul-plan.md): the feature dialogs on the design language, after an
audit of each on the real house (kitchen panel 1280×800 and a phone at 540px, 24 November 2026).

## What they had in common

| # | Problem | Seen in | Fix |
| :--- | :--- | :--- | :--- |
| 1 | Every row in its own bordered box | TVs' list, Music's speakers, Messages' speakers and TVs, To-do's items | Rows on one surface, the picked one filled ([DeviceRow](components.md#devicerow), `SURFACE`) |
| 2 | Outlined chips everywhere, a row of borders | Inputs, quick messages, Play on, person filters, talkback | Tonal chips, the pick filled ([Chips](components.md#chips-and-segmented-choices)) |
| 3 | Four tab styles | Music, To-do (full width); Messages, Cameras (pills); Daily (in the header); Energy (a toggle group) | One segmented control |
| 4 | Outlined buttons beside one bright primary | Turn off, the transport, Refresh, Print, Today | Secondary (tonal); one primary per dialog |
| 5 | Choosing many drawn as radio circles | Messages' speakers and people | Checkmarks |
| 6 | Empty space, weak hierarchy | TVs (under the apps), Messages (the middle) | Each dialog's own layout |

1 to 4 are shared components, fixed once for every dialog (the foundation pull request: Button
`outline` tonal, ToggleGroup's segmented control and `chip`, one Tabs style). 5 and 6, and the
rows, are each dialog's own.

## Each dialog

- **TVs**: the list of TVs as rows on one surface, the picked one filled; the TV's card with what's
  on as the dialog's hero (its poster large), the transport and volume under it; inputs as tonal
  chips; the apps in a grid that fills the space below, so there's no blank half.
- **Messages** (done): speakers and TVs as `CheckRow`s on one surface each (All / None as the
  group's actions), the people on Phones the same way; the quick messages under an overline; the
  volume, chime and composer as the footer.
- **Music**: the speakers as rows on one surface; Now Playing's cover as the hero; Browse's tiles
  and the queue's rows on the design's shapes.
- **Cameras**: the camera list as tiles with the picked one ringed; the live view's controls on
  the overlay's scrim; talkback's quick lines as tonal chips.
- **To-do**: the items as rows on one surface with hairlines (no box each); the person filters as
  chips; the add row as the footer.
- **Daily, Calendar, Weather, Energy, People, Pets, Notifications**: the shared fixes carry most of
  it; each gets a pass for its surfaces (cards in cards), its headings (overlines) and its one
  primary action.
- **Guest Wi-Fi**: the network and password under the code (done: read from the code itself).

## Order

The foundation first (it changes every dialog at once), then Messages and TVs (the most used on
the panels), Music, Cameras, To-do, and a pass over the rest.
