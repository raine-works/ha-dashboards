<p align="center">
  <img src="custom_components/raineworks_dashboards/brand/icon@2x.png" alt="Raineworks Dashboards" width="128">
</p>

# Raineworks Dashboards

Dashboards for Home Assistant that work like an app: one for desktops and phones, and one for wall
tablets. Built with Preact, shadcn/ui and Tailwind CSS, they discover your house on their own:
lights by room and floor, locks, garage doors, cameras, thermostats, curtains, fans, music, TVs and
people. You add a card; there's nothing to configure per entity.

[![Home Assistant Marketplace](https://img.shields.io/badge/Home_Assistant-Marketplace-41BDF5.svg?style=for-the-badge)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=raine-works&repository=ha-dashboards&category=integration)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg?style=for-the-badge)](LICENSE)

<a href="https://buymeacoffee.com/raineworks"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee" /></a>

![The Home dashboard on a desktop](docs/images/home-dark.png)

<p align="center">
  <img src="docs/images/phone.png" alt="The Home dashboard on a phone" width="270">
  &nbsp;
  <img src="docs/images/wall-panel.png" alt="A wall panel" width="540">
</p>

<sub>Screenshots of the demo house (`bun run demo`).</sub>

## The cards

| Card | For |
| :--- | :--- |
| `custom:home-dashboard` | Desktops and phones (the Companion app): the whole house in a header and three columns on a wide screen, a tab per section on a phone |
| `custom:wall-panel-dashboard` | Wall tablets: the same sections sized for fingers, its own floor first, and the panel's hardware (status light, waking on the doorbell) through the integration |

Each card is a whole dashboard: put it in a `panel: true` view.

## What's in them

Each feature is a **module** that turns itself on when your house has what it needs, and stays out of
the way when it doesn't:

- **Lighting**: every light labeled *Household Light*, by floor and room, with dimmers, colors and
  effects, scenes (Stateful Scenes), All off with Undo, and bedtime per room
- **Security**: Alarmo with a PIN pad and countdowns, locks with their door sensors, garage doors,
  open doors and windows, a camera grid
- **Cameras**: live WebRTC with picture-in-picture, pinch to zoom, talkback, and UniFi Protect's
  recorded clips
- **Climate**: thermostats with presets, curtains and blinds, fans, scent diffusers
- **Music**: a Music Assistant player with the whole queue, browsing, podcasts, speaker groups and a
  party mode (the queue and podcasts need [ha-music-assistant](https://github.com/raine-works/ha-music-assistant))
- **The header**: clock, weather with forecasts and charts, calendar, to-do lists with assignment,
  notifications, people on a map, pets, laundry, energy, TVs, the daily brief, and Assist with voice
- **Messages**: announcements on your speakers and TVs (typed or recorded), pushes to phones, notes
  on a receipt printer
- **Holidays**: small easter eggs around each holiday and on birthdays

## Installation

[![Open your Home Assistant instance and open this repository in the Home Assistant Marketplace.](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=raine-works&repository=ha-dashboards&category=integration)

1. **The integration.** Open this repository in the Home Assistant Marketplace with the button (or
   add `https://github.com/raine-works/ha-dashboards` there as a custom repository of type
   Integration) and download **Raineworks Dashboards**. Restart Home Assistant, then add it under
   Settings → Devices & services. It serves the cards on every page, so there's no Lovelace
   resource to add.
2. **A dashboard.** Settings → Dashboards → Add dashboard → New dashboard from scratch, then edit it
   in YAML mode:

   ```yaml
   views:
     - title: Home
       path: home
       panel: true
       cards:
         - type: custom:home-dashboard
   ```

3. **Label your lights.** Give room lights the label `household_light` (*Household Light*) so the
   lighting section lists them. Indicator LEDs and other non-room lights stay unlabeled.

### Wall panels

Add a dashboard per tablet with the wall panel card, then register the tablet on the integration's
page (**Add wall panel**, picking its device) so its status light and wake-on-doorbell work:

```yaml
views:
  - path: home
    panel: true
    cards:
      - type: custom:wall-panel-dashboard
        name: Kitchen wall panel   # says where an alarm was armed or disarmed
        floor: main_floor          # this floor's lights first
        timer: true                # a countdown timer in the header
```

Any tablet works: a panel's hardware is found on its device (a light for status, a button or switch
to wake the screen, a restart button to reload), and each can be left out.

## Documentation

The [docs](docs/README.md): [installation](docs/installation.md), [the cards and their settings](docs/cards.md),
[wall panels](docs/wall-panels.md), and references to every [module](docs/reference/modules.md),
[integration option](docs/reference/options.md) and [action](docs/reference/actions.md).

## Configuration

Discovery covers most houses. What it can't tell (which speaker announces, the voice, the laundry's
sensors, quiet hours) is in the integration's options (Configure), or in a card's `house` option in
YAML, which wins key by key. Turn a module off with `house: { modules: { holidays: false } }`.

The integration also gives the dashboards their household (a [Warden](https://github.com/raine-works/ha-warden)
group, or every person with a device tracker), per-room bedtime switches, lock fault sensors, voice
clip uploads any signed-in user can make, each member's [phone alerts](docs/phone-alerts.md) (which
pushes they get), and actions for announcements, phone pushes, to-dos and the receipt printer.

## Development

```bash
bun install
bun run demo          # every card on a made-up house, no Home Assistant needed (http://localhost:4173)
bun run dev           # rebuild on every change
bun test              # unit tests
bun run lint          # Biome and the Tailwind lint
bun run typecheck
bun run build         # build and upload to your Home Assistant (HA_URL, HA_TOKEN in .env)
```

The integration's tests: `uv venv --python 3.14 .venv && uv pip install -r requirements-test.txt`,
then `.venv/bin/python -m pytest -q`. See [AGENTS.md](AGENTS.md) for how the code is laid out and
the rules it follows.

## Related

- [ha-music-assistant](https://github.com/raine-works/ha-music-assistant): Music Assistant's
  integration with the whole queue, podcasts and the Party link
- [ha-warden](https://github.com/raine-works/ha-warden): user groups, permissions and two-factor
  authentication
- [ha-gitops](https://github.com/raine-works/ha-gitops): deploy your Home Assistant configuration
  from Git

## ☕ Support

If you find this project helpful, consider buying me a coffee to support continued
maintenance and development:

<a href="https://buymeacoffee.com/raineworks"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee" /></a>

## License

MIT: see [LICENSE](LICENSE).
