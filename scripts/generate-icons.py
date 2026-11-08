"""Generate Windows icon resources from Jarvis's shared reactor artwork."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = root / "electron" / "icon.png"
if not source.exists():
    raise SystemExit(f"Missing reactor image: {source}")
image = Image.open(source).convert("RGBA")
image.save(root / "electron" / "icon.ico", format="ICO", sizes=[
    (16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)
])
image.save(root / "electron" / "tray.ico", format="ICO", sizes=[
    (16, 16), (24, 24), (32, 32), (48, 48)
])
print("Generated matching Jarvis app, installer and tray icons.")
