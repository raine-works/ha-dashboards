# Security

Please report a security problem privately, through GitHub's
[private vulnerability reporting](https://github.com/raine-works/ha-dashboards/security/advisories/new),
not in a public issue. Include what it lets someone do, and how to reproduce it.

The integration runs inside Home Assistant, so the things that matter most are what it lets a
signed-in user do that Home Assistant wouldn't (it takes uploads from any signed-in user, and an
administrator's bundle upload), and anything that could expose a token or a camera.
