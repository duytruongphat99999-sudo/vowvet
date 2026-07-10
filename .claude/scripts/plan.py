#!/usr/bin/env python3
"""
plan.py — bộ lập lịch cho plan.yaml.

Việc của nó:
  1. Đọc plan.yaml (hoặc plan.json nếu không có pyyaml)
  2. Kiểm tra tính hợp lệ: id trùng, needs trỏ vào hư không, chu trình
  3. Ép luật "hợp đồng trước": task contract:true phải ở wave 0, và
     wave 0 KHÔNG được chứa gì khác
  4. Topo sort thành các WAVE. Task cùng wave = không phụ thuộc nhau
  5. Trong mỗi wave, phát hiện hai task cùng đụng một file → CHẶN

Dùng:
  plan.py validate            # chỉ kiểm tra, in ra sơ đồ
  plan.py waves --json        # xuất lịch chạy cho run-plan.sh
"""
import sys, json, os, glob as globmod, argparse
from collections import defaultdict

# Windows: console mặc định cp1252 — không in nổi emoji/tiếng Việt
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

def load(path):
    if path.endswith((".yaml", ".yml")):
        try:
            import yaml
        except ImportError:
            sys.exit("❌ Thiếu pyyaml. Chạy: pip install pyyaml — hoặc đổi sang plan.json")
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def die(msg):
    sys.exit(f"❌ plan không hợp lệ: {msg}")


def validate(plan):
    tasks = plan.get("tasks") or die("thiếu khoá 'tasks'")
    ids = [t["id"] for t in tasks]

    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        die(f"id trùng: {sorted(dupes)}")

    idset = set(ids)
    for t in tasks:
        if not t.get("goal"):
            die(f"task {t['id']} thiếu 'goal'")
        for n in t.get("needs", []):
            if n not in idset:
                die(f"task {t['id']} needs '{n}' — không tồn tại")

    # Phát hiện chu trình bằng DFS 3 màu
    graph = {t["id"]: list(t.get("needs", [])) for t in tasks}
    WHITE, GREY, BLACK = 0, 1, 2
    color = defaultdict(int)

    def dfs(u, stack):
        color[u] = GREY
        for v in graph[u]:
            if color[v] == GREY:
                cyc = stack[stack.index(v):] + [v] if v in stack else [v, u]
                die(f"phụ thuộc vòng tròn: {' → '.join(cyc)}")
            if color[v] == WHITE:
                dfs(v, stack + [v])
        color[u] = BLACK

    for i in ids:
        if color[i] == WHITE:
            dfs(i, [i])
    return tasks


def topo_waves(tasks):
    """Chia thành các wave. Wave n chỉ chạy sau khi wave n-1 đã merge xong."""
    remaining = {t["id"]: set(t.get("needs", [])) for t in tasks}
    by_id = {t["id"]: t for t in tasks}
    done, waves = set(), []

    while remaining:
        ready = sorted(i for i, needs in remaining.items() if needs <= done)
        if not ready:
            die(f"bế tắc, không task nào chạy được: {sorted(remaining)}")
        waves.append(ready)
        done |= set(ready)
        for i in ready:
            del remaining[i]

    # ── Luật hợp đồng trước ────────────────────────────────────────────
    contracts = [t["id"] for t in tasks if t.get("contract")]
    if contracts:
        w0 = set(waves[0])
        if not set(contracts) <= w0:
            late = sorted(set(contracts) - w0)
            die(f"task contract phải chạy đầu tiên (không được có 'needs'): {late}")
        extra = sorted(w0 - set(contracts))
        if extra:
            die("wave 0 có task contract nên KHÔNG được chứa gì khác. "
                f"Thêm 'needs: {contracts}' cho: {extra}")
    return waves, by_id


def expand(patterns):
    """Nở glob ra file thật. Không khớp file nào → giữ nguyên chuỗi glob."""
    out = set()
    for p in patterns:
        hits = globmod.glob(p, recursive=True)
        out |= set(hits) if hits else {p}
    return out


def collisions(wave, by_id):
    """Hai task cùng wave đụng cùng file = merge conflict chờ sẵn."""
    bad = []
    owners = {i: expand(by_id[i].get("touches", [])) for i in wave}
    for a in range(len(wave)):
        for b in range(a + 1, len(wave)):
            ia, ib = wave[a], wave[b]
            shared = owners[ia] & owners[ib]
            if shared:
                bad.append((ia, ib, sorted(shared)[:3]))
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["validate", "waves"])
    ap.add_argument("--plan", default=".claude/plan.yaml")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    if not os.path.exists(a.plan):
        sys.exit(f"❌ Không thấy {a.plan}. Chạy /epic để sinh ra.")

    plan = load(a.plan)
    tasks = validate(plan)
    waves, by_id = topo_waves(tasks)

    # Đụng file là lỗi cứng — thà biết bây giờ còn hơn biết lúc merge
    fatal = False
    for n, w in enumerate(waves):
        for ia, ib, files in collisions(w, by_id):
            print(f"❌ WAVE {n}: '{ia}' và '{ib}' cùng đụng {files}", file=sys.stderr)
            print(f"   Sửa: cho một task 'needs: [{ia}]' để chúng chạy nối tiếp.",
                  file=sys.stderr)
            fatal = True
    if fatal:
        sys.exit(1)

    if a.cmd == "waves" and a.json:
        print(json.dumps({
            "epic": plan.get("epic", "epic"),
            "base": plan.get("base", "main"),
            "waves": [[{"id": i,
                        "goal": by_id[i]["goal"],
                        "verify": by_id[i].get("verify", "")} for i in w]
                      for w in waves],
        }))
        return

    print(f"📐 epic: {plan.get('epic','?')}   ({len(tasks)} task, {len(waves)} wave)\n")
    for n, w in enumerate(waves):
        tag = " ← HỢP ĐỒNG, merge trước tiên" if n == 0 and any(
            by_id[i].get("contract") for i in w) else ""
        print(f"  WAVE {n}{tag}")
        for i in w:
            needs = by_id[i].get("needs", [])
            arrow = f"  ⟵ {', '.join(needs)}" if needs else ""
            print(f"    • {i:<12} {by_id[i]['goal'][:50]}{arrow}")
        print()
    print("✅ plan hợp lệ. Chạy: .claude/scripts/run-plan.sh")


if __name__ == "__main__":
    main()
