import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hold_after_guards as g

NOW = 1_700_000_000.0
OLD = "2026-10-23T10:00:00Z"


class GH:
    def __init__(self, items=None, events=None, fail_refs=None):
        self.items = {i["number"]: i for i in (items or [])}
        self.events = events or {}
        self.fail_refs = set(fail_refs or [])
        self.calls = []

    def pages(self, path):
        if "/events" in path:
            return self.events.get(int(path.split("/")[-2]), [])
        return []

    def req(self, method, path, data=None, timeout=None, **kw):
        self.calls.append((method, path))
        if method != "GET":
            return {}
        ref = int(path.rsplit("/", 1)[-1])
        if ref in self.fail_refs:
            raise OSError("synthetic lookup failure")
        return self.items.get(ref, {"state": "closed", "body": ""})


def vk_item(n, body="", labels=(), state="open", updated_at=OLD):
    labs = ["project:tsv"] + list(labels)
    return dict(
        number=n,
        body=body,
        labels=[{"name": x} for x in labs],
        state=state,
        updated_at=updated_at,
        created_at=updated_at,
    )


def load_idle_helpers():
    fixture = os.path.join(os.path.dirname(__file__), "fixtures", "idle_capacity_host_685.py")
    import importlib.util
    import types

    sys.modules.setdefault(
        "tsv_common",
        types.SimpleNamespace(D="/tmp/tsv-dispatch-test", REPO="grampadsbot-sudo/timesyncher"),
    )
    sys.modules.setdefault(
        "dr_scorecard",
        types.SimpleNamespace(read_page=lambda *a, **k: "", record_miss=lambda *a, **k: None),
    )
    spec = importlib.util.spec_from_file_location("idle_capacity_host_685", fixture)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class HoldAfterLabel(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ic = load_idle_helpers()

    def _removals(self, gh, item, latest="", open_map=None):
        return g.extra_hold_removals(
            gh,
            item,
            latest,
            NOW,
            dry=True,
            open_map=open_map,
            hold_label_names=self.ic._hold_label_names,
            label_since=self.ic._label_since,
            hold_renewed=self.ic._hold_renewed,
            hold_text=self.ic.hold_text,
            references=self.ic.references,
            rescope_refs=self.ic.rescope_refs,
            dr_post=self.ic.dr_post,
            running=self.ic.running,
            stamp=self.ic.stamp,
            utc=self.ic.utc,
            repo=self.ic.REPO,
            hold_max_s=self.ic.HOLD_MAX_S,
        )

    def test_label_only_open_blocker_keeps_hold(self):
        gh = GH(
            [
                vk_item(653, "", ["hold:after-680"]),
                dict(number=680, state="open", labels=[], body=""),
            ]
        )
        self.assertEqual(self._removals(gh, gh.items[653]), [])

    def test_label_only_closed_blocker_removes_with_issue_number(self):
        gh = GH(
            [
                vk_item(653, "", ["hold:after-680"]),
                dict(number=680, state="closed", labels=[], body=""),
            ]
        )
        out = self._removals(gh, gh.items[653])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0][0], "hold:after-680")
        self.assertEqual(out[0][1], "blocker #680 closed or merged")

    def test_open_label_blocker_skips_two_hour_expiry(self):
        gh = GH(
            [
                vk_item(653, "Blocked by #680", ["hold:after-680"]),
                dict(number=680, state="open", labels=[], body=""),
            ],
            events={
                653: [
                    {
                        "event": "labeled",
                        "label": {"name": "hold:after-680"},
                        "created_at": OLD,
                    }
                ]
            },
        )
        self.assertEqual(self._removals(gh, gh.items[653]), [])

    def test_lookup_failure_preserves_hold(self):
        gh = GH([vk_item(653, "Blocked by #680", ["hold:after-680"])], fail_refs={680})
        self.assertEqual(self._removals(gh, gh.items[653]), [])

    def test_missing_open_map_entry_preserves_hold(self):
        gh = GH([vk_item(653, "", ["hold:after-680"])])
        self.assertEqual(self._removals(gh, gh.items[653], open_map={}), [])

    def test_parse_hold_after_issue(self):
        self.assertEqual(g.parse_hold_after_issue("hold:after-680", 653), 680)
        self.assertIsNone(g.parse_hold_after_issue("hold:after-653", 653))
        self.assertIsNone(g.parse_hold_after_issue("hold:dr-diagnosis", 653))


if __name__ == "__main__":
    unittest.main()
