"""Offline UI checks: data.js loads without a server and the UI pulls nothing from the network."""
import json
import re

from src.build import build, write_data_js
from src.config import ROOT


def test_data_js_roundtrip(tmp_path):
    path = write_data_js(build(date="11-10-2026"), tmp_path / "data.js")
    text = path.read_text(encoding="utf-8")
    assert text.startswith("window.GHAT_DATA = ") and text.rstrip().endswith(";")
    data = json.loads(text[len("window.GHAT_DATA = "):].rstrip().rstrip(";"))
    assert data["scopes"]["all"][0]["id"] == "bairagarh"


def test_ui_has_no_external_assets_or_network_calls():
    html = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
    js = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
    css = (ROOT / "docs" / "style.css").read_text(encoding="utf-8")
    assert not re.search(r'(src|href)="https?://', html)
    assert "@import" not in css and "url(http" not in css
    for call in ("fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "import("):
        assert call not in js
    # The only absolute URL in app.js is the wa.me share link the officer clicks.
    assert set(re.findall(r"https?://[\w.]+", js)) == {"https://wa.me"}
