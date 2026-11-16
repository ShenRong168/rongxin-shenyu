"""Regression checks for the seventeenth Facebook quote-card renderer."""

import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "render_seventeenth_round_quote_cards.py"


class SeventeenthRoundQuoteCardTests(unittest.TestCase):
    def test_renders_both_approved_quote_cards_as_rgb_portraits(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            for variant in ("happy-for-others-empty", "year-end-nothing-to-show"):
                output = Path(temp_dir) / f"{variant}.png"
                result = subprocess.run(
                    ["python3", str(SCRIPT), variant, str(output)],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                with Image.open(output) as image:
                    self.assertEqual(image.mode, "RGB")
                    self.assertEqual(image.size, (1080, 1350))


if __name__ == "__main__":
    unittest.main()
