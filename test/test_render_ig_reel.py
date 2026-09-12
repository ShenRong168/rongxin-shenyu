import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "render_ig_reel.py"


class RenderIgReelTest(unittest.TestCase):
    def test_renders_a_decodable_vertical_reel(self):
        spec = importlib.util.spec_from_file_location("render_ig_reel", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "reel.mp4"
            module.render_reel(
                ROOT / "assets" / "ig-characters" / "moon-hungry-question.png",
                output,
                ["月亮會肚子餓嗎？", "它在等你說晚安。"],
                duration=1.0,
            )
            self.assertTrue(output.is_file())
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(output)],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertEqual(probe.stdout.strip(), "1080,1350")

    def test_ken_burns_crop_is_symmetric_at_the_four_corners(self):
        spec = importlib.util.spec_from_file_location("render_ig_reel", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        colors = {
            "top_left": (230, 40, 40),
            "top_right": (40, 180, 60),
            "bottom_left": (40, 80, 230),
            "bottom_right": (230, 200, 40),
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source, output = temp / "corners.png", temp / "reel.mp4"
            image = Image.new("RGB", (1080, 1350), (245, 240, 230))
            draw = ImageDraw.Draw(image)
            size = 220
            draw.rectangle((0, 0, size, size), fill=colors["top_left"])
            draw.rectangle((1080 - size, 0, 1079, size), fill=colors["top_right"])
            draw.rectangle((0, 1350 - size, size, 1349), fill=colors["bottom_left"])
            draw.rectangle((1080 - size, 1350 - size, 1079, 1349), fill=colors["bottom_right"])
            image.save(source)

            module.render_reel(source, output, ["測試"], duration=15.0)
            for timestamp in ("0", "14.9"):
                frame = temp / f"frame-{timestamp}.png"
                subprocess.run(
                    ["ffmpeg", "-y", "-ss", timestamp, "-i", str(output), "-frames:v", "1", str(frame)],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                pixels = list(Image.open(frame).convert("RGB").get_flattened_data())
                counts = {
                    name: sum(
                        abs(pixel[0] - color[0]) < 45
                        and abs(pixel[1] - color[1]) < 45
                        and abs(pixel[2] - color[2]) < 45
                        for pixel in pixels
                    )
                    for name, color in colors.items()
                }
                self.assertLess(abs(counts["top_left"] - counts["top_right"]), 3_000, counts)
                self.assertLess(abs(counts["bottom_left"] - counts["bottom_right"]), 3_000, counts)


if __name__ == "__main__":
    unittest.main()
