#!/usr/bin/env python3
"""
Prueft, ob sich Gliedmassen und Rumpf waehrend der Animationen durchdringen.

Genauigkeit ist hier wichtig: ein Test mit achsenparallelen Huellen im
Weltraum meldet bei gedrehtem Koerper staendig Fehlalarme. Deshalb werden die
Eckpunkte der Arm-/Beinteile in den RUHERAUM des jeweiligen Rumpfknochens
zurueckgerechnet und dort gegen dessen Huelle geprueft — das ist exakt.

    python3 tools/check_clearance.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_player_glb import BONES, WORLD, build_character, make_clips, quat_from_euler, slerp  # noqa: E402


def qmat(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def part_bounds(mesh):
    out = {}
    for tri in range(mesh.tris):
        for k in range(3):
            vi = mesh.idx[tri * 3 + k]
            b = BONES[mesh.joint[vi]][0]
            p = mesh.pos[vi * 3:vi * 3 + 3]
            e = out.setdefault(b, [list(p), list(p)])
            for i in range(3):
                e[0][i] = min(e[0][i], p[i])
                e[1][i] = max(e[1][i], p[i])
    return out


def fk(pose):
    """Vorwaertskinematik; liefert je Knochen (Rotationsmatrix, Translation)."""
    out = {}
    for name, parent, off in BONES:
        R = qmat(pose.get(name, (0, 0, 0, 1)))
        pm, pt = out[parent] if parent else ([[1, 0, 0], [0, 1, 0], [0, 0, 1]], (0, 0, 0))
        t = tuple(pt[i] + sum(pm[i][k] * off[k] for k in range(3)) for i in range(3))
        m = [[sum(pm[i][k] * R[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
        out[name] = (m, t)
    return out


def sample_pose(keys, t):
    prev, nxt = keys[0], keys[-1]
    for k in range(1, len(keys)):
        if keys[k][0] >= t:
            prev, nxt = keys[k - 1], keys[k]
            break
    span = (nxt[0] - prev[0]) or 1.0
    f = max(0.0, min(1.0, (t - prev[0]) / span))
    pose = {}
    for b in set(list(prev[1]) + list(nxt[1])):
        if b.startswith("_"):
            continue
        pose[b] = slerp(quat_from_euler(*prev[1].get(b, (0, 0, 0))),
                        quat_from_euler(*nxt[1].get(b, (0, 0, 0))), f)
    return pose


def check(margin=0.006, samples=24):
    mesh = build_character()
    P = part_bounds(mesh)
    # Arme duerfen den Rumpf nirgends beruehren.
    # Oberschenkel gegen Becken waere ein Fehlalarm: das Hueftgelenk steckt
    # konstruktiv im Becken. Sie werden nur gegen Brust/Backpack geprueft.
    checks = [
        (["UpperArm_L", "LowerArm_L", "Hand_L", "UpperArm_R", "LowerArm_R", "Hand_R"],
         ["Chest", "Spine", "Hips", "Backpack"]),
        (["UpperLeg_L", "UpperLeg_R", "LowerLeg_L", "LowerLeg_R"],
         ["Chest", "Backpack"]),
    ]
    hits = []

    for name, dur, keys in make_clips():
        for i in range(samples):
            mats = fk(sample_pose(keys, dur * i / (samples - 1)))
            for limb, body in [(l, b) for ls, b in checks for l in ls]:
                if limb not in P:
                    continue
                lo, hi = P[limb]
                lm, lt = mats[limb]
                lw = WORLD[limb]
                corners = []
                for x in (lo[0], hi[0]):
                    for y in (lo[1], hi[1]):
                        for z in (lo[2], hi[2]):
                            r = (x - lw[0], y - lw[1], z - lw[2])
                            corners.append(tuple(
                                lt[j] + sum(lm[j][k] * r[k] for k in range(3)) for j in range(3)))
                for part in body:
                    if part not in P or part == limb:
                        continue
                    bm, bt = mats[part]
                    bw = WORLD[part]
                    blo, bhi = P[part]
                    for c in corners:
                        d = (c[0] - bt[0], c[1] - bt[1], c[2] - bt[2])
                        # in den Ruheraum des Rumpfknochens zurueckdrehen (R transponiert)
                        r = [sum(bm[k][j] * d[k] for k in range(3)) + bw[j] for j in range(3)]
                        if all(blo[j] + margin < r[j] < bhi[j] - margin for j in range(3)):
                            hits.append((name, round(dur * i / (samples - 1), 2), limb, part))
                            break
    return hits


if __name__ == "__main__":
    hits = check()
    if hits:
        print(f"{len(hits)} Durchdringungen:")
        seen = set()
        for h in hits:
            key = (h[0], h[2], h[3])
            if key in seen:
                continue
            seen.add(key)
            print(f"   {h[0]} @ {h[1]}s: {h[2]} steckt in {h[3]}")
    else:
        print("Keine Durchdringungen zwischen Gliedmassen und Rumpf")
    sys.exit(1 if hits else 0)
