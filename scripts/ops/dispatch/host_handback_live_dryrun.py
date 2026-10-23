"""HOST-HANDBACK-LIVE-DRYRUN. Run on the independent outer host only."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-root', required=True)
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    sys.path.insert(0, str(Path(args.runtime_root).resolve()))
    from tsv_common import GH, REPO
    sys.path.insert(0, str(source))
    from host_handback_evidence import CanonicalCollector, HostReaders
    from host_handback_review import EvidenceError

    class ReadOnlyGH:
        def __init__(self):
            self.gh = GH()

        def req(self, method, *a, **kw):
            if method != 'GET':
                raise EvidenceError('dry-run refuses GitHub mutation')
            return self.gh.req(method, *a, **kw)

        def pages(self, *a, **kw):
            return self.gh.pages(*a, **kw)

    gh = ReadOnlyGH()
    collector = CanonicalCollector(gh, REPO, HostReaders(args.runtime_root))
    spec = importlib.util.spec_from_file_location('host_alarm_source', source / 'tsv_stall_alarm.py')
    alarm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(alarm)
    alarm.GH = lambda: gh
    alarm.D = args.runtime_root
    alarm.ST = str(Path(args.runtime_root) / 'stall-alarm-state.json')
    decisions = alarm.main(dry=True, review_scan=collector.scan())
    if not isinstance(decisions, dict) or not decisions:
        raise EvidenceError('source adapter hook omitted or empty current-object scan')
    print(json.dumps({'check': 'HOST-HANDBACK-LIVE-DRYRUN', 'mode': 'read-only; supervisor verdict required',
                      'source_sha256': {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
                                        for name in ('host_handback_evidence.py', 'tsv_stall_alarm.py')},
                      'objects': {str(n): {'state': d.state, 'reason': d.reason, 'event': d.event}
                                  for n, d in decisions.items()}}, indent=2))


if __name__ == '__main__':
    main()
