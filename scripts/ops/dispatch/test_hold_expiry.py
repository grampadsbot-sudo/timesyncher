import unittest

from test_idle_capacity import c as ic

NOW = ic.stamp("2026-10-18T20:00:00Z")
OLD = "2026-10-18T18:00:00Z"
RECENT = "2026-10-18T19:50:00Z"


class GH:
    def __init__(self, items=None, comments=None, events=None, checks=None):
        self.items = {i["number"]: i for i in (items or [])}
        self.comments = comments or {}
        self.events = events or {}
        self.checks = checks or {}
        self.writes = []

    def pages(self, path, key=None):
        if "/comments" in path:
            return self.comments.get(int(path.split("/")[-2]), [])
        if "/events" in path:
            return self.events.get(int(path.split("/")[-2]), [])
        if "labels=project:tsv" in path:
            return [i for i in self.items.values() if i.get("state") == "open"]
        if "/pulls" in path:
            return [i for i in self.items.values() if i.get("pull_request")]
        return list(self.items.values())

    def req(self, method, path, data=None, timeout=None, **kw):
        if method != "GET":
            self.writes.append((method, path, data))
            return {}
        if "/check-runs" in path:
            sha = path.split("/commits/")[1].split("/")[0]
            return {"check_runs": self.checks.get(sha, [])}
        return self.items[int(path.rsplit("/", 1)[-1])]



def vk_item(n, body="", labels=(), state="open"):
    labs = ["project:tsv", "executor:cursor", "status:ready"] + list(labels)
    return dict(number=n, body=body, labels=[{"name": x} for x in labs], state=state, updated_at=OLD, created_at=OLD)



class HoldExpiry(unittest.TestCase):
    def test_closed_blocker_clears(self):
        gh = GH([vk_item(469, "blocked-by #470", ["hold:test"]), dict(number=470, state="closed", labels=[], body="")])
        out = ic.extra_hold_removals(gh, gh.items[469], "", NOW)
        self.assertEqual(out[0][1], "blocker closed or merged")

    def test_no_blocker_clears(self):
        gh = GH([vk_item(469, "hold without blocker", ["hold:test"])])
        out = ic.extra_hold_removals(gh, gh.items[469], "", NOW)
        self.assertEqual(out[0][1], "no named open blocker")

    def test_old_hold_without_renewal_clears(self):
        gh = GH([vk_item(469, "blocked-by #470", ["hold:test"]), dict(number=470, state="open", labels=[], body="")],
                events={469: [{"event": "labeled", "label": {"name": "hold:test"}, "created_at": OLD}]})
        out = ic.extra_hold_removals(gh, gh.items[469], "", NOW)
        self.assertTrue(any("2h" in r for _, r in out))

    def test_renewed_hold_stays(self):
        gh = GH([vk_item(469, "blocked-by #470", ["hold:test"]), dict(number=470, state="open", labels=[], body="")],
                events={469: [{"event": "labeled", "label": {"name": "hold:test"}, "created_at": OLD}]},
                comments={469: [{"body": "dr eggbot\nblocked-by #470", "created_at": RECENT, "user": {"login": "grokbot"}}]})
        self.assertEqual(ic.extra_hold_removals(gh, gh.items[469], "", NOW), [])

    def test_young_open_blocker_stays(self):
        gh = GH([vk_item(469, "blocked-by #470", ["hold:test"]), dict(number=470, state="open", labels=[], body="")],
                events={469: [{"event": "labeled", "label": {"name": "hold:test"}, "created_at": RECENT}]})
        self.assertEqual(ic.extra_hold_removals(gh, gh.items[469], "", NOW), [])

