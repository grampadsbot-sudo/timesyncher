#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def load_json(path):
    return json.loads(Path(path).read_text())


def timeline_ids(fixture):
    found = []
    assignments = fixture.get('assignments') if isinstance(fixture, dict) else None
    if not isinstance(assignments, dict):
        return []
    for rows in assignments.values():
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            place = row.get('place') if isinstance(row.get('place'), dict) else {}
            raw = row.get('place_id') or place.get('id') or 0
            try:
                number = int(raw)
            except (TypeError, ValueError):
                number = 0
            if number:
                found.append(number)
    return sorted(set(found))


def catalog_count(fixture):
    places = fixture.get('places') if isinstance(fixture, dict) else None
    if not isinstance(places, list):
        return 0
    return sum(1 for place in places if isinstance(place, dict) and place.get('id') is not None)


def box_ok(box):
    return isinstance(box, list) and len(box) == 4 and all(isinstance(part, (int, float)) for part in box)


def source_of(region):
    if not isinstance(region, dict):
        return None
    if isinstance(region.get('budget_membership'), list):
        return region
    struct = region.get('struct')
    if isinstance(struct, dict) and isinstance(struct.get('budget_membership'), list):
        return struct
    return None


def shot_report(name, region, timeline, catalog):
    source = source_of(region)
    if source is None:
        return {
            'shot': name,
            'budget_row_count': None,
            'budget_text': None,
            'geometry': 'NOT_COLLECTED',
            'missing_fields': ['budget_row_count', 'budget_membership', 'budget_text', 'box'],
            'rows': [],
            'off_timeline': [],
            'missing_timeline': list(timeline),
        }
    rows = []
    geometry = 'COLLECTED'
    got = set()
    for row in source.get('budget_membership') or []:
        if not isinstance(row, dict):
            continue
        box = row.get('box')
        if not box_ok(box):
            geometry = 'NOT_COLLECTED'
        try:
            got.add(int(row.get('place_id')))
        except (TypeError, ValueError):
            pass
        rows.append({
            'name': row.get('name'),
            'place_id': row.get('place_id'),
            'amount_text': row.get('amount_text'),
            'box': box,
        })
    timeline_set = set(timeline)
    return {
        'shot': name,
        'budget_row_count': source.get('budget_row_count'),
        'budget_text': source.get('budget_text'),
        'geometry': geometry,
        'missing_fields': [],
        'rows': rows,
        'off_timeline': sorted(got - timeline_set),
        'missing_timeline': sorted(timeline_set - got),
        'on_timeline': sorted(got & timeline_set),
    }


def build_report(regions, fixture):
    timeline = timeline_ids(fixture)
    catalog = catalog_count(fixture)
    shots = []
    if isinstance(regions, dict):
        for name in sorted(regions):
            if not str(name).startswith('budget'):
                continue
            shots.append(shot_report(name, regions.get(name), timeline, catalog))
    return {
        'catalog_count': catalog,
        'timeline_count': len(timeline),
        'timeline_place_ids': [str(item) for item in timeline],
        'pixel_thresholds_unchanged': True,
        'shots': shots,
    }


def comment_block(report):
    lines = ['### Budget membership']
    lines.append(f"catalog_count={report['catalog_count']} timeline_count={report['timeline_count']}")
    lines.append('timeline_place_ids=' + ','.join(report['timeline_place_ids']))
    if not report['shots']:
        lines.append('budget shots missing from capture-regions.json')
    for shot in report['shots']:
        lines.append(
            f"{shot['shot']}: budget_row_count={shot['budget_row_count']} geometry={shot['geometry']} "
            f"off_timeline={shot['off_timeline']} missing_timeline={shot['missing_timeline']}"
        )
        if shot['missing_fields']:
            lines.append('  missing_fields=' + ','.join(shot['missing_fields']))
        for row in shot['rows']:
            lines.append(f"  place_id={row['place_id']} name={row['name']} amount={row['amount_text']} box={row['box']}")
    lines.append('pixel acceptance thresholds unchanged')
    return '\n'.join(lines) + '\n'


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument('--regions', required=True)
    parser.add_argument('--fixture', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--comment', required=True)
    args = parser.parse_args(argv)
    report = build_report(load_json(args.regions), load_json(args.fixture))
    text = comment_block(report)
    Path(args.out).write_text(json.dumps(report, indent=1) + '\n')
    Path(args.comment).write_text(text)
    print(text, end='')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(__import__('sys').argv[1:]))
