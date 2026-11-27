# Performance

How the dashboards compare with Home Assistant's own, measured in a real Home Assistant: how fast a page
loads, how much it downloads and keeps in memory, and how much of the browser's time it takes while the
house changes around it. A wall panel runs one page for weeks on a modest tablet, and a phone runs it on a
battery, so the time a page spends on updates it doesn't show matters as much as how fast it opens.

## Results

Medians of three runs each, Home Assistant 2026.10.4, Chromium 158 headless (Playwright 1.63), on a
4-core 2.3 GHz Xeon with 16 GB. Absolute numbers depend on the machine; compare the rows with each other.

| Dashboard | Largest paint | JavaScript (transferred) | Heap after load | Idle | Unseen sensor updates | A light toggling | Both together |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Raineworks Home (1440×900) | 368 ms | 1549 KB | 16.1 MB | 2.1 ms/s | 6.8 ms/s | 73.0 ms/s | 77.2 ms/s |
| Raineworks wall panel (1280×800) | 392 ms | 1549 KB | 16.2 MB | 2.2 ms/s | 6.6 ms/s | 80.7 ms/s | 81.7 ms/s |
| Home Assistant's Home | 40 ms | 1647 KB | 15.6 MB | 0.1 ms/s | 10.9 ms/s | 4.9 ms/s | 11.5 ms/s |
| Home Assistant auto-generated | 1036 ms | 2011 KB | 25.0 MB | 79.4 ms/s | 105.3 ms/s | 98.9 ms/s | 111.9 ms/s |

- **Largest paint:** when the page's largest element was drawn, on a cold load (nothing cached).
- **JavaScript:** every script the page loaded, Home Assistant's frontend included, as sent over the
  network (compressed). The dashboards' own bundle and chunks are about 220 KB of it; the rest is Home
  Assistant's frontend, which every page loads.
- **Heap:** the page's JavaScript memory after a garbage collection, once it had loaded. After 30 seconds
  of updates it was within 1 MB of that on every page: nothing grows with updates.
- **Idle, and the updates:** main-thread time (scripts, style, layout, everything the browser did on
  the page's behalf) per second, first over 20 seconds with nothing changing, then over 30 seconds of
  changes. Below 16 ms in each second the page has nearly all of every frame free.

## What the numbers say

- **Updates nobody sees cost the least on the dashboards.** A house sends a few state changes a second,
  nearly all of them power, CPU and signal sensors no dashboard shows. The dashboards read each change in
  a store and re-render only the parts whose own entities changed ([Real time and
  resilience](../AGENTS.md#real-time-and-resilience)), so those changes cost them less than they cost Home
  Assistant's Home, and a fraction of what they cost a dashboard that shows every entity.
- **What a light changing costs is mostly the numbers rolling.** A count or a temperature that changes
  rolls its digits to the new value (NumberFlow, [components](design/components.md#numberflow)), and that
  restyles its digits every frame for about 0.9 s: about 60 ms of the main thread for each change, spread
  over the roll. With reduced motion on (the system setting), nothing rolls and a toggle costs 16 ms/s.
- **Home Assistant's Home draws first** because it draws less: it's a summary of areas whose first
  paint is a heading, where the dashboards' first paint is the whole house, every light and control,
  laid out. The auto-generated dashboard, every entity as a card, is the slowest on every measure.
- **The download is the same size** whichever dashboard it is: Home Assistant's frontend is most of
  every page, and the dashboards' bundle loads on every page so the cards exist wherever they're used
  ([Development](development.md)).

## How it was measured

A Home Assistant with the demo integration's 128 entities (lights, covers, climate, media players,
locks, sensors, cameras) and five extra power sensors (`sensor.bench_power_0` to `_4`) that no dashboard
shows. Each dashboard, in a new browser context with service workers off:

1. A first visit, so the frontend knows the dashboards, then the cache is cleared and turned off.
2. A cold load, then 4 seconds to settle (late chunks, first renders); the page must still be on its
   own address.
3. A garbage collection and the heap, then 20 seconds with nothing changing.
4. 30 seconds of changes at 6 a second through Home Assistant's REST API, in three runs of their own:
   - **unseen sensors**: the five power sensors take new readings,
   - **a light toggling**: the kitchen light, which the dashboards show, once a second,
   - **both together**: five sensor readings and one toggle each second, the mix a busy house sends.

Main-thread time comes from Chrome's own counters (`Performance.getMetrics` over the DevTools protocol:
`TaskDuration`, `ScriptDuration`, `RecalcStyleDuration`, `LayoutDuration`), the largest paint from the
page's `largest-contentful-paint` entries, and the downloads from its resource timing.

The dashboards were the Home card on a dashboard of its own and the wall panel card on the kitchen's,
both with the demo house's settings; Home Assistant's were its built-in Home page (`/home/overview`) and
a dashboard with its original auto-generated view (every entity as a card, by area).
