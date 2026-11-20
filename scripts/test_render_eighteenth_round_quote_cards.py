#!/usr/bin/env python3
"""Regression checks for the eighteenth Facebook quote-card content."""

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("render_eighteenth_round_quote_cards.py")


def load_renderer():
    spec = importlib.util.spec_from_file_location("eighteenth_renderer", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class EighteenthRoundContentTest(unittest.TestCase):
    def test_contains_the_two_approved_headlines(self):
        renderer = load_renderer()

        self.assertEqual(
            renderer.CARDS["too-tired-to-reply"][0],
            "不想回訊息，又覺得過意不去",
        )
        self.assertEqual(
            renderer.CARDS["being-the-strong-one"][0],
            "總是那個撐得住的人",
        )


if __name__ == "__main__":
    unittest.main()
