<!-- Written by scripts/docs.ts from custom_components/raineworks_dashboards/services.yaml and strings.json: edit that, then run `bun scripts/docs.ts`. -->

# Actions

The integration's actions, for automations, scripts and Assist.

## `raineworks_dashboards.add_todo_item`

Adds an item to a to-do list, for a household member (an 'Assigned to' line in its description) or anyone, and tells whom it's for.

| Field | Required | Default | What it is |
| :--- | :--- | :--- | :--- |
| `list` | yes |  | The to-do list. |
| `item` | yes |  | What to do. |
| `person` |  |  | Who it's for; empty for anyone. |
| `note` |  |  | A line under the assignee. |
| `due_date` |  |  | When it's due. |

## `raineworks_dashboards.announce`

Speaks a message in the house's voice on Music Assistant speakers (each group once, through its leader) and on every TV that's on, after a chime (in a holiday's days, the holiday's sound). Skipped during quiet hours and bedtime unless told otherwise.

| Field | Required | Default | What it is |
| :--- | :--- | :--- | :--- |
| `message` | yes |  | What to say. |
| `speakers` |  |  | Speakers by entity id or name; the House options' announcement speakers when empty. |
| `volume` |  | `75` | The announcement's volume. |
| `chime` |  | `true` | Play a chime before it. |
| `holiday_chime` |  | `true` | In a holiday's days, its sound as the chime. |
| `chime_sound` |  |  | One of the integration's sounds by name (birthday), instead of the usual chime. |
| `quiet_hours` |  | `true` | Skip it during the House options' quiet hours and while bedtime is on (off for announcements a person starts). |
| `tvs` |  | `true` | Also speak it on every TV that's on. |
| `wait` |  | `true` | Wait for it to be spoken; off answers at once and speaks in the background. |
| `cache` |  | `false` | Keep the spoken audio to reuse for the same message. |

## `raineworks_dashboards.notify_people`

Sends a push to household members' phones (their Companion apps). No people: the whole household.

| Field | Required | Default | What it is |
| :--- | :--- | :--- | :--- |
| `people` |  |  | Who to notify. Leave empty for the whole household. |
| `exclude` |  |  | People to leave out (whoever made the change). |
| `title` | yes |  | A few words, such as who it's from. |
| `message` | yes |  | What to say. |
| `data` |  |  | The Companion app's data (tag, group, channel, clickAction, url, actions, image…). |
| `category` |  |  | What kind of push it is, so people who turned that kind off in the Home dashboard don't get it. Security always comes through; no category goes to everyone. |

## `raineworks_dashboards.notify_todo_assignee`

Pushes a to-do item to whom it's for (anyone: the household but whoever added it), with Mark done.

| Field | Required | Default | What it is |
| :--- | :--- | :--- | :--- |
| `person` |  |  | Who it's for; empty for anyone. |
| `list` | yes |  | The to-do list. |
| `item` | yes |  | The item's summary (finds it without a uid). |
| `uid` |  |  | The item's uid, when known. |
| `uids` |  |  | Several items at once; the item then lists their summaries. |

## `raineworks_dashboards.print_note`

Prints a note on the receipt printer: titled Note, who it's from and when, the message big and centered.

| Field | Required | Default | What it is |
| :--- | :--- | :--- | :--- |
| `message` | yes |  | The note (plain text: the printer has no emoji). |
| `sender` |  |  | Who it's from; empty for no name. |
| `printer` |  |  | Empty for the first receipt printer. |

## `raineworks_dashboards.print_todo_list`

Prints a to-do list's open items (or those picked) as a checklist, each with its due date and who it's for.

| Field | Required | Default | What it is |
| :--- | :--- | :--- | :--- |
| `list` | yes |  | The to-do list. |
| `uids` |  |  | The items to print (their uids); empty for every open item. |
| `person` |  |  | Whose slip this is (their name): titled with it, their own items not repeating it. |
| `printer` |  |  | Empty for the first receipt printer. |

## `raineworks_dashboards.reload_panels`

Presses every wall panel's reload, so each loads its dashboard again (a new version, after a deploy).

## `raineworks_dashboards.set_affirmation`

Stores a household member's daily affirmation (the Daily dialog shows it).

| Field | Required | Default | What it is |
| :--- | :--- | :--- | :--- |
| `person` | yes |  | A household member. |
| `text` | yes |  | The affirmation. |

## `raineworks_dashboards.wake_panels`

Turns on every wall panel's screen.
