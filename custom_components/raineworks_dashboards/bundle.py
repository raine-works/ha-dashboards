"""The dashboards bundle this integration serves.

One folder is served, /config/raineworks_dashboards/www (outside the integration's own
folder, which HACS replaces on an update): the bundle (`dashboards-<hash>.js`), the
chunks it loads on demand (`chunk-<hash>.js`), each with .br / .gz copies, and
`version.json` naming the bundle, which the dashboards read to notice a newer one. A
release's packaged www/ is copied in when it's newer than what's served (by its build
time), and `bun run build` uploads a build straight into it (an admin's upload,
`BundleUploadView`). The two newest bundles stay, so a page loading during an update
still finds the one it asked for, with every chunk they reach.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import shutil

BUNDLE_FILE = re.compile(r"^dashboards-[0-9a-f]{12}\.js$")
SERVED_FILE = re.compile(
    r"^(?:(?:dashboards|chunk)-[A-Za-z0-9_-]+\.js(?:\.br|\.gz)?|version\.json)$"
)
CHUNK_REF = re.compile(rb"chunk-[A-Za-z0-9_-]+\.js")
KEEP_BUNDLES = 2


class BundleError(ValueError):
    """An upload that isn't a dashboards build."""


def find_bundle(www: Path) -> str | None:
    """The bundle's file name, from version.json; None without a valid one.

    Run in the executor: it reads a file.
    """
    version = _version(www)
    file = version.get("file")
    if not isinstance(file, str) or not BUNDLE_FILE.match(file):
        return None
    return file if (www / file).is_file() else None


def _version(www: Path) -> dict:
    try:
        version = json.loads((www / "version.json").read_text())
    except OSError, ValueError:
        return {}
    return version if isinstance(version, dict) else {}


def built_at(www: Path) -> str:
    """When the folder's bundle was built (ISO time, so it sorts); "" without one."""
    built = _version(www).get("built")
    return built if isinstance(built, str) and find_bundle(www) else ""


def install(files: dict[str, bytes], served: Path) -> str:
    """Write a build into the served folder; the bundle's name. Run in the executor.

    version.json goes last, so a page never reads a version whose files aren't there
    yet.
    """
    for name in files:
        if not SERVED_FILE.match(name):
            raise BundleError(f"Not a dashboards file: {name}")
    try:
        version = json.loads(files.get("version.json", b""))
    except ValueError as error:
        raise BundleError("version.json is missing or not JSON") from error
    bundle = version.get("file") if isinstance(version, dict) else None
    if (
        not isinstance(bundle, str)
        or not BUNDLE_FILE.match(bundle)
        or bundle not in files
    ):
        raise BundleError("version.json doesn't name a bundle in the upload")
    served.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        if name != "version.json":
            temporary = served / f".{name}.part"
            temporary.write_bytes(content)
            temporary.replace(served / name)
    temporary = served / ".version.json.part"
    temporary.write_bytes(files["version.json"])
    temporary.replace(served / "version.json")
    prune(served)
    return bundle


def install_packaged(packaged: Path, served: Path) -> bool:
    """Copy a release's packaged build in when it's newer than what's served. Run in the
    executor.
    """
    if not built_at(packaged) or built_at(packaged) <= built_at(served):
        return False
    install(
        {
            p.name: p.read_bytes()
            for p in packaged.iterdir()
            if p.is_file() and SERVED_FILE.match(p.name)
        },
        served,
    )
    return True


def prune(served: Path, keep: int = KEEP_BUNDLES) -> list[str]:
    """Remove all but the newest bundles (the one version.json names always stays) and
    every chunk none of them reach, with their .br / .gz copies; the names removed.
    """
    current = find_bundle(served)
    bundles = sorted(
        (p for p in served.iterdir() if BUNDLE_FILE.match(p.name)),
        key=lambda p: (p.name == current, p.stat().st_mtime),
        reverse=True,
    )
    kept, removed = bundles[:keep], []
    for old in bundles[keep:]:
        removed.extend(_remove(old))

    reached: set[str] = set()
    pending = [p.read_bytes() for p in kept]
    while pending:
        for ref in CHUNK_REF.findall(pending.pop()):
            name = ref.decode()
            if name not in reached and (served / name).is_file():
                reached.add(name)
                pending.append((served / name).read_bytes())
    for chunk in served.glob("chunk-*.js"):
        if chunk.name not in reached:
            removed.extend(_remove(chunk))
    return removed


def _remove(path: Path) -> list[str]:
    removed = []
    for variant in (
        path,
        path.with_name(path.name + ".br"),
        path.with_name(path.name + ".gz"),
    ):
        if variant.exists():
            variant.unlink()
            removed.append(variant.name)
    return removed


def remove_served(served: Path) -> None:
    """Delete the served folder (the integration removed). Run in the executor."""
    shutil.rmtree(served, ignore_errors=True)
