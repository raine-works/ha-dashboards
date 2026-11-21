<!-- Written by scripts/docs.ts from custom_components/raineworks_dashboards/strings.json: edit that, then run `bun scripts/docs.ts`. -->

# Integration options

Settings → Devices & services → Raineworks Dashboards → **Configure**. A card's `house` option
in YAML wins over these key by key.

## General

| Option | Key | What it does |
| :--- | :--- | :--- |
| Serve the dashboards | `serve_bundle` | Load the dashboards on every page from this integration. Turn off only when you build and serve them yourself. |
| Household | `household_group` | Who the dashboards list, message and assign chores to: a Warden group's members, or everyone whose person has a device tracker. |
| Alarm panel | `alarm_panel` | The wall panels' status lights pulse red when it's triggered, amber during its delays, and show green while armed. Leave empty to use Alarmo's panel, else the first one. |
| Bedtime | `bedtime_entity` | While it's on, the status lights show at 10% (a triggered alarm stays bright); else this integration's Home Bedtime, when it has bedtime rooms. Doors labeled Exterior Door show amber while open. |
| Theme | `theme` | The house's theme: the dashboards' and Home Assistant's whole UI (and the Companion apps' bars) for anyone who hasn't picked their own. Each person picks theirs in the dashboards' Appearance menu. |

## House

What the dashboards can't find on their own. A dashboard card's own `house` option wins where both set something.

| Option | Key | What it does |
| :--- | :--- | :--- |
| Announcing speaker | `announce_speaker` | Where the wall panel timer announces, and the Daily dialog's first speaker. |
| Weather | `weather` | Else the first weather entity. |
| Thermostats | `thermostats` | The climate card's thermostats, in this order; else every thermostat. |
| Voice (text-to-speech) | `tts_engine` | The house's voice for the intercom's typed messages and camera talkback; else the first text-to-speech entity. |
| Voice name | `tts_voice` | Named on every call, so a change of the engine's default never changes it. |
| The voice streams | `tts_streaming` | The engine speaks an answer as it's written (Assist speaks through it itself). |
| Fallback voice | `tts_fallback` | Spoken with when the voice fails. |
| Guest Wi-Fi QR code | `guest_wifi_qr` | An image with the guest network's QR code (UniFi's), shown on the wall panels. |
| Birthdays calendar | `birthday_calendar` | Else the calendar named Birthdays. |
| Announcement speakers | `announce_speakers` | Where an announcement plays when none are named; else the announcing speaker. |
| Quiet from | `quiet_start` | Automated announcements stay silent from this time (10 PM if empty), and while bedtime is on. |
| Quiet until | `quiet_end` | …until this time (7 AM if empty). A person's own announcements (the intercom, the timer) always play. |
| Home dashboard | `home_path` | The Home dashboard's path (/dashboard-home/home): to-do pushes open their item there. |

## Bedtime

A Bedtime switch for each room picked, and Home Bedtime: every room on turns Home Bedtime on, any room off turns it off, and Home Bedtime turned on puts every room to bed. What a room's bedtime does is up to your automations (trigger on its switch). A room that had a bedtime toggle (an input_boolean labeled Bedtime, in that area) keeps its name and state.

| Option | Key | What it does |
| :--- | :--- | :--- |
| Bedtime rooms | `bedtime_rooms` | Each gets a Bedtime switch, in its area, labeled Bedtime. |
| Bedtime ends | `bedtime_ends` | Every room's bedtime turns off then (and so Home Bedtime). |

## Laundry

The washer's and dryer's sensors (SmartThings names them so). A machine with all three shows in the header while it runs.

| Option | Key | What it does |
| :--- | :--- | :--- |
| Washer machine state | `washer_machine_state` |  |
| Washer job state | `washer_job_state` |  |
| Washer time remaining | `washer_time_remaining` |  |
| Dryer machine state | `dryer_machine_state` |  |
| Dryer job state | `dryer_job_state` |  |
| Dryer time remaining | `dryer_time_remaining` |  |

## Wall panels

**Add wall panel** on the integration's page, once per tablet.

A tablet on a wall showing a `custom:wall-panel-dashboard`. Pick its device and its status light, wake and reload are found on it; pick any of them yourself to override, or leave them out if the tablet has none.

| Setting | Key | What it does |
| :--- | :--- | :--- |
| Name | `name` | How it's named where the shared user can't say which panel it was (who armed the alarm). Use the same name as its card's `name`. |
| Device | `device_id` | The tablet's device (ROAMiQ, Fully Kiosk Browser, the Companion app…). |
| Status light | `status_light` | A light showing the house's status: the alarm, an exterior door open. |
| Wake the screen | `wake` | A button or switch that turns its screen on: pressed when the doorbell rings. |
| Reload | `reload` | A button that reloads its dashboard: pressed by the reload_panels action. |
