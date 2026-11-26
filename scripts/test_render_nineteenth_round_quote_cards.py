#!/usr/bin/env python3
"""Regression checks for the nineteenth Facebook quote-card content."""

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("render_nineteenth_round_quote_cards.py")


def load_renderer():
    spec = importlib.util.spec_from_file_location("nineteenth_renderer", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class NineteenthRoundContentTest(unittest.TestCase):
    def test_contains_the_two_approved_headlines(self):
        renderer = load_renderer()

        self.assertEqual(
            renderer.CARDS["one-sentence-all-night"][0],
            "別人隨口一句話，我想了一整晚",
        )
        self.assertEqual(
            renderer.CARDS["reach-out-old-friend"][0],
            "想聯絡老朋友，又怕打擾",
        )


if __name__ == "__main__":
    unittest.main()
