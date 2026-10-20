import argparse
import ast
import copy
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from same_selection_capture_lib import (
    assert_hotel_stay_parity,
    fixture_selected_keys,
    hotel_stay_row_errors,
    minimal_trip_hotel_unchecked,
    node_prepare,
    place_title,
    require_selected_titles,
    required_hotel_stay_row_titles,
    selection_namespace_keys,
    trip_without_timeline_materialized,
)

ROOT = HERE.parents[2]
CAPTURE = ROOT / 'scripts/ops/capture'


def load_staging_capture_module(tmp_dispatch):
    source = ast.parse((HERE / 'tsv_rereview.py').read_text())
    functions = [
        n
        for n in source.body
        if isinstance(n, ast.FunctionDef) and n.name in ('staging_capture', '_staging_has_inventory')
    ]
    namespace = {
        'os': os,
        'json': json,
        're': re,
        'D': tmp_dispatch,
        'REPO': 'grampadsbot-sudo/timesyncher',
        'subprocess': subprocess,
        'CAPTURE_STAGING': os.path.join(tmp_dispatch, 'capture-staging.sh'),
        'HOME': os.environ.get('HOME', '/tmp'),
    }
    exec(compile(ast.Module(body=functions, type_ignores=[]), 'tsv_rereview.py', 'exec'), namespace)
    return namespace['staging_capture']


def minimal_regions():
    return {
        'daybyday-1280.png': {'ok': True, 'struct': {'timeline': [{'title': 'x'}]}},
        'daybyday-390.png': {'ok': True, 'struct': {'timeline': [{'title': 'x'}]}},
    }


class DryContext:
    dry = True

    def api(self, method, route):
        assert method == 'GET'
        return {'object': {'sha': '2b6d8dfdeadbeefdeadbeefdeadbeefdeadbeef'}}


class HotelStayRowOracleTests(unittest.TestCase):
    def test_all_four_rows_required_when_checked(self):
        hotel = 'Hotel Beacon'
        rows = required_hotel_stay_row_titles(hotel)
        self.assertEqual(len(rows), 4)
        assert_hotel_stay_parity(rows, rows, hotel, True)

    def test_each_missing_row_fails_candidate_and_reference(self):
        hotel = 'Hotel Beacon'
        full = required_hotel_stay_row_titles(hotel)
        for omit in full:
            partial = [r for r in full if r != omit]
            with self.assertRaises(AssertionError) as ctx:
                assert_hotel_stay_parity(partial, full, hotel, True)
            self.assertIn('candidate: missing stay row: %s' % omit, str(ctx.exception))
            with self.assertRaises(AssertionError) as ctx:
                assert_hotel_stay_parity(full, partial, hotel, True)
            self.assertIn('reference: missing stay row: %s' % omit, str(ctx.exception))

    def test_unchecked_hotel_omits_all_stay_rows_both_sides(self):
        hotel = 'Hotel Beacon'
        clean = ['Morning Flight', 'Dinner Spot']
        assert_hotel_stay_parity(clean, clean, hotel, False)
        for row in required_hotel_stay_row_titles(hotel):
            with self.assertRaises(AssertionError):
                assert_hotel_stay_parity(clean + [row], clean, hotel, False)
            with self.assertRaises(AssertionError):
                assert_hotel_stay_parity(clean, clean + [row], hotel, False)

    def test_hotel_stay_row_errors_independent(self):
        hotel = 'Hotel Beacon'
        missing = hotel_stay_row_errors([], hotel, True)
        self.assertEqual(len(missing), 4)
        for row in required_hotel_stay_row_titles(hotel):
            self.assertIn('missing stay row: %s' % row, missing)
        self.assertEqual(hotel_stay_row_errors(required_hotel_stay_row_titles(hotel), hotel, True), [])


class ProducerAndCacheTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.trip = minimal_trip_hotel_unchecked()
        cls.fixture_bytes = json.dumps(cls.trip).encode()
        cls.fixture_sha = hashlib.sha256(cls.fixture_bytes).hexdigest()
        cls.replay = node_prepare(cls.fixture_bytes, CAPTURE)

    def test_selection_namespace_is_place_per_thing(self):
        self.assertEqual(selection_namespace_keys(self.trip), ['place:1', 'place:9', 'place:25'])
        self.assertEqual(fixture_selected_keys(self.trip), ['place:1', 'place:9'])

    def test_producer_explicit_timeline_on_minimal_trip(self):
        served = json.loads(self.replay['payload'])
        binding = self.replay['timelineReplay']
        self.assertEqual(binding['policy'], 'timeline-explicit-v1')
        self.assertEqual(binding['source_fixture_sha256'], self.fixture_sha)
        self.assertEqual(binding['selected_place_keys'], fixture_selected_keys(self.trip))
        self.assertFalse(served['thingOverrides']['place:25']['timeline'])
        self.assertNotIn('place:25', binding['selected_place_keys'])
        self.assertEqual(trip_without_timeline_materialized(served, self.trip), self.trip)
        invalid = copy.deepcopy(self.trip)
        invalid['thingOverrides']['place:25']['timeline'] = 'yes'
        with self.assertRaises(subprocess.CalledProcessError):
            node_prepare(json.dumps(invalid).encode(), CAPTURE)

    def test_checked_hotel_payload_and_stay_row_oracle(self):
        checked = copy.deepcopy(self.trip)
        checked['thingOverrides']['place:25']['timeline'] = True
        replay = node_prepare(json.dumps(checked).encode(), CAPTURE)
        self.assertIn('place:25', replay['timelineReplay']['selected_place_keys'])
        served = json.loads(replay['payload'])
        self.assertTrue(served['thingOverrides']['place:25']['timeline'])
        self.assertEqual(served['assignments'], self.trip['assignments'])
        self.assertEqual(served['places'], self.trip['places'])
        hotel_name = 'Hotel Beacon'
        synthetic_timeline = required_hotel_stay_row_titles(hotel_name) + [
            place_title(checked, 1),
            place_title(checked, 9),
        ]
        assert_hotel_stay_parity(synthetic_timeline, synthetic_timeline, hotel_name, True)
        for row in required_hotel_stay_row_titles(hotel_name):
            broken = [t for t in synthetic_timeline if row not in t]
            with self.assertRaises(AssertionError):
                assert_hotel_stay_parity(broken, synthetic_timeline, hotel_name, True)

    def test_saved_artifact_cli_checked_unchecked_and_missing_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture = root / 'fixture.json'
            candidate = root / 'candidate.json'
            reference = root / 'reference.json'
            args = ['--fixture', str(fixture), '--candidate-regions', str(candidate), '--reference-regions', str(reference)]
            for checked in (False, True):
                trip = copy.deepcopy(self.trip)
                trip['thingOverrides']['place:25']['timeline'] = checked
                fixture.write_text(json.dumps(trip))
                titles = ['Morning Flight', 'Dinner Spot']
                if checked:
                    titles += required_hotel_stay_row_titles('Hotel Beacon')
                regions = {f'daybyday-{width}.png': {'struct': {'timeline': [{'title': title} for title in titles]}} for width in (1280, 390)}
                candidate.write_text(json.dumps(regions))
                reference.write_text(json.dumps(regions))
                cmd_replay_saved_artifacts(args)
                broken = copy.deepcopy(regions)
                for screen in broken.values():
                    screen['struct']['timeline'] = [r for r in screen['struct']['timeline'] if r['title'] != 'Morning Flight']
                candidate.write_text(json.dumps(broken))
                reference.write_text(json.dumps(broken))
                with self.assertRaises(AssertionError):
                    cmd_replay_saved_artifacts(args)
                if checked:
                    for omitted in required_hotel_stay_row_titles('Hotel Beacon'):
                        broken = copy.deepcopy(regions)
                        for screen in broken.values():
                            screen['struct']['timeline'] = [r for r in screen['struct']['timeline'] if r['title'] != omitted]
                        candidate.write_text(json.dumps(broken))
                        reference.write_text(json.dumps(broken))
                        with self.assertRaises(AssertionError):
                            cmd_replay_saved_artifacts(args)

    def test_reference_cache_binding(self):
        binding = self.replay['timelineReplay']
        with tempfile.TemporaryDirectory() as tmp:
            capture = load_staging_capture_module(tmp)
            candidate_dir = Path(tmp) / 'candidate'
            candidate_dir.mkdir()
            candidate_manifest = {
                'fixture': str(Path(tmp) / 'fixture.json'),
                'fixture_sha256': self.fixture_sha,
                'timeline_replay': binding,
            }
            (Path(tmp) / 'fixture.json').write_bytes(self.fixture_bytes)
            (candidate_dir / 'capture-manifest.json').write_text(json.dumps(candidate_manifest))
            args = (DryContext(), {'base': {'ref': 'migrate/trek-source'}}, str(Path(tmp) / 'fixture.json'), str(candidate_dir))
            old = Path(tmp) / 'gateb-cand' / ('staging-2b6d8df-fixture-%s' % self.fixture_sha[:16])
            old.mkdir(parents=True)
            (old / 'capture-regions.json').write_text(json.dumps(minimal_regions()))
            (old / 'capture-manifest.json').write_text(json.dumps({'timeline_replay': binding}))
            self.assertIsNone(capture(*args)[0])
            new = Path(str(old) + '-timeline-explicit-v1')
            new.mkdir()
            (new / 'capture-regions.json').write_text(json.dumps(minimal_regions()))
            (new / 'capture-manifest.json').write_text(json.dumps({'timeline_replay': {}}))
            self.assertIsNone(capture(*args)[0])
            manifest = {
                'fixture_sha256': self.fixture_sha,
                'timeline_replay': binding,
            }
            (new / 'capture-manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(capture(*args)[0], str(new))
            for field, value in [
                ('policy', 'old'),
                ('source_fixture_sha256', '0' * 64),
                ('selected_place_keys', []),
                ('served_payload_sha256', ''),
            ]:
                changed = copy.deepcopy(manifest)
                changed['timeline_replay'][field] = value
                (new / 'capture-manifest.json').write_text(json.dumps(changed))
                self.assertIsNone(capture(*args)[0])
            (new / 'capture-manifest.json').write_text(json.dumps(manifest))
            bad_candidate = dict(candidate_manifest, fixture_sha256='0' * 64)
            (candidate_dir / 'capture-manifest.json').write_text(json.dumps(bad_candidate))
            self.assertIsNone(capture(*args)[0])


def cmd_replay_saved_artifacts(argv):
    parser = argparse.ArgumentParser(description='Replay host saved capture regions (not run in CI).')
    parser.add_argument('--fixture', required=True)
    parser.add_argument('--candidate-regions', required=True)
    parser.add_argument('--reference-regions', required=True)
    ns = parser.parse_args(argv)
    fixture = Path(ns.fixture)
    candidate_regions = Path(ns.candidate_regions)
    reference_regions = Path(ns.reference_regions)
    trip = json.loads(fixture.read_bytes())
    hotel = next(p for p in trip['places'] if p.get('name') == 'Hotel Beacon')
    hotel_name = hotel['name']
    for width in (1280, 390):
        screen = 'daybyday-%s.png' % width
        cand = json.loads(candidate_regions.read_text())
        ref = json.loads(reference_regions.read_text())
        cand_titles = [r['title'] for r in cand[screen]['struct']['timeline']]
        ref_titles = [r['title'] for r in ref[screen]['struct']['timeline']]
        require_selected_titles(cand_titles, trip)
        require_selected_titles(ref_titles, trip)
        checked = (trip.get('thingOverrides') or {}).get('place:%s' % hotel['id'], {}).get('timeline') is True
        assert_hotel_stay_parity(cand_titles, ref_titles, hotel_name, checked)
    print('saved-artifact replay OK')


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--replay-saved-artifacts':
        cmd_replay_saved_artifacts(sys.argv[2:])
        return
    unittest.main()


if __name__ == '__main__':
    main()
