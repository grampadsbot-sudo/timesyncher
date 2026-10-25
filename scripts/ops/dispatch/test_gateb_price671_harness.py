#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "ops" / "gateb"))

import gateb_close_call  # noqa: E402
import gateb_coverage  # noqa: E402
from gateb_text_normalize import names_match, norm_match_key  # noqa: E402


class GatebPrice671HarnessTests(unittest.TestCase):
    def test_apostrophe_normalization_romer(self) -> None:
        ascii_name = "Romer Hell's Kitchen"
        curly_name = "Romer Hell\u2019s Kitchen"
        self.assertTrue(names_match(ascii_name, curly_name))
        body = (
            "Hyatt Place Times Square $389/night "
            + curly_name
            + " boutique hotel $425 per night Neighborhood Cafe"
        )
        items = [{"name": ascii_name}]
        self.assertEqual(gateb_coverage.unpriced_list_rows(body, items), [])
        msg = gateb_coverage.list_price_coverage_failure("hotels-390.png", body, items)
        self.assertIsNone(msg)

    def test_apostrophe_mismatch_without_normalize_would_miss_price(self) -> None:
        ascii_name = "Romer Hell's Kitchen"
        curly_name = "Romer Hell\u2019s Kitchen"
        body = curly_name + " $425"
        self.assertNotIn(ascii_name, body)
        self.assertEqual(norm_match_key(ascii_name), norm_match_key(curly_name))
        misses = gateb_coverage.unpriced_list_rows(body, [{"name": ascii_name}])
        self.assertEqual(misses, [])

    def test_budget_close_call_price_only_pass(self) -> None:
        ok, reason = gateb_close_call.adjudicate_close_call(
            "budget-1280.png",
            0.009,
            [],
            [],
            "prices changed on budget rows and trip total updated",
            size_changed=False,
        )
        self.assertTrue(ok)
        self.assertIn("price-amount-only", reason)

    def test_close_call_layout_change_still_fails(self) -> None:
        ok, _ = gateb_close_call.adjudicate_close_call(
            "budget-390.png",
            0.005,
            [],
            [],
            "logo chip missing on hotel row",
            size_changed=False,
        )
        self.assertFalse(ok)

    def test_hotels_price_resort_same_row_set_pass(self) -> None:
        base = [
            {"name": "Pod Times Square", "price_text": "", "desc": "UWS"},
            {"name": "Romer Hell's Kitchen", "price_text": "$425", "desc": "Hell's Kitchen"},
        ]
        cand = [
            {"name": "Romer Hell's Kitchen", "price_text": "$425", "desc": "Hell's Kitchen"},
            {"name": "Pod Times Square", "price_text": "$389", "desc": "UWS"},
        ]
        self.assertTrue(gateb_close_call.capture_rows_price_only_change(base, cand))
        ok, reason = gateb_close_call.adjudicate_close_call(
            "hotels-390.png",
            0.085,
            base,
            cand,
            "prices changed; rows reordered by cheapest-first sort",
            size_changed=False,
        )
        self.assertTrue(ok)
        self.assertIn("price-only list", reason)

    def test_hotels_extra_row_fails(self) -> None:
        base = [{"name": "Pod Times Square"}]
        cand = [{"name": "Pod Times Square"}, {"name": "New Hotel"}]
        ok, _ = gateb_close_call.adjudicate_close_call(
            "hotels-1280.png",
            0.008,
            base,
            cand,
            "prices changed",
            size_changed=False,
        )
        self.assertFalse(ok)

    def test_merge_close_call_verdict_pass(self) -> None:
        merged = gateb_close_call.merge_close_call_verdict(
            "FAIL",
            (True, "PASS price-amount-only: budget"),
        )
        self.assertEqual(merged["verdict"], "PASS")
        self.assertEqual(merged["close_call"], "price-only")

    def test_apply_compare_override_pr660_budget_messages(self) -> None:
        cases = (
            (0.000457, "The 'Trip total' amount has changed from $69,436 to $131,257."),
            (0.00258, "There are significant changes in the pricing data and 'Add price' buttons throughout the itinerary sections."),
            (0.009022, "The trip budget and individual item prices have changed significantly, resulting in widespread differences across the entire page."),
        )
        for ratio, why in cases:
            override = gateb_close_call.apply_compare_override(
                "budget-390.png", ratio, why, size_changed=False, base_items=[], cand_items=[]
            )
            self.assertIsNotNone(override, why)
            self.assertEqual(override["verdict"], "PASS")
            self.assertEqual(override["close_call"], "price-only")

    def test_apply_compare_override_returns_none_on_layout(self) -> None:
        self.assertIsNone(
            gateb_close_call.apply_compare_override(
                "budget-1280.png",
                0.005,
                "logo chip missing on hotel row",
                size_changed=False,
                base_items=[],
                cand_items=[],
            )
        )


if __name__ == "__main__":
    unittest.main()
