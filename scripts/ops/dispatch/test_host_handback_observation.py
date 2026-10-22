"""Offline regressions for zero-model host assessment observations."""
import os
import shutil
import unittest
from pathlib import Path
from unittest.mock import Mock

from host_handback_evidence import (ASSESSMENT, CanonicalCollector, EvidenceError, HostReaders,
                                    current_section)
from host_handback_observation import (ObservationError, load_observation, produce_observation,
                                       verify_assessment_observation, verify_item_observation,
                                       verify_observation_freshness, validate_observation_path)
from test_host_handback_evidence import SHA, SLUG, assessment
from test_host_handback_review import NOW, issue, receipt

SCOPED_ROOT = Path('/home/ubishere9995/tsv-work/.host-handback-observation-tests')


def scoped_observation(name):
    folder = SCOPED_ROOT / ('%s-%d' % (name, os.getpid()))
    folder.mkdir(parents=True, exist_ok=True)
    return folder / 'HOST_OBSERVATION.json'


class HostObservationSchema(unittest.TestCase):
    def setUp(self):
        self.runtime = SCOPED_ROOT / ('runtime-schema-%d' % os.getpid())
        self.runtime.mkdir(parents=True, exist_ok=True)
        self.assessment = assessment(NOW - 3600, NOW - 7200)
        self.receipt_page = 'https://example.test/issues/566#issuecomment-10\n' + SHA
        self.obs_path = scoped_observation('schema')

    def tearDown(self):
        shutil.rmtree(self.obs_path.parent, ignore_errors=True)
        shutil.rmtree(self.runtime, ignore_errors=True)

    def produce(self, at=NOW - 1, items=None):
        items = items or [(566, 'active-dr', SHA)]
        return produce_observation(
            str(self.obs_path),
            self.assessment,
            {SLUG: self.receipt_page},
            items,
            str(self.runtime),
            observed_at=at,
            registered_at=at,
            clock=lambda: at,
        )

    def test_observation_module_is_in_runtime_install(self):
        from install_host_handback_runtime import MODULES
        self.assertIn('host_handback_observation.py', MODULES)

    def test_symlink_observation_refuses(self):
        self.produce()
        link = self.obs_path.parent / 'link.json'
        link.symlink_to(self.obs_path)
        with self.assertRaisesRegex(ObservationError, 'symlinks'):
            validate_observation_path(str(link))

    def test_stale_section_refuses_without_observation(self):
        with self.assertRaisesRegex(EvidenceError, 'stale'):
            current_section(self.assessment, NOW)

    def test_fresh_observation_allows_stale_section_header(self):
        record = self.produce()
        verify_assessment_observation(record, self.assessment, {SLUG: self.receipt_page}, now=NOW)
        section = current_section(self.assessment, NOW, observation=record)
        self.assertIn('#566', section)

    def test_stale_observation_refuses(self):
        record = self.produce(at=NOW - 901)
        with self.assertRaisesRegex(ObservationError, 'stale'):
            verify_observation_freshness(record, now=NOW)

    def test_tampered_assessment_digest_refuses(self):
        record = self.produce()
        record = dict(record)
        record['assessment_sha256'] = 'f' * 64
        with self.assertRaisesRegex(ObservationError, 'digest mismatch'):
            verify_assessment_observation(record, self.assessment, {SLUG: self.receipt_page}, now=NOW)

    def test_wrong_section_event_at_refuses(self):
        record = self.produce()
        record = dict(record)
        record['section_event_at'] = record['section_event_at'] - 60
        with self.assertRaisesRegex(ObservationError, 'section event time mismatch'):
            verify_assessment_observation(record, self.assessment, {SLUG: self.receipt_page}, now=NOW)

    def test_incomplete_receipt_scope_refuses(self):
        record = self.produce()
        record = dict(record)
        record['receipt_slugs'] = []
        with self.assertRaisesRegex(ObservationError, 'receipt_sha256 keys must match receipt_slugs'):
            verify_assessment_observation(record, self.assessment, {SLUG: self.receipt_page}, now=NOW)

    def test_wrong_head_refuses(self):
        record = self.produce()
        with self.assertRaisesRegex(ObservationError, 'head mismatch'):
            verify_item_observation(record, 566, 'active-dr', 'b' * 40, now=NOW)

    def test_missing_item_scope_refuses(self):
        record = self.produce(items=[(566, 'active-dr', SHA)])
        with self.assertRaisesRegex(ObservationError, 'missing item'):
            verify_item_observation(record, 567, 'active-dr', SHA, now=NOW)

    def test_owner_mismatch_refuses(self):
        record = self.produce()
        with self.assertRaisesRegex(ObservationError, 'owner mismatch'):
            verify_item_observation(record, 566, 'other-dr', SHA, now=NOW)

    def test_produce_roundtrip_loads(self):
        record = self.produce()
        loaded = load_observation(str(self.obs_path))
        self.assertEqual(loaded['assessment_sha256'], record['assessment_sha256'])


class CollectorObservationIntegration(unittest.TestCase):
    def setUp(self):
        self.item = issue()
        self.item['head'] = {'sha': SHA}
        self.comments = [receipt()]
        self.comments[0].update(html_url='https://example.test/issues/566#issuecomment-10',
                                updated_at=self.comments[0]['created_at'])
        self.comments[0]['user']['id'] = 7
        self.page = assessment(NOW - 3600, NOW - 7200)
        self.record = self.comments[0]['html_url'] + '\n' + SHA
        self.runtime = SCOPED_ROOT / ('runtime-collector-%d' % os.getpid())
        self.runtime.mkdir(parents=True, exist_ok=True)
        self.obs_path = scoped_observation('collector')
        produce_observation(
            str(self.obs_path),
            self.page,
            {SLUG: self.record},
            [(566, 'active-dr', SHA)],
            str(self.runtime),
            observed_at=NOW - 1,
            registered_at=NOW - 1,
            clock=lambda: NOW - 1,
        )
        self.readers = HostReaders(
            str(self.runtime),
            host_observation_path=str(self.obs_path),
        )
        self.readers.page = lambda slug: self.page if slug == ASSESSMENT else self.record
        self.readers.running = lambda *a, **k: frozenset()
        self.readers.receipt = lambda page, number, head: self.comments[0]['body']
        self.gh = Mock()
        self.gh.req.return_value = {'id': 7, 'login': 'host-supervisor'}

    def tearDown(self):
        shutil.rmtree(self.obs_path.parent, ignore_errors=True)
        shutil.rmtree(self.runtime, ignore_errors=True)

    def test_collector_accepts_stale_header_with_fresh_observation(self):
        collector = CanonicalCollector(self.gh, 'synthetic/repo', self.readers, clock=lambda: NOW)
        evidence = collector(self.item, self.comments, NOW)
        self.assertEqual(evidence.owner, 'active-dr')
        self.assertEqual(evidence.last_action_at, NOW - 7200)

    def test_collector_preserves_last_action_without_refresh(self):
        collector = CanonicalCollector(self.gh, 'synthetic/repo', self.readers, clock=lambda: NOW)
        evidence = collector(self.item, self.comments, NOW)
        self.assertLess(evidence.last_action_at, NOW - 3000)


class ObservationFirstRunConfig(unittest.TestCase):
    def test_fresh_destination_is_validated_without_fabricating_observation(self):
        import json
        from host_handback_entrypoint import load_entrypoint_config
        root = SCOPED_ROOT / ('first-run-%d' % os.getpid())
        root.mkdir(parents=True, exist_ok=True)
        try:
            event = root / 'event.json'
            event.write_text('{}')
            dest = root / 'observation.json'
            config = root / 'config.json'
            config.write_text(json.dumps({'version': 1,
                'handback_event_paths': {'566': str(event)},
                'host_observation_path': str(dest)}))
            parsed = load_entrypoint_config(str(config))
            self.assertEqual(parsed['host_observation_path'], str(dest))
            self.assertFalse(dest.exists())
        finally:
            shutil.rmtree(root, ignore_errors=True)


class LiveObservationProducer(unittest.TestCase):
    def test_real_reader_pipeline_preserves_action_and_refuses_unknown_jobs(self):
        from host_handback_observation import produce_live_observation
        from unittest.mock import Mock
        import tempfile
        root = SCOPED_ROOT / ('live-%d' % os.getpid())
        root.mkdir(parents=True, exist_ok=True)
        try:
            text = assessment(NOW - 3600, NOW - 7200)
            readers = Mock()
            readers.root = root
            readers.page.side_effect = lambda slug: text if slug == ASSESSMENT else 'receipt'
            readers.running.return_value = frozenset()
            gh = Mock()
            pr = {'number': 566, 'head': {'sha': SHA}, 'state': 'open'}
            gh.req.side_effect = lambda method, route: {'id': 7, 'login': 'host'} if route == '/user' else pr
            gh.pages.return_value = [pr]
            dest = root / 'observed.json'
            rec = produce_live_observation(str(dest), gh, 'test/repo', readers, clock=lambda: NOW)
            self.assertEqual(rec['section_event_at'], NOW - 3600)
            self.assertEqual(rec['items']['566']['head'], SHA)
            readers.running.assert_called_once_with({566}, {566: SHA})
            before = dest.read_bytes()
            readers.running.return_value = None
            with self.assertRaisesRegex(ObservationError, 'live job evidence'):
                produce_live_observation(str(dest), gh, 'test/repo', readers, clock=lambda: NOW)
            self.assertEqual(dest.read_bytes(), before)
        finally:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
