# Phone alerts

Every household member chooses which pushes the house sends to their phone. In the Home dashboard,
open **Phone alerts** (the bell on a phone's header, or the More menu on a wider screen): a switch
for each kind of push. The choice is kept by the integration for that person, so it follows them to
every phone they have. Only a household member signed in sees it: never a wall panel's shared user
or the admin.

| Kind | `category` | What it covers |
| :--- | :--- | :--- |
| Security | `security` | The alarm going off, doors left open, locks that didn't lock. **Always on**: it can't be turned off |
| Doorbell | `doorbell` | Someone at the door |
| Packages | `packages` | A delivery left at the door |
| Laundry | `laundry` | The washer or dryer is done |
| Daily brief | `daily` | The morning's brief and reading |
| Affirmations | `affirmations` | Your daily affirmation and birthday wishes |
| To-do | `todo` | Chores assigned to you, and reminders when they're due |
| Messages | `messages` | Messages from people in the household (the Messages dialog's Phones tab sends these) |
| House | `house` | Everything else the house tells you |

## Sending a push in a category

Name the category when you call
[`raineworks_dashboards.notify_people`](reference/actions.md):

```yaml
- action: raineworks_dashboards.notify_people
  data:
    category: laundry
    title: Laundry
    message: The washer is done
```

People who turned that kind off are skipped (the action's response lists them as `skipped`). A push
in `security`, without a category, or with one the integration doesn't know reaches everyone it
names, as before, so an automation that doesn't name one keeps working.
