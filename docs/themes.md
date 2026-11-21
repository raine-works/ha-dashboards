# Themes

A theme colors the dashboards and the whole of Home Assistant: its sidebar, settings pages and
cards, and the Companion apps' status and navigation bars. The integration adds its themes to
Home Assistant's own theme list, so they also show in your profile's Theme setting.

| Theme | |
| :--- | :--- |
| **Raineworks** (the default) | Black and white with a peach-to-teal gradient edge on what to press and what's chosen, a soft glow under primary buttons, and a gradient line under the header |
| **Neutral** | shadcn's black, white and grays, with an amber accent in Home Assistant's own pages |
| **Blue, Green, Orange, Rose, Violet** | Neutral with a colored accent |

Every theme has a light and a dark mode. Status colors (an open door, the alarm, a failed call)
stay the same in every theme.

## Picking your theme

On the Home dashboard, open **Appearance** (in the More menu on a wide screen, the sun or moon
button on a phone): choose Light, Dark or Auto, and a theme. Your choice is saved to your Home
Assistant profile, so it follows you to every device. **House theme** goes back to the house's.

## The house theme

The integration's options (Settings → Devices & services → Raineworks Dashboards → Configure →
General → **Theme**) set the house theme: Home Assistant's default theme for anyone who hasn't
picked their own, and the wall panels'. **Leave Home Assistant's theme** keeps whatever Home
Assistant uses, and the dashboards then draw with Raineworks.

## For one dashboard

A card's `theme` option draws that dashboard in a theme whatever's picked (Home Assistant's own
pages keep the picked one):

```yaml
- type: custom:wall-panel-dashboard
  theme: neutral
```

Ids: `raineworks`, `neutral`, `blue`, `green`, `orange`, `rose`, `violet`.
