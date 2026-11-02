#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts' / 'ops' / 'dispatch'))

import postdeploy_screens  # noqa: E402


def _fake_region(allow, fname, reference, cand_dir, workdir):
    del allow, reference, cand_dir, workdir
    if fname == 'events-390.png':
        return {'ok': True, 'outside_px': 305, 'band': 'PASS'}
    if fname == 'events-390-top.png':
        return {'ok': True, 'outside_px': 127, 'band': 'PASS'}
    return {'ok': False, 'outside_px': 1, 'band': 'FAIL'}


class PostdeployAllowance778Tests(unittest.TestCase):
    def test_inside_allowed_regions_does_not_regress(self) -> None:
        compare = {'overall': 'NEEDS_JUDGMENT', 'out': '/tmp/gateb-run'}
        rows = {
            'events-390.png': {'verdict': 'NEEDS_JUDGMENT', 'pct': 1.2},
            'events-390-top.png': {'verdict': 'NEEDS_JUDGMENT', 'pct': 0.4},
        }
        ctx = {'pr_number': 776, 'issue': 613, 'allow': {'mode': 'regions', 'regions': {'rows': ['events-*']}}}
        self.assertTrue(
            postdeploy_screens.screens_match(
                compare,
                '/tmp/pre',
                '/tmp/post',
                '/tmp/work',
                accept_ctx=ctx,
                rows=rows,
                region_check=_fake_region,
            )
        )
        self.assertFalse(
            postdeploy_screens.postdeploy_regressed(
                compare,
                '/tmp/pre',
                '/tmp/post',
                '/tmp/work',
                accept_ctx=ctx,
                rows=rows,
                region_check=_fake_region,
            )
        )

    def test_outside_allowed_region_still_regresses(self) -> None:
        compare = {'overall': 'NEEDS_JUDGMENT', 'out': '/tmp/gateb-run'}
        rows = {
            'events-390.png': {'verdict': 'NEEDS_JUDGMENT', 'pct': 1.2},
            'hotels-390.png': {'verdict': 'FAIL', 'pct': 0.1},
        }
        ctx = {'pr_number': 776, 'issue': 613, 'allow': {'mode': 'regions', 'regions': {'rows': ['events-*']}}}
        self.assertFalse(
            postdeploy_screens.screens_match(
                compare,
                '/tmp/pre',
                '/tmp/post',
                '/tmp/work',
                accept_ctx=ctx,
                rows=rows,
                region_check=_fake_region,
            )
        )
        self.assertTrue(
            postdeploy_screens.postdeploy_regressed(
                compare,
                '/tmp/pre',
                '/tmp/post',
                '/tmp/work',
                accept_ctx=ctx,
                rows=rows,
                region_check=_fake_region,
            )
        )

    def test_no_accept_context_uses_overall_only(self) -> None:
        compare_fail = {'overall': 'NEEDS_JUDGMENT'}
        compare_pass = {'overall': 'PASS'}
        rows = {'events-390.png': {'verdict': 'NEEDS_JUDGMENT', 'pct': 1.0}}
        self.assertFalse(postdeploy_screens.screens_match(compare_fail, '/tmp/pre', '/tmp/post', '/tmp/work'))
        self.assertTrue(postdeploy_screens.screens_match(compare_pass, '/tmp/pre', '/tmp/post', '/tmp/work'))
        self.assertTrue(postdeploy_screens.postdeploy_regressed(compare_fail, '/tmp/pre', '/tmp/post', '/tmp/work'))
        self.assertFalse(postdeploy_screens.postdeploy_regressed(compare_pass, '/tmp/pre', '/tmp/post', '/tmp/work'))
        self.assertFalse(
            postdeploy_screens.screens_match(
                compare_fail,
                '/tmp/pre',
                '/tmp/post',
                '/tmp/work',
                rows=rows,
                region_check=_fake_region,
            )
        )


if __name__ == '__main__':
    unittest.main()
