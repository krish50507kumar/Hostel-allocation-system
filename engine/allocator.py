"""Deterministic backtracking allocation engine (api.md section 8).

Pure function: never writes bookings. The booking RPC revalidates DB state independently.
Run tests:  pytest engine/allocator.py
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Student:
    id: str
    room_type: str | None = None
    facilities: tuple[str, ...] = ()
    building: str | None = None


@dataclass(frozen=True)
class Room:
    id: str
    building: str
    room_type: str
    facilities: tuple[str, ...]
    free_beds: int


def _eligible(s: Student, r: Room) -> tuple[bool, list[str]]:
    passed = ["capacity"]
    if s.room_type and s.room_type != r.room_type:
        return False, []
    if s.building and s.building != r.building:
        return False, []
    if not set(s.facilities) <= set(r.facilities):
        return False, []
    passed.append("eligibility")
    return True, passed


def _score(s: Student, r: Room) -> float:
    # Simple explainable score: fraction of preferences explicitly matched.
    prefs = [bool(s.room_type), bool(s.building), bool(s.facilities)]
    return 1.0 if not any(prefs) else sum(prefs) / len(prefs) * 0.5 + 0.5


def allocate(students: list[Student], rooms: list[Room]) -> dict:
    students = sorted(students, key=lambda s: s.id)  # deterministic order
    rooms = sorted(rooms, key=lambda r: r.id)
    cap = {r.id: r.free_beds for r in rooms}
    options = {
        s.id: [(r, ev) for r in rooms for ok, ev in [_eligible(s, r)] if ok and r.free_beds > 0]
        for s in students
    }
    best: dict = {"assigned": {}, "score": -1.0}

    def solve(i: int, assigned: dict, score: float) -> bool:
        """Returns True when everyone is assigned (full solution found)."""
        if len(assigned) + (len(students) - i) < len(best["assigned"]):
            return False  # cannot beat current best
        if i == len(students):
            if len(assigned) > len(best["assigned"]) or (
                len(assigned) == len(best["assigned"]) and score > best["score"]
            ):
                best.update(assigned=dict(assigned), score=score)
            return len(assigned) == len(students)
        s = students[i]
        for r, ev in sorted(options[s.id], key=lambda o: (-_score(s, o[0]), o[0].id)):
            if cap[r.id] > 0:
                cap[r.id] -= 1
                assigned[s.id] = (r, ev, _score(s, r))
                done = solve(i + 1, assigned, score + _score(s, r))
                del assigned[s.id]
                cap[r.id] += 1
                if done:
                    return True
        return solve(i + 1, assigned, score)  # leave this student unassigned

    solve(0, {}, 0.0)
    got = best["assigned"]
    unassigned = [s.id for s in students if s.id not in got]
    n = len(got)
    status = "feasible" if not unassigned else ("infeasible" if n == 0 else "partial")
    return {
        "status": status,
        "assignments": [
            {"student_id": sid, "room_id": r.id, "score": sc, "constraints_passed": ev}
            for sid, (r, ev, sc) in sorted(got.items())
        ],
        "unassigned_students": unassigned,
        "objective_score": round(best["score"], 3) if n else 0.0,
        "solver": "backtracking",
    }


# ---- tests ----
def test_feasible():
    rooms = [Room("r1", "A", "double", ("desk",), 2)]
    res = allocate([Student("s1"), Student("s2", facilities=("desk",))], rooms)
    assert res["status"] == "feasible" and not res["unassigned_students"]


def test_infeasible_reports_unassigned():
    rooms = [Room("r1", "A", "single", (), 1)]
    res = allocate([Student("s1", room_type="double")], rooms)
    assert res["status"] == "infeasible" and res["unassigned_students"] == ["s1"]


def test_capacity_respected():
    rooms = [Room("r1", "A", "single", (), 1)]
    res = allocate([Student("s1"), Student("s2")], rooms)
    assert len(res["assignments"]) == 1 and len(res["unassigned_students"]) == 1
