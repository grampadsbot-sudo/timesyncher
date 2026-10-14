import unittest
from work_groups import consolidate

def pr(n, issue=None, labels=(), draft=False, body=""):
    return {"number":n,"title":"Work"+(" (#%d)"%issue if issue else ""),"body":body,
            "head":{"sha":"a"*40},"labels":[{"name":x} for x in labels],"draft":draft}

def issue(n, labels=(), body=""):
    return {"number":n,"labels":[{"name":x} for x in labels],"body":body}

def entry(kind, n, age=100, labels="kickback"):
    key=("pr" if kind=="PR" else "is")+str(n)
    return (key,n,"reason"),{"kind":kind,"age":age,"why":"blocked","last":"update","labels":labels,"sha":"a"*7}

class Tests(unittest.TestCase):
    def run_group(self, prs, issues, specs):
        rows=[];info={}
        for kind,n,age,labs in specs:
            row,value=entry(kind,n,age,labs);rows.append(row);info[row[0]]=value
        return consolidate(rows,info,prs,issues),info

    def test_issue_and_pr_form_one_row_and_preserve_both_blockers_and_oldest_age(self):
        rows,info=self.run_group([pr(336,335)],[issue(335)],[("PR",336,200,"kickback"),("issue",335,300,"hold:data")])
        self.assertEqual(len(rows),1)
        f=info[rows[0][0]]
        self.assertEqual(f["who"],"VK PR #336 / issue #335")
        self.assertEqual(f["age"],300)
        self.assertIn("PR #336",f["why"]);self.assertIn("issue #335",f["why"])
        self.assertEqual(f["labels"],"hold:data,kickback")

    def test_non_stuck_owning_issue_is_named_with_its_stuck_pr(self):
        rows,info=self.run_group([pr(378,367)],[issue(367)],[("PR",378,100,"hold:dr-diagnosis")])
        self.assertEqual(info[rows[0][0]]["who"],"VK PR #378 / issue #367")

    def test_incidental_dependency_and_ask_mentions_do_not_merge_jobs(self):
        rows,_=self.run_group([pr(394,391,body="Depends on #335. managing dr ask #37. Do not fix #335.")],
                [issue(335),issue(391)],[("PR",394,10,"none"),("issue",335,300,"kickback")])
        self.assertEqual(len(rows),2)

    def test_parked_pair_visible_once_without_active_stuck_status(self):
        label="parked:photos-videos"
        rows,info=self.run_group([pr(207,labels=[label],draft=True)],[issue(393,[label],"Related draft: #207.")],
            [("PR",207,1000,label),("issue",393,100,label)])
        self.assertEqual(len(rows),1)
        self.assertTrue(info[rows[0][0]]["parked_job"])
        self.assertEqual(info[rows[0][0]]["who"],"VK PR #207 / issue #393")

    def test_bare_draft_or_same_label_without_explicit_link_is_not_valid_parked_pair(self):
        label="parked:photos-videos"
        rows,info=self.run_group([pr(207,labels=[label],draft=True)],[issue(393,[label])],
            [("PR",207,1000,label),("issue",393,100,label)])
        self.assertEqual(len(rows),2)
        self.assertFalse(any(info[r[0]]["parked_job"] for r in rows))

    def test_multiple_prs_for_one_issue_count_as_one_job_and_both_heads_visible(self):
        rows,info=self.run_group([pr(10,5),pr(11,5)],[issue(5)],[("PR",10,100,"kickback"),("PR",11,50,"hold:data")])
        self.assertEqual(len(rows),1)
        self.assertIn("PR #10 / PR #11 / issue #5",info[rows[0][0]]["who"])
        self.assertIn("#10",info[rows[0][0]]["sha"]);self.assertIn("#11",info[rows[0][0]]["sha"])

if __name__=="__main__":unittest.main()
