#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts' / 'ops' / 'dispatch'))
sys.path.insert(0, str(ROOT / 'scripts' / 'ops' / 'gateb'))

import rowfix_brief  # noqa: E402
import vk_live_row_check  # noqa: E402
from ui_paths import pr_touches_app_ui  # noqa: E402

PR569_PATHS = (
    'scripts/ops/dispatch/host_handback_entrypoint.py',
    'scripts/ops/dispatch/tsv_stall_alarm.py',
    'scripts/ops/dispatch/test_host_handback_alarm.py',
)

ISSUE567_BODY = (
    'Source scripts/ops/dispatch; no UI/checker/fixtures/deploy/CI/dependency/secret changes.'
)


class VkLiveRowCheckTests(unittest.TestCase):
    def test_pr569_paths_are_ops_only(self) -> None:
        self.assertEqual(pr_touches_app_ui(PR569_PATHS), [])
        verdict = vk_live_row_check.host_row_check_verdict(PR569_PATHS)
        self.assertEqual(verdict['verdict'], vk_live_row_check.ROW_CHECK_NA)

    def test_app_pr_runs_row_check(self) -> None:
        paths = (*PR569_PATHS, 'apps/vacation-client/src/components/ListRow.tsx')
        self.assertTrue(pr_touches_app_ui(paths))
        verdict = vk_live_row_check.host_row_check_verdict(
            paths,
            head_row_failures=['Apple Fifth Avenue: missing visible name line (fail closed)'],
            base_known_row_failures=['Apple Fifth Avenue: missing visible name line (fail closed)'],
        )
        self.assertEqual(verdict['verdict'], vk_live_row_check.ROW_CHECK_PASS)

    def test_new_row_failure_fails_app_pr(self) -> None:
        paths = ('apps/vacation-client/src/styles.css',)
        verdict = vk_live_row_check.host_row_check_verdict(
            paths,
            head_row_failures=['Blue Note: missing visible name line (fail closed)'],
            base_known_row_failures=[],
        )
        self.assertEqual(verdict['verdict'], vk_live_row_check.ROW_CHECK_FAIL)
        self.assertEqual(len(verdict['actionable_failures']), 1)

    def test_rowfix_brief_strips_app_edits_on_ops_pr(self) -> None:
        brief = '\n'.join([
            'Fix row logos on events tab.',
            'Edit apps/vacation-client/src/components/ListRow.tsx and wrap names in <strong>.',
            'Touch src/vacation/trek-live-product-patches.mjs for translateY(-2px).',
        ])
        out = rowfix_brief.filter_rowfix_brief(brief, PR569_PATHS, ISSUE567_BODY)
        self.assertIn('N/A', out)
        self.assertNotIn('ListRow.tsx', out)
        self.assertNotIn('translateY', out)

    def test_rowfix_brief_keeps_app_guidance_on_app_pr(self) -> None:
        brief = 'Adjust apps/vacation-client/src/styles.css for row layout.'
        paths = ('apps/vacation-client/src/styles.css',)
        out = rowfix_brief.filter_rowfix_brief(brief, paths, 'Fix list row layout on migrate/trek-source.')
        self.assertEqual(out, brief)

    def test_lane_autofill_row_check_record_alias(self) -> None:
        rec = vk_live_row_check.lane_autofill_row_check_record(PR569_PATHS)
        self.assertEqual(rec['verdict'], vk_live_row_check.ROW_CHECK_NA)


if __name__ == '__main__':
    unittest.main()
