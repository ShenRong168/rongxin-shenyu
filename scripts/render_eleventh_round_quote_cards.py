#!/usr/bin/env python3
"""Render the eleventh Facebook quote-card pair with verified Traditional Chinese text."""

import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
INK = "#173E35"
GOLD = "#C9A86A"
IVORY = "#F6F0E5"

CARDS = {
    "how-have-you-been": ("還好啊，不一定是真的", 48),
    "quiet-not-fine": ("安靜，不代表沒事", 64),
}


def centered(draw, text, font, center_x, top, fill):
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((center_x - (box[2] - box[0]) / 2, top), text, font=font, fill=fill)


def main():
    if len(sys.argv) != 4 or sys.argv[1] not in CARDS:
        raise SystemExit(
            "Usage: render_eleventh_round_quote_cards.py "
            "<how-have-you-been|quiet-not-fine> <input.png> <output.png>"
        )

    variant, source_path, output_path = sys.argv[1:]
    quote, quote_size = CARDS[variant]
    source = Image.open(source_path).convert("RGBA").resize((W, H))
    draw = ImageDraw.Draw(source)

    quote_font = ImageFont.truetype(FONT, quote_size)
    centered(draw, quote, quote_font, W / 2, 570, INK)
    draw.line((470, 780, 610, 780), fill=GOLD, width=2)

    draw.rounded_rectangle((31, 1209, 257, 1301), radius=39, fill=INK, outline=GOLD, width=2)
    brand_font = ImageFont.truetype(FONT, 24)
    english_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12)
    centered(draw, "榮心紳語", brand_font, 144, 1223, IVORY)
    centered(draw, "InnerDialogueStudio", english_font, 144, 1260, IVORY)

    source.convert("RGB").save(output_path, "PNG")


if __name__ == "__main__":
    main()
