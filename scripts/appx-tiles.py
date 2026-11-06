# python3 scripts/appx-tiles.py: the Microsoft Store tiles in build/appx/ (electron-builder.yml → appx), at scale 100
# and 200, from build/icon.png centered on a transparent canvas. Needs Pillow. Run again when the icon changes.
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
icon = Image.open(root / "build" / "icon.png").convert("RGBA")
out = root / "build" / "appx"
out.mkdir(exist_ok=True)
for name, (w, h) in {"StoreLogo": (50, 50), "Square44x44Logo": (44, 44), "Square150x150Logo": (150, 150), "Wide310x150Logo": (310, 150)}.items():
    for scale in (100, 200):
        W, H = w * scale // 100, h * scale // 100
        side = min(W, H)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(icon.resize((side, side), Image.LANCZOS), ((W - side) // 2, (H - side) // 2))
        canvas.save(out / f"{name}.scale-{scale}.png")
        print(f"{name}.scale-{scale}.png {W}x{H}")
