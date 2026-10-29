#!/usr/bin/env python3
"""Render the thirteenth Facebook quote-card pair with verified Traditional Chinese text."""

import random
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
INK = "#173E35"
MATCHA = "#A9BA9D"
GOLD = "#C9A86A"
IVORY = "#F6F0E5"

CARDS = {
    "nobody-asked-tired": ("好久沒有人問你，累不累了", 48),
    "sadness-no-comparison": ("難過不用比較", 56),
}


def centered(draw, text, font, center_x, top, fill):
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((center_x - (box[2] - box[0]) / 2, top), text, font=font, fill=fill)


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in CARDS:
        raise SystemExit(
            "Usage: render_thirteenth_round_quote_cards.py "
            "<nobody-asked-tired|sadness-no-comparison> <output.png>"
        )

    variant, output_path = sys.argv[1:]
    quote, quote_size = CARDS[variant]
    image = Image.new("RGB", (W, H), MATCHA)
    draw = ImageDraw.Draw(image)

    # Fixed seed keeps the handmade paper texture repeatable for this series.
    random.seed(13 if variant == "nobody-asked-tired" else 14)
    for _ in range(360):
        x, y = random.randrange(W), random.randrange(H)
        r = random.choice((1, 1, 2, 3))
        draw.ellipse((x - r, y - r, x + r, y + r), fill="#A1B294")

    panel = (85, 292, 995, 1004)
    draw.rounded_rectangle(panel, radius=20, fill=IVORY, outline=GOLD, width=3)
    draw.line((470, 755, 610, 755), fill=GOLD, width=2)

    quote_font = ImageFont.truetype(FONT, quote_size)
    centered(draw, quote, quote_font, W / 2, 615, INK)

    draw.rounded_rectangle((31, 1209, 257, 1301), radius=39, fill=INK, outline=GOLD, width=2)
    brand_font = ImageFont.truetype(FONT, 24)
    english_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12)
    centered(draw, "榮心紳語", brand_font, 144, 1223, IVORY)
    centered(draw, "InnerDialogueStudio", english_font, 144, 1260, IVORY)

    image.save(output_path, "PNG")


if __name__ == "__main__":
    main()
