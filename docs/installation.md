# Installation

You need Home Assistant 2026.10 or later and [HACS](https://hacs.xyz) (the Marketplace on 2026.11+).

## 1. The integration

1. In HACS, add `https://github.com/raine-works/ha-dashboards` as a custom repository of type
   **Integration**, then install **Raineworks Dashboards**.
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
