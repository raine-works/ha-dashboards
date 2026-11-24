<!-- Written by scripts/docs.ts from packages/ui/src/lib/modules.ts: edit that, then run `bun scripts/docs.ts`. -->

# Modules

Every feature is a module. A module is **on** when your house has what it needs and you haven't
turned it off, **missing** when something it needs isn't there, and **off** when you turned it off.
Missing and off modules leave no trace in the dashboards.

Turn one off in a card's `house` option:

```yaml
house:
  modules:
    holidays: false
```

`bun run report` shows which modules a Home Assistant has.

| Module | Id | What it shows | What it needs |
| :--- | :--- | :--- | :--- |
| Lighting | `lighting` | A tile per room by floor (its lights, scenes, dimmers and colors a tap away) and All off | Lights labeled "Household Light" (household_light) in areas on floors; Stateful Scenes for scenes |
| Bedtime | `bedtime` | Each room's bedtime toggle and Home Bedtime, asking before lights come on in a room asleep | The integration's Bedtime rooms (its options), or input_booleans labeled "bedtime" in each room's area with input_boolean.home_bedtime |
| Security | `security` | Door locks with their contact sensors, garage doors, and every opening left open | lock.* entities, garage covers, door/window binary sensors |
| Alarm | `alarm` | Arm and disarm with a PIN pad, exit and entry countdowns, and the arming check | The Alarmo integration (an alarm_control_panel and the alarmo.arm action) |
| Cameras | `cameras` | Live views (WebRTC), snapshots, smart detections, talkback and recorded clips | camera.* entities; UniFi Protect for detections, talkback and clips |
| Thermostats | `climate` | Each thermostat's setpoint and mode | climate.* entities (house.yaml `thermostats` to pick and name them) |
| Thermostat presets | `thermostat_presets` | A house-wide Home / Away / Sleep preset over the thermostats | input_select.thermostat_preset and script.adjust_thermostat_temperature, with the preset automation |
| Curtains & blinds | `covers` | Every curtain, blind and shade, with positions estimated while they move | cover.* entities with device class curtain, blind, shade or shutter |
| Fans | `fans` | Every fan: speed, oscillation and presets | fan.* entities |
| Scent diffusers | `diffusers` | Whole-home diffusers: oil, fragrance and Quick scent | The EverScent integration (raine-works/ha-everscent) |
| Weather | `weather` | Now in the header; hourly charts, details and the 10-day forecast in its dialog | A weather.* entity with forecasts |
| Calendar | `calendar` | The next event in the header; a month grid and day agenda | calendar.* entities |
| To-do | `todo` | To-do lists with swipes, drag to reorder, due dates and assignment to household members | todo.* entities (Local To-do, Shopping list…) |
| Notifications | `notifications` | Home Assistant's persistent notifications, swiped away | Nothing: part of Home Assistant |
| People | `people` | Who's home in the header; a map of everyone with their phones' batteries | person.* entities with a device tracker (the Companion app) |
| Pets | `pets` | Litter-Robot and Feeder-Robot: visits, weight and food charts, Cycle and Give snack | The Litter-Robot integration, with a person.* per pet |
| Music | `music` | Now playing, browse and search, the queue, speaker groups, live inputs and Party mode | The Music Assistant integration |
| TVs | `tvs` | Power, what's on with its poster, volume, the TV's apps and inputs, and a remote | The Raineworks TV integration (raine-works/ha-googletv) |
| Messages | `messages` | Announce on the speakers (typed or recorded), message phones, print notes | Music Assistant speakers, or script.notify_people for phones, or a receipt printer |
| Receipt printer | `printer` | Print to-do lists and notes | An ESC/POS printer (the escpos_printer notify platform) |
| Laundry | `laundry` | The washer and dryer in the header while they run, and a toast when one is done | house.yaml `laundry`: each machine’s machine state, job state and time remaining sensors (SmartThings) |
| Energy | `energy` | Live draw split by circuit, today / week / month charts, and where it went | Home Assistant's Energy settings with a grid meter (and devices for circuits) |
| Daily | `daily` | The daily brief (weather, today's events, the news), a daily affirmation and a scripture study | The daily brief package: sensor.daily_brief and script.daily_brief_generate (an AI task and a conversation agent that can search) |
| Assist | `assist` | Voice and typed commands through Home Assistant's preferred Assist pipeline, with the glow | An Assist pipeline with speech to text (and text to speech for spoken answers) |
| Holidays | `holidays` | Easter eggs in the days around each holiday and on birthdays: characters, confetti, sounds | Nothing (birthdays: a calendar named "Birthdays") |
| Guest Wi-Fi | `guest_wifi` | The guest network's QR code, on the wall panels | house.yaml `guest_wifi_qr`: an image entity with the QR code (UniFi’s, enabled) |
