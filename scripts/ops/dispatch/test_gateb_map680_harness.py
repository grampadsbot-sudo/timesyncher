#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "ops" / "gateb"))

import gateb_pregate_map as mapmod  # noqa: E402


class GatebMap680HarnessTests(unittest.TestCase):
    def test_daybyday_full_shot_detection(self) -> None:
        self.assertTrue(mapmod.is_daybyday_full_shot("daybyday-390.png"))
        self.assertFalse(mapmod.is_daybyday_full_shot("daybyday-390-top.png"))

    def test_map_box_from_regions(self) -> None:
        reg = {"map": {"box": [1, 2, 3, 4]}}
        self.assertEqual(mapmod.map_box_from_regions(reg), [1.0, 2.0, 3.0, 4.0])

    def test_assess_skips_non_daybyday(self) -> None:
        ok, _ = mapmod.assess_daybyday_after_pixels("hotels-390.png", None, None, None, None)
        self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
