#!/usr/bin/env python3
"""
Baut den "Rift Runner" in Blender auf und speichert RiftRush_Player.blend.

    blender --background --python tools/build_riftrush_player_blender.py

Das Skript benutzt exakt dieselben Definitionen wie tools/build_player_glb.py
(Skelett, Geometrie, Materialien, Animationen) — beide Ergebnisse können also
nicht auseinanderlaufen. Wer die Figur ändern will, ändert entweder dort die
Daten oder arbeitet anschliessend direkt in der .blend weiter.

Optional exportiert es auch gleich das GLB:
    blender --background --python tools/build_riftrush_player_blender.py -- --glb
"""
import os
import sys
import math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from build_player_glb import BONES, BONE_INDEX, WORLD, MATERIALS, build_character, make_clips  # noqa: E402

try:
    import bpy
    from mathutils import Vector, Euler
except ImportError:  # pragma: no cover - nur ausserhalb von Blender
    print("Dieses Skript muss in Blender laufen:")
    print("  blender --background --python tools/build_riftrush_player_blender.py")
    sys.exit(1)

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BLEND = os.path.join(OUT_DIR, "RiftRush_Player.blend")
GLB = os.path.join(OUT_DIR, "assets", "RiftRush_Player.glb")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_materials():
    mats = []
    for name, color, metallic, rough, emis in MATERIALS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = rough
        # Emission-Eingänge heissen je nach Blender-Version unterschiedlich
        for key in ("Emission Color", "Emission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (emis[0], emis[1], emis[2], 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 1.0 if any(emis) else 0.0
        mats.append(m)
    return mats


def make_armature():
    arm_data = bpy.data.armatures.new("Armature")
    arm_obj = bpy.data.objects.new("Armature", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    ebones = {}
    for name, parent, _ in BONES:
        eb = arm_data.edit_bones.new(name)
        head = Vector(WORLD[name])
        # Tail: Richtung des ersten Kindes, sonst ein kurzer Standard-Stummel
        children = [b for b in BONES if b[1] == name]
        if children:
            eb.tail = Vector(WORLD[children[0][0]])
            if (eb.tail - eb.head).length < 0.02:
                eb.tail = head + Vector((0, 0.06, 0))
        else:
            eb.tail = head + Vector((0, -0.09, 0)) if "Foot" in name or "Hand" in name \
                else head + Vector((0, 0.09, 0))
        eb.head = head
        ebones[name] = eb
    for name, parent, _ in BONES:
        if parent:
            ebones[name].parent = ebones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def make_mesh(mats, arm_obj):
    src = build_character()
    verts = [(src.pos[i * 3], src.pos[i * 3 + 1], src.pos[i * 3 + 2])
             for i in range(len(src.pos) // 3)]
    faces = [tuple(src.idx[t * 3:t * 3 + 3]) for t in range(src.tris)]

    me = bpy.data.meshes.new("RiftRunner")
    me.from_pydata(verts, [], faces)
    me.validate()
    for m in mats:
        me.materials.append(m)
    for i, poly in enumerate(me.polygons):
        poly.material_index = src.mat_of_tri[i]
        poly.use_smooth = False

    obj = bpy.data.objects.new("RiftRunner", me)
    bpy.context.collection.objects.link(obj)

    # Starres Skinning: jeder Vertex mit Gewicht 1 an genau einen Knochen.
    # Bei Hartflächen-Panzerung ist das gewollt — keine Verzerrung an den
    # Gelenken, exakt wie im Character Sheet gefordert.
    groups = {}
    for name, _, _ in BONES:
        groups[name] = obj.vertex_groups.new(name=name)
    for vi, j in enumerate(src.joint):
        groups[BONES[j][0]].add([vi], 1.0, "REPLACE")

    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_obj
    obj.parent = arm_obj
    return obj


def make_actions(arm_obj):
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"

    fps = bpy.context.scene.render.fps
    for name, dur, keys in make_clips():
        action = bpy.data.actions.new(name)
        arm_obj.animation_data_create()
        arm_obj.animation_data.action = action
        for pb in arm_obj.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
        for t, pose in keys:
            frame = 1 + t * fps
            for pb in arm_obj.pose.bones:
                e = pose.get(pb.name)
                pb.rotation_quaternion = Euler(e if e else (0, 0, 0), "XYZ").to_quaternion()
                pb.keyframe_insert("rotation_quaternion", frame=frame)
        action.use_fake_user = True        # ueberlebt das Speichern
    bpy.ops.object.mode_set(mode="OBJECT")


def main():
    clear_scene()
    mats = make_materials()
    arm = make_armature()
    make_mesh(mats, arm)
    make_actions(arm)

    os.makedirs(os.path.dirname(GLB), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print(f"gespeichert: {BLEND}")

    if "--glb" in sys.argv:
        bpy.ops.export_scene.gltf(
            filepath=GLB, export_format="GLB",
            export_animations=True, export_skins=True,
            export_apply=False, export_yup=True,
        )
        print(f"exportiert: {GLB}")


if __name__ == "__main__":
    main()
