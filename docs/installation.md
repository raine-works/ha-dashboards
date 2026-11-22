# Installation

You need Home Assistant 2026.11 or later, whose Home Assistant Marketplace installs it (on 2026.10,
HACS, the Marketplace before it was built in, does the same).

## 1. The integration

[![Open your Home Assistant instance and open this repository in the Home Assistant Marketplace.](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=raine-works&repository=ha-dashboards&category=integration)

1. Open this repository in the Home Assistant Marketplace with the button above, or open the
   Marketplace (Settings → Marketplace) and add `https://github.com/raine-works/ha-dashboards` as a
   custom repository of type **Integration**. Download **Raineworks Dashboards**.
2. Restart Home Assistant.
3. Settings → Devices & services → **Add integration** → **Raineworks Dashboards**.

The integration serves the dashboards on every page of Home Assistant: there's no Lovelace resource
to add, and a new release reaches every open dashboard by itself (pages show "Dashboard updated" with
a Reload button, or reload when you come back to them).

## 2. A dashboard

Settings → Dashboards → **Add dashboard** → New dashboard from scratch. Open it, choose Edit, then
the three dots → **Raw configuration editor**, and replace everything with:

```yaml
views:
  - title: Home
    path: home
    panel: true
    cards:
      - type: custom:home-dashboard
```

That's the whole dashboard: the card fills the view, with its own header (the sidebar opens from its
button). On a phone it becomes a tab per section. For a wall tablet, see [Wall panels](wall-panels.md).

## 3. Your lights

The lighting section lists lights labeled **Household Light** (`household_light`), by floor and
room, so it shows the lamps and ceiling lights people switch, not every LED in the house:

1. Settings → Areas, labels & zones → Labels → **Create label** "Household Light".
2. Give it to your room lights (and light switches), and make sure each is in an area on a floor.

Scenes show on their rooms when you use [Stateful Scenes](https://github.com/hugobloem/stateful_scenes).

Speakers and TVs work the same way, but only if you want them to. The dashboards list every Music
Assistant speaker and every Raineworks TV until you give one of them the label:

- **Household Speaker** (`household_speaker`), on Music Assistant's `media_player`s: from then on
  only labeled speakers show in the music player, the Messages dialog and the Daily dialog's Play on.
- **Household TV** (`household_tv`), on Raineworks TV's `media_player`s: from then on only labeled
  TVs show in the TVs dialog, the Messages dialog and Party mode's Show on TVs. Party mode lists
  Music Assistant's display for each labeled TV that's available, matched to it by name.

## 4. What it found

Open the dashboard: every section that has something to show is there. Anything missing needs
something Home Assistant doesn't have yet; [Modules](reference/modules.md) says what each feature
needs. Settings discovery can't work out (the speaker that announces, the voice, the laundry's
sensors) are in the integration's options: see [Integration options](reference/options.md).

## Optional companions

- [Warden](https://github.com/raine-works/ha-warden): pick a Warden group as the household (who the
  dashboards list, message and assign chores to), and limit what a shared tablet's user can open.
- [ha-music-assistant](https://github.com/raine-works/ha-music-assistant): the music player's whole
  queue, podcast episodes and the Party link (the built-in Music Assistant integration gives only the
  playing and next song).
