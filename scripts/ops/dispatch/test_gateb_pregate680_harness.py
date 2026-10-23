#!/usr/bin/env python3

from __future__ import annotations

import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "ops" / "gateb"))

import gateb_pregate_daybyday as gp  # noqa: E402


def _write_rgba_png(path: Path, width: int, height: int, pixels: bytes) -> None:
    assert len(pixels) == width * height * 4

    def chunk(ctype: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(ctype + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + ctype + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        rows.extend(pixels[y * width * 4 : (y + 1) * width * 4])
    idat = zlib.compress(bytes(rows), 9)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    path.write_bytes(png)


def _colourful_map_pixels(width: int, height: int) -> bytes:
    buf = bytearray(width * height * 4)
    palette = [(220, 60, 60), (60, 160, 80), (50, 90, 210), (230, 180, 40), (140, 70, 190)]
    for y in range(height):
        for x in range(width):
            r, g, b = palette[(x // 12 + y // 10) % len(palette)]
            i = (y * width + x) * 4
            buf[i : i + 4] = bytes([r, g, b, 255])
    return bytes(buf)


def _flat_map_pixels(width: int, height: int, rgb=(210, 205, 198)) -> bytes:
    buf = bytearray(width * height * 4)
    r, g, b = rgb
    for i in range(0, len(buf), 4):
        buf[i : i + 4] = bytes([r, g, b, 255])
    return bytes(buf)


def _regions(map_box: list[int]) -> dict:
    return {
        "daybyday-390.png": {
            "ok": True,
            "map": {"box": map_box},
            "struct": {"timeline": [{"title": "Hotel Beacon"}, {"title": "Smoke Jazz"}]},
        }
    }


def _tile_log(markers: int) -> dict:
    return {"shots": [{"shot": "daybyday-390.png", "w": 390, "markers": markers}]}


class GatebPregate680HarnessTests(unittest.TestCase):
    def test_tile_noise_inside_map_box_passes(self) -> None:
        map_box = [16, 400, 358, 420]
        compare = {
            "verdict": "FAIL",
            "mismatched": 903,
            "clusters": [{"x": 40, "y": 450, "w": 8, "h": 2}, {"x": 120, "y": 520, "w": 6, "h": 2}],
        }
        ok, reason = gp.adjudicate_daybyday_pregate(
            "daybyday-390.png",
            compare,
            cand_regions=_regions(map_box),
            ref_regions=_regions(map_box),
            cand_tile_log=_tile_log(5),
            ref_tile_log=_tile_log(5),
            cand_png_path=None,
        )
        self.assertFalse(ok)
        self.assertIn("png", reason.lower())

        with tempfile.TemporaryDirectory() as tmp:
            png = Path(tmp) / "cand.png"
            _write_rgba_png(png, 390, 900, _colourful_map_pixels(390, 900))
            ok, reason = gp.adjudicate_daybyday_pregate(
                "daybyday-390.png",
                compare,
                cand_regions=_regions(map_box),
                ref_regions=_regions(map_box),
                cand_tile_log=_tile_log(5),
                ref_tile_log=_tile_log(5),
                cand_png_path=str(png),
            )
        self.assertTrue(ok, reason)
        self.assertIn("map-box masked", reason)

    def test_diff_outside_map_box_fails(self) -> None:
        map_box = [16, 400, 358, 420]
        compare = {
            "verdict": "FAIL",
            "mismatched": 40,
            "clusters": [{"x": 10, "y": 50, "w": 12, "h": 8}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            png = Path(tmp) / "cand.png"
            _write_rgba_png(png, 390, 900, _colourful_map_pixels(390, 900))
            ok, reason = gp.adjudicate_daybyday_pregate(
                "daybyday-390.png",
                compare,
                cand_regions=_regions(map_box),
                ref_regions=_regions(map_box),
                cand_tile_log=_tile_log(5),
                ref_tile_log=_tile_log(5),
                cand_png_path=str(png),
            )
        self.assertFalse(ok)
        self.assertIn("not confined", reason)

    def test_moved_marker_fails_even_when_diff_inside_map(self) -> None:
        map_box = [16, 400, 358, 420]
        compare = {
            "verdict": "FAIL",
            "mismatched": 100,
            "clusters": [{"x": 40, "y": 450, "w": 8, "h": 2}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            png = Path(tmp) / "cand.png"
            _write_rgba_png(png, 390, 900, _colourful_map_pixels(390, 900))
            ok, reason = gp.adjudicate_daybyday_pregate(
                "daybyday-390.png",
                compare,
                cand_regions=_regions(map_box),
                ref_regions=_regions(map_box),
                cand_tile_log=_tile_log(4),
                ref_tile_log=_tile_log(5),
                cand_png_path=str(png),
            )
        self.assertFalse(ok)
        self.assertIn("marker", reason.lower())

    def test_broken_flat_map_fails_colour_variety(self) -> None:
        map_box = [16, 400, 358, 420]
        w, h = 390, 900
        rgba = _flat_map_pixels(w, h)
        metrics = gp.colour_variety_in_box(rgba, w, h, map_box)
        self.assertFalse(metrics["ok"])
        compare = {
            "verdict": "FAIL",
            "mismatched": 0,
            "clusters": [],
        }
        with tempfile.TemporaryDirectory() as tmp:
            png = Path(tmp) / "flat.png"
            _write_rgba_png(png, w, h, rgba)
            compare["mismatched"] = 50
            compare["clusters"] = [{"x": 40, "y": 450, "w": 8, "h": 2}]
            ok, reason = gp.adjudicate_daybyday_pregate(
                "daybyday-390.png",
                compare,
                cand_regions=_regions(map_box),
                ref_regions=_regions(map_box),
                cand_tile_log=_tile_log(5),
                ref_tile_log=_tile_log(5),
                cand_png_path=str(png),
            )
        self.assertFalse(ok)
        self.assertIn("colour", reason.lower())

    def test_merge_verdict_pass(self) -> None:
        merged = gp.merge_daybyday_pregate_verdict("FAIL", (True, "masked tile noise"))
        self.assertEqual(merged["verdict"], "PASS")
        self.assertEqual(merged["pregate_map"], "map-box-masked")


if __name__ == "__main__":
    unittest.main()
