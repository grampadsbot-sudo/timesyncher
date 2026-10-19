import importlib.util
import sys
from pathlib import Path
import unittest


HERE = Path(__file__).resolve().parent


def module(name, path):
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class ReasonableLogo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = module('logo_contract', HERE / 'vk_contract_check.py')
        cls.gate = module('logo_gate', HERE / 'restore_check.py')

    def test_contract_accepts_brand_domain_without_provenance(self):
        row = dict(category='flight', name='JetBlue', summary='JetBlue nonstop', description='Nonstop flight from Las Vegas to New York.', price=250, logoUrl='https://www.jetblue.com/favicon.ico')
        failures, _, _ = self.contract.check({'601': row})
        self.assertFalse(failures, failures)
        del row['logoUrl']
        failures, _, _ = self.contract.check({'601': row})
        self.assertIn(('logoUrl', 'flight'), failures)

    def test_gate_accepts_loaded_brand_logo_without_evidence_and_rejects_broken(self):
        item = dict(name='JetBlue', cat='flight', logo_src='https://www.jetblue.com/favicon.ico', box=[0, 0, 100, 30], img=dict(loaded=True, visible=True, natural=[32, 32], box=[0, 0, 24, 24]))
        region = dict(rows=[1], items=[item, item], viewport=[390, 844])
        reasons, _ = self.gate.row_design('flights-390.png', region, {}, dict(row_design=[]))
        self.assertEqual(reasons, [])
        item['img']['loaded'] = False
        reasons, _ = self.gate.row_design('flights-390.png', region, {}, dict(row_design=[]))
        self.assertTrue(reasons, 'broken logos must still fail')

    def test_clearly_wrong_brand_is_still_rejected(self):
        row = dict(category='hotel', title='Midtown sample hotel', logoUrl='https://www.manhattanclub.com/favicon.ico')
        failures, _, _ = self.contract.check({'608': row})
        self.assertIn(('identity', 'hotel'), failures)


if __name__ == '__main__':
    unittest.main()
