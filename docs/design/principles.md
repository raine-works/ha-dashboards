# Principles

## Who uses what

| Surface | Who | How | So |
| :--- | :--- | :--- | :--- |
| **Wall panel** (15" 1280×800, 10.5" 960×600) | Everyone, guests included; no one signed in | In passing, at arm's length, often at night | Status-forward and read-mostly; a short list of whole-house actions; nothing personal |
| **Phone** (390–540 wide) | One household member, signed in | One hand, on the go | Personal; the most-used action within the thumb's reach at the bottom |
| **Desktop** (1024 and up) | One member | Seated, mouse | The extra room keeps status in view; it doesn't add content |

## Information architecture

**Status first, controls second, detail one tap away.** Progressive disclosure works for two
levels; more and people get lost, and whatever is on the first screen signals that it matters
([NN/g](https://www.nngroup.com/articles/progressive-disclosure/)).

- **Level 1, the screen:** the house's status, the few actions used every day, and rooms as tiles.
- **Level 2, one dialog or sheet:** a room's lights and scenes, a thermostat's mode, a curtain's
  position, music, cameras, to-do, the calendar, the brief, messages, TVs, settings.
- **No level 3.** A dialog opens another only to confirm. A feature that needs a third level is
  simplified or flattened.
- **Rooms are the structure** for lights (and, later, for everything in a room), the way Apple
  Home, Google Home and Home Assistant's own Areas dashboards are built
  ([HA area card](https://www.home-assistant.io/dashboards/area/)).
- **One route to each thing.** A second path is a shortcut at most, never a copy.

## Glanceability: the two-second test

A wall panel is glanceable when someone walking past understands it without stopping
([Matthews et al., Berkeley](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2006/EECS-2006-113.html)).
In two seconds they should know:

1. **Is the house secure?** Armed or not, and anything open.
2. **Does anything need me?** Laundry done, a lock that didn't lock, a notification.
3. **What's on?** Lights, music, TVs.
4. **Time, weather and how warm it is inside.**

How:

- **Quiet when all is well.** Normal states aren't items: no row of green checks. An exception
  then stands out on its own.
- **Exceptions only while they're true** ("2 open" while something's open; laundry while it runs
  or is done).
- **Escalate by severity:** icon + word + color, never color alone; amber for attention, red only
  for the alarm and failures.
- **Big type for the two or three numbers that matter** (time, temperature); everything
  secondary smaller and muted, but still readable (see [type](shape-space-type.md#typography)).
- **Toasts for events** that matter for about a minute; never for state that lasts.

## Touch and ergonomics

- **Targets:** 44px everywhere; **48px on wall panels**, **56px for the main action** (arming,
  a room's power). WCAG's floor is 24px ([2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)),
  the enhanced level 44px; fingertips are 1.6–2 cm wide and people on the move, children and
  older people need more ([NN/g](https://www.nngroup.com/articles/touch-target-size/)).
- **8px between targets**, and never a security or destructive control beside a frequent one.
- **Shrink padding, never targets**, to make a layout fit.
- **Undo over confirm** for anything reversible (lights, scenes, All off, a deleted to-do): it
  happens at once, with an Undo toast. Confirmations get clicked through by habit
  ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/)).
- **One deliberate step** for what lowers security: disarming (the PIN pad), unlocking, opening a
  garage. Locking and closing never ask.
- **Whole-house actions** (Home Bedtime) ask once, saying exactly what will happen, with a button
  that names the outcome.

## Interaction patterns

| Pattern | Use it for | Not for |
| :--- | :--- | :--- |
| **Tile** | Rooms, favorites: spatial, scannable, a big target | A list of a room's fixtures |
| **Row** | A device inside a section or dialog: name, state, one control | Anything with several controls |
| **Section** | Grouping on a screen (Lighting, Security, Climate) | Nesting: no card inside a card |
| **Switch** | A state that persists and applies at once (a light, a room) | An action |
| **Button** | An action or command (Open, Play, Quick scent) | A state |
| **Slider** | A continuous value (dimmer, volume, position), with its number shown | The first screen: it lives in the dialog |
| **Dialog / sheet** | A focused task that returns where it came from | Navigation between areas |

- **Optimistic UI:** a tap shows its result at once and reconciles when the device reports; a slow
  device (a lock, a garage, a thermostat) shows a busy state. A tap that looks ignored gets tapped
  again.
- **Feedback** within 100ms; haptics on phones as a second cue, never the only one; sounds on the
  panels only for security events and the holiday eggs.
- **Empty and error states:** one icon, one sentence, one way out ("Try again"). An unreachable
  device shows as **Offline**, disabled; never hidden, never stale.
- **Recognition over recall** ([NN/g](https://www.nngroup.com/articles/recognition-and-recall/)):
  every control has a visible label; every swipe or long press has a visible alternative.

## Accessibility and inclusion

- **Guests and children:** every control explains itself by its label; one obvious action per
  screen; no gesture-only paths; always a visible way back.
- **Low vision:** text at 4.5:1, controls and focus rings at 3:1 (WCAG 1.4.3, 1.4.11); body at
  least 16px on a wall panel and 14px on a phone.
- **Color blindness:** never color alone (WCAG 1.4.1); see [Color](color.md#color-blindness).
- **Motion:** honor `prefers-reduced-motion`, and a dashboard set to reduced motion; ambient animation only for alerts and what's
  playing. Constant motion in the corner of the eye is the busiest thing a wall panel can do.
- **Night:** dark, dimmed during bedtime, no flashing, quiet. A panel that lights up a dark hallway
  is a bug ([Color: night](color.md#night)).
- **Privacy:** nothing personal on a shared panel: affirmations, someone's own to-dos, private
  scenes stay on their phone.

## Words

- The **same word for the same state** everywhere: Locked, Unlocked, Open, Closed, Offline,
  Jammed, On, Off.
- **Buttons name the outcome** ("Arm anyway", "Put the house to bed"), never OK or Yes.
- **Dialog titles in Title Case; everything else in sentence case**; "…" never "...".
- **Numbers carry units** (72°, 45%, 3 min), in tabular figures; relative time under a day
  ("5 min ago").
- **Say what happened and what to do:** "Front door didn't lock. Close it, then try again."
- **No platform jargon** (entity, integration, helper) on a dashboard.

## The rules

1. Status above controls, on every surface.
2. Exceptions only while they're true; normal isn't an item.
3. Five to seven groups on a first screen at most; add one, remove one.
4. Two levels: a screen, then a dialog. A dialog opens another only to confirm.
5. 44px targets, 48px on panels, 56px for the main action, 8px apart.
6. Rooms are the structure; fixtures live in the room's dialog.
7. Undo for what's reversible; one deliberate step for what lowers security; never ask to lock or
   close.
8. A word on every control; icon-only only for Close.
9. Color with an icon and a word, never alone.
10. A visible alternative to every swipe and long press.
11. Optimistic or busy at once; never a tap that looks ignored.
12. One control per row; the rest in its dialog.
13. Advanced options (color, effects, presets) behind one labeled way in.
14. Nothing personal on a shared panel.
15. Quiet and dim at night; animate alerts, not idle.
16. Outcome-named buttons; say what will happen.
17. Offline is shown, never hidden.
18. One word and one icon per concept, everywhere.
19. One way to draw one thing ([Components](components.md)).
20. Test by walking past the panel, not at a desk.
