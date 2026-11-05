#!/usr/bin/env python3
"""Render the fifteenth Facebook quote-card pair with verified Traditional Chinese text."""

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
    "rest-with-guilt": ("休息的時候，為什麼會有罪惡感", 43),
    "said-yes-meant-no": ("答應了，其實不太想去", 50),
}


def centered(draw, text, font, center_x, top, fill):
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((center_x - (box[2] - box[0]) / 2, top), text, font=font, fill=fill)


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in CARDS:
        raise SystemExit(
            "Usage: render_fifteenth_round_quote_cards.py "
            "<rest-with-guilt|said-yes-meant-no> <output.png>"
        )

    variant, output_path = sys.argv[1:]
    quote, quote_size = CARDS[variant]
    image = Image.new("RGB", (W, H), MATCHA)
    draw = ImageDraw.Draw(image)

    random.seed(17 if variant == "rest-with-guilt" else 18)
    for _ in range(360):
        x, y = random.randrange(W), random.randrange(H)
        radius = random.choice((1, 1, 2, 3))
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill="#A1B294")

    panel = (85, 292, 995, 1004)
    draw.rounded_rectangle(panel, radius=20, fill=IVORY, outline=GOLD, width=3)
    draw.line((470, 755, 610, 755), fill=GOLD, width=2)

    centered(draw, quote, ImageFont.truetype(FONT, quote_size), W / 2, 615, INK)

    draw.rounded_rectangle((31, 1209, 257, 1301), radius=39, fill=INK, outline=GOLD, width=2)
    centered(draw, "榮心紳語", ImageFont.truetype(FONT, 24), 144, 1223, IVORY)
    centered(draw, "InnerDialogueStudio", ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12), 144, 1260, IVORY)

    image.save(output_path, "PNG")


if __name__ == "__main__":
    main()
