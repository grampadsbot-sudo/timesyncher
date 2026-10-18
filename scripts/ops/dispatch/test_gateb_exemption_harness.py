#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts' / 'ops' / 'dispatch'))

import gateb_exemption  # noqa: E402
import pregate_one  # noqa: E402


PR507_PATHS = (
    'scripts/offline-tests.txt',
    'scripts/ops/dispatch/gateb_exemption.py',
    'scripts/ops/dispatch/pregate_one.py',
    'scripts/ops/dispatch/test_budget_checkout_harness.py',
    'scripts/ops/dispatch/test_gateb_exemption_harness.py',
    'scripts/ops/dispatch/test_pregate_one_harness.py',
    'scripts/ops/dispatch/tsv_dispatch.py',
    'scripts/test_budget_checkout_harness.mjs',
    'scripts/test_pregate_one_harness.mjs',
)


class GatebExemptionHarnessTests(unittest.TestCase):
    def test_pr507_paths_eligible_for_exemption(self) -> None:
        self.assertTrue(gateb_exemption.changed_paths_eligible_for_exemption(PR507_PATHS))

    def test_src_change_disqualifies_exemption(self) -> None:
        paths = (*PR507_PATHS, 'src/vacation/place-search.mjs')
        self.assertFalse(gateb_exemption.changed_paths_eligible_for_exemption(paths))

    def test_data_contract_line_compare_ignores_order(self) -> None:
        base = ['DATA-CONTRACT: ok', 'line b']
        head = ['line b', 'DATA-CONTRACT: ok']
        self.assertTrue(gateb_exemption.data_contract_lines_equal(base, head))

    def test_skipped_backend_only_still_success_for_gateb_status(self) -> None:
        self.assertEqual(pregate_one.gateb_commit_state(pregate_one.SKIPPED_BACKEND_ONLY), 'success')

    def test_exempt_description_matches_guard_c_pattern(self) -> None:
        text = gateb_exemption.gateb_exempt_commit_description('c9035298fc882c5d', 'f32ac76d17e4015')
        self.assertIn('Gate B exempt on c903529', text)
        self.assertIn('base f32ac76', text)


if __name__ == '__main__':
    unittest.main()
