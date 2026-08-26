#!/bin/bash
# Trim + scale a raw screen recording of a make_reel_card.py page into an
# upload-ready IG Reel MP4. Assumes the standard flow: open page, click once,
# press R, record until the animation settles (~18-20s is plenty).
#
# Usage: finish_reel.sh <raw-recording.mov> <output.mp4> [start_sec] [duration_sec]
#   start_sec / duration_sec default to 2.3 / 14.7 — the template's fixed
#   countdown + animation timing. Override only if your recording's timing
#   drifted (e.g. you waited a beat before pressing R).

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <raw-recording.mov> <output.mp4> [start_sec] [duration_sec]" >&2
  exit 1
fi

RAW="$1"
OUT="$2"
START="${3:-2.3}"
DURATION="${4:-14.7}"

if [ ! -f "$RAW" ]; then
  echo "error: input not found: $RAW" >&2
  exit 1
fi

ffmpeg -y -ss "$START" -t "$DURATION" -i "$RAW" \
  -vf "scale=1080:1350:flags=lanczos" -r 30 \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -b:v 8M \
  -movflags +faststart -an "$OUT"

echo "Done: $OUT"
ffprobe -v error -show_entries format=duration -show_entries stream=width,height \
  -of default=noprint_wrappers=1 "$OUT"
