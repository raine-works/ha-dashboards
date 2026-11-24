# The cards

Both cards are whole dashboards: put one in a `panel: true` view, alone.

## `custom:home-dashboard`

For desktops, laptops and phones (the Companion app included).

![The Home dashboard in light mode](images/home-light.png)

- **Wide screens** (1024px and up): the header (clock, weather, calendar, what's open, music,
  people and pets, and a More menu; every button its icon over a label) over Lighting, Security and
  Climate side by side, each column scrolling on its own.
- **Lighting is rooms first**: a tile per room, by floor (what's on, its scene, a power button for
  its lights). A tap on a room opens its lights, scenes, colors and bedtime; a light that's off
  shows only its name until it's on.
- **Security is the alarm, then doors and garage doors**: the alarm's state at a glance (its Disarm
  quiet while the house is safe, red only while it's going off), then a row per door and garage door
  with its state in words (amber only when something's open or unlocked) and a button saying what a
  tap does (Unlock, Lock, Open, Close).
- **Climate is a line per thing**: each thermostat zone (its mode, the temperature inside, the
  setpoint between − and +; a tap opens its mode), curtain (open and close as icons; a tap opens its
  position) and fan (a tap opens its speed, Oscillate and presets).
- **Phones and portrait tablets**: a header with the greeting, weather and the house's status, and
  a tab bar: Lights, Security, Assist (the voice button, in the middle), Climate, Music. Cameras
  open from Security.
- Home Assistant's toolbar is hidden (the card's header has a button for the sidebar).
- No scrollbars: lists and columns scroll by touch, wheel or keyboard without a bar, and the page's
  own is hidden while a dashboard is on it.
- Links: `?view=security` (or `lights`, `climate`, `music`, `cameras`) opens a tab, `?camera=<entity>`
  opens a camera, `?brief=1` the daily brief, `?todo=<list>&item=<uid>` a to-do item.

| Option | | |
| :--- | :--- | :--- |
| `color_scheme` | `auto` (default), `light`, `dark` | `auto` follows Home Assistant's theme mode; the card's Appearance dialog sets that |
| `theme` | a theme id | This dashboard in that theme whatever's picked ([Themes](themes.md)) |
| `house` | see below | House settings, over the integration's |

## `custom:wall-panel-dashboard`

For a tablet on the wall. See [Wall panels](wall-panels.md).

![A wall panel](images/wall-panel.png)

| Option | | |
| :--- | :--- | :--- |
| `name` | text | The panel's name ("Kitchen wall panel"): where an alarm was armed or disarmed when the tablet's user is shared |
| `floor` | a floor id | Its floor's lights first |
| `timer` | `true` | A countdown timer in the header, announced on the house's speaker when it ends |
| `color_scheme` | `dark` (default), `light`, `auto` | |
| `theme` | a theme id | This panel in that theme ([Themes](themes.md)) |
| `house` | see below | |

## The `house` settings

What discovery can't tell. Most are also in the integration's options ([reference](reference/options.md));
the card's `house` option wins key by key, so YAML can override a setting for one dashboard. Share
one file between your dashboards with `house: !include ../house.yaml`.

```yaml
house:
  announce_speaker: media_player.kitchen      # the kitchen timer, the daily brief's first pick
  weather: weather.home                       # else the first weather entity
  alarm_panel: alarm_control_panel.alarmo     # else Alarmo's, else the first
  thermostats:                                # else every visible thermostat
    - entity: climate.main_floor
      name: Main Floor
  laundry:
    washer: { machine_state: sensor.washer_machine_state, job_state: sensor.washer_job_state, time_remaining: sensor.washer_completion_time }
    dryer: { machine_state: sensor.dryer_machine_state, job_state: sensor.dryer_job_state, time_remaining: sensor.dryer_completion_time }
  guest_wifi_qr: image.guest_wifi_qr_code     # the UniFi integration's QR code for the guest network
  birthday_calendar: calendar.birthdays       # else the calendar named "Birthdays"
  tts:
    engine: tts.home_voice                    # else the first tts entity
    voice: nova
    streaming: true                           # an engine that speaks while the answer is written
    fallback: tts.google_translate_en_com
  live_inputs:                                # inputs a speaker can play (a turntable), by Music Assistant URI
    - name: Turntable
      uri: sendspin_source://audio_source/turntable
      signal: binary_sensor.turntable_signal
  bedtime_routines:                           # a room's bedtime extras, beyond what its labels say
    switch.bedroom_bedtime:
      zone: Bedroom and Bath                    # else the room's own name
      steps:
        - { kind: fan, text: Turns the fan on, actions: [fan.turn_on] }
  modules:                                    # turn a feature off
    holidays: false
```

- Every key is optional. A value of the wrong shape is ignored, never an error, so check that what
  you set shows up.
- A bedtime step's `kind` sets its icon: `rooms`, `lights`, `media`, `speaker`, `fan`, `covers`,
  `locks`, `climate`, `alert` or `panels`. Its `actions` name the actions your automation runs, so a
  test can check the list stays true.
- Module ids are in [Modules](reference/modules.md).

## Bedtime

Each room's bedtime (the integration's Bedtime switches) and Home Bedtime turn things off by label,
so a new lamp, TV or speaker joins bedtime once it's labeled and in its room:

| Label | At bedtime |
| :--- | :--- |
| **Household Light** (`household_light`) | Turned off |
| **Household TV** (`household_tv`) | Turned off |
| **Household Speaker** (`household_speaker`) | Its music stopped |
| **Stays on at bedtime** (`stays_on_at_bedtime`) | Left alone, and turning it on in a room in bedtime doesn't ask first (a night light, a TV with a sleep timer) |

A room's bedtime covers what's in its own area (and closes its curtains and blinds); Home Bedtime
covers the whole house. What a room's routine does beyond that (a fan turned on, a speaker in the
next room) goes in `bedtime_routines`, so its confirm dialog lists it too. The routines themselves
are your own automations, triggered by the Bedtime switches; the dialog lists the labeled things
from the same labels the automations use.
