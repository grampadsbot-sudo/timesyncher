"""Base fixture places that duplicate a snapshot row by name are dropped; the priced snapshot row is kept."""
import json
import tempfile
import unittest
from pathlib import Path

from build_head_fixture import build

HERE = Path(__file__).resolve().parent


class DedupeTest(unittest.TestCase):
    def test_name_twin_is_replaced_by_snapshot_row(self):
        base = {
            "trip": {"id": 1},
            "categories": [{"id": 3, "name": "Food"}],
            "places": [
                {"id": 1, "name": "Blue Note", "price": None},
                {"id": 2, "name": "Chelsea Market", "price": None},
            ],
            "thingOverrides": {"place:1": {"title": "Blue Note"}, "place:2": {"title": "Chelsea Market"}},
        }
        snap = {"601": {"title": "blue note", "category": "Food", "price": 40, "lat": 1, "lng": 2}}
        with tempfile.TemporaryDirectory() as tmp:
            paths = {}
            for name, data in (("base", base), ("snap", snap)):
                paths[name] = Path(tmp, name + ".json")
                paths[name].write_text(json.dumps(data))
            out = Path(tmp, "out.json")
            build(str(paths["base"]), str(paths["snap"]), str(out))
            fx = json.loads(out.read_text())
        ids = [p["id"] for p in fx["places"]]
        self.assertEqual(ids, [2, 601])
        self.assertNotIn("place:1", fx["thingOverrides"])
        self.assertIn("place:601", fx["thingOverrides"])
        self.assertIn("place:2", fx["thingOverrides"])


if __name__ == "__main__":
    unittest.main()
