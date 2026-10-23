import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dispatch_stall_guards as g


class CarriedExpiry(unittest.TestCase):
    def test_expired_hold_dropped_and_issue_dispatchable(self):
        now = 1_000_000.0
        carried = {
            "items": [
                {"n": 608, "hold_until": now - 60},
                {"n": 609, "hold_until": now + 3600},
            ]
        }
        logs = g.prune_expired_carried(carried, now)
        self.assertEqual(len(logs), 1)
        self.assertFalse(g.carried_blocks_issue(carried, 608, now))
        self.assertTrue(g.carried_blocks_issue(carried, 609, now))
        self.assertEqual([x["n"] for x in carried["items"]], [609])

    def test_unexpired_hold_still_blocks(self):
        now = 2_000_000.0
        carried = {"608": {"hold_until": now + 120}}
        self.assertTrue(g.carried_blocks_issue(carried, 608, now))
        self.assertEqual(g.prune_expired_carried(carried, now), [])

    def test_entry_without_hold_until_still_blocks(self):
        now = 3_000_000.0
        carried = {"items": [{"n": 608, "note": "manager follow-up"}]}
        self.assertTrue(g.carried_blocks_issue(carried, 608, now))


class LocalLaneFolders(unittest.TestCase):
    def test_dead_or_missing_pid_not_owned(self):
        root = tempfile.mkdtemp()
        dead = os.path.join(root, "vkfill-608-202610221004")
        live = os.path.join(root, "vkfill-609-202610221005")
        os.mkdir(dead)
        os.mkdir(live)
        open(os.path.join(dead, "pid"), "w", encoding="utf-8").write("999991\n")
        open(os.path.join(live, "pid"), "w", encoding="utf-8").write("999992\n")

        def pid_alive(pid):
            return pid == 999992

        owned, stale = g.local_lane_owned_issues(root, pid_alive=pid_alive)
        self.assertEqual(owned, {609})
        self.assertTrue(any("608" in line and "dead_pid" in line for line in stale))
        self.assertFalse(g.local_lane_owns_issue(root, 608, pid_alive=pid_alive))
        self.assertTrue(g.local_lane_owns_issue(root, 609, pid_alive=pid_alive))

    def test_missing_pid_folder_ignored(self):
        root = tempfile.mkdtemp()
        os.mkdir(os.path.join(root, "vkfill-608-stale"))
        owned, stale = g.local_lane_owned_issues(root)
        self.assertEqual(owned, set())
        self.assertTrue(any("missing_pid" in line for line in stale))


if __name__ == "__main__":
    unittest.main()
