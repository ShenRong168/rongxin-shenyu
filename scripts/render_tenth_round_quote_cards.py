#!/usr/bin/env python3
"""Render the tenth Facebook quote-card pair with verified Traditional Chinese text."""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
INK = "#173E35"
GOLD = "#C9A86A"
IVORY = "#F6F0E5"

CARDS = {
    "bother": ("不用怕打擾。\n有些話，\n只是想有人聽。", 52),
    "replaying": ("那句話，\n今晚先放著。", 62),
}


def centered_multiline(draw, text, font, center_x, top, spacing, fill):
    lines = text.splitlines()
    y = top
    for line in lines:
        box = draw.textbbox((0, 0), line, font=font)
        draw.text((center_x - (box[2] - box[0]) / 2, y), line, font=font, fill=fill)
        y += (box[3] - box[1]) + spacing


def main():
    if len(sys.argv) != 4 or sys.argv[1] not in CARDS:
        raise SystemExit("Usage: render_tenth_round_quote_cards.py <bother|replaying> <input.png> <output.png>")
    variant, source_path, output_path = sys.argv[1:]
    quote, quote_size = CARDS[variant]
    source = Image.open(source_path).convert("RGBA").resize((W, H))
    draw = ImageDraw.Draw(source)

    quote_font = ImageFont.truetype(FONT, quote_size)
    centered_multiline(draw, quote, quote_font, W / 2, 510 if variant == "bother" else 570, 24, INK)
    draw.line((470, 830, 610, 830), fill=GOLD, width=2)

    draw.rounded_rectangle((31, 1209, 257, 1301), radius=39, fill=INK, outline=GOLD, width=2)
    brand_font = ImageFont.truetype(FONT, 24)
    english_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12)
    centered_multiline(draw, "榮心紳語", brand_font, 144, 1223, 0, IVORY)
    centered_multiline(draw, "InnerDialogueStudio", english_font, 144, 1260, 0, IVORY)

    source.convert("RGB").save(output_path, "PNG")


if __name__ == "__main__":
    main()
