#!/usr/bin/env python3
"""Generate a self-contained Ken Burns + kinetic-caption Reel HTML from a still
image, matching 榮心紳語's brand palette. Reusable — no hand-coding per post.

Usage:
    python3 make_reel_card.py \
        --image /path/to/illustration.png \
        --caption "第一行文字" "第二行文字" \
        --output /path/to/output-reel.html

Then: open the .html in a real browser tab (not an in-app preview), click once
on the page, press R to replay from a 3-2-1 countdown, screen-record ~18s.
Feed the raw recording to finish_reel.sh to get an upload-ready MP4.
"""
import argparse
import base64
import mimetypes
import sys
from pathlib import Path

TEMPLATE = """<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700&display=swap');
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{
    width: 100%; height: 100%;
    background: #000;
    overflow: hidden;
    font-family: 'Noto Serif TC', serif;
  }}
  #frame {{
    position: fixed;
    top: 0; left: 0;
    width: 1080px; height: 1350px;
    transform-origin: top left;
  }}
  #stage {{
    position: relative;
    width: 1080px; height: 1350px;
    overflow: hidden;
  }}
  #bg {{
    position: absolute;
    top: 0; left: 0;
    width: 1080px; height: 1350px;
    object-fit: cover;
    transform-origin: 52% 40%;
    animation: kenburns 13s ease-out forwards;
  }}
  @keyframes kenburns {{
    from {{ transform: scale(1.0); }}
    to   {{ transform: scale(1.09); }}
  }}
  #veil {{
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 46%;
    background: linear-gradient(to top, rgba(23,62,53,0.55) 0%, rgba(23,62,53,0.0) 100%);
    opacity: 0;
    animation: veilIn 1.4s ease-out 1.6s forwards;
  }}
  @keyframes veilIn {{ to {{ opacity: 1; }} }}
  #caption {{
    position: absolute;
    left: 90px; right: 90px;
    bottom: 210px;
    text-align: center;
    color: #F6F0E5;
    font-weight: 700;
    font-size: {font_size}px;
    line-height: 1.5;
    text-shadow: 0 2px 18px rgba(0,0,0,0.35);
    opacity: 0;
    transform: translateY(18px);
    animation: capIn 1.1s cubic-bezier(.2,.8,.2,1) 2.1s forwards,
               capHold 1s linear 9.5s forwards;
  }}
  @keyframes capIn {{ to {{ opacity: 1; transform: translateY(0); }} }}
  @keyframes capHold {{ to {{ opacity: 0; }} }}
  #tag {{
    position: absolute;
    left: 60px; bottom: 64px;
    background: #173E35;
    border-radius: 8px;
    padding: 14px 26px;
    opacity: 0;
    animation: tagIn 0.9s ease-out 0.4s forwards;
  }}
  @keyframes tagIn {{ to {{ opacity: 1; }} }}
  #tag span {{
    color: #F6F0E5;
    font-weight: 500;
    font-size: 26px;
    letter-spacing: 1.5px;
  }}
  #countdown {{
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 260px;
    font-weight: 700;
    color: #F6F0E5;
    background: #173E35;
    z-index: 50;
  }}
  .hidden {{ display: none !important; }}
</style>
</head>
<body>
  <div id="frame">
  <div id="stage">
    <img id="bg" src="{image_data_uri}" alt="">
    <div id="veil"></div>
    <div id="caption">{caption_html}</div>
    <div id="tag"><span>榮心紳語　InnerDialogueStudio</span></div>
  </div>
  <div id="countdown" class="hidden">3</div>
  </div>

<script>
  const stage = document.getElementById('stage');
  const countdown = document.getElementById('countdown');
  const bg = document.getElementById('bg');
  const veil = document.getElementById('veil');
  const caption = document.getElementById('caption');
  const tag = document.getElementById('tag');

  function replay() {{
    countdown.classList.remove('hidden');
    stage.style.visibility = 'hidden';
    let n = 3;
    countdown.textContent = n;
    const timer = setInterval(() => {{
      n -= 1;
      if (n <= 0) {{
        clearInterval(timer);
        countdown.classList.add('hidden');
        stage.style.visibility = 'visible';
        [bg, veil, caption, tag].forEach(el => {{
          el.style.animation = 'none';
          void el.offsetWidth;
          el.style.animation = '';
        }});
      }} else {{
        countdown.textContent = n;
      }}
    }}, 700);
  }}

  window.addEventListener('keydown', (e) => {{
    if (e.key === 'r' || e.key === 'R') replay();
  }});

  const frame = document.getElementById('frame');
  function fitFrame() {{
    const scale = Math.min(window.innerWidth / 1080, window.innerHeight / 1350);
    frame.style.transform = `translate(${{(window.innerWidth - 1080 * scale) / 2}}px, ${{(window.innerHeight - 1350 * scale) / 2}}px) scale(${{scale}})`;
  }}
  window.addEventListener('resize', fitFrame);
  fitFrame();
</script>
</body>
</html>
"""


def build(image_path: Path, caption_lines: list[str], output_path: Path, font_size: int) -> None:
    mime, _ = mimetypes.guess_type(str(image_path))
    if mime is None:
        mime = "image/png"
    data = base64.b64encode(image_path.read_bytes()).decode("ascii")
    data_uri = f"data:{mime};base64,{data}"
    caption_html = "<br>".join(caption_lines)
    html = TEMPLATE.format(
        title=output_path.stem,
        image_data_uri=data_uri,
        caption_html=caption_html,
        font_size=font_size,
    )
    output_path.write_text(html, encoding="utf-8")
    print(f"Wrote {output_path} ({output_path.stat().st_size / 1_000_000:.1f} MB)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, type=Path, help="Source illustration (1080x1350 recommended)")
    parser.add_argument("--caption", required=True, nargs="+", help="One or more caption lines")
    parser.add_argument("--output", required=True, type=Path, help="Output .html path")
    parser.add_argument("--font-size", type=int, default=56, help="Caption font size in px (default 56)")
    args = parser.parse_args()

    if not args.image.exists():
        print(f"error: image not found: {args.image}", file=sys.stderr)
        return 1

    build(args.image, args.caption, args.output, args.font_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
