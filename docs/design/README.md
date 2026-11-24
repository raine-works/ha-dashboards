# Design system

How Raineworks Dashboards should look and behave, and why: **the target design** the
[overhaul plan](overhaul-plan.md) works toward. Until a phase lands, [AGENTS.md](../../AGENTS.md)'s
rules and the components as they are still apply (today's dialog sizes, the 44px minimum on the
panels); the pull request that lands a phase changes AGENTS.md to match. Once landed, a change that
breaks one of these pages changes the page first.

| Page | What it settles |
| :--- | :--- |
| [Principles](principles.md) | The approach: status first, two levels, glanceable, shared panels vs personal phones, the do/don't rules |
| [Color](color.md) | Neutrals, the one brand accent, status colors, "on", how many colors at once, night, color blindness |
| [Shape, space and type](shape-space-type.md) | Squircles and the radius scale, spacing and density, the Geist type scale, depth, icons, motion |
| [Components](components.md) | The building blocks every feature is made of, and the ones to retire |
| [Overhaul plan](overhaul-plan.md) | What's wrong today (the audit) and the phased plan to get there |

## The short version

1. **Status first, controls second, detail one tap away.** Two levels at most: a screen, then a
   dialog. Nothing deeper.
2. **Quiet by default.** Neutral everywhere; color means something (a light's own color, or a
   status). Exceptions only while they're true.
3. **One way to draw one thing.** A device is a `DeviceRow` or a `Tile` wherever it appears; one
   header per section; one dialog anatomy.
4. **Big enough to hit, at arm's length.** 44px everywhere, 48px on wall panels, 56px for the main
   action; 8px between targets; nothing a user must read under 14px on a wall.
5. **Squircles, on a 4/8 grid, in Geist.** Continuous corners where the browser can draw them,
   rounded corners where it can't, and spacing that's always on the scale.
6. **Every word is a label.** No icon-only control but Close; buttons say what happens.

## How these were made

From four research passes (UX for home dashboards; color theory; shape, spacing and type; and an
audit of the dashboards as they were in November 2026, from the code and screenshots of a real
house). Sources are linked where a rule comes from one. Claims marked *(unverified)* came from the
researchers' own knowledge rather than a page they read, and should be checked before they're
quoted as a standard.
