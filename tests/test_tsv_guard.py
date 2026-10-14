#!/usr/bin/env python3
"""Regression tests for historical DATA_FAULT latch + verified resolution (#398)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts' / 'ops' / 'dispatch'))

import tsv_dispatch  # noqa: E402
import tsv_guard  # noqa: E402


class HarnessFaultResolutionTests(unittest.TestCase):
    def test_current_repo_fixture_integrity_passes(self) -> None:
        integrity = tsv_dispatch.verify_vk_fixture_integrity(ROOT)
        self.assertTrue(integrity.ok, integrity.contract_errors)
        self.assertTrue(integrity.repo_head_sha)
        self.assertTrue(integrity.snapshot_sha256)
        self.assertTrue(integrity.binding_sha256)

    def test_historical_data_fault_released_by_bound_resolution(self) -> None:
        integrity = tsv_dispatch.verify_vk_fixture_integrity(ROOT)
        self.assertTrue(integrity.ok)
        verdicts = [
            tsv_guard.GateVerdict(
                pr=336,
                head_sha='9cb20e3',
                verdict=tsv_guard.DATA_FAULT_VERDICT,
                reason='DATA-CONTRACT: required VK data snapshot missing for captured fixture',
                at='2026-10-13T23:31:00Z',
            )
        ]
        resolutions = [
            tsv_guard.DataFaultResolution(
                pr=336,
                repo_head_sha=integrity.repo_head_sha,
                snapshot_sha256=integrity.snapshot_sha256,
                binding_sha256=integrity.binding_sha256,
                recorded_at='2026-10-14T12:00:00+00:00',
            )
        ]
        self.assertFalse(tsv_guard.harness_fault_pending(336, verdicts, resolutions, integrity))
        self.assertIsNone(
            tsv_guard.blocked_reason(
                336,
                fixit=True,
                verdicts=verdicts,
                resolutions=resolutions,
                integrity=integrity,
            )
        )

    def test_stale_resolution_does_not_clear_pause(self) -> None:
        integrity = tsv_dispatch.verify_vk_fixture_integrity(ROOT)
        self.assertTrue(integrity.ok)
        verdicts = [
            tsv_guard.GateVerdict(
                pr=336,
                head_sha='9cb20e3',
                verdict=tsv_guard.DATA_FAULT_VERDICT,
                reason='missing snapshot',
                at='2026-10-13T23:31:00Z',
            )
        ]
        resolutions = [
            tsv_guard.DataFaultResolution(
                pr=336,
                repo_head_sha='deadbeef',
                snapshot_sha256=integrity.snapshot_sha256,
                binding_sha256=integrity.binding_sha256,
                recorded_at='2026-10-14T12:00:00+00:00',
            )
        ]
        self.assertTrue(tsv_guard.harness_fault_pending(336, verdicts, resolutions, integrity))
        reason = tsv_guard.blocked_reason(
            336,
            fixit=True,
            verdicts=verdicts,
            resolutions=resolutions,
            integrity=integrity,
        )
        self.assertIn('harness/data fault', reason or '')

    def test_invalid_integrity_blocks_resolution_record(self) -> None:
        bad = tsv_dispatch.VkFixtureIntegrity(
            ok=False,
            repo_head_sha='abc',
            snapshot_sha256='snap',
            binding_sha256='bind',
            contract_errors=('DATA-CONTRACT: row 602 price mismatch',),
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'resolutions.jsonl'
            with self.assertRaises(ValueError):
                tsv_guard.append_data_fault_resolution(path, pr=336, integrity=bad)

    def test_record_verified_resolution_appends_jsonl(self) -> None:
        integrity = tsv_dispatch.verify_vk_fixture_integrity(ROOT)
        self.assertTrue(integrity.ok)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'resolutions.jsonl'
            row = tsv_guard.record_verified_data_fault_resolution(
                336,
                path,
                repo_root=ROOT,
                note='issue-398 regression',
            )
            lines = path.read_text(encoding='utf-8').strip().splitlines()
            self.assertEqual(len(lines), 1)
            payload = json.loads(lines[0])
            self.assertEqual(payload['kind'], 'data_fault_resolution')
            self.assertEqual(payload['pr'], 336)
            self.assertEqual(row.binding_sha256, integrity.binding_sha256)


if __name__ == '__main__':
    unittest.main()
