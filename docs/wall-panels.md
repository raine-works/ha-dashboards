# Wall panels

A wall panel is a tablet showing `custom:wall-panel-dashboard`: Lighting, Security and Climate under
the header, sized for fingers, its own floor's lights first, always dark. Any tablet that runs a
browser works: a dedicated panel, an old Android tablet in Fully Kiosk Browser, the Companion app.
On Android, its WebView must be **139 or later** ([below](#the-browser-android-system-webview)).

## A dashboard per panel

```yaml
views:
  - path: home
    panel: true
    cards:
      - type: custom:wall-panel-dashboard
        name: Kitchen wall panel
        floor: main_floor
        timer: true
```

Point the tablet at that dashboard and sign it in. Tablets often share one Home Assistant user; the
card's `name` is how a shared user still says which panel armed the alarm.

## The panel's hardware

On the integration's page, **Add wall panel** for each tablet and pick its device. Its hardware is
found on the device, and you can pick or leave out each part:

| Part | Found as | Does |
| :--- | :--- | :--- |
| Status light | The device's one light | Pulses red while the alarm is triggered, amber during its entry and exit delays; steady amber while a door labeled **Exterior Door** is open; green while armed; off otherwise. 10% brightness while bedtime is on (never for a triggered alarm) |
| Wake | A button or switch named for waking or the screen | Turned on when any doorbell rings, so the doorbell's camera, which opens by itself, is seen |
| Reload | A button with the `restart` device class | Pressed by `raineworks_dashboards.reload_panels` |

A tablet without any of them still runs the dashboard. The status light follows the integration's
**Alarm panel** and **Bedtime** options ([reference](reference/options.md)).

## At night

While Home Bedtime is on, the panel's screen dims too, so it never lights up a dark hallway: the
page and text a step darker, the status colors softer, the theme's glow off; the alarm keeps its
full red. Everything stays readable (the contrast test checks the night colors in every theme).
Phones and desktops aren't dimmed: they're someone's own screen.

## A shared user

A panel's user doesn't need to be an administrator: the integration takes voice clip uploads from any
signed-in user and looks up what the music player needs for them.

To limit what the tablet can open, use [Warden](https://github.com/raine-works/ha-warden) 0.3.3 or
later: a group with the panels' dashboards allowed. Earlier versions could leave a user whose group
allowed no panels on Home Assistant's loading screen.

## Sizes

The layout is made for 1280×800 (15") and 960×600 (10.5") screens, and anything between; nothing
scrolls the page, and each column scrolls under its title when it's full.

## The browser: Android System WebView

On an Android panel the dashboard runs in **Android System WebView** (the panel's app, Fully Kiosk
Browser and the Companion app all use it), so the WebView's version decides how it draws, not the
app's.

| WebView (Chromium) | What you get |
| :--- | :--- |
| **139 or later** (required) | Everything as designed: squircle corners, numbers that roll |
| 138 and earlier | Works, but corners are plain rounded (small tiles look like pills) and rolling numbers can draw wrong (a temperature's degree sign over its last digit) |

Squircles need CSS `corner-shape`, new in Chromium 139 ([shape, space and
type](design/shape-space-type.md#squircles)). Tested on WebView 158 (good) and 124 (both problems).

**Check it:** Settings → Apps → ⋮ → **Show system** → **Android System WebView**: the version is at
the bottom. Or, over USB debugging:

```sh
adb shell "dumpsys webviewupdate | grep 'Current WebView'"
```

**Update it:** through the Play Store where the tablet has it. Many wall panels aren't Play Protect
certified, so the Play Store and Chrome won't run on them, and their WebView never updates by itself.
On one of those, install a newer one from a computer:

1. Check the panel can take Google's WebView: its package must be `com.google.android.webview`
   (the AOSP `com.android.webview` can't be replaced this way). Get the Android version and CPU too:

   ```sh
   adb shell "getprop ro.build.version.release; getprop ro.product.cpu.abi; dumpsys webviewupdate | grep -i package"
   ```

2. Download the latest **stable** Android System WebView from
   [APKMirror](https://www.apkmirror.com/apk/google-inc/android-system-webview/): a plain APK (not a
   bundle) for the panel's CPU (`arm64-v8a` takes the *arm64-v8a + armeabi-v7a* variant) and
   Android version, never a beta.
3. Install it and restart the panel:

   ```sh
   adb install -r -d <the file>.apk
   adb reboot
   ```

   If the panel's own app doesn't come back after the restart, start it from its app icon.

Do this for each panel: identical panels can ship with different WebViews.

