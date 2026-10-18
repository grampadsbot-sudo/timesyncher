#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts' / 'ops' / 'dispatch'))

import pregate_one  # noqa: E402


class PregateOneHarnessTests(unittest.TestCase):
    def test_compare_result_out_missing_key(self) -> None:
        self.assertEqual(pregate_one.compare_result_out({'ok': True, 'screens': 0}), {})
        self.assertEqual(pregate_one.compare_result_out(None), {})

    def test_compare_log_fields_without_out_does_not_crash(self) -> None:
        fields = pregate_one.compare_log_fields({'screens': 0, 'verdict': pregate_one.SKIPPED_BACKEND_ONLY})
        self.assertEqual(fields['screens'], 0)
        self.assertEqual(fields['verdict'], pregate_one.SKIPPED_BACKEND_ONLY)

    def test_log_compare_result_without_out(self) -> None:
        lines: list[str] = []
        pregate_one.log_compare_result({'screens': 0}, lines.append)
        self.assertEqual(len(lines), 1)
        self.assertIn('screens=0', lines[0])

    def test_skipped_backend_only_sets_gateb_success(self) -> None:
        self.assertEqual(pregate_one.gateb_commit_state(pregate_one.SKIPPED_BACKEND_ONLY), 'success')

    def test_finalize_applies_success_for_backend_skip(self) -> None:
        set_status = MagicMock()
        state = pregate_one.pregate_one_finalize_verdict(
            pregate_one.SKIPPED_BACKEND_ONLY,
            {'screens': 0},
            log=lambda _msg: None,
            set_status=set_status,
            description='backend-only',
        )
        self.assertEqual(state, 'success')
        set_status.assert_called_once()
        self.assertEqual(set_status.call_args.kwargs['state'], 'success')


if __name__ == '__main__':
    unittest.main()
