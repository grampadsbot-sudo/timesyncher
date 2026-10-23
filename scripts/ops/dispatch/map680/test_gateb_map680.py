#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
MAP680 = Path(__file__).resolve().parent
GATEB_HOST = Path("/home/ubishere9995/tsv-gateb")
sys.path.insert(0, str(ROOT / "scripts" / "ops" / "gateb"))
sys.path.insert(0, str(MAP680))

import gateb_compare  # noqa: E402
import gateb_pregate_map as mapmod  # noqa: E402

PR653_BASE = "/home/ubishere9995/tsv-dispatch/gateb-cand/base-39e5c83-fixture-207bb7a30a4b099c"
PR653_CAND = "/home/ubishere9995/tsv-dispatch/gateb-cand/pr653-6931f48"
PR653_HAVE = os.path.isdir(PR653_BASE) and os.path.isdir(PR653_CAND)


class MapEvidenceUnitTests(unittest.TestCase):
    def test_broken_map_no_tiles_fails(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            shot = "daybyday-390.png"
            reg = {"viewport": [390, 844], "map": {"box": [16, 1174, 358, 420]}, "struct": {"chips": [{"text": "Day 1", "active": True}]}}
            log = {"requests": [], "shots": [{"shot": shot, "w": 390, "markers": 3, "t_ms": 1000}]}
            open(os.path.join(td, "tile-log.json"), "w").write(json.dumps(log))
            reasons = mapmod.map_tile_evidence_failures(td, shot, reg)
            self.assertTrue(any("map tiles did not load" in r for r in reasons))

    def test_timeline_change_outside_map_fails_masked_pixelmatch(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            box = [16, 1174, 358, 420]
            base = os.path.join(td, "base.png")
            cand = os.path.join(td, "cand.png")
            shutil.copyfile(os.path.join(PR653_BASE, "daybyday-390.png"), base)
            shutil.copyfile(os.path.join(PR653_CAND, "daybyday-390.png"), cand)
            subprocess_draw = [
                "convert",
                cand,
                "-fill",
                "red",
                "-draw",
                "rectangle 20,400 200,420",
                cand,
            ]
            subprocess.run(subprocess_draw, check=True, capture_output=True)
            pm = str(GATEB_HOST / "pm.mjs")
            fails, n = mapmod.pixelmatch_outside_map_fails(pm, base, cand, box, td, "moved", cwd=str(GATEB_HOST))
            self.assertTrue(fails)
            self.assertGreater(n, 0)


@unittest.skipUnless(PR653_HAVE, "PR #653 captures not on this host")
class Pr653TileNoiseIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        gateb_compare.HERE = str(GATEB_HOST)
        cls.args = Namespace(pass_max=0.0001, fail_min=0.02, iso_max=0, no_vision=True)
        cls.base_regs = json.load(open(os.path.join(PR653_BASE, "capture-regions.json")))
        cls.cand_regs = json.load(open(os.path.join(PR653_CAND, "capture-regions.json")))

    def _compare_shot(self, shot: str) -> dict:
        with tempfile.TemporaryDirectory() as out:
            return gateb_compare.compare(
                shot,
                os.path.join(PR653_BASE, shot),
                os.path.join(PR653_CAND, shot),
                out,
                self.args,
                self.base_regs,
                self.cand_regs,
                {},
                PR653_BASE,
                PR653_CAND,
            )

    def test_daybyday_390_tile_noise_passes(self) -> None:
        r = self._compare_shot("daybyday-390.png")
        self.assertEqual(r["verdict"], "PASS")
        self.assertIn("map_mask", r)

    def test_daybyday_1280_tile_noise_passes(self) -> None:
        r = self._compare_shot("daybyday-1280.png")
        self.assertEqual(r["verdict"], "PASS")


if __name__ == "__main__":
    unittest.main()
