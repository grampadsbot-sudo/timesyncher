"""Consolidate tracker items into jobs using explicit ownership, not mentions."""
import re


def owner_issues(pr, issue_numbers):
    result = set()
    title = pr.get("title") or ""
    match = re.search(r"\(#(\d+)\)\s*$", title)
    if match:
        result.add(int(match.group(1)))
    for match in re.finditer(r"^\s*(?:[-*]\s*)?(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s+(?:issue\s+)?#(\d+)\b", pr.get("body") or "", re.I | re.M):
        result.add(int(match.group(1)))
    return result & issue_numbers


def consolidate(items, info, prs, issues):
    """One report row per connected ownership group; leave raw tracker data intact.

    Include an owning issue in the display even when it has no independent
    stuck flag. Dependencies remain separate jobs. Valid parked pairs are
    still visible but don't ring dr action bells or claim to be active stalls.
    """
    prs = {p["number"]: p for p in prs}
    issues = {i["number"]: i for i in issues if "pull_request" not in i}
    parent = {}

    def root(k):
        parent.setdefault(k, k)
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    def join(a, b):
        parent[root(b)] = root(a)

    for n, p in prs.items():
        for issue in owner_issues(p, set(issues)):
            join("pr%d" % n, "is%d" % issue)
    for n, issue in issues.items():
        labels = {x["name"] for x in issue.get("labels") or [] if x["name"].startswith("parked:")}
        if not labels:
            continue
        for match in re.finditer(r"\bRelated\s+draft\s*:?\s*#(\d+)\b", issue.get("body") or "", re.I):
            prn = int(match.group(1))
            if prn in prs and labels & {x["name"] for x in prs[prn].get("labels") or []}:
                join("pr%d" % prn, "is%d" % n)
    groups = {}
    for item in items:
        groups.setdefault(root(item[0]), []).append(item)
    result = []
    for component, rows in groups.items():
        members = [k for k in parent if root(k) == component]
        pn = sorted(int(k[2:]) for k in members if k.startswith("pr"))
        isn = sorted(int(k[2:]) for k in members if k.startswith("is"))
        key = "pr%d" % pn[0] if pn else rows[0][0]
        number = pn[0] if pn else rows[0][1]
        raw = [dict(info[k]) for k, _, _ in rows]
        f = dict(raw[0])
        f["age"] = max(x["age"] for x in raw)
        f["why"] = "; ".join(("PR" if k.startswith("pr") else "issue") + " #%d: %s" % (n, value["why"]) for (k, n, _), value in zip(rows, raw))
        f["last"] = "; ".join(("PR" if k.startswith("pr") else "issue") + " #%d %s" % (n, value["last"]) for (k, n, _), value in zip(rows, raw))
        f["labels"] = ",".join(sorted({label for x in raw for label in x["labels"].split(",") if label != "none"})) or "none"
        f["sha"] = ", ".join("#%d %s" % (n, prs[n]["head"]["sha"][:7]) for n in pn) or "-"
        f["who"] = "VK " + " / ".join(["PR #%d" % n for n in pn] + ["issue #%d" % n for n in isn])
        f["members"] = members
        parked_labels = set.intersection(*[{l["name"] for l in (prs[n].get("labels") or []) if l["name"].startswith("parked:")} for n in pn]) if pn else set()
        parked_issues = [n for n in isn if parked_labels & {l["name"] for l in issues[n].get("labels") or []}]
        f["parked_job"] = bool(pn and all(prs[n].get("draft") for n in pn) and parked_labels and parked_issues)
        f["draft"] = bool(pn and all(prs[n].get("draft") for n in pn))
        if f["parked_job"]:
            f["why"] = "parked for " + ",".join(sorted(l.split(":", 1)[1] for l in parked_labels)) + "; linked future-phase issue; not an active blocker"
        info[key] = f
        result.append((key, number, f["who"] + " " + f["why"]))
    return sorted(result, key=lambda x: (bool(info[x[0]].get("parked_job")), -info[x[0]]["age"]))
