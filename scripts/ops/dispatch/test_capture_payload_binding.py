import ast
import copy
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def functions(path):
    tree = ast.parse(path.read_text())
    code = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and (n.name.startswith(('_capture_', '_effective_', '_row_', '_data_', '_review_', '_logo_', '_price_', '_load_')) or n.name in ('build', '_blank'))], type_ignores=[])
    env = dict(json=json, re=re)
    exec(compile(code, str(path), 'exec'), env)
    return env

class BindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.snapshot = ROOT / 'scripts/fixtures/pr336-vk-search-places.snapshot.json'
        self.snap = json.loads(self.snapshot.read_text())
        self.base = {'trip': {'id': 1}, 'categories': [], 'places': [{'id': 1, 'name': 'static'}], 'thingOverrides': {'place:1': {'summary': 'static'}, 'reservation:2': {'price': 4}}}
        self.builder = functions(HERE / 'build_head_fixture.py')['build']
        self.reader = functions(HERE / 'tsv_dispatch.py')['_capture_payload_faults']
        self.base_path = self.work / 'base.json'
        self.output = self.work / 'output.json'
        self.base_path.write_text(json.dumps(self.base))
        self.builder(str(self.base_path), str(self.snapshot), str(self.output))
        self.fx = json.loads(self.output.read_text())

    def faults(self, fixture=None):
        self.output.write_text(json.dumps(self.fx if fixture is None else fixture))
        return self.reader(str(self.snapshot), str(self.output))

    def test_actual_product_consumer_and_static_preservation(self):
        self.assertEqual(self.faults(), [])
        for rid, src in self.snap.items():
            self.assertNotIn(rid, self.fx['thingOverrides'])
            self.assertEqual(self.fx['thingOverrides']['place:' + rid]['summary'], src['summary'])
        self.assertEqual(self.fx['places'][0], self.base['places'][0])
        for key, value in self.base['thingOverrides'].items():
            self.assertEqual(self.fx['thingOverrides'][key], value)
        module = ROOT / 'src/vacation/thing-detail-fields.mjs'
        driver = "import {applyThingDetailOverrides} from " + json.dumps(module.as_uri()) + "; import fs from 'node:fs'; const f=JSON.parse(fs.readFileSync(process.argv[1])); for(const id of [609,603]){const p=f.places.find(x=>x.id===id); const got=applyThingDetailOverrides(f).thingOverrides['place:'+id]; if(got.summary!==f.thingOverrides['place:'+id].summary)throw Error('consumer binding');}"
        subprocess.run(['node', '--input-type=module', '-e', driver, str(self.output)], check=True, capture_output=True)

    def test_namespace_rejections(self):
        for value in [None, [], '', 1]:
            with self.subTest(value=value):
                fx=copy.deepcopy(self.fx); fx['thingOverrides']['place:609']=value
                self.assertTrue(self.faults(fx))
        for keep in [False, True]:
            fx=copy.deepcopy(self.fx); fx['thingOverrides']['609']=copy.deepcopy(fx['thingOverrides']['place:609'])
            if not keep: del fx['thingOverrides']['place:609']
            self.assertTrue(self.faults(fx))
        fx=copy.deepcopy(self.fx); fx['thingOverrides']['609']=fx['thingOverrides']['place:609']; fx['thingOverrides']['place:609']={}
        self.assertTrue(self.faults(fx))

    def test_all_value_comparisons_stay_fail_closed(self):
        for field in ['title','summary','description','logoUrl','price','lat','reviews']:
            with self.subTest(field=field):
                fx=copy.deepcopy(self.fx); p=fx['thingOverrides']['place:603']
                p[field]=None
                if field=='title': next(r for r in fx['places'] if r['id']==603)['name']=None
                if field in ['logoUrl','price','reviews']: p['sourceRecord']={}
                self.assertTrue(any(('identity' if field in ('title','name') else 'coordinates' if field=='lat' else field.replace('logoUrl','logo')) in x for x in self.faults(fx)), field)
        for field in ['title','summary','description','logoUrl','price','lat','reviews']:
            with self.subTest(conflicting=field):
                fx=copy.deepcopy(self.fx); p=fx['thingOverrides']['place:603']
                other=copy.deepcopy(self.snap['609'].get(field))
                if field=='lat': other=self.snap['609']['lng']
                p[field]=other
                if field=='reviews':
                    p['sourceRecord']=copy.deepcopy(self.snap['609']['sourceRecord'])
                self.assertTrue(any(('identity' if field in ('title','name') else 'coordinates' if field=='lat' else field.replace('logoUrl','logo')) in x for x in self.faults(fx)), field)
        for field in ['name','description','price','lat']:
            fx=copy.deepcopy(self.fx); raw=next(p for p in fx['places'] if p['id']==603)
            raw[field]=self.snap['609'].get('title' if field=='name' else ('lng' if field=='lat' else field))
            self.assertTrue(any(('identity' if field in ('title','name') else 'coordinates' if field=='lat' else field.replace('logoUrl','logo')) in x for x in self.faults(fx)), field)

    def test_collisions_and_missing_payload(self):
        for key in ['place:609','609']:
            fx=copy.deepcopy(self.base); fx['thingOverrides'][key]={}; self.base_path.write_text(json.dumps(fx))
            with self.assertRaises(ValueError): self.builder(str(self.base_path),str(self.snapshot),str(self.output))
        fx=copy.deepcopy(self.base); fx['places'].append({'id':609}); self.base_path.write_text(json.dumps(fx))
        with self.assertRaises(ValueError): self.builder(str(self.base_path),str(self.snapshot),str(self.output))
        self.assertTrue(self.faults({}))
        fx=copy.deepcopy(self.fx); fx['places']=[p for p in fx['places'] if p['id']!=609]
        self.assertTrue(self.faults(fx))
        self.snapshot=self.work/'empty.json'; self.snapshot.write_text('{}'); self.assertTrue(self.faults())

if __name__ == '__main__':
    unittest.main()
