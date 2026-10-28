import bpy, bmesh, math
from mathutils import Vector

study = bpy.data.collections.new("Estudio_Anatomico")
bpy.context.scene.collection.children.link(study)
parts = []

def mesh_obj(name, verts, faces):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    study.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    parts.append(obj)
    return obj

def ellipsoid(name, center, radii, axis=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=1.0)
    rotation = Vector((0,0,1)).rotation_difference(Vector(axis).normalized()) if axis else None
    origin = Vector(center)
    for vert in bm.verts:
        p = Vector((vert.co.x*radii[0], vert.co.y*radii[1], vert.co.z*radii[2]))
        vert.co = origin + (rotation @ p if rotation else p)
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    study.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    parts.append(obj)
    return obj

def limb(name, p, q, profile, n=32):
    profile=smooth_sections(profile,6)
    p, q = Vector(p), Vector(q)
    axis = (q-p).normalized()
    u = Vector((0,1,0)).cross(axis).normalized()
    v = axis.cross(u).normalized()
    verts, faces = [], []
    for t, rx, ry in profile:
        c = p.lerp(q,t)
        for j in range(n):
            a = 2*math.pi*j/n
            verts.append(tuple(c + u*(rx*math.cos(a)) + v*(ry*math.sin(a))))
    rows = len(profile)
    for i in range(rows-1):
        for j in range(n):
            k = (j+1)%n
            faces.append((i*n+j,i*n+k,(i+1)*n+k,(i+1)*n+j))
    faces += [tuple(range(n-1,-1,-1)), tuple((rows-1)*n+j for j in range(n))]
    return mesh_obj(name,verts,faces)

def capsule(name, p, q, radius):
    p,q=Vector(p),Vector(q)
    return ellipsoid(name,(p+q)/2,(radius,radius,(q-p).length/2+radius),q-p)

def smooth_sections(rows, steps=8):
    result=[]
    for i in range(len(rows)-1):
        a,b,c,d=rows[max(0,i-1)],rows[i],rows[i+1],rows[min(len(rows)-1,i+2)]
        for j in range(steps):
            t=j/steps
            values=[b[0]+(c[0]-b[0])*t]
            for k in range(1,len(b)):
                values.append(.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t))
            result.append(tuple(values))
    return result+[rows[-1]]

# Cross sections provide one torso silhouette; muscles only add low relief.
sections=[
 (.865,.083,.067,.074,.015),
 (.900,.127,.088,.100,.009),
 (.960,.151,.092,.106,.007),
 (1.020,.140,.085,.099,.007),
 (1.080,.117,.086,.085,.005),
 (1.140,.118,.091,.081,.000),
 (1.205,.143,.099,.086,.000),
 (1.270,.164,.111,.092,.003),
 (1.340,.186,.119,.103,.005),
 (1.405,.191,.107,.111,.005),
 (1.455,.159,.075,.089,.008),
 (1.480,.079,.061,.068,.009)]
sections=smooth_sections(sections)
verts,faces=[],[]
n=64
for z,rx,front,back,cy in sections:
    for j in range(n):
        a=2*math.pi*j/n
        sine=math.sin(a)
        x=rx*math.cos(a)
        y=cy+sine*(back if sine>=0 else front)
        if sine<0:
            # Rectus abdominis is relief in the wall, not separate round masses.
            relief=0.0
            for az in (1.249,1.183,1.119):
                for ax in (-.041,.041):
                    relief+=.011*math.exp(-(((x-ax)/.036)**4+((z-az)/.027)**4))
            y-=relief*(-sine)**5
            for ax in (-.079,.079):
                y-=.012*math.exp(-(((x-ax)/.076)**4+((z-1.355)/.046)**4))*(-sine)**4
            oblique_x=.106+.18*(z-1.17)
            y-=.010*math.exp(-((abs(x)-oblique_x)/.020)**2-((z-1.17)/.105)**4)*(-sine)**2
            iliac_x=.130+.50*(z-1.005)
            y-=.006*math.exp(-((abs(x)-iliac_x)/.013)**2-((z-.996)/.035)**4)*(-sine)**2
        else:
            ax=abs(x)
            # Scapular plane, its spine, and paired lower-back/gluteal masses.
            a0,a1,a2=Vector((.039,1.418)),Vector((.156,1.403)),Vector((.075,1.289))
            p=Vector((ax,z))
            den=(a1.y-a2.y)*(a0.x-a2.x)+(a2.x-a1.x)*(a0.y-a2.y)
            u=((a1.y-a2.y)*(p.x-a2.x)+(a2.x-a1.x)*(p.y-a2.y))/den
            v=((a2.y-a0.y)*(p.x-a2.x)+(a0.x-a2.x)*(p.y-a2.y))/den
            w=1-u-v
            fade=max(0,min(1,min(u,v,w)/.14))
            y+=.018*fade*fade*(3-2*fade)*sine**3
            sa,sb=Vector((.044,1.407)),Vector((.165,1.432))
            t=max(0,min(1,(p-sa).dot(sb-sa)/(sb-sa).length_squared))
            dist=(p-sa.lerp(sb,t)).length
            y+=.008*math.exp(-(dist/.010)**2)*sine**3
            for bx in (-.079,.079):
                y+=.017*math.exp(-(((x-bx)/.065)**4+((z-.946)/.066)**4))*sine**3
            y+=.004*math.exp(-((ax-.026)/.015)**2-((z-1.238)/.140)**4)*sine**4
        verts.append((x,y,z))
for i in range(len(sections)-1):
    for j in range(n):
        k=(j+1)%n
        faces.append((i*n+j,i*n+k,(i+1)*n+k,(i+1)*n+j))
faces += [tuple(range(n-1,-1,-1)),tuple((len(sections)-1)*n+j for j in range(n))]
mesh_obj("Torso_y_pelvis",verts,faces)
ellipsoid("Cuello",(0,.014,1.521),(.057,.061,.099))
# Smooth cranium, planar facial envelope and chin, without facial features.
head=[
 (1.588,.027,.042,.042,.005),
 (1.610,.048,.061,.059,.000),
 (1.640,.066,.073,.080,.000),
 (1.688,.073,.079,.093,.002),
 (1.742,.074,.078,.093,.006),
 (1.789,.056,.059,.068,.012),
 (1.815,.027,.029,.030,.013),
 (1.823,.004,.005,.005,.013)]
head=smooth_sections(head,6)
verts,faces=[],[]
for z,rx,front,back,cy in head:
    for j in range(48):
        a=2*math.pi*j/48
        sine=math.sin(a)
        verts.append((rx*math.cos(a),cy+sine*(back if sine>=0 else front),z))
for i in range(len(head)-1):
    for j in range(48):
        k=(j+1)%48
        faces.append((i*48+j,i*48+k,(i+1)*48+k,(i+1)*48+j))
faces += [tuple(range(47,-1,-1)),tuple((len(head)-1)*48+j for j in range(48))]
mesh_obj("Cabeza_sin_rostro",verts,faces)

for sign,label in [(1,"R"),(-1,"L")]:
    def mirror(p): return (p[0]*sign,p[1],p[2])
    hip=mirror((.086,.015,.965))
    knee=mirror((.111,-.005,.535))
    ankle=mirror((.131,.017,.125))
    limb("Muslo_"+label,hip,knee,[
        (0,.059,.070),(.12,.084,.088),(.32,.084,.093),
        (.54,.071,.080),(.77,.051,.062),(1,.041,.046)])
    limb("Pierna_"+label,knee,ankle,[
        (0,.042,.046),(.13,.046,.052),(.35,.052,.065),
        (.53,.043,.057),(.78,.027,.035),(1,.021,.026)])
    # Quadriceps, patella, patellar tendon and anterior tibial crest.
    capsule("Vasto_lateral_"+label,mirror((.127,-.024,.895)),mirror((.127,-.024,.650)),.025)
    ellipsoid("Vasto_medial_"+label,mirror((.086,-.023,.611)),(.030,.027,.059),mirror((-.025,0,-1)))
    ellipsoid("Rotula_"+label,mirror((.111,-.035,.543)),(.026,.020,.033))
    capsule("Tendon_rotuliano_"+label,mirror((.111,-.029,.515)),mirror((.112,-.031,.476)),.010)
    capsule("Cresta_tibial_"+label,mirror((.113,-.030,.467)),mirror((.129,-.012,.180)),.010)
    ellipsoid("Maleolo_externo_"+label,mirror((.153,.019,.129)),(.014,.021,.021))
    ellipsoid("Maleolo_interno_"+label,mirror((.112,.016,.143)),(.012,.018,.021))
    ellipsoid("Talon_"+label,mirror((.131,.027,.064)),(.035,.054,.052))
    ellipsoid("Pie_"+label,mirror((.131,-.066,.048)),(.040,.111,.033))
    ellipsoid("Empeine_"+label,mirror((.131,-.023,.078)),(.032,.073,.040))
    ellipsoid("Punta_pie_"+label,mirror((.135,-.150,.043)),(.048,.053,.027))
    shoulder=mirror((.205,.004,1.421))
    elbow=mirror((.500,.004,1.421))
    wrist=mirror((.765,.004,1.421))
    limb("Brazo_"+label,shoulder,elbow,[
        (0,.048,.054),(.18,.064,.064),(.42,.052,.060),
        (.72,.040,.044),(1,.030,.033)])
    ellipsoid("Deltoides_"+label,mirror((.241,.002,1.421)),(.061,.064,.078),mirror((1,0,0)))
    capsule("Biceps_"+label,mirror((.300,-.012,1.421)),mirror((.450,-.012,1.421)),.032)
    capsule("Triceps_"+label,mirror((.300,.020,1.421)),mirror((.464,.020,1.421)),.030)
    limb("Antebrazo_"+label,elbow,wrist,[
        (0,.031,.033),(.19,.041,.039),(.43,.036,.035),
        (.75,.025,.025),(1,.020,.020)])
    ellipsoid("Olecranon_"+label,mirror((.500,.027,1.421)),(.024,.019,.021))
    ellipsoid("Epicondilo_"+label,mirror((.500,.004,1.397)),(.022,.023,.016))
    capsule("Braquiorradial_"+label,mirror((.533,-.012,1.429)),mirror((.659,-.012,1.429)),.020)
    axis=(Vector(wrist)-Vector(elbow)).normalized()
    side=Vector((0,0,1))
    palm=Vector(wrist)+axis*.053
    # Palms face forward. Each finger has an open gap along its free length.
    ellipsoid("Palma_"+label,palm,(.040,.019,.066),axis)
    lengths=[.065,.083,.079,.060]
    for i,offset in enumerate([.034,.011,-.012,-.035]):
        root=Vector(wrist)+axis*.092+side*offset
        tip=root+axis*lengths[i]+side*(offset*.18)
        limb("Dedo_"+label+"_"+str(i),root-axis*.005,tip,[
            (0,.009,.008),(.15,.009,.008),(.45,.008,.0075),
            (.72,.0075,.007),(.90,.0065,.0065),(.98,.0035,.0035),(1,.001,.001)],24)
    thumbroot=Vector(wrist)+axis*.042+side*.025
    thumbjoint=thumbroot+axis*.020+side*.027
    thumbtip=thumbjoint+axis*.034+side*.013
    capsule("Pulgar_base_"+label,thumbroot,thumbjoint,.011)
    limb("Pulgar_punta_"+label,thumbjoint,thumbtip,[
        (0,.010,.009),(.35,.010,.009),(.75,.008,.008),(.94,.005,.005),(1,.001,.001)],24)
    # Pectorals, abdominal wall and clavicles stay attached to the core.
    capsule("Clavicula_"+label,mirror((.026,-.055,1.458)),mirror((.158,-.035,1.456)),.011)
    capsule("Esternocleidomastoideo_"+label,mirror((.040,-.008,1.573)),mirror((.020,-.035,1.470)),.010)
    capsule("Trapecio_"+label,mirror((.038,.055,1.501)),mirror((.180,.044,1.431)),.034)

bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
body=bpy.context.object
body.name="Humano_Anatomia_Base"
body.data.name="Humano_Anatomia_Malla"
body["purpose"]="Basic faceless anatomical study; not rigged or game-ready topology"
body["landmarks"]="Scapulae, clavicles, abdomen, iliac crests, patellae, tibiae, elbows, malleoli"
body["height_target_m"]=1.82
body["pose"]="T-pose; palms forward; individually separated fingers"
bpy.app.driver_namespace["anatomy_body_name"]=body.name
print("Volumen construido:",body.name,"vertices:",len(body.data.vertices),"partes:",len(parts))
