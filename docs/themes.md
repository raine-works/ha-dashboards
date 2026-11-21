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

## Making your own

In Appearance, **New theme** under Your themes (or the pencil on one of yours) opens the theme
editor, with a preview in light and dark on the dashboards' own buttons, toggles and cards:

- **Start from** any theme: its statuses, charts and everything you don't change come from it.
- **Accent**: the theme's own, **a color** (buttons, focus rings, and Home Assistant's switches,
  sliders and selected items), or **a gradient**, two colors for Raineworks-style edges and glow,
  each of which can be turned off.
- **Grays**: Neutral, Zinc, Stone or Slate, shadcn's bases.
- **Corners**: from square to round.
- **Import** takes a theme from [ui.shadcn.com/themes](https://ui.shadcn.com/themes),
  [tweakcn](https://tweakcn.com) or a project's `globals.css` (its `:root { … }` and
  `.dark { … }`); **Copy CSS** gives yours back in the same format.

**Save** makes it a Home Assistant theme and picks it for you. Your themes are yours: others
don't see them in their Appearance dialog (Home Assistant's own theme list is shared, so they do
show in everyone's Profile → Theme). An administrator can **Share with the house**, so everyone
can pick it, and it can be the house theme.

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
