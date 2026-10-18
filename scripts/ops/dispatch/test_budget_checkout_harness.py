#!/usr/bin/env python3

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts' / 'ops' / 'dispatch'))

import tsv_dispatch  # noqa: E402

PR493_HEAD = '7ac7f00cf37a8ffb7b070e023fb217fb004a0c79'
MINIMAL_SHARED = {
    'trip': {'id': 1, 'title': 'NYC', 'start_date': '2026-06-01', 'end_date': '2026-06-05', 'currency': 'usd'},
    'days': [],
    'places': [],
    'assignments': {},
    'thingOverrides': {},
    'permissions': {'share_budget': True},
    'budget': [],
}


class BudgetCheckoutHarnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.head = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()

    def test_budget_archive_paths_include_apps_lib_for_pr493_head(self) -> None:
        paths = tsv_dispatch.budget_archive_paths(ROOT, PR493_HEAD)
        self.assertIn('apps/vacation-client/src/lib', paths)

    def test_src_only_archive_fails_for_pr493_head(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / 'checkout'
            dest.mkdir()
            tsv_dispatch._git_archive_extract(ROOT, PR493_HEAD, 'src', dest)
            tsv_dispatch.materialize_budget_driver(ROOT, PR493_HEAD, dest)
            tsv_dispatch.link_node_modules(ROOT, dest)
            with self.assertRaises(tsv_dispatch.HeadBudgetBuildError) as ctx:
                tsv_dispatch.fill_budget(dest, MINIMAL_SHARED)
            self.assertTrue(ctx.exception.missing_module)
            self.assertIn('budgetModel', ctx.exception.missing_module)

    def test_archive_checkout_driver_exits_zero_at_repo_head(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / 'checkout'
            tsv_dispatch.budget_checkout(ROOT, self.head, dest, node_modules_from=ROOT)
            budget = tsv_dispatch.fill_budget(dest, MINIMAL_SHARED)
            self.assertIsInstance(budget, list)

    def test_head_capture_fixture_does_not_swallow_budget_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pr_checkout = Path(tmp) / 'pr'
            pr_checkout.mkdir()
            (pr_checkout / 'fixture-nyc' / 'checkouts').mkdir(parents=True)
            tsv_dispatch.link_node_modules(ROOT, pr_checkout)
            logs: list[str] = []

            checkout_dir = pr_checkout / 'fixture-nyc' / 'checkouts' / 'abc12345'
            checkout_dir.mkdir(parents=True)

            def fake_fill_budget(_checkout: Path, _shared: dict, **kwargs) -> list:
                raise tsv_dispatch.HeadBudgetBuildError(
                    'gateb_head_budget_lines exit 1; missing module apps/vacation-client/src/lib/budgetModel.mjs',
                    missing_module='apps/vacation-client/src/lib/budgetModel.mjs',
                    returncode=1,
                )

            with patch.object(tsv_dispatch, 'budget_checkout', return_value=checkout_dir):
                with patch.object(tsv_dispatch, 'fill_budget', side_effect=fake_fill_budget):
                    with self.assertRaises(tsv_dispatch.HeadBudgetBuildError) as ctx:
                        tsv_dispatch.head_capture_fixture(
                            MINIMAL_SHARED,
                            head_sha='abc12345',
                            repo_root=ROOT,
                            pr_checkout=pr_checkout,
                            log=logs.append,
                        )
            self.assertTrue(logs)
            self.assertIn('ERR_MODULE_NOT_FOUND', logs[0])
            self.assertIn('budgetModel', logs[0])
            self.assertIn('HARNESS_BUDGET_BUILD', logs[0])
            self.assertNotIn('DATA_FAULT', logs[0])
            self.assertIn('budgetModel', ctx.exception.missing_module or '')

    def test_budget_build_pregate_detail_names_missing_module(self) -> None:
        exc = tsv_dispatch.HeadBudgetBuildError(
            'failed',
            missing_module='apps/vacation-client/src/lib/budgetModel.mjs',
        )
        detail = tsv_dispatch.budget_build_pregate_detail(exc)
        self.assertIn(tsv_dispatch.HARNESS_BUDGET_BUILD, detail)
        self.assertIn('budgetModel.mjs', detail)


if __name__ == '__main__':
    unittest.main()
