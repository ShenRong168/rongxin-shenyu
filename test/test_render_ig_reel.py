import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
