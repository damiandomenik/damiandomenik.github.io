#!/usr/bin/env python3
"""
Erzeugt RiftRush_Player.glb — den "Rift Runner" aus dem Character Sheet.

Warum kein Blender: Das Modell wird hier direkt als glTF geschrieben (Mesh,
Armature, Skinning, Materialien, 16 Animationen). Wer die Figur bearbeiten
will, nutzt tools/build_riftrush_player_blender.py — das baut exakt dieselbe
Figur in Blender auf und liefert die .blend-Datei.

Bauweise: Hartflächen-Panzerung aus getaperten Boxen, jedes Teil starr an einen
Knochen gebunden (Gewicht 1.0). Das ist bei Roboter-/Rüstungsfiguren üblich und
vermeidet die typischen Skinning-Fehler an Schulter, Ellbogen und Knie
vollständig — genau das, was die Vorlage verlangt ("avoid severe mesh clipping").

    python3 tools/build_player_glb.py assets/RiftRush_Player.glb
"""
import json
import math
import struct
import sys
import os

# ---------------------------------------------------------------- Mathe
def quat_from_euler(x, y, z):
    """XYZ-Reihenfolge wie in three.js."""
    cx, sx = math.cos(x / 2), math.sin(x / 2)
    cy, sy = math.cos(y / 2), math.sin(y / 2)
    cz, sz = math.cos(z / 2), math.sin(z / 2)
    return (
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz,
        cx * cy * cz - sx * sy * sz,
    )

def slerp(a, b, t):
    d = sum(a[i] * b[i] for i in range(4))
    if d < 0:
        b = tuple(-v for v in b); d = -d
    if d > 0.9995:
        r = tuple(a[i] + (b[i] - a[i]) * t for i in range(4))
    else:
        th = math.acos(max(-1.0, min(1.0, d)))
        s = math.sin(th)
        r = tuple((math.sin((1 - t) * th) * a[i] + math.sin(t * th) * b[i]) / s for i in range(4))
    n = math.sqrt(sum(v * v for v in r)) or 1.0
    return tuple(v / n for v in r)

# ---------------------------------------------------------------- Skelett
# Seiten-Suffix bewusst "_L"/"_R" statt ".L"/".R":
# three.js entfernt Punkte aus Node-Namen (PropertyBinding.sanitizeNodeName),
# aus "UpperArm.L" wuerde beim Laden "UpperArmL". Blender erkennt "_L"/"_R"
# fuer Symmetrie/Spiegelung genauso.
# (name, parent, offset zur Elternposition)  — Ruhepose, Höhe 1.80 m
BONES = [
    ("Root",        None,        (0.000, 0.000, 0.000)),
    ("Hips",        "Root",      (0.000, 0.960, 0.000)),
    ("Spine",       "Hips",      (0.000, 0.120, 0.000)),
    ("Chest",       "Spine",     (0.000, 0.180, 0.000)),
    ("Neck",        "Chest",     (0.000, 0.180, 0.000)),
    ("Head",        "Neck",      (0.000, 0.085, 0.000)),
    ("Visor",       "Head",      (0.000, 0.010, -0.090)),
    ("Backpack",    "Chest",     (0.000, 0.060, 0.115)),
    ("Core",        "Backpack",  (0.000, 0.000, 0.075)),
    ("Shoulder_L",  "Chest",     (-0.172, 0.115, 0.000)),
    ("UpperArm_L",  "Shoulder_L",(-0.075, -0.055, 0.000)),
    ("LowerArm_L",  "UpperArm_L",(0.000, -0.255, 0.000)),
    ("Hand_L",      "LowerArm_L",(0.000, -0.235, 0.000)),
    ("Shoulder_R",  "Chest",     (0.172, 0.115, 0.000)),
    ("UpperArm_R",  "Shoulder_R",(0.075, -0.055, 0.000)),
    ("LowerArm_R",  "UpperArm_R",(0.000, -0.255, 0.000)),
    ("Hand_R",      "LowerArm_R",(0.000, -0.235, 0.000)),
    ("UpperLeg_L",  "Hips",      (-0.092, -0.060, 0.000)),
    ("LowerLeg_L",  "UpperLeg_L",(0.000, -0.440, 0.000)),
    ("Foot_L",      "LowerLeg_L",(0.000, -0.415, 0.000)),
    ("UpperLeg_R",  "Hips",      (0.092, -0.060, 0.000)),
    ("LowerLeg_R",  "UpperLeg_R",(0.000, -0.440, 0.000)),
    ("Foot_R",      "LowerLeg_R",(0.000, -0.415, 0.000)),
]
BONE_INDEX = {b[0]: i for i, b in enumerate(BONES)}

def bone_world(name):
    x = y = z = 0.0
    while name is not None:
        i = BONE_INDEX[name]
        o = BONES[i][2]
        x += o[0]; y += o[1]; z += o[2]
        name = BONES[i][1]
    return (x, y, z)

WORLD = {b[0]: bone_world(b[0]) for b in BONES}

# ---------------------------------------------------------------- Materialien
MATERIALS = [
    # name,           basecolor,               metallic, rough, emissive
    ("Armor",        (0.055, 0.060, 0.075, 1), 0.15, 0.62, (0, 0, 0)),
    ("ArmorLight",   (0.760, 0.790, 0.820, 1), 0.25, 0.42, (0, 0, 0)),
    ("Metal",        (0.300, 0.330, 0.380, 1), 0.85, 0.30, (0, 0, 0)),
    ("Visor",        (0.020, 0.045, 0.060, 1), 0.20, 0.15, (0.10, 0.85, 1.00)),
    ("Accent",       (0.030, 0.180, 0.220, 1), 0.10, 0.35, (0.10, 0.90, 1.00)),
]
MAT = {m[0]: i for i, m in enumerate(MATERIALS)}

# ---------------------------------------------------------------- Geometrie
class Mesh:
    def __init__(self):
        self.pos, self.nrm, self.joint, self.idx = [], [], [], []
        self.mat_of_tri = []

    def poly(self, pts, bone, mat, center):
        """Fläche als Fächer triangulieren; Wicklung automatisch nach aussen."""
        n = len(pts)
        # Normale aus den ersten drei Punkten
        ax = [pts[1][i] - pts[0][i] for i in range(3)]
        bx = [pts[2][i] - pts[0][i] for i in range(3)]
        nx = (ax[1] * bx[2] - ax[2] * bx[1],
              ax[2] * bx[0] - ax[0] * bx[2],
              ax[0] * bx[1] - ax[1] * bx[0])
        ln = math.sqrt(sum(v * v for v in nx)) or 1.0
        nx = tuple(v / ln for v in nx)
        cen = [sum(p[i] for p in pts) / n for i in range(3)]
        out = [cen[i] - center[i] for i in range(3)]
        if sum(nx[i] * out[i] for i in range(3)) < 0:
            pts = list(reversed(pts))
            nx = tuple(-v for v in nx)
        base = len(self.pos) // 3
        j = BONE_INDEX[bone]
        m = MAT[mat]
        for p in pts:
            self.pos += [p[0], p[1], p[2]]
            self.nrm += [nx[0], nx[1], nx[2]]
            self.joint.append(j)
        for k in range(1, n - 1):
            self.idx += [base, base + k, base + k + 1]
            self.mat_of_tri.append(m)

    def prism(self, bone, mat, center, radius, length, axis="x", seg=8, taper=1.0):
        """Mehrkantiges Prisma — fuer Gelenke (Schulter, Ellbogen, Knie, Knoechel).
        Runde Formen an den Drehpunkten verhindern die Luecken, die bei starrem
        Skinning zwischen zwei Kaesten entstehen."""
        ai = {"x": 0, "y": 1, "z": 2}[axis]
        u, v = (ai + 1) % 3, (ai + 2) % 3
        rings = []
        for end in (-1, 1):
            r = radius * (taper if end > 0 else 1.0)
            ring = []
            for i in range(seg):
                a = (i / seg) * math.tau
                p = [0.0, 0.0, 0.0]
                p[ai] = center[ai] + end * length / 2
                p[u] = center[u] + math.cos(a) * r
                p[v] = center[v] + math.sin(a) * r
                ring.append(tuple(p))
            rings.append(ring)
        for i in range(seg):
            j = (i + 1) % seg
            self.poly([rings[0][i], rings[0][j], rings[1][j], rings[1][i]], bone, mat, center)
        self.poly(list(reversed(rings[0])), bone, mat, center)
        self.poly(rings[1], bone, mat, center)

    def box(self, bone, mat, center, size, taper=1.0, bevel=None):
        """Gefaste Box in ABSOLUTEN Ruhepose-Koordinaten.

        Wichtig: glTF-Skinning rechnet skin = jointWorld * inverseBind * vertex.
        Die inverse Bind-Matrix zieht die Knochenposition bereits ab — die
        Vertices muessen deshalb absolut vorliegen. (Beides abzuziehen ergibt
        eine voellig zerrissene Figur.)

        Die Fase ist der Grund, warum die Figur nicht nach Klötzchen aussieht:
        sie erzeugt die schmalen Glanzkanten, die Hartflächen-Panzerung
        ausmachen — und kostet nur ~30 Dreiecke pro Teil.
        """
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        # kraeftigere Fase: nimmt der Panzerung das Klotzige, ohne die
        # klaren Kanten ganz zu verlieren
        c = bevel if bevel is not None else min(0.030, min(hx, hy, hz) * 0.46)
        cx, cy, cz = center

        def P(sx, sy, sz, kind):
            t = taper if sy > 0 else 1.0
            ex = hx * t - (c if kind != "x" else 0)
            ey = hy - (c if kind != "y" else 0)
            ez = hz * t - (c if kind != "z" else 0)
            return (cx + sx * ex, cy + sy * ey, cz + sz * ez)

        S = (-1, 1)
        # 6 Flächen
        for axis, kind in ((0, "x"), (1, "y"), (2, "z")):
            for sgn in S:
                pts = []
                for a in S:
                    for b in S:
                        k = [0, 0, 0]
                        k[axis] = sgn
                        k[(axis + 1) % 3] = a
                        k[(axis + 2) % 3] = b if a > 0 else -b
                        pts.append(P(k[0], k[1], k[2], kind))
                self.poly(pts, bone, mat, center)
        # 12 Kanten
        for axis in range(3):
            o1, o2 = (axis + 1) % 3, (axis + 2) % 3
            for s1 in S:
                for s2 in S:
                    quad = []
                    for along in S:
                        k = [0, 0, 0]
                        k[axis] = along
                        k[o1] = s1
                        k[o2] = s2
                        kinds = ["x", "y", "z"]
                        quad.append(P(k[0], k[1], k[2], kinds[o1]))
                        quad.append(P(k[0], k[1], k[2], kinds[o2]))
                    self.poly([quad[0], quad[1], quad[3], quad[2]], bone, mat, center)
        # 8 Ecken
        for sx in S:
            for sy in S:
                for sz in S:
                    self.poly([P(sx, sy, sz, "x"), P(sx, sy, sz, "y"), P(sx, sy, sz, "z")],
                              bone, mat, center)

    @property
    def tris(self):
        return len(self.idx) // 3


def build_character():
    """Rift Runner — geschichtete Panzerung nach dem Character Sheet.

    Aufbau nach Gruppen statt "viele kleine Wuerfel": jeder Teil ist eine
    bewusst gesetzte, gefaste Platte; Gelenke sind Prismen, damit an Schulter,
    Ellbogen, Knie und Knoechel beim Animieren keine Luecken aufreissen.
    """
    M = Mesh()
    B, P = M.box, M.prism

    # ================= KOPF: Helmschale, Visier, Seitenmodule =================
    B("Head", "ArmorLight", (0, 1.596, -0.012), (0.228, 0.150, 0.246), taper=0.86, bevel=0.048)  # Schale
    B("Head", "ArmorLight", (0, 1.672, -0.004), (0.170, 0.062, 0.190), taper=0.62, bevel=0.040)  # Kalotte
    B("Head", "Metal",      (0, 1.660, 0.010),  (0.048, 0.070, 0.200), taper=0.85)   # Kamm
    B("Head", "Armor",      (0, 1.520, -0.010), (0.196, 0.075, 0.212), bevel=0.036)  # Kinnpartie
    B("Head", "Armor",      (0, 1.556, -0.104), (0.185, 0.105, 0.045))               # dunkles Gesichtsfeld
    B("Head", "Armor",      (0, 1.594, 0.112),  (0.150, 0.100, 0.045))               # Nackenmodul
    B("Head", "Metal",      (0, 1.548, 0.126),  (0.070, 0.045, 0.030))
    for sx in (-1, 1):
        B("Head", "ArmorLight", (sx * 0.116, 1.566, 0.004), (0.036, 0.108, 0.150), taper=0.88)  # Ohrmodul
        B("Head", "Metal",      (sx * 0.132, 1.566, 0.004), (0.014, 0.062, 0.090))
        P("Head", "Metal", (sx * 0.128, 1.566, -0.030), 0.022, 0.020, axis="x", seg=8)
    B("Head", "Metal", (0.086, 1.746, 0.052), (0.011, 0.135, 0.011))                 # Antenne
    B("Head", "Accent", (0.086, 1.812, 0.052), (0.020, 0.022, 0.020))
    # Visier: breites, leicht v-foermiges Leuchtband
    B("Visor", "Visor",  (0, 1.556, -0.118), (0.196, 0.056, 0.036))
    B("Visor", "Accent", (0, 1.556, -0.133), (0.150, 0.026, 0.012))
    for sx in (-1, 1):
        B("Visor", "Visor",  (sx * 0.104, 1.548, -0.096), (0.040, 0.046, 0.060))
        B("Visor", "Accent", (sx * 0.100, 1.542, -0.114), (0.022, 0.014, 0.014))
    P("Neck", "Armor", (0, 1.455, 0.000), 0.056, 0.080, axis="y", seg=10)

    # ================= TORSO: Kragen, Brust, Bauch, Huefte ====================
    B("Chest", "ArmorLight", (0, 1.352, 0.000), (0.352, 0.070, 0.212), taper=0.94)   # Kragenring
    B("Chest", "Armor",      (0, 1.286, 0.000), (0.350, 0.110, 0.228), taper=1.02, bevel=0.042)   # obere Brust
    B("Chest", "Armor",      (0, 1.196, 0.000), (0.330, 0.110, 0.222), taper=1.03, bevel=0.042)   # untere Brust
    B("Chest", "ArmorLight", (0, 1.262, -0.108), (0.230, 0.150, 0.038))              # Brustplatte
    B("Chest", "Metal",      (0, 1.180, -0.100), (0.190, 0.070, 0.034))
    for sx in (-1, 1):
        B("Chest", "Armor", (sx * 0.168, 1.240, -0.020), (0.052, 0.190, 0.170), taper=0.9)
        B("Chest", "Accent", (sx * 0.176, 1.240, -0.076), (0.018, 0.130, 0.016))
    # Energiekern in der Brust: klar sichtbares Dreieck-Motiv
    P("Chest", "Metal",  (0, 1.262, -0.128), 0.052, 0.026, axis="z", seg=6)
    P("Chest", "Accent", (0, 1.262, -0.140), 0.034, 0.022, axis="z", seg=6)
    B("Chest", "Accent", (0, 1.208, -0.126), (0.030, 0.026, 0.014))

    B("Spine", "Armor", (0, 1.108, 0.000), (0.300, 0.100, 0.204), taper=1.0, bevel=0.040)         # Bauch oben
    B("Spine", "Armor", (0, 1.028, 0.000), (0.284, 0.078, 0.196), taper=1.0, bevel=0.036)         # Bauch unten
    B("Spine", "Metal", (0, 1.070, -0.092), (0.150, 0.130, 0.028))
    B("Hips",  "Metal", (0, 0.972, 0.000), (0.316, 0.056, 0.212))                    # Guertel
    B("Hips",  "Accent", (0, 0.972, -0.106), (0.090, 0.024, 0.012))
    B("Hips",  "Armor", (0, 0.912, 0.000), (0.290, 0.100, 0.198), taper=0.96, bevel=0.040)
    for sx in (-1, 1):
        B("Hips", "ArmorLight", (sx * 0.148, 0.926, 0.006), (0.052, 0.120, 0.130), taper=0.86)
    B("Hips", "Metal", (0.156, 0.972, 0.058), (0.038, 0.075, 0.052))                 # Huftmodul (asym.)

    # ================= BACKPACK: kompaktes Energiemodul =======================
    B("Backpack", "Armor",      (0, 1.286, 0.150), (0.246, 0.290, 0.126), taper=0.94)
    B("Backpack", "ArmorLight", (0, 1.396, 0.146), (0.210, 0.062, 0.116), taper=0.86)
    B("Backpack", "Metal",      (0, 1.150, 0.146), (0.180, 0.052, 0.110))
    for sx in (-1, 1):
        B("Backpack", "ArmorLight", (sx * 0.132, 1.286, 0.152), (0.046, 0.230, 0.104), taper=0.9)
        B("Backpack", "Accent",     (sx * 0.150, 1.286, 0.156), (0.014, 0.150, 0.030))
        P("Backpack", "Metal", (sx * 0.104, 1.146, 0.190), 0.030, 0.060, axis="y", seg=6)
    P("Core", "Metal",  (0, 1.300, 0.214), 0.062, 0.040, axis="z", seg=8)
    P("Core", "Accent", (0, 1.300, 0.232), 0.042, 0.026, axis="z", seg=8)

    # ================= ARME ===================================================
    for s_, side in ((-1, "L"), (1, "R")):
        sh, ua, la, hd = f"Shoulder_{side}", f"UpperArm_{side}", f"LowerArm_{side}", f"Hand_{side}"
        X = s_ * 0.248                       # Armachse
        # Schultermodul: zwei Lagen + Gelenkkugel
        B(sh, "ArmorLight", (s_ * 0.212, 1.372, 0.000), (0.148, 0.118, 0.196), taper=0.72)
        B(sh, "ArmorLight", (s_ * 0.234, 1.300, 0.000), (0.104, 0.086, 0.166), taper=0.80)
        B(sh, "Accent",     (s_ * 0.216, 1.322, -0.084), (0.070, 0.016, 0.026))
        P(sh, "Metal", (X, 1.268, 0.000), 0.062, 0.070, axis="x", seg=8)
        # Oberarm
        P(ua, "Armor", (X, 1.180, 0.000), 0.060, 0.200, axis="y", seg=10, taper=0.92)
        B(ua, "ArmorLight", (X, 1.216, -0.044), (0.086, 0.100, 0.040))
        # Ellbogen
        P(la, "Metal", (X, 1.078, 0.000), 0.056, 0.084, axis="x", seg=8)
        P(la, "Armor", (X, 0.980, 0.000), 0.052, 0.190, axis="y", seg=10, taper=0.92)
        B(la, "ArmorLight", (X, 1.020, -0.038), (0.074, 0.090, 0.036))
        B(la, "Accent",     (X, 0.960, -0.048), (0.026, 0.108, 0.012))
        # Handschuh
        P(hd, "Metal", (X, 0.878, 0.000), 0.048, 0.040, axis="x", seg=8)
        B(hd, "Armor",  (X, 0.826, -0.006), (0.096, 0.104, 0.082), taper=0.92)
        B(hd, "Armor",  (X, 0.766, -0.014), (0.084, 0.052, 0.070), taper=0.9)
        B(hd, "Accent", (X, 0.834, -0.046), (0.022, 0.062, 0.010))

    # ================= BEINE ==================================================
    for s_, side in ((-1, "L"), (1, "R")):
        ul, ll, ft = f"UpperLeg_{side}", f"LowerLeg_{side}", f"Foot_{side}"
        X = s_ * 0.092
        P(ul, "Metal", (X, 0.884, 0.000), 0.072, 0.096, axis="x", seg=8)              # Hueftgelenk
        P(ul, "Armor", (X, 0.760, 0.000), 0.088, 0.230, axis="y", seg=12, taper=0.92)     # Oberschenkel
        P(ul, "Armor", (X, 0.598, 0.000), 0.078, 0.150, axis="y", seg=12, taper=0.94)
        B(ul, "ArmorLight", (X, 0.740, -0.078), (0.104, 0.170, 0.040))                # Frontplatte
        B(ul, "Accent",     (X, 0.700, -0.096), (0.024, 0.130, 0.012))
        # Knie
        P(ll, "Metal", (X, 0.518, 0.000), 0.070, 0.104, axis="x", seg=10)
        B(ll, "ArmorLight", (X, 0.520, -0.070), (0.116, 0.116, 0.062), taper=0.86)    # Kniescheibe
        P(ll, "Armor", (X, 0.380, 0.000), 0.070, 0.190, axis="y", seg=12, taper=0.90)     # Wade
        P(ll, "Armor", (X, 0.250, 0.004), 0.060, 0.130, axis="y", seg=12, taper=0.92)
        B(ll, "ArmorLight", (X, 0.330, -0.064), (0.084, 0.190, 0.036))
        B(ll, "Accent",     (X, 0.310, -0.082), (0.024, 0.150, 0.012))
        P(ft, "Metal", (X, 0.148, 0.006), 0.052, 0.086, axis="x", seg=8)              # Knoechel
        # Stiefel: grosse Sohle, kantige Kappe
        B(ft, "Armor",      (X, 0.098, -0.036), (0.150, 0.098, 0.244), taper=0.94, bevel=0.032)
        B(ft, "ArmorLight", (X, 0.108, -0.128), (0.120, 0.078, 0.070), taper=0.88)    # Kappe
        B(ft, "Metal",      (X, 0.034, -0.030), (0.166, 0.050, 0.268))                # Sohle
        B(ft, "Metal",      (X, 0.060, 0.096),  (0.130, 0.070, 0.070))                # Ferse
        B(ft, "Accent",     (X, 0.058, -0.152), (0.060, 0.014, 0.012))
        B(ft, "Accent",     (X * 1.55, 0.086, -0.020), (0.012, 0.044, 0.130))
    return M


# ---------------------------------------------------------------- Animationen
def leg_cycle(t, amp, knee=1.0):
    a = math.sin(t * math.tau)
    return a * amp, max(0.0, -a) * amp * 1.35 * knee

def make_clips():
    """Jeder Clip: (name, dauer, keys) mit keys = [(zeit, {bone: (rx,ry,rz)})]."""
    clips = []

    def cycle(name, dur, steps, fn):
        keys = []
        for i in range(steps + 1):
            t = i / steps
            keys.append((t * dur, fn(t)))
        clips.append((name, dur, keys))

    def locomotion(lean, amp, arm, knee=1.0):
        def pose(t):
            lf, lk = leg_cycle(t, amp, knee)
            rf, rk = leg_cycle(t + 0.5, amp, knee)
            al = math.sin((t + 0.5) * math.tau) * arm
            ar = math.sin(t * math.tau) * arm
            bob = abs(math.sin(t * math.tau)) * 0.04 * amp
            return {
                "Hips": (lean * 0.25, 0, 0),
                "Spine": (lean * 0.45, -math.sin(t * math.tau) * 0.10, 0),
                "Chest": (lean * 0.30, math.sin(t * math.tau) * 0.06, 0),
                "Neck": (-lean * 0.55, 0, 0),
                "UpperLeg_L": (lf, 0, 0), "LowerLeg_L": (-lk, 0, 0), "Foot_L": (lk * 0.35, 0, 0),
                "UpperLeg_R": (rf, 0, 0), "LowerLeg_R": (-rk, 0, 0), "Foot_R": (rk * 0.35, 0, 0),
                "UpperArm_L": (al, 0, 0.10), "LowerArm_L": (-abs(al) * 0.9 - 0.35, 0, 0),
                "UpperArm_R": (ar, 0, -0.10), "LowerArm_R": (-abs(ar) * 0.9 - 0.35, 0, 0),
                "_bob": bob,
            }
        return pose

    # --- Fortbewegung -------------------------------------------------------
    cycle("Walk", 1.00, 8, locomotion(-0.06, 0.42, 0.30))
    cycle("Run", 0.70, 8, locomotion(-0.16, 0.72, 0.62))
    cycle("Sprint", 0.54, 8, locomotion(-0.34, 0.95, 0.85, knee=1.15))

    # --- Idle: ruhiges Atmen -------------------------------------------------
    def idle(t):
        b = math.sin(t * math.tau) * 0.022
        return {
            "Spine": (b * 0.5, 0, 0), "Chest": (-b, 0, 0), "Neck": (b * 0.6, 0, 0),
            "UpperArm_L": (b * 0.8, 0, 0.13), "UpperArm_R": (b * 0.8, 0, -0.13),
            "LowerArm_L": (-0.30, 0, 0), "LowerArm_R": (-0.30, 0, 0),
        }
    cycle("Idle", 2.4, 8, idle)

    # --- Einzelposen / kurze Clips ------------------------------------------
    def pose_clip(name, dur, poses):
        keys = [(dur * p[0], p[1]) for p in poses]
        clips.append((name, dur, keys))

    air = {
        "Hips": (-0.10, 0, 0), "Spine": (-0.12, 0, 0), "Chest": (-0.10, 0, 0),
        "UpperArm_L": (0.70, 0, 0.55), "UpperArm_R": (0.70, 0, -0.55),
        "LowerArm_L": (-0.95, 0, 0), "LowerArm_R": (-0.95, 0, 0),
        "UpperLeg_L": (0.75, 0, 0.06), "LowerLeg_L": (-1.15, 0, 0),
        "UpperLeg_R": (0.30, 0, -0.06), "LowerLeg_R": (-0.60, 0, 0),
    }
    crouch_low = {
        "Hips": (0.30, 0, 0), "Spine": (0.22, 0, 0), "Chest": (0.15, 0, 0), "Neck": (-0.35, 0, 0),
        "UpperLeg_L": (-1.15, 0, 0.10), "LowerLeg_L": (1.75, 0, 0), "Foot_L": (-0.55, 0, 0),
        "UpperLeg_R": (-1.15, 0, -0.10), "LowerLeg_R": (1.75, 0, 0), "Foot_R": (-0.55, 0, 0),
        "UpperArm_L": (-0.35, 0, 0.28), "LowerArm_R": (-1.25, 0, 0),
        "UpperArm_R": (-0.35, 0, -0.28), "LowerArm_L": (-1.25, 0, 0),
    }

    pose_clip("JumpStart", 0.26, [
        (0.0, {"Hips": (0.05, 0, 0)}),
        (0.45, {"Hips": (0.34, 0, 0), "UpperLeg_L": (-0.95, 0, 0), "LowerLeg_L": (1.5, 0, 0),
                "UpperLeg_R": (-0.95, 0, 0), "LowerLeg_R": (1.5, 0, 0),
                "UpperArm_L": (-0.7, 0, 0.2), "UpperArm_R": (-0.7, 0, -0.2)}),
        (1.0, {"Hips": (-0.12, 0, 0), "UpperLeg_L": (0.5, 0, 0), "UpperLeg_R": (0.35, 0, 0),
               "UpperArm_L": (0.9, 0, 0.4), "UpperArm_R": (0.9, 0, -0.4)}),
    ])
    cycle("Jump", 0.8, 4, lambda t: {**air, "Spine": (-0.12 + math.sin(t * math.tau) * 0.04, 0, 0)})
    cycle("Fall", 0.9, 4, lambda t: {
        "Hips": (0.06, 0, 0), "Spine": (0.10, 0, 0), "Neck": (-0.25, 0, 0),
        "UpperArm_L": (-0.15 + math.sin(t * math.tau) * 0.08, 0, 1.05),
        "UpperArm_R": (-0.15 + math.sin(t * math.tau) * 0.08, 0, -1.05),
        "LowerArm_L": (-0.25, 0, 0), "LowerArm_R": (-0.25, 0, 0),
        "UpperLeg_L": (0.30, 0, 0.12), "LowerLeg_L": (-0.55, 0, 0),
        "UpperLeg_R": (0.10, 0, -0.12), "LowerLeg_R": (-0.35, 0, 0),
    })
    pose_clip("Land", 0.34, [
        (0.0, {"Hips": (-0.05, 0, 0), "UpperLeg_L": (0.4, 0, 0), "UpperLeg_R": (0.4, 0, 0)}),
        (0.35, crouch_low),
        (1.0, {"Hips": (0.06, 0, 0), "UpperLeg_L": (-0.15, 0, 0), "LowerLeg_L": (0.25, 0, 0),
               "UpperLeg_R": (-0.15, 0, 0), "LowerLeg_R": (0.25, 0, 0)}),
    ])
    cycle("Crouch", 2.0, 4, lambda t: {**crouch_low,
                                       "Spine": (0.22 + math.sin(t * math.tau) * 0.02, 0, 0)})
    cycle("Slide", 1.2, 4, lambda t: {
        "Hips": (0.55, 0, 0), "Spine": (0.30, 0, 0), "Chest": (0.20, 0, 0), "Neck": (-0.60, 0, 0),
        "UpperLeg_L": (-0.35, 0, 0.10), "LowerLeg_L": (0.25, 0, 0),
        "UpperLeg_R": (-1.30, 0, -0.12), "LowerLeg_R": (1.85, 0, 0),
        "UpperArm_L": (-0.95, 0, 0.30), "LowerArm_L": (-0.55, 0, 0),
        "UpperArm_R": (-0.55 + math.sin(t * math.tau) * 0.05, 0, -0.55), "LowerArm_R": (-0.30, 0, 0),
    })
    # Wallrun: bewusst SEITENNEUTRAL — nur Laufzyklus und leichte Vorlage.
    # Neigung zur Wand, Körperdrehung und der greifende Arm haengen von der
    # Wandseite ab und werden zur Laufzeit gesetzt (GlbCharacter). Stuenden sie
    # fest im Clip, waere an der anderen Wand alles spiegelverkehrt.
    def wallrun(t):
        lf, lk = leg_cycle(t, 0.88)
        rf, rk = leg_cycle(t + 0.5, 0.88)
        al = math.sin((t + 0.5) * math.tau) * 0.75
        ar = math.sin(t * math.tau) * 0.75
        return {
            "Hips": (-0.10, 0, 0), "Spine": (-0.16, 0, 0), "Chest": (-0.08, 0, 0),
            "Neck": (0.16, 0, 0),
            "UpperLeg_L": (lf, 0, 0), "LowerLeg_L": (-lk, 0, 0),
            "UpperLeg_R": (rf, 0, 0), "LowerLeg_R": (-rk, 0, 0),
            "UpperArm_L": (al, 0, 0.10), "LowerArm_L": (-abs(al) * 0.8 - 0.45, 0, 0),
            "UpperArm_R": (ar, 0, -0.10), "LowerArm_R": (-abs(ar) * 0.8 - 0.45, 0, 0),
        }
    cycle("WallRun", 0.62, 8, wallrun)
    pose_clip("WallJump", 0.42, [
        (0.0, {"Hips": (-0.10, 0, -0.28), "UpperArm_R": (-0.5, 0, -1.0)}),
        (0.30, {"Hips": (-0.05, 0, 0.10), "Spine": (-0.20, 0.25, 0.10),
                "UpperArm_L": (-1.05, 0, 0.45), "UpperArm_R": (0.95, 0, -0.35),
                "UpperLeg_L": (-0.85, 0, 0), "LowerLeg_L": (1.25, 0, 0),
                "UpperLeg_R": (0.60, 0, 0)}),
        (1.0, air),
    ])
    pose_clip("Dash", 0.36, [
        (0.0, {"Hips": (-0.15, 0, 0)}),
        (0.25, {"Hips": (-0.48, 0, 0), "Spine": (-0.35, 0, 0), "Chest": (-0.20, 0, 0),
                "Neck": (0.55, 0, 0),
                "UpperArm_L": (-1.25, 0, 0.18), "UpperArm_R": (-1.25, 0, -0.18),
                "LowerArm_L": (-0.15, 0, 0), "LowerArm_R": (-0.15, 0, 0),
                "UpperLeg_L": (-0.55, 0, 0), "LowerLeg_L": (0.85, 0, 0),
                "UpperLeg_R": (0.35, 0, 0), "LowerLeg_R": (-0.30, 0, 0)}),
        (1.0, {"Hips": (-0.30, 0, 0), "Spine": (-0.25, 0, 0),
               "UpperArm_L": (-0.9, 0, 0.16), "UpperArm_R": (-0.9, 0, -0.16)}),
    ])
    # Der Schlag muss aus der Distanz lesbar sein: kurze Ausholphase, dann ein
    # voll durchgestreckter Arm nach vorne, Koerperdrehung und Ausfallschritt.
    # Frame 0 ist bewusst die Ruhepose: der Clip wird zur Laufzeit additiv
    # ueberlagert, damit die Beine weiterlaufen.
    pose_clip("Punch", 0.46, [
        (0.0, {}),
        # ausholen: Faust an die Schulter, Koerper dreht auf
        # Ausholen: rechte Schulter zurueck. rotation.y > 0 dreht nach LINKS,
        # die rechte Schulter geht dabei nach HINTEN -> negativer Wert.
        (0.20, {"Chest": (0, -0.50, 0), "Spine": (0, -0.24, 0), "Hips": (0, -0.15, 0),
                "UpperArm_R": (-0.55, 0, -0.30), "LowerArm_R": (-1.85, 0, 0),
                "UpperArm_L": (0.45, 0, 0.22), "LowerArm_L": (-0.55, 0, 0),
                "Neck": (0, 0.24, 0)}),
        # Treffer: Arm voll ausgestreckt nach vorne, Schulter schiebt nach
        # Treffer: die rechte Schulter schiebt nach vorne -> positiver Wert
        (0.42, {"Chest": (0, 0.62, 0), "Spine": (0, 0.30, 0), "Hips": (0, 0.22, 0),
                "UpperArm_R": (1.62, 0, -0.10), "LowerArm_R": (0.02, 0, 0),
                "UpperArm_L": (-0.60, 0, 0.34), "LowerArm_L": (-1.35, 0, 0),
                "Neck": (0, -0.32, 0), "UpperLeg_R": (0.30, 0, 0), "UpperLeg_L": (-0.22, 0, 0)}),
        # kurz stehen lassen, damit der Treffer sichtbar bleibt
        (0.58, {"Chest": (0, 0.55, 0), "Spine": (0, 0.26, 0), "Hips": (0, 0.18, 0),
                "UpperArm_R": (1.48, 0, -0.12), "LowerArm_R": (-0.10, 0, 0),
                "UpperArm_L": (-0.50, 0, 0.30), "LowerArm_L": (-1.20, 0, 0)}),
        (1.0, {}),
    ])
    pose_clip("Hit", 0.38, [
        (0.0, {}),
        (0.30, {"Hips": (-0.28, 0, 0.12), "Spine": (-0.30, 0.10, 0.10), "Neck": (0.45, 0, -0.15),
                "UpperArm_L": (-0.85, 0, 0.75), "UpperArm_R": (-0.85, 0, -0.75),
                "UpperLeg_L": (0.45, 0, 0), "UpperLeg_R": (0.25, 0, 0)}),
        (1.0, {}),
    ])
    pose_clip("Death", 0.95, [
        (0.0, {}),
        (0.25, {"Hips": (-0.35, 0, 0.15), "Neck": (0.5, 0, -0.2),
                "UpperArm_L": (-1.0, 0, 0.8), "UpperArm_R": (-1.0, 0, -0.8)}),
        (1.0, {"Hips": (0.9, 0.2, 0.35), "Spine": (0.5, 0, 0.2), "Neck": (0.4, 0, 0),
               "UpperLeg_L": (-0.9, 0, 0.3), "LowerLeg_L": (1.4, 0, 0),
               "UpperLeg_R": (-0.7, 0, -0.2), "LowerLeg_R": (1.2, 0, 0),
               "UpperArm_L": (-0.4, 0, 1.0), "UpperArm_R": (-0.4, 0, -1.0)}),
    ])
    # --- Zwei zentrale Vorzeichen-Korrekturen fuer alle Clips ---
    for _, _, keys in clips:
        for _, pose in keys:
            for bone, e in list(pose.items()):
                if bone.startswith("_"):
                    continue          # Hilfswerte wie "_bob" sind keine Knochen
                rx, ry, rz = e
                # (a) Seitliche Ausrichtung: eine positive Z-Drehung schwenkt
                #     BEIDE haengenden Gliedmassen nach +X. "Nach aussen" heisst
                #     also links negativ, rechts positiv.
                if bone.endswith("_L") or bone.endswith("_R"):
                    rz = -rz
                # (b) Ellbogen: der menschliche Arm beugt nach VORNE (Bizeps),
                #     das ist eine positive X-Drehung. Vorher knickte er nach
                #     hinten weg wie ein Vogelbein — das liest sich beim Laufen
                #     wie eine Rueckwaertsbewegung.
                if bone.startswith("LowerArm"):
                    rx = -rx
                pose[bone] = (rx, ry, rz)
    return clips


# ---------------------------------------------------------------- GLB schreiben
class Buf:
    def __init__(self):
        self.data = bytearray()
        self.views = []
        self.accessors = []

    def _pad(self):
        while len(self.data) % 4:
            self.data.append(0)

    def add(self, raw, target=None):
        self._pad()
        off = len(self.data)
        self.data += raw
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(raw)}
        if target:
            v["bufferTarget"] = target
            v["target"] = target
        self.views.append(v)
        return len(self.views) - 1

    def accessor(self, view, ctype, count, atype, mn=None, mx=None):
        a = {"bufferView": view, "componentType": ctype, "count": count, "type": atype}
        if mn is not None:
            a["min"] = mn; a["max"] = mx
        self.accessors.append(a)
        return len(self.accessors) - 1


FLOAT, USHORT, UBYTE = 5126, 5123, 5121


def build_glb(path):
    mesh = build_character()
    clips = make_clips()
    buf = Buf()

    # --- Vertexdaten (nach Material gruppiert -> ein Primitive je Material) ---
    tri_count = mesh.tris
    prims = []
    for mi in range(len(MATERIALS)):
        tris = [t for t in range(tri_count) if mesh.mat_of_tri[t] == mi]
        if not tris:
            continue
        remap, pos, nrm, jnt, wgt, idx = {}, [], [], [], [], []
        for t in tris:
            for k in range(3):
                vi = mesh.idx[t * 3 + k]
                if vi not in remap:
                    remap[vi] = len(pos) // 3
                    pos += mesh.pos[vi * 3:vi * 3 + 3]
                    nrm += mesh.nrm[vi * 3:vi * 3 + 3]
                    jnt += [mesh.joint[vi], 0, 0, 0]
                    wgt += [1.0, 0.0, 0.0, 0.0]
                idx.append(remap[vi])
        n = len(pos) // 3
        mn = [min(pos[i::3]) for i in range(3)]
        mx = [max(pos[i::3]) for i in range(3)]
        vp = buf.add(struct.pack(f"<{len(pos)}f", *pos), 34962)
        vn = buf.add(struct.pack(f"<{len(nrm)}f", *nrm), 34962)
        vj = buf.add(struct.pack(f"<{len(jnt)}B", *jnt), 34962)
        vw = buf.add(struct.pack(f"<{len(wgt)}f", *wgt), 34962)
        vi_ = buf.add(struct.pack(f"<{len(idx)}H", *idx), 34963)
        prims.append({
            "attributes": {
                "POSITION": buf.accessor(vp, FLOAT, n, "VEC3", mn, mx),
                "NORMAL": buf.accessor(vn, FLOAT, n, "VEC3"),
                "JOINTS_0": buf.accessor(vj, UBYTE, n, "VEC4"),
                "WEIGHTS_0": buf.accessor(vw, FLOAT, n, "VEC4"),
            },
            "indices": buf.accessor(vi_, USHORT, len(idx), "SCALAR"),
            "material": mi,
        })

    # --- Knochen-Nodes --------------------------------------------------------
    nodes = []
    for name, parent, off in BONES:
        nodes.append({"name": name, "translation": list(off), "rotation": [0, 0, 0, 1]})
    for i, (name, parent, _) in enumerate(BONES):
        if parent is not None:
            p = BONE_INDEX[parent]
            nodes[p].setdefault("children", []).append(i)

    # Inverse Bind Matrices (nur Translation, Ruhepose ist rotationsfrei)
    ibm = []
    for name, _, _ in BONES:
        w = WORLD[name]
        ibm += [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1]
    v_ibm = buf.add(struct.pack(f"<{len(ibm)}f", *[float(x) for x in ibm]))
    acc_ibm = buf.accessor(v_ibm, FLOAT, len(BONES), "MAT4")

    mesh_node = len(nodes)
    nodes.append({"name": "RiftRunner", "mesh": 0, "skin": 0})
    root_node = len(nodes)
    nodes.append({"name": "Armature", "children": [0, mesh_node]})

    # --- Animationen ----------------------------------------------------------
    animations = []
    for name, dur, keys in clips:
        bones_used = sorted({b for _, pose in keys for b in pose if not b.startswith("_")})
        channels, samplers = [], []
        times = [k[0] for k in keys]
        v_t = buf.add(struct.pack(f"<{len(times)}f", *times))
        acc_t = buf.accessor(v_t, FLOAT, len(times), "SCALAR", [min(times)], [max(times)])
        for b in bones_used:
            quats = []
            for _, pose in keys:
                e = pose.get(b, (0, 0, 0))
                quats += list(quat_from_euler(*e))
            v_q = buf.add(struct.pack(f"<{len(quats)}f", *quats))
            acc_q = buf.accessor(v_q, FLOAT, len(keys), "VEC4")
            samplers.append({"input": acc_t, "output": acc_q, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1,
                             "target": {"node": BONE_INDEX[b], "path": "rotation"}})
        animations.append({"name": name, "channels": channels, "samplers": samplers})

    gltf = {
        "asset": {"version": "2.0", "generator": "RiftRush character generator"},
        "scene": 0,
        "scenes": [{"nodes": [root_node]}],
        "nodes": nodes,
        "meshes": [{"name": "RiftRunner", "primitives": prims}],
        "skins": [{"name": "Armature", "joints": list(range(len(BONES))),
                   "skeleton": 0, "inverseBindMatrices": acc_ibm}],
        "materials": [
            {
                "name": n,
                "pbrMetallicRoughness": {
                    "baseColorFactor": list(c),
                    "metallicFactor": m,
                    "roughnessFactor": r,
                },
                "emissiveFactor": list(e),
                "doubleSided": False,
            } for (n, c, m, r, e) in MATERIALS
        ],
        "animations": animations,
        "bufferViews": buf.views,
        "accessors": buf.accessors,
        "buffers": [{"byteLength": len(buf.data)}],
    }
    for v in gltf["bufferViews"]:
        v.pop("bufferTarget", None)

    js = json.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    bin_ = bytes(buf.data)
    while len(bin_) % 4:
        bin_ += b"\0"
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_))
    glb += struct.pack("<II", len(js), 0x4E4F534A) + js
    glb += struct.pack("<II", len(bin_), 0x004E4942) + bin_

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(glb)
    return {
        "tris": tri_count,
        "materials": len(MATERIALS),
        "bones": len(BONES),
        "clips": [c[0] for c in clips],
        "bytes": len(glb),
    }


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "assets/RiftRush_Player.glb"
    info = build_glb(out)
    print(f"{out}: {info['tris']} Dreiecke, {info['materials']} Materialien, "
          f"{info['bones']} Knochen, {len(info['clips'])} Clips, {info['bytes'] / 1024:.0f} KB")
    print("Clips:", ", ".join(info["clips"]))
