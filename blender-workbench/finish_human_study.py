import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector

out=Path(r'C:\Users\leo_j\Documents\Codex\2026-10-08\como-la-computadora-la-acabo-de\outputs')
body=bpy.data.objects['Humano_Anatomia_Base']
for obj in bpy.context.selected_objects: obj.select_set(False)
body.select_set(True)
bpy.context.view_layer.objects.active=body
if not body.get('continuous_skin'):
    body.data.remesh_voxel_size=.0032
    bpy.ops.object.voxel_remesh()
    sm=body.modifiers.new('Integracion de relieves','SMOOTH')
    sm.factor=.6
    sm.iterations=14
    bpy.ops.object.modifier_apply(modifier=sm.name)
    body['continuous_skin']=True
for poly in body.data.polygons: poly.use_smooth=True
zmin=min(v.co.z for v in body.data.vertices)
for vert in body.data.vertices: vert.co.z-=zmin
body.data.update()

mat=bpy.data.materials.new('Arcilla gris')
mat.use_nodes=True
shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
shader.inputs['Base Color'].default_value=(.24,.27,.29,1)
shader.inputs['Roughness'].default_value=.68
mat.diffuse_color=(.52,.55,.57,1)
body.data.materials.clear()
body.data.materials.append(mat)

scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1
scene.render.resolution_x=1400
scene.render.resolution_y=1400
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
world=bpy.data.worlds.new('Fondo de estudio')
world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs['Color'].default_value=(.13,.145,.16,1)
background.inputs['Strength'].default_value=.35
scene.world=world

presentation=bpy.data.collections.new('Presentacion')
scene.collection.children.link(presentation)
def aim(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

for name,pos,power,size,color in [
    ('Luz principal',(-2.2,-3,3.5),280,2.0,(1,.94,.88)),
    ('Luz relleno',(2.2,-1.5,2.1),100,2.2,(.86,.93,1)),
    ('Luz espalda',(-2.0,2.8,3.0),290,1.8,(1,.97,.92)),
    ('Luz lateral',(2.0,2.2,1.8),110,2.0,(.90,.95,1))]:
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.size=size
    data.color=color
    obj=bpy.data.objects.new(name,data)
    presentation.objects.link(obj)
    obj.location=pos
    aim(obj,(0,0,1))

cameras=[]
for name,pos in [('Camara frente',(0,-6,1.25)),('Camara espalda',(0,6,1.25))]:
    data=bpy.data.cameras.new(name)
    data.type='ORTHO'
    data.ortho_scale=2.20
    data.lens=65
    obj=bpy.data.objects.new(name,data)
    presentation.objects.link(obj)
    obj.location=pos
    aim(obj,(0,-.035,.91))
    cameras.append(obj)
scene.camera=cameras[0]

mesh=bpy.data.meshes.new('Suelo_mesh')
mesh.from_pydata([(-200,-200,-.002),(200,-200,-.002),(200,200,-.002),(-200,200,-.002)],[],[(0,1,2,3)])
mesh.update()
floor=bpy.data.objects.new('Suelo',mesh)
presentation.objects.link(floor)
floor_mat=bpy.data.materials.new('Suelo neutro')
floor_mat.use_nodes=True
bsdf=next(n for n in floor_mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bsdf.inputs['Base Color'].default_value=(.095,.108,.12,1)
bsdf.inputs['Roughness'].default_value=.85
floor.data.materials.append(floor_mat)

bm=bmesh.new()
bm.from_mesh(body.data)
seen=set()
components=[]
for vert in bm.verts:
    if vert in seen: continue
    queue=[vert]
    seen.add(vert)
    count=0
    while queue:
        current=queue.pop()
        count+=1
        for edge in current.link_edges:
            other=edge.other_vert(current)
            if other not in seen:
                seen.add(other)
                queue.append(other)
    components.append(count)
audit={
    'object':body.name,
    'vertices':len(bm.verts),
    'faces':len(bm.faces),
    'connected_components':len(components),
    'non_manifold_edges':sum(not e.is_manifold for e in bm.edges),
    'loose_vertices':sum(not v.link_edges for v in bm.verts),
    'height_m':max(v.co.z for v in bm.verts),
    'rigged':False,
    'notes':'Stylized basic anatomical study. Continuous sculpt mesh, not retopologized for deformation.'}
bm.free()
assert audit['connected_components']==1
assert audit['non_manifold_edges']==0
assert audit['loose_vertices']==0
body['mesh_audit']=json.dumps(audit)

for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.shading.type='SOLID'
            space.shading.color_type='MATERIAL'
            space.overlay.show_overlays=False
            region=space.region_3d
            region.view_location=(0,-.03,.91)
            region.view_rotation=(Vector((1.8,-6,1.3))).to_track_quat('Z','Y')
            region.view_distance=3.6
            region.view_perspective='ORTHO'
for obj in presentation.objects: obj.hide_set(True)

scene.render.filepath=str(out/'humano_Tpose_frente.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'humano_anatomia_Tpose_v01.blend'))
print(json.dumps(audit,indent=2))
print('Saved:',bpy.data.filepath)
