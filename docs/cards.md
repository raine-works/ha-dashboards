# The cards

Both cards are whole dashboards: put one in a `panel: true` view, alone.

## `custom:home-dashboard`

For desktops, laptops and phones (the Companion app included).

- **Wide screens** (1024px and up): the header (clock, weather, calendar, what's open, music,
  people and pets, and a More menu) over Lighting, Security and Climate side by side, each column
  scrolling on its own.
- **Phones and portrait tablets**: a header with the greeting, weather and the house's status, and
  a tab bar: Lights, Security, Assist (the voice button, in the middle), Climate, Music. Cameras
  open from Security.
- Home Assistant's toolbar is hidden (the card's header has a button for the sidebar).
- Links: `?view=security` (or `lights`, `climate`, `music`, `cameras`) opens a tab, `?camera=<entity>`
  opens a camera, `?brief=1` the daily brief, `?todo=<list>&item=<uid>` a to-do item.

| Option | | |
| :--- | :--- | :--- |
| `color_scheme` | `auto` (default), `light`, `dark` | `auto` follows Home Assistant's theme mode; the card's Appearance picker sets that for this browser |
| `house` | see below | House settings, over the integration's |

## `custom:wall-panel-dashboard`

For a tablet on the wall. See [Wall panels](wall-panels.md).

| Option | | |
| :--- | :--- | :--- |
| `name` | text | The panel's name ("Kitchen wall panel"): where an alarm was armed or disarmed when the tablet's user is shared |
| `floor` | a floor id | Its floor's lights first |
| `timer` | `true` | A countdown timer in the header, announced on the house's speaker when it ends |
| `color_scheme` | `dark` (default), `light`, `auto` | |
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
  bedtime_routines:                           # what each room's bedtime does, for its confirm dialog
    switch.bedroom_bedtime:
      zone: Bedroom
      steps:
        - { kind: lights, text: Turns off the bedroom's lights, actions: [light.turn_off] }
        - { kind: covers, text: Closes the curtains, actions: [cover.close_cover] }
  modules:                                    # turn a feature off
    holidays: false
```

- Every key is optional. A value of the wrong shape is ignored, never an error, so check that what
  you set shows up.
- A bedtime step's `kind` sets its icon: `rooms`, `lights`, `media`, `speaker`, `fan`, `covers`,
  `locks`, `climate`, `alert` or `panels`. Its `actions` name the actions your automation runs, so a
  test can check the list stays true.
- Module ids are in [Modules](reference/modules.md).
