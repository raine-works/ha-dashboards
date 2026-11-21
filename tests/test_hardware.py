"""Finding a wall panel's light, wake and reload on its device."""

from custom_components.raineworks_dashboards.hardware import (
    DeviceEntity as E,
    PanelHardware,
    find_hardware,
)


def test_a_roamiq_panel() -> None:
    assert find_hardware(
        [
            E("light.roamiq_kitchen_panel_led", "LED"),
            E("button.roamiq_kitchen_panel_reload", "Reload", "restart"),
            E("button.roamiq_kitchen_panel_wake_screen", "Wake Screen"),
            E("number.roamiq_kitchen_panel_brightness", "Screen Brightness"),
        ]
    ) == PanelHardware(
        "light.roamiq_kitchen_panel_led",
        "button.roamiq_kitchen_panel_wake_screen",
        "button.roamiq_kitchen_panel_reload",
    )


def test_a_fully_kiosk_tablet() -> None:
    assert find_hardware(
        [
            E("switch.tablet_screen", "Screen"),
            E("switch.tablet_screensaver", "Screensaver"),
            E("switch.tablet_kiosk_lock", "Kiosk lock"),
            E("button.tablet_restart_browser", "Restart browser", "restart"),
            E("button.tablet_bring_to_foreground", "Bring to foreground"),
            E("number.tablet_screen_brightness", "Screen brightness"),
        ]
    ) == PanelHardware(None, "switch.tablet_screen", "button.tablet_restart_browser")


def test_nothing_on_a_plain_tablet() -> None:
    assert find_hardware([E("sensor.tablet_battery", "Battery")]) == PanelHardware()


def test_two_lights_is_no_status_light() -> None:
    # Which one? Picked by hand instead
    found = find_hardware([E("light.a", "Strip"), E("light.b", "Flash")])
    assert found.status_light is None
