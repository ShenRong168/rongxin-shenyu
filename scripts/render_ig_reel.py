#!/usr/bin/env python3
"""Render a captioned 4:5 Ken Burns Instagram Reel without ffmpeg drawtext."""

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1350, 30
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"


def run(command):
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:])
    return result


def caption_card(lines, path):
    card = Image.new("RGBA", (W, 360), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    text_font = ImageFont.truetype(FONT, 48)
    tag_font = ImageFont.truetype(FONT, 28)
    wrapped = []
    for line in lines:
        current = ""
        for character in line:
            if draw.textlength(current + character, font=text_font) > 850:
                wrapped.append(current)
                current = character
            else:
                current += character
        if current:
            wrapped.append(current)
    line_height = 62
    text_height = line_height * len(wrapped)
    draw.rounded_rectangle((55, 25, 1025, min(320, text_height + 120)), radius=30, fill=(23, 62, 53, 205))
    y = 52
    for line in wrapped:
        width = draw.textlength(line, font=text_font)
        draw.text(((W - width) / 2, y), line, font=text_font, fill=(246, 240, 229, 255))
        y += line_height
    tag = "榮心紳語  InnerDialogueStudio"
    width = draw.textlength(tag, font=tag_font)
    draw.text(((W - width) / 2, min(274, text_height + 74)), tag, font=tag_font, fill=(201, 168, 106, 255))
    card.save(path)


def render_reel(image_path, output_path, captions, duration=15.0):
    image_path, output_path = Path(image_path), Path(output_path)
    if not image_path.is_file():
        raise FileNotFoundError(image_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frames = round(duration * FPS)
    with tempfile.TemporaryDirectory(prefix="ig-reel-") as directory:
        work = Path(directory)
        base, card = work / "base.mp4", work / "caption.png"
        caption_card(captions, card)
        run([
            "ffmpeg", "-y", "-loop", "1", "-framerate", str(FPS), "-i", str(image_path),
            "-vf", f"scale={W}:{H},zoompan=z='min(zoom+0.00035,1.15)':d={frames}:s={W}x{H}:fps={FPS},format=yuv420p",
            "-frames:v", str(frames), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-an", str(base),
        ])
        run([
            "ffmpeg", "-y", "-i", str(base), "-loop", "1", "-i", str(card),
            "-filter_complex", f"[0:v][1:v]overlay=0:900:enable='between(t,0.7,{duration})'[video]",
            "-map", "[video]", "-t", str(duration), "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
            "-b:v", "8M", "-movflags", "+faststart", "-an", str(output_path),
        ])
    decoded = run(["ffmpeg", "-v", "error", "-i", str(output_path), "-f", "null", "-"])
    if decoded.stderr.strip():
        raise RuntimeError(f"decode check failed: {decoded.stderr}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--caption", required=True, nargs="+")
    parser.add_argument("--duration", type=float, default=15.0)
    args = parser.parse_args()
    render_reel(args.image, args.output, args.caption, args.duration)


if __name__ == "__main__":
    main()
