#!/usr/bin/env python3
"""Offline classification only. A manifest is data, never authority to ring/install."""
import argparse
from dataclasses import fields
import json

from host_handback_review import Evidence, classify


def classify_manifest(manifest, now):
    if manifest.get('schema_version') != 1:
        raise ValueError('schema_version must be 1')
    actors = frozenset(manifest['trusted_actors'])
    out = []
    for entry in manifest['objects']:
        raw = dict(entry['evidence'])
        if set(raw) != {f.name for f in fields(Evidence)}:
            raise ValueError('exact canonical evidence fields required')
        raw['running_items'] = frozenset(raw['running_items'])
        raw['handback_ids'] = frozenset(raw['handback_ids'])
        decision = classify(entry['item'], entry['comments'], Evidence(**raw),
                            now, actors, manifest.get('sent', {}))
        out.append({'number': entry['item']['number'], 'state': decision.state,
                    'reason': decision.reason, 'event': decision.event,
                    'fingerprint': decision.fingerprint, 'source': raw['source'],
                    'mode': 'offline; no notification or runtime proof'})
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest')
    parser.add_argument('--now', type=float, required=True, help='UTC epoch matching evidence collection')
    args = parser.parse_args()
    with open(args.manifest) as f:
        manifest = json.load(f)
    print(json.dumps(classify_manifest(manifest, args.now), indent=2))


if __name__ == '__main__':
    main()
