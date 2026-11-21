"""Constants for Raineworks Dashboards."""

DOMAIN = "raineworks_dashboards"

# Where the dashboards bundle (www/, `bun run build:integration`) is served from.
STATIC_URL = f"/{DOMAIN}"
WWW_DIR = "www"

# Options.
CONF_SERVE_BUNDLE = "serve_bundle"
CONF_HOUSEHOLD_GROUP = "household_group"
# The house settings (the dashboards' `house` option, as house.yaml writes it)
CONF_HOUSE = "house"

# Warden (raine-works/ha-warden), when installed: its groups pick the household.
WARDEN_DOMAIN = "warden"

# Each wall panel is a subentry of this type: its device and hardware.
SUBENTRY_WALL_PANEL = "wall_panel"
CONF_DEVICE = "device_id"
CONF_STATUS_LIGHT = "status_light"
CONF_WAKE = "wake"
CONF_RELOAD = "reload"

# What the status lights follow (options): the alarm panel (else found: Alarmo's,
# else the first), doors labeled EXTERIOR_DOOR_LABEL, and a bedtime switch.
CONF_ALARM_PANEL = "alarm_panel"
CONF_BEDTIME_ENTITY = "bedtime_entity"
EXTERIOR_DOOR_LABEL = "exterior_door"

# Bedtime (options): the rooms with a bedtime switch (areas), and when bedtime ends.
CONF_BEDTIME_ROOMS = "bedtime_rooms"
CONF_BEDTIME_ENDS = "bedtime_ends"
DEFAULT_BEDTIME_ENDS = "09:00:00"
BEDTIME_LABEL = "bedtime"
