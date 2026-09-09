from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
BG = (15, 118, 110, 255)
WHITE = (255, 255, 255, 255)
TITLE = "F"
SUBTITLE = "Finanças"


def load_font(size: int, italic: bool = False) -> ImageFont.ImageFont:
    names = (
        ("ariali.ttf", "Arial Italic.ttf", "ARIALI.TTF")
        if italic
        else ("arialbd.ttf", "Arial Bold.ttf", "ARIALBD.TTF", "arial.ttf")
    )
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def text_size(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1], bbox


def fit_subtitle_font(draw: ImageDraw.ImageDraw, target_width: int, size: int) -> ImageFont.ImageFont:
    lo, hi = 4, max(8, int(size * 0.11))
    best = load_font(lo, italic=True)
    while lo <= hi:
        mid = (lo + hi) // 2
        font = load_font(mid, italic=True)
        width, _, _ = text_size(draw, SUBTITLE, font)
        if width <= target_width:
            best = font
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def draw_icon(size: int, path: Path) -> None:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * 0.19)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BG)

    title_font = load_font(int(size * 0.44))
    tw, th, tb = text_size(draw, TITLE, title_font)
    sub_font = fit_subtitle_font(draw, int(tw * 1.6), size)
    sw, sh, sb = text_size(draw, SUBTITLE, sub_font)

    gap = int(size * 0.028)
    block_h = th + gap + sh
    top = (size - block_h) / 2 - size * 0.02

    title_x = (size - tw) / 2 - tb[0]
    title_y = top - tb[1]
    sub_x = (size - sw) / 2 - sb[0]
    sub_y = top + th + gap - sb[1]

    draw.text((title_x, title_y), TITLE, fill=WHITE, font=title_font)
    draw.text((sub_x, sub_y), SUBTITLE, fill=WHITE, font=sub_font)
    img.save(path, format="PNG")


if __name__ == "__main__":
    draw_icon(192, ROOT / "icon192.png")
    draw_icon(512, ROOT / "icon512.png")
    print("ok")
