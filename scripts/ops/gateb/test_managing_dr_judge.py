import datetime
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from managing_dr_judge import ManagingDrJudge, atomic_json

class Judge(ManagingDrJudge):
    rubrics = {"hotel": "location, amenities, price, praise and complaints"}

class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.capture = self.root / "capture"
        self.capture.mkdir()
        (self.capture / "capture-regions.json").write_text('{"hotels-390.png": {"items": []}}')
        self.j = Judge(cache_path=self.root / "receipts")
        self.j.bind_capture(self.capture)
        self.args = ("hotel", "Motto", "$188", "Specific hotel description")

    def receipt(self, **updates):
        req = self.j.request(*self.args)
        rec = dict(req, reviewer="gpt", reviewed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   reason="Specific amenities and price; tradeoffs match the reviews", verdict={"score":4,"missing":[],"generic":False})
        rec.update(updates)
        atomic_json(self.j.root / "verdicts" / (req["key"] + ".json"), rec)
        return req

    def test_missing_exports_full_request_without_model_or_usage_call(self):
        with patch("subprocess.run", side_effect=AssertionError("must not call a model or usage checker")):
            self.assertIsNone(self.j.judge(*self.args))
        files = list((self.j.root / "pending").glob("*.json"))
        self.assertEqual(len(files), 1)
        self.assertEqual(json.loads(files[0].read_text())["input"]["rubric"], Judge.rubrics["hotel"])

    def test_valid_manager_pass_and_fail_keep_original_scores(self):
        self.receipt()
        self.assertEqual(self.j.judge(*self.args)["score"], 4)
        self.receipt(verdict={"score":2,"missing":["price"],"generic":True})
        self.assertEqual(self.j.judge(*self.args)["score"], 2)

    def test_stale_capture_or_changed_rubric_name_price_reviews_ask_never_reuses_pass(self):
        self.receipt()
        for args, kw in [(self.args, {"rubric":"new rubric"}), (self.args, {"reviews":["poor service"]}),
                         (self.args, {"ask":"review sample"}), (("hotel","Other","$188",self.args[3]), {}),
                         (("hotel","Motto","$999",self.args[3]), {})]:
            self.assertIsNone(self.j.judge(*args, **kw))
        (self.capture / "capture-regions.json").write_text('{"changed": true}')
        self.j.bind_capture(self.capture)
        self.assertIsNone(self.j.judge(*self.args))

    def test_missing_provenance_and_malformed_verdicts_fail_closed(self):
        for updates in [{"reviewer":"coder"}, {"reason":""}, {"reviewed_at":"bad"},
                        {"verdict":{"score":True,"missing":[],"generic":False}},
                        {"verdict":{"score":6,"missing":[],"generic":False}},
                        {"verdict":{"score":4,"missing":[],"generic":"false"}}, {"input":{}}]:
            self.receipt(**updates)
            self.assertIsNone(self.j.judge(*self.args))

    def test_offline_does_not_queue_and_legacy_cache_cannot_pass(self):
        legacy = self.root / "old-cache.json"
        legacy.write_text('{"some-key":{"score":5,"generic":false,"missing":[]}}')
        j = Judge(cache_path=legacy, offline=True)
        self.assertIsNone(j.judge(*self.args))
        self.assertFalse((self.j.root / "pending").exists())

    def test_gate_missing_judgment_is_harness_no_verdict(self):
        from runtime_checker import load_checker
        rc = load_checker()
        from managing_dr_judge import ManagingDrJudgmentPending
        def check(*args):
            self.j.judge(*self.args)
            return ["description quality not judged this run"]
        with patch.object(rc, "check_screen", return_value={"ok":True,"reasons":[]}), patch.object(rc, "structure_check", side_effect=check):
            with self.assertRaises(ManagingDrJudgmentPending):
                rc.check_dir({"mode":"structure"}, str(self.capture), str(self.capture), str(self.root), files=["hotels-390.png"], judge=self.j)

if __name__ == "__main__":
    unittest.main()
