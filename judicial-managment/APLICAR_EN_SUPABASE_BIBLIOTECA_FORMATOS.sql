-- Biblioteca generada desde ejemplos sanitizados. No contiene datos personales originales.

create table if not exists public.legal_drafting_examples (
  id text primary key,
  title text not null,
  kind text not null,
  matter text not null,
  keywords jsonb not null default '[]'::jsonb,
  structure jsonb not null default '[]'::jsonb,
  source_excerpt text not null,
  sanitized_docx_path text,
  redaction_counts jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  library_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_legal_drafting_examples_active_matter
  on public.legal_drafting_examples (is_active, matter);

alter table public.legal_drafting_examples enable row level security;

drop policy if exists "Authenticated users can read sanitized drafting examples" on public.legal_drafting_examples;
create policy "Authenticated users can read sanitized drafting examples"
  on public.legal_drafting_examples
  for select
  to authenticated
  using (is_active = true);

create or replace function public.search_drafting_examples(
  search_text text,
  matter_filter text default null,
  result_limit integer default 1
)
returns table (
  id text,
  title text,
  kind text,
  matter text,
  keywords jsonb,
  structure jsonb,
  source_excerpt text,
  sanitized_docx_path text,
  redaction_counts jsonb,
  score integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with search_input as (
    select lower(coalesce(search_text, '')) as query,
           lower(coalesce(matter_filter, '')) as requested_matter
  )
  select
    example.id,
    example.title,
    example.kind,
    example.matter,
    example.keywords,
    example.structure,
    example.source_excerpt,
    example.sanitized_docx_path,
    example.redaction_counts,
    (
      case when input.requested_matter <> '' and lower(example.matter) = input.requested_matter then 12 else 0 end
      + case when input.query like '%' || lower(example.kind) || '%' then 10 else 0 end
      + case when lower(example.title) like '%' || input.query || '%' then 4 else 0 end
      + case when lower(example.keywords::text) like '%' || input.query || '%' then 3 else 0 end
    )::integer as score
  from public.legal_drafting_examples as example
  cross join search_input as input
  where example.is_active = true
  order by score desc, example.updated_at desc, example.title asc
  limit greatest(1, least(coalesce(result_limit, 1), 3));
$$;

grant execute on function public.search_drafting_examples(text, text, integer) to authenticated;

notify pgrst, 'reload schema';

insert into public.legal_drafting_examples (
  id, title, kind, matter, keywords, structure, source_excerpt, sanitized_docx_path, redaction_counts
) values
(
  'escrito-01-demanda-mercantil',
  'Ejemplo 01 - Demanda Mercantil',
  'demanda mercantil',
  'mercantil',
  '["accion proforma","compraventa","demanda mercantil","escritura","mercantil"]'::jsonb,
  '["JUICIO ORDINARIO CIVIL","ACCION PROFORMA","SUMA PETITORIA: ESCRITO INICIAL DE DEMANDA.","C. [NOMBRE] CIVIL.","P R E S E N T E.-","PRESTACIONES.","HECHOS","DERECHO","ACCION PROFORMA U OTORGAMIENTO Y FIRMA DE ESCRITURA. IMPRESCRIPTIBILIDAD DE LA.","SEXTO TRIBUNAL COLEGIADO EN MATERIA CIVIL XXX PRIMER CIRCUITO.","TERCER TRIBUNAL COLEGIADO EN MATERIA CIVIL XXX PRIMER CIRCUITO.","ACCIÓN PROFORMA. PARA SU [NOMBRE] LA REALIZACIÓN DE UN [NOMBRE] LA LEY (COMPRAVENTA)."]'::jsonb,
  'JUICIO ORDINARIO CIVIL
ACCION PROFORMA
SUMA PETITORIA: ESCRITO INICIAL DE DEMANDA.
C. [NOMBRE] CIVIL.
P R E S E N T E.-
[NOMBRE], mexicano, mayor de edad, señalando como [NOMBRE] X [NOMBRE] XX [NOMBRE] XX [NOMBRE] XX. 357 Poniente Planta baja de la [NOMBRE] XX [NOMBRE]; autorizando para imponerse de los autos que se originen a los CC. LIC’S, [NOMBRE], [NOMBRE], [NOMBRE], [NOMBRE]; y XXX fundamento en lo dispuesto por el artículo 156 XXX Código Procesal Civil vigente en el Estado, vengo a solicitar atentamente a su Señoría se sirva autorizar para vía internet en forma virtual el expediente en el cual comparezco, XXX el correo previamente registrado siendo el siguiente: XXXXXXXXXXXXXXXXXXXXX.XXX; Manifestando Bajo Protesta de Decir Verdad, que tengo conocimiento que la información que se encuentra en el expediente virtual, es menester de carácter informativo y para efectos de consulta exclusivamente, en virtud de que las constancias originales obran en el expediente de origen que se encu

[... estructura intermedia omitida ...]

 se publicó el viernes 06 de diciembre de 2019 a las 10:18 horas en el Semanario Judicial de la Federación.
ACCIÓN PROFORMA. PARA SU [NOMBRE] LA REALIZACIÓN DE UN [NOMBRE] LA LEY (COMPRAVENTA).
La acción proforma procede cuando la ley exija determinada forma para un contrato y ésta no se hubiere realizado; de manera que como requisito de procedencia de la acción está acreditar la voluntad de las partes para celebrarl',
  'assets/drafting-examples/docx/escrito-01-demanda-mercantil-mercantil.docx',
  '{"address":13,"case_number":3,"context_name":6,"email":1,"filename_name":52,"named_context":2,"placeholder_context_name":6,"placeholder_uppercase_name":42,"uppercase_name":48}'::jsonb
),
(
  'escrito-02-amparo',
  'Ejemplo 02 - Amparo',
  'amparo',
  'federal',
  '["acto reclamado","amparo","federal","garantias"]'::jsonb,
  '["TRIBUNAL COLEGIADO EN MATERIA CIVIL Y DE TRABAJO XXX OCTAVO CIRCUITO.","P R E S E N T E. –","CONCEPTOS DE VIOLACIÓN"]'::jsonb,
  'TRIBUNAL COLEGIADO EN MATERIA CIVIL Y DE TRABAJO XXX OCTAVO CIRCUITO.
P R E S E N T E. –
[NOMBRE], mexicana, mayor de edad, quejosa y actora en el juicio tramitado en la Vía Especial de Seguridad Social de donde emana el acto reclamado que citaré en la parte conducente de la presente Demanda de Garantías y XXX tal carácter, autorizo a los CC. LIC’S. [NOMBRE], [NOMBRE], [NOMBRE], para imponerse de autos y recibir toda clase de documentos, señalando como [NOMBRE] X [NOMBRE] XX XXXXXXX XX [NOMBRE] XX XXXXXXX, XXXXXXXX; así mismo atentamente solicito se me autorice al acceso al expediente electrónico dentro XXX portal de servicios en línea XXX poder judicial de la federación, bajo el XXXXXX XX usuario XXXXXXXXXXXXX; comparezco XXX el debido respeto que me merecen los integrantes de este órgano de control constitucional a exponer:
Que XXX fundamento en los artículos 103 Fracción I y 107 Fracciones I y V Inciso d) de la Constitución General de la República; 76, 79 fracción V, 170, 171 y 172 

[... estructura intermedia omitida ...]

egislador menciona que si la parte demandada en este caso el Instituto Mexicano XXX Seguro Social (IMSS) no dio contestacion a la demanda instaurada en su contra, se le debe de hacer efectivo el aprecibimiento que viene contenido en el articulo antes mencionado, por tanto debio de tener por admitidas las peticiones de la parte actora, en este caso de la C. [NOMBRE], salvo aquellas que sean contrarias a derecho, que a',
  'assets/drafting-examples/docx/escrito-02-amparo-federal.docx',
  '{"address":3,"case_number":6,"context_name":1,"credential":1,"filename_name":85,"named_context":2,"placeholder_context_name":1,"placeholder_uppercase_name":35,"uppercase_name":37}'::jsonb
),
(
  'escrito-03-contestacion',
  'Ejemplo 03 - Contestacion',
  'contestacion',
  'civil',
  '["civil","contestacion","defensas","excepciones"]'::jsonb,
  '["SUMA: SE CONTESTA DEMANDA","C. [NOMBRE]","P R E S E N T E.-","A LAS P R E S T A C I O N E S.-","A LOS HECHOS","EXCEPCIONES Y DEFENSAS","AL DERECHO","A LAS PRUEBAS"]'::jsonb,
  'EXPEDIENTE No. XXXX/XXXX
SUMA: SE CONTESTA DEMANDA
C. [NOMBRE]
P R E S E N T E.-
[NOMBRE], mexicana, mayor de edad; señalando como [NOMBRE] X [NOMBRE] XX XXXXXXXXXXXXXX XX XXXXXXX XX XXX. Juarez Numero 357 Poniente Planta Baja de la [NOMBRE] XX [NOMBRE] XX [NOMBRE], [NOMBRE] XX XX XXXXXX X [NOMBRE] X XXXXXXXX, [NOMBRE] todas las facultades previstas por el artículo 1069 XXX Código de Comercio en vigor a los CC. LICENCIADOS, [NOMBRE], [NOMBRE], [NOMBRE]; ante Usted XXX merecido respeto comparezco y EXPONGO:
Que en tiempo y en forma, por medio XXX presente escrito vengo a dar contestación a la Infundada demanda instaurada en mi contra por la endosataria en propiedad C. [NOMBRE], permitiéndome materializarla en los términos siguientes:
A   LAS   P R E S T A C I O N E S.-
A).- En efecto, niego que la parte actora tenga acción y derecho a reclamarme la prestación identificada en este correlativo, esto virtud de que a la fecha jamás he firmado ningún pagare a favor de [NOMBRE] ni he tenido t

[... estructura intermedia omitida ...]

encia definitiva, colocando a la actora en consecuencia, a ser condenada al pago de gastos y costas que origine el presente juicio por intentar una acción totalmente improcedente y contraria a derecho.
A LAS PRUEBAS
En cuanto a las pruebas ofrecidas por la actora, desde este momento se solicita atentamente a el H. Tribunal, se tenga por hecha la objeción de las mismas en cuanto a su fuerza y eficacia demostrativa, es',
  'assets/drafting-examples/docx/escrito-03-contestacion-civil.docx',
  '{"address":4,"case_number":4,"context_name":6,"filename_name":52,"placeholder_context_name":6,"placeholder_uppercase_name":30,"uppercase_name":37}'::jsonb
),
(
  'escrito-04-convenio',
  'Ejemplo 04 - Convenio',
  'convenio',
  'familiar',
  '["alimentos","convenio","convivencia","familiar"]'::jsonb,
  '["EXPEDIENTE: XXXX/[NOMBRE]","VS.","MAYRA XXXXXXX MARTINEZ JUICIO EJECUTIVO MERCANTIL","CONVENIO JUDICIAL","C. [NOMBRE] MERCANTIL","P R E S E N T E.-","C L Á U S U L A S","PROTESTAMOS LO NECESARIO","LIC. [NOMBRE],","C. [NOMBRE] [NOMBRE]"]'::jsonb,
  'EXPEDIENTE: XXXX/[NOMBRE]
VS.
MAYRA XXXXXXX MARTINEZ JUICIO EJECUTIVO MERCANTIL
CONVENIO JUDICIAL
C. [NOMBRE] MERCANTIL
P R E S E N T E.-
LIC. [NOMBRE], en mi calidad de endosatario en procuración de la C. [NOMBRE], XXX el carácter de parte actora y [NOMBRE], por mi propio derecho, XXX el carácter de parte demandada, personalidades que tenemos debidamente acreditadas y reconocidas en los autos XXX expediente indicado al rubro; ante Usted XXX el debido respeto comparecemos para exponer:
Que, por medio XXX presente ocurso, venimos de común acuerdo a celebrar el presente CONVENIO JUDICIAL, que pone fin a la controversia suscitada en el presente juicio, sujetándonos al tenor de las siguientes:
C L Á U S U L A S
PRIMERA. - RECONOCIMIENTO DE ADEUDO. La demandada, la C. [NOMBRE], reconoce expresamente adeudar a la actora, la C. [NOMBRE], la cantidad de $30,000.00 ([NOMBRE] XX/XXX M.N.) como suerte principal reclamada en el presente juicio.
SEGUNDA. – FORMA Y ÉPOCAS DE PAGO. Las partes pactan 

[... estructura intermedia omitida ...]

ando CONVENIO JUDICIAL en los precisos términos de las cláusulas que anteceden para poner fin al litigio.
SEGUNDO. - Aprobar el presente convenio en todas y cada una de sus partes, elevándolo a la categoría de [NOMBRE] y obligando a las partes a estar y pasar por él.
PROTESTAMOS LO NECESARIO
Torreón, Coahuila; a 4 de Marzo XXX 2026.
LIC. [NOMBRE],
en su calidad de endosatario en procuración de la
C. [NOMBRE] [NOMBRE]',
  'assets/drafting-examples/docx/escrito-04-convenio-familiar.docx',
  '{"address":1,"case_number":5,"context_name":7,"filename_name":15,"placeholder_context_name":7,"placeholder_uppercase_name":15,"uppercase_name":24}'::jsonb
),
(
  'escrito-05-recurso-de-queja',
  'Ejemplo 05 - Recurso De Queja',
  'recurso de queja',
  'federal',
  '["agravio","federal","queja","recurso","recurso de queja"]'::jsonb,
  '["EXPEDIENTE NUMERO: XXX/XXXX","H. TRIBUNAL LABORAL XXX DISTRITO JUDICIAL DE TORREÓN.","PRESENTE. -","PROTESTO LO NECESARIO.","TORREÓN, COAHUILA; 24 DE [NOMBRE] 2026.","[NOMBRE]."]'::jsonb,
  'EXPEDIENTE NUMERO: XXX/XXXX
H. TRIBUNAL LABORAL XXX DISTRITO JUDICIAL DE TORREÓN.
PRESENTE. -
[NOMBRE], de generales ya conocidas dentro de los autos XXX juicio al rubro indicado XXX el debido respeto que me merece este H. Tribunal Laboral comparezco para exponer:
Por medio XXX presente escrito y visto el acuerdo de fecha 28 de enero XXX 2026, en tiempo y forma vengo a dar cumplimiento a la prevención realizada al suscrito por este H. Tribunal Obrero de la siguiente forma:
1.- el [NOMBRE] XXXXXXXX X XXXXXXXX XX XX XXXXXX XX [NOMBRE].
2.- Se acompaña al presente escrito memoria USB como trasladó para la demandada.
3.- El pago de las vacaciones y prima vacacional XXX último año de trabajo de manera completa.
4.- El pago XXX aguinaldo XXX último año de trabajo
5.- Forma de contratación verbal.
6.- Mi jornada laboral era de las 9:00 horas de las 18:00 horas de lunes a Sábado de cada semana hasta el día 25 de Marzo XXX año 2025 que me cambiaron el horario de las 11:30 horas a las 21:00 hora

[... estructura intermedia omitida ...]

 ZARAGOZA, X.X. 27087 minutos después la que hubiere sido mi hora de entrada a laborar las 11:30 horas XXX 4 de Octubre XXX año 2025.
Por lo anteriormente expuesto y fundado a este H. Tribunal Obrero, respetuosamente le solicito:
UNICO. – Acordad de conformidad a derecho mi petición por ser ajustada a derecho.
PROTESTO LO NECESARIO.
TORREÓN, COAHUILA; 24 DE [NOMBRE] 2026.
___________________________________
[NOMBRE].',
  'assets/drafting-examples/docx/escrito-05-cumplimiento-de-prevencion-civil.docx',
  '{"address":5,"case_number":1,"filename_name":42,"placeholder_uppercase_name":21,"uppercase_name":21}'::jsonb
),
(
  'escrito-06-demanda-familiar',
  'Ejemplo 06 - Demanda Familiar',
  'demanda familiar',
  'familiar',
  '["convivencia","custodia","demanda familiar","familiar","menores","pension"]'::jsonb,
  '["PRESENTE.-","PRESTACIONES"]'::jsonb,
  'JUEZ FAMILIAR DE PRIMERA INSTANCIA EN TURNO XXX DISTRITO JUDICIAL DE TORREÓN, COAHUILA DE ZARAGOZA.
PRESENTE.-
[NOMBRE]  por mi propio derecho y señalando como [NOMBRE] X [NOMBRE] XX XXXXXXXXXX X XXXXXXXXXXXXXX XX [NOMBRE], [NOMBRE] XX [NOMBRE] XX [NOMBRE] número de cédula profesional  número XXXXXXXX; autorizando en términos XXX 8 y 215 XXX Código Nacional de Procedimientos Civiles y Familiares a la pasante de Derecho___, XXX el debido respeto comparezco y expongo.
Por otro lado, me permito solicitar la autorización XXX expediente digital en forma virtual, así como el uso XXX buzón electrónico de demandas y promociones; al efecto proporciono el correo electrónico ya registrado.
Que por medio XXX presente escrito vengo a promover demanda familiar de GUARDIA Y CUSTODIA en contra de [NOMBRE], quien puede ser emplazado a juicio en [NOMBRE] XX XX [NOMBRE], XXXXXX, XXXXXX, XXXXXXXX X X XXXXX XX [NOMBRE].
PRESTACIONES
La guardia y custodia provisional y en su momento de manera definitiva de 

[... estructura intermedia omitida ...]

specto a una guardia y custodia definitiva.
III.- Se solicita una medida de restricción XXX padre a XXX la solicitante, para efecto de salvaguardar mi seguridad y salud psicológica. Pudiendo decretar “siempre que tenga que acercarse a mi persona por razones XXX niño tendría que hacerlo en presencia de una persona tercera, mayor de edad y de mi confianza; pues considero existen elementos suficientes para acreditar que',
  'assets/drafting-examples/docx/escrito-06-demanda-familiar-familiar.docx',
  '{"address":12,"context_name":2,"filename_name":157,"long_number":2,"named_context":5,"placeholder_context_name":2,"placeholder_uppercase_name":75,"uppercase_name":77}'::jsonb
),
(
  'escrito-07-denuncia',
  'Ejemplo 07 - Denuncia',
  'denuncia',
  'penal',
  '["denuncia","hechos","ministerio publico","penal"]'::jsonb,
  '["SUMA: SE [NOMBRE] DE HECHOS","AGENTE INVESTIGADOR XXX MINISTERIO PÚBLICO EN TURNO.","P R E S E N T E.-","H E C H O S","CONFIGURACIÓN DE DELITO","([NOMBRE] PÁRRAFO, P.O. 28 DE NOVIEMBRE DE 2023) XXXXXXXX"]'::jsonb,
  'SUMA: SE [NOMBRE] DE HECHOS
AGENTE INVESTIGADOR XXX MINISTERIO PÚBLICO EN TURNO.
P R E S E N T E.-
[NOMBRE], mexicano, mayor de edad, señalando como [NOMBRE] X [NOMBRE] XX XXXXXXX XX XX. Juárez No. 357 Poniente Planta baja [NOMBRE] XX [NOMBRE] XX [NOMBRE]; designando al C. LIC. [NOMBRE] Y [NOMBRE], ante esta H. Representación Social como Asesores Jurídicos en términos de los artículos 110 XXX código Nacional de Procedimientos Penales; a fin de que representen mis intereses y ejerzan mi defensa y asesoría legal profesionalmente; ante Usted, respetuosamente comparezco a exponer:
Por este conducto, XXX fundamento en lo dispuesto en el Artículo 8 de la Constitución Política de los Estados Unidos Mexicanos y 108 y 109 y demás relativos y aplicables XXX Código Nacional de Procedimientos Penales, ocurro a interponer DENUNCIA; en contra de [NOMBRE] Y [NOMBRE], quienes tiene como XXXXXXXXX XX XXXXXXX XX [NOMBRE] XX [NOMBRE] XX [NOMBRE] XX [NOMBRE], XX XXXXXXXX XX [NOMBRE] XX X XX XXX XXdigo Pen

[... estructura intermedia omitida ...]

añera civil, compañero o ex-compañero civil, pariente consanguíneo en línea recta ascendente o descendente sin limitación de grado, o pariente colateral consanguíneo o por afinidad hasta el cuarto grado, así como contra el adoptante, adoptado o adoptada, o respecto a quien tenga o haya tenido una relación de pareja o noviazgo, al igual que contra cualquiera otra persona que esté sujeta a la custodia, guarda',
  'assets/drafting-examples/docx/escrito-07-denuncia-penal.docx',
  '{"address":8,"case_number":1,"context_name":8,"credential":1,"filename_name":58,"named_context":3,"placeholder_context_name":9,"placeholder_uppercase_name":66,"uppercase_name":74}'::jsonb
),
(
  'escrito-08-demanda-civil',
  'Ejemplo 08 - Demanda Civil',
  'demanda civil',
  'civil',
  '["arrendamiento","civil","demanda civil","desahucio","desocupacion"]'::jsonb,
  '["[NOMBRE]","XXXXX XXXXXXX XXXXXX XXXXXXXX","SUMA: SE PRESENTA DEMANDA DE DESAHUCIO","C. [NOMBRE] CIVIL EN TURNO","PRESENTE. -","P R E S T A C IO N E S","H E C H O S","ARRENDAMIENTO. [NOMBRE] DE [NOMBRE].","DERECHO","PROTESTO LO NECESARIO","TORREON COAH; A 18 DE [NOMBRE] 2026."]'::jsonb,
  '[NOMBRE]
VS
XXXXX XXXXXXX XXXXXX XXXXXXXX
SUMA: SE PRESENTA DEMANDA DE DESAHUCIO
C. [NOMBRE] CIVIL EN TURNO
PRESENTE. -
[NOMBRE], mexicana, mayor de edad, señalando como [NOMBRE] X [NOMBRE] XX XXXXXXX XX [NOMBRE], [NOMBRE], [NOMBRE], XX [NOMBRE], [NOMBRE] XXXXXXo me permito autorizar para que en mi nombre y representación las reciba, escuchen y se impongan de todos los autos XXX presente expediente a los CC. LIC`S, [NOMBRE], [NOMBRE], [NOMBRE], [NOMBRE], [NOMBRE]; así mismo solicito atentamente se me autorice el acceso al expediente virtual XXX el correo electrónico XXXXXXXXXXXXXXXXXXXXX.XXX; XXX el debido respeto que me merece su señoría comparezco para exponer:
Que, por medio XXX presente escrito, XXX fundamento en los artículos 766, 767, 769, 770, 772, 773 y 774 XXX Código Procesal Civil Vigente para el Estado de Coahuila, vengo a promover juicio de desahucio en contra de la C. [NOMBRE], quien puede ser legalmente emplazada a juicio, en el [NOMBRE] XX [NOMBRE] XX [NOMBRE] XX XXXXXX 

[... estructura intermedia omitida ...]

PRIMERO. - Se me tenga por presentando el presente Juicio de Desahucio.
SEGUNDO. - Se le requiera a la demandada y conteste lo que a su derecho convenga en términos de ley; solicitando desde este momento se le embraguen y depositen bienes bastantes para cubrir las rentas atrasadas.
TERCERO. - Acordar de conformidad mi solicitud por ser justa y legal.
PROTESTO LO NECESARIO
TORREON COAH; A 18 DE [NOMBRE] 2026.
[NOMBRE]',
  'assets/drafting-examples/docx/escrito-08-demanda-civil-civil.docx',
  '{"address":4,"case_number":10,"context_name":2,"email":1,"filename_name":41,"placeholder_context_name":2,"placeholder_uppercase_name":36,"relationship_email":1,"uppercase_name":39}'::jsonb
),
(
  'escrito-09-recurso-de-queja',
  'Ejemplo 09 - Recurso De Queja',
  'recurso de queja',
  'federal',
  '["agravio","federal","queja","recurso","recurso de queja"]'::jsonb,
  '[]'::jsonb,
  '1. Requisitos para la devolución directa
Para evitar el juicio, debes cumplir XXX lo siguiente:
Parentesco directo: Ser hija biológica o adoptiva (se acredita XXX tu acta de nacimiento)
Estatus de la cuenta: Que no exista un juicio previo iniciado por otra persona sobre la misma cuenta.
Expediente actualizado: Es ideal que tu madre tuviera sus datos biométricos registrados, aunque no es un impedimento total si no los tenía.
2. Documentación necesaria:
Debes presentarte en la sucursal de la AFORE donde estaba tu madre XXX:
Acta de Defunción de tu madre (original).
Tu Acta de Nacimiento (para comprobar el parentesco).
Tu Identificación Oficial vigente (INE o Pasaporte).
Número de Seguridad Social (NSS) de tu madre y su CURP.
Estado de cuenta de la AFORE (si no lo tienes, ellos lo buscan XXX el NSS).
Resolución de pensión o Negativa de pensión expedida por el IMSS (este documento es la "llave" que libera los recursos).
3. El proceso:
Cita en el IMSS: Acude a la subdelegación que le corres

[... estructura intermedia omitida ...]

en 2024, el derecho a reclamarlos es imprescriptible, por lo que la AFORE debe gestionar la devolución desde dicho fondo sin trabas.
¿Qué hacer si la AFORE se niega?
Si la administradora te pide forzosamente una "sentencia judicial", están ignorando el criterio vigente.
En ese caso:
Contacta a la PROFEDET (Procuraduría Federal de la Defensa XXX Trabajo) para asesoría legal gratuita.
Presenta una queja ante la CONSAR.',
  'assets/drafting-examples/docx/escrito-09-promocion-seguridad-social-laboral.docx',
  '{"filename_name":5}'::jsonb
),
(
  'escrito-10-demanda-familiar',
  'Ejemplo 10 - Demanda Familiar',
  'demanda familiar',
  'familiar',
  '["demanda familiar","divorcio","familiar","medidas","violencia familiar"]'::jsonb,
  '["C. [NOMBRE] FAMILIAR EN TURNO","PRESENTE. -","P R E S T A C I O N E S","H E C H O S","D E R E C H O","PROTESTO LO NECESARIO","TORREON COAHUILA A 29 DE [NOMBRE] 2024","[NOMBRE].","P R O P U E S T A D E C O N V E N I O","C L A U S U L A S","DE LA [NOMBRE]","[NOMBRE] [NOMBRE]"]'::jsonb,
  'C. [NOMBRE] FAMILIAR EN TURNO
PRESENTE. -
[NOMBRE], mexicana, mayor de edad, señalando como [NOMBRE] X [NOMBRE] XX XXXXXXXXXXXXXX XX [NOMBRE] XX XX. Juárez No. 357 Poniente Interior 3 [NOMBRE] XX [NOMBRE], [NOMBRE] X [NOMBRE] XX XXXXXXXXXXXXXX X XXXXXXXXX XX [NOMBRE] XX XXXXX X XXX XC. LIC´S  [NOMBRE], [NOMBRE], [NOMBRE]; XXX fundamento en lo dispuesto por el artículo 156 XXX Código Procesal Civil vigente en el Estado, vengo a solicitar atentamente a su Señoría se sirva autorizar para vía internet en forma virtual el expediente en el cual comparezco, XXX el correo previamente registrado siendo el siguiente: XXXXXXXXXXXXXXXXXXXXX.XXX; Manifiesto Bajo Protesta de Decir Verdad, que tengo conocimiento que la información que se encuentra en el expediente virtual, es menester de carácter informativo y para efectos de consulta exclusivamente, en virtud de que las constancias originales obran en el expediente de origen que se encuentran en este Juzgado; XXX el debido respeto que me merece su S

[... estructura intermedia omitida ...]

derecho o a las buenas costumbres, obligándose a estar y pasar por él en todo tiempo y lugar como si se tratase de sentencia definitiva debidamente declarada ejecutoriada en los términos de ley, y en consecuencia se decrete la [NOMBRE] que los une.
SEXTA. - Para la interpretación, cumplimiento y ejecución XXX presente convenio, las partes se sujetan expresamente a la jurisdicción de este H. Juzgado.
[NOMBRE] [NOMBRE]',
  'assets/drafting-examples/docx/escrito-10-demanda-familiar-familiar.docx',
  '{"address":5,"context_name":5,"email":1,"filename_name":32,"named_context":2,"placeholder_context_name":6,"placeholder_uppercase_name":45,"relationship_email":1,"uppercase_name":49}'::jsonb
),
(
  'escrito-11-oficio',
  'Ejemplo 11 - Oficio',
  'oficio',
  'administrativo',
  '["administrativo","autoridad","oficio","requerimiento"]'::jsonb,
  '["C. [NOMBRE]","P R E S E N T E.-","PROTESTO LO NECESARIO","LERDO DGO; A 16 DE [NOMBRE] 2026.","[NOMBRE]."]'::jsonb,
  'Expediente Número XXX/XXXX
C. [NOMBRE]
P R E S E N T E.-
[NOMBRE], XXX la personalidad que se me tiene reconocida dentro de los autos XXX expediente citado al rubro y XXX el debido respeto que me merece su Señoría atentamente vengo a exponer:
Que, por medio XXX presente escrito, en primer término vengo revocar cualquier autorización hecha XXX anterioridad a esta fecha así como el [NOMBRE], XXXXXXXXXXX XX [NOMBRE] X [NOMBRE] XX XXXXXXXXXXXXXX X XXXXXXXXX XX [NOMBRE] Xuicio al rubro indicado a los CC. LIC’S [NOMBRE], [NOMBRE], [NOMBRE], [NOMBRE]; señalando como nuevo [NOMBRE] X [NOMBRE] XX XXXXXXXXXXXXXX XX XXXXXXX XX XXXXXXX XX XX XXXX, XXXXXXX, XXXXXXXXX XX XXXXX.
Así mismo, vistos los autos XXX juicio familiar al rubro indicado solicito XXX fundamento en el código procesal civil XXX Estado de Durango se regularice el procedimiento en los siguientes términos:
1.- Mediante acuerdo de fecha, 19 de agosto XXX año 2025, su Señoría determinó que el descuento por concepto de pensión alimenti

[... estructura intermedia omitida ...]

e un nuevo oficio a la fuente de trabajo donde laboro a efecto de qué se descuente por concepto de pensión alimenticia el 35% pero de manera quincenal y no semanal por la razones y consideraciones antes mencionadas.
Por lo anteriormente expuesto ante usted su Señoría atentamente solicito:
ÚNICO: Acordar de conformidad mi petición por ser justa y legal.
PROTESTO LO NECESARIO
LERDO DGO; A 16 DE [NOMBRE] 2026.
[NOMBRE].',
  'assets/drafting-examples/docx/escrito-11-promocion-general.docx',
  '{"address":2,"case_number":1,"context_name":1,"filename_name":15,"placeholder_context_name":1,"placeholder_uppercase_name":13,"uppercase_name":15}'::jsonb
),
(
  'escrito-12-alegatos',
  'Ejemplo 12 - Alegatos',
  'alegatos',
  'civil',
  '["alegatos","civil","pruebas","sentencia"]'::jsonb,
  '["EXPEDIENTE NÚMERO: [EXPEDIENTE]","JUICIO: [NOMBRE]","[NOMBRE]","C. [NOMBRE] MATERIA MERCANTIL","PRESENTE.-","PROTESTO LO NECESARIO","LIC. [NOMBRE]"]'::jsonb,
  'EXPEDIENTE NÚMERO: [EXPEDIENTE]
JUICIO: [NOMBRE]
XX
[NOMBRE]
C. [NOMBRE] MATERIA MERCANTIL
PRESENTE.-
LIC. [NOMBRE], de generales ya conocidas dentro de los autos XXX expediente citado al rubro, ante Usted XXX el debido respeto comparezco para exponer:
Que por medio XXX presente escrito y XXX fundamento en lo dispuesto por el artículo 1406 XXX Código de Comercio, vengo a solicitar se declare concluida la etapa de desahogo de pruebas y, en consecuencia, se abra la fase de alegatos.
Lo anterior tiene sustento en que, según consta en la audiencia de fecha 21 de enero de 2026, se declaró desierta la prueba confesional a cargo de la demandada por falta de interés procesal, de conformidad XXX los artículos 1078 y 1201 XXX ordenamiento legal invocado. Asimismo, en la audiencia de fecha 17 de diciembre de 2025, se declaró concluida en perjuicio de la demandada la prueba confesional ofrecida por ésta, por las mismas razones legales.
Toda vez que no quedan pruebas pendientes por desahogar, solicito se pongan los autos a disposición de las partes para que produzcan sus alegatos.
Por lo anteriormente expuesto y fundado, A USTED C. JUEZ, [NOMBRE]:
ÚNICO. Tener por presentado este escrito en tiempo y forma, acordando de conformidad lo solicitado para continuar XXX el curso legal XXX proceso.
PROTESTO LO NECESARIO
Torreón, Coahuila a; 11 de marzo XXX 2026.
LIC. [NOMBRE]',
  'assets/drafting-examples/docx/escrito-12-alegatos-civil.docx',
  '{"context_name":3,"filename_name":10,"placeholder_case_number":1,"placeholder_context_name":3,"placeholder_uppercase_name":3,"uppercase_name":7}'::jsonb
),
(
  'escrito-13-convenio',
  'Ejemplo 13 - Convenio',
  'convenio',
  'familiar',
  '["alimentos","convenio","convivencia","familiar"]'::jsonb,
  '["C. [NOMBRE] FAMILIAR","PRESENTE.-","HECHOS","SEGUNDO TRIBUNAL COLEGIADO EN MATERIA CIVIL XXX SEXTO CIRCUITO.","DERECHO:","PROTESTO LO NECESARIO","A TORREON COAH; 27 DE [NOMBRE] 2026","[NOMBRE]."]'::jsonb,
  'C. [NOMBRE] FAMILIAR
PRESENTE.-
[NOMBRE],  [NOMBRE], mexicanos, mayores de edad, señalando como [NOMBRE] X [NOMBRE] XX XXXXXXX XX XX. Juarez Numero 357 Poniente Planta Baja de esta Ciudad, designando como mi abogado patrono al  C.  [NOMBRE], quien ostenta Cédula Profesional para el ejercicio de la Abogacía números XXXXXXX, expedida por la Dirección General de Profesiones de la Secretaría de Educación Pública y cuenta XXX el Registro ante el H. Tribunal Superior de Justicia en el Estado de los Títulos Profesionales, 6703 XXX Libro XII; autorizando para oír y recibir toda clase de notificaciones y se impongan de los autos que se deprendan XXX presente juicio a los CC. LIC’S. [NOMBRE], [NOMBRE], [NOMBRE], [NOMBRE]; asi mismo XXX fundamento en lo dispuesto por el artículo 156 XXX Código Procesal Civil vigente en el Estado, vengo a solicitar atentamente a su Señoría se sirva autorizar para vía internet en forma virtual el expediente en el cual comparezco, XXX el correo previamente registrad

[... estructura intermedia omitida ...]

 juez atentamente solicito:
PRIMERO. - Se nos tenga por presentado convenio de convivencia en sus terminos y se señale dia y hora para su debida ratificacion por los suscritos.
SEGUNDO. – Una vez hecho lo anterior se scepte e sus terminos el convenio de referencia
TERCERO. -  Justa y legal nuestra solicitud sea admitida y acordada conforme a derecho.
PROTESTO LO NECESARIO
A TORREON COAH; 27 DE [NOMBRE] 2026
[NOMBRE].',
  'assets/drafting-examples/docx/escrito-13-convenio-familiar.docx',
  '{"address":2,"case_number":6,"context_name":3,"email":1,"filename_name":81,"named_context":1,"phone":2,"placeholder_context_name":3,"placeholder_uppercase_name":41,"relationship_email":1,"uppercase_name":44}'::jsonb
),
(
  'escrito-14-manifestacion',
  'Ejemplo 14 - Manifestacion',
  'manifestacion',
  'civil',
  '["civil","dictamen","manifestacion","objecion","peritaje"]'::jsonb,
  '["C. [NOMBRE] MATERIA MERCANTIL","P R E S E N T E.-","PROTESTO LO NECESARIO","TORREON COAH; A 10 DE [NOMBRE] 2022","[NOMBRE]."]'::jsonb,
  'Expediente No. XXX/XXXX
C. [NOMBRE] MATERIA MERCANTIL
P R E S E N T E.-
[NOMBRE], de generales ya conocidas dentro de los autos XXX juicio al rubro indicado, ante Usted XXX merecido respeto comparezco y EXPONGO:
Que en tiempo y en forma, por medio XXX presente escrito vengo manifestar y objetar XXX relación al peritaje rendido por el C. LIC. [NOMBRE] de la siguiente manera:
El peritaje en mención no es rendido en términos específicos ni XXX la pericia en la materia, así como lo instrumentos que menciona el perito no son los adecuados, ya que la firma cuestionado es a todas luces puesta XXX puño y letra de la
Por tanto, se objeta el dictamen que nos ocupa ya que se encuentra viciado en su elaboración y por esa razón su conclusión carece de veracidad y sustentabilidad.
Por lo anteriormente expuesto y fundado a Usted C. Juez; respetuosamente concluyo solicitando:
UNICO. - Se me tenga XXX este escrito por contestando en tiempo y forma, la vista ordenada en autos.
PROTESTO LO NECESARIO
TORREON COAH; A 10 DE [NOMBRE] 2022
[NOMBRE].',
  'assets/drafting-examples/docx/escrito-14-manifestacion-civil.docx',
  '{"case_number":1,"context_name":2,"filename_name":8,"placeholder_context_name":2,"placeholder_uppercase_name":3,"uppercase_name":6}'::jsonb
),
(
  'escrito-15-oficio',
  'Ejemplo 15 - Oficio',
  'oficio',
  'administrativo',
  '["administrativo","autoridad","oficio","requerimiento"]'::jsonb,
  '["C. [NOMBRE] Y AUXILIAR EN MATERIAS MERCANTIL Y CIVIL","P R E S E N T E .-","PROTESTO LO NECESARIO","XXXXX XXXXXXX; DGO. A 09 DE [NOMBRE] 2024","[NOMBRE]."]'::jsonb,
  'Expediente No. XXXX/XXXX
C. [NOMBRE] Y AUXILIAR EN MATERIAS MERCANTIL Y CIVIL
P R E S E N T E .-
[NOMBRE], de generales conocidas dentro de los autos XXX juicio indicado al rubro, ante Usted, C. Juez, XXX el respeto que me merece su Señoría, comparezco a exponer:
Que, por medio XXX presente escrito, solicito atentamente se gire atento oficio al Instituto Mexicano XXX Seguro Social, a efecto de que informe si el C. [NOMBRE], se encuentra laborando actualmente y de ser afirmativo, proporcione la empresa o persona física para la cual se encuentra laborando y el XXXXXXXXX XX XX XXXXXX XX XXXXXXX, XX XXXXXXXX, XX [NOMBRE] XX [NOMBRE], XXX XX X. [NOMBRE], ya no labora para [NOMBRE], y actualmente desconozco donde labora, por el hecho de que no se ha tenido contacto XXX el, ni sus menores hijos ni la suscrita, lo anterior para poder dar cumplimiento al RESOLUTIVO QUINTO de la Sentencia de Fecha 19 de marzo XXX 2024, esto en razón de que el C. [NOMBRE], no ha dado cumplimiento a su obligación de dar alimentos a sus menores hijos.
Por lo anteriormente expuesto a Su Señoría, atentamente solicito:
PRIMERO. - Acordar de conformidad mi solicitud por ser justa y apegada a derecho.
PROTESTO LO NECESARIO
XXXXX XXXXXXX; DGO. A 09 DE [NOMBRE] 2024
[NOMBRE].',
  'assets/drafting-examples/docx/escrito-15-oficio-administrativo.docx',
  '{"address":1,"case_number":1,"context_name":3,"filename_name":11,"placeholder_context_name":3,"placeholder_uppercase_name":7,"uppercase_name":11}'::jsonb
),
(
  'escrito-16-pliego-de-posiciones',
  'Ejemplo 16 - Pliego De Posiciones',
  'pliego de posiciones',
  'civil',
  '["civil","confesional","pliego de posiciones","posiciones","prueba"]'::jsonb,
  '["PLIEGO DE [NOMBRE] EL C. [NOMBRE] [NOMBRE] DE [NOMBRE] H. TRIBUNAL.","[NOMBRE] EL ABSOLVENTE SI ES [NOMBRE] LO ES:","RESERVANDONOS EL DERECHO DE [NOMBRE] DE [NOMBRE] SI EL JUICIO ASI LO REQUIERA.","PROTESTAMOS LO NECESARIO","TORREON COAHUILA A 23 DE MARZO DE 2009","LIC. [NOMBRE]"]'::jsonb,
  'PLIEGO DE [NOMBRE] EL C. [NOMBRE] [NOMBRE] DE [NOMBRE] H. TRIBUNAL.
[NOMBRE] EL ABSOLVENTE SI ES [NOMBRE] LO ES:
Que su representada solicito un crédito a [NOMBRE] S.A. DE C.V.
Que su representada utilizo el crédito concedido por [NOMBRE] S.A. DE C.V. para obtener diversos productos de mi mandante en distintas fechas.
Que su representada le adeuda actualmente a refrigeración lozano s.a. de c.v. la cantidad de $5,193.17 pesos m.n. contenida en el contra-recibo de fecha 06 de Marzo de 2007 y que tiene a la vista.
Que su representada le adeuda actualmente a refrigeración lozano s.a. de c.v. las cantidades de $1,535.25 pesos m.n. y $718.75 pesos m.n. contenidos en el contra-recibo de fecha 13 de Noviembre de 2007 y que tiene a la vista.
Que su representada le adeuda actualmente a refrigeración lozano s.a. de c.v. las cantidades de $826.50 pesos m.n., $384.10 pesos m.n., y $718.75 pesos m.n., contenidos en el contra-recibo de fecha 21 de Noviembre de 2007 y que tiene a la vista.
RESERVANDONOS EL DERECHO DE [NOMBRE] DE [NOMBRE] SI EL JUICIO ASI LO REQUIERA.
PROTESTAMOS LO NECESARIO
TORREON COAHUILA A 23 DE MARZO DE 2009
LIC. [NOMBRE]',
  'assets/drafting-examples/docx/escrito-16-pliego-de-posiciones-civil.docx',
  '{"context_name":2,"filename_name":1,"placeholder_context_name":2,"placeholder_uppercase_name":9,"uppercase_name":10}'::jsonb
),
(
  'escrito-17-contestacion',
  'Ejemplo 17 - Contestacion',
  'contestacion',
  'civil',
  '["civil","contestacion","defensas","excepciones"]'::jsonb,
  '["XXXX XXXXX XXXXXXX XXXXX","SUMA: SE OFRECEN PRUEBAS","C. [NOMBRE] MATERIA CIVIL","PRESENTE.-","PRUEBAS","PROTESTO LO NECESARIO","TORREÓN, COAHUILA; A 12 DE MAYO DE 2011.","[NOMBRE]."]'::jsonb,
  'EXPEDIENTE No. XXX/[NOMBRE]
VS
XXXX XXXXX XXXXXXX XXXXX
SUMA: SE OFRECEN PRUEBAS
C. [NOMBRE] MATERIA CIVIL
PRESENTE.-
[NOMBRE], [NOMBRE], de generales ya conocidas dentro de los autos XXX Juicio Ordinario Civil al rubro indicado, XXX el debido respeto que me merece su Señoría comparezco para exponer:
Que por medio XXX presente escrito, en tiempo y forma, me permito ofrecer las pruebas de mi intención, XXX el fin de probar los hechos de mi escrito de contestación de la siguiente manera:
PRUEBAS
LA CONFESIONAL.- XXX cargo al C. [NOMBRE], quien deberá ser citada a absolver posiciones el día y hora que señale esta H. Junta para ese efecto, apercibido de que si en la fecha y hora indicada para el desahogo de esa probanza no compareciera sin justa causa, será declarada confesa de todas y cada una de las posiciones que previamente articuladas se califiquen de legales por este H. Juzgado; citación que deberá ser personal o a través de su apoderado, por conducto XXX actuario de la adscripción e

[... estructura intermedia omitida ...]

encionados en el capítulo correlativo XXX escrito de contestación de demanda y ampliación; el cual concatenado a los diversos medios de prueba que se ofrecen en el presente ocurso, es apto para demostrar como ya se indicó los hechos XXX escrito de contestación y para desvirtuar las contradicciones que resulten XXX escrito  de  demanda.
PROTESTO LO NECESARIO
TORREÓN, COAHUILA; A 12 DE MAYO DE 2011.
[NOMBRE].
[NOMBRE].',
  'assets/drafting-examples/docx/escrito-17-ofrecimiento-de-pruebas-civil.docx',
  '{"address":10,"case_number":1,"context_name":9,"filename_name":44,"placeholder_context_name":9,"placeholder_uppercase_name":36,"uppercase_name":47}'::jsonb
),
(
  'escrito-18-amparo',
  'Ejemplo 18 - Amparo',
  'amparo',
  'federal',
  '["acto reclamado","amparo","federal","garantias"]'::jsonb,
  '["H. JUZGADO CUARTO DE DISTRITO EN LA LAGUNA.","PRESENTE. -","PROTESTO LO NECESARIO","TORREÓN COAH; A 23 DE [NOMBRE] 2026","[NOMBRE].","H. TRIBUNAL COLEGIADO EN MATERIA CIVIL Y LABORAL XXX OCTAVO CIRCUITO EN TURNO.","PRESENTE.-","ANTECEDENTES","AGRAVIOS","DEMANDA DE AMPARO. AL [NOMBRE] SU ADMISIÓN, SU [NOMBRE] SE ACOMPAÑEN A LA MISMA."]'::jsonb,
  'Juicio de Amparo Número: XXX/XXXX
Se interpone Recurso de Queja
H. JUZGADO CUARTO DE DISTRITO EN LA LAGUNA.
PRESENTE. -
[NOMBRE], XXX personalidad ya reconocida dentro XXX juicio de amparo al rubro indicado, XXX el debido respeto que me Merece su Señoría respetuosamente, comparezco para exponer:
Por medio XXX presente escrito en tiempo y forma, XXX fundamento en los Artículos 97 Fracción I Inciso a), 98, 99 y demás relativos y aplicables de la Ley de Amparo, vengo a interponer RECURSO DE QUEJA en contra de la resolución que desecha mi demanda de garantías de fecha 12 de febrero XXX 2026, la cual considero infundada y contraria a derecho.
Por lo anteriormente expuesto y fundado atentamente solicito:
ÚNICO.— Acordar de conformidad mi solicitud por ser Justa y Legal.
PROTESTO LO NECESARIO
TORREÓN COAH; A 23 DE [NOMBRE] 2026
[NOMBRE].
H. TRIBUNAL COLEGIADO EN MATERIA CIVIL Y LABORAL XXX OCTAVO CIRCUITO EN TURNO.
PRESENTE.-
[NOMBRE], mexicano, mayor de edad, señalando como [NOMBRE] X [NOMBR

[... estructura intermedia omitida ...]

, de la Ley de Amparo, llevaría a ordenar la reposición XXX procedimiento.
Contradicción de tesis XXX/XXXX-SS. Entre las sustentadas por el Primer Tribunal Colegiado en Materias Penal y Administrativa XXX Vigésimo Primer Circuito y el Tercer Tribunal Colegiado en Materia Administrativa XXX Primer Circuito. 30 de noviembre de 2005. Unanimidad de cuatro votos. Ausente: Guillermo I. Ortiz Mayagoitia. Ponente: Sergio Sal',
  'assets/drafting-examples/docx/escrito-18-recurso-de-queja-federal.docx',
  '{"address":4,"case_number":10,"credential":1,"filename_name":61,"named_context":1,"placeholder_uppercase_name":29,"uppercase_name":29}'::jsonb
),
(
  'escrito-19-promocion',
  'Ejemplo 19 - Promocion',
  'promocion',
  'civil',
  '["civil","emplazamiento","preclusion","promocion","rebeldia"]'::jsonb,
  '["[NOMBRE] Y","XXXXX XXXXXXXXX XXXXXXXXX XXXXXXXX","SUMA: SE [NOMBRE] DE LA [NOMBRE]","C. [NOMBRE] RAMO CIVIL","P R E S E N T E.-","PROTESTO LO NECESARIO.","TORREÓN, COAHUILA A 23 DE [NOMBRE] 2024.","[NOMBRE]."]'::jsonb,
  'Expediente XXX/[NOMBRE]
VS
[NOMBRE] Y
XXXXX XXXXXXXXX XXXXXXXXX XXXXXXXX
SUMA: SE [NOMBRE] DE LA [NOMBRE]
C. [NOMBRE] RAMO CIVIL
P R E S E N T E.-
[NOMBRE], de generales ya conocidas dentro de los autos XXX expediente indicado al rubro, ante usted su Señoría, XXX el debido respeto comparezco a exponer:
Que por medio XXX presente escrito y XXX fundamento en el artículo 406 XXX Código Procesal Civil Vigente en el Estado, atentamente solicitó sean declaradas en rebeldía a las demandadas [NOMBRE] Y [NOMBRE], ya que XXX día en que fue emplazada a juicio a la fecha XXX presente escrito ha transcurrido en demasía el término conferido a la parte demandada para que opusiera las excepciones que su derecho convinieran sin haberlo hecho en tiempo y forma.
De igual manera atentamente solcito a su señoría que todas las notificaciones que señale la ley como personales le sean realizadas a la diversa demandada mediante los estrados de este H. Juzgado.
Por ultimo solcito a su Señoría se sirva señalar d

[... estructura intermedia omitida ...]

estas en el presente ocurso.
SEGUNDO. – Se hagan las notificaciones que la Ley señale como personales a la diversa demandada mediante los estrados de este H. Juzgado.
TERCERO. - Se señale día y hora para que tenga verificativo la audiencia previa, de conciliación y depuración.
CUARTO. - Acordar de conformidad mi solicitud por ser justa y legal.
PROTESTO LO NECESARIO.
TORREÓN, COAHUILA A 23 DE [NOMBRE] 2024.
[NOMBRE].',
  'assets/drafting-examples/docx/escrito-19-promocion-civil.docx',
  '{"case_number":1,"context_name":2,"filename_name":12,"placeholder_context_name":2,"placeholder_uppercase_name":9,"uppercase_name":12}'::jsonb
),
(
  'escrito-20-recurso',
  'Ejemplo 20 - Recurso',
  'recurso',
  'administrativo',
  '["administrativo","reconsideracion","recurso","revocacion"]'::jsonb,
  '["XXXXXX XXXXX XXXXXXXX XXXXXXX","SUMA: SE INTERPONE","RECURSO DE RECONSIDERACION","C. [NOMBRE] MATERIA CIVIL","P R E S E N T E.-","TERCER TRIBUNAL COLEGIADO XXX VIGÉSIMO SÉPTIMO CIRCUITO"]'::jsonb,
  'Expediente número XXX/[NOMBRE]
VS
XXXXXX XXXXX XXXXXXXX XXXXXXX
SUMA: SE INTERPONE
RECURSO DE RECONSIDERACION
C. [NOMBRE] MATERIA CIVIL
P R E S E N T E.-
[NOMBRE], de generales conocidas dentro de los autos XXX juicio indicado al rubro, ante Usted, C. Juez, XXX el respeto que me merece su Señoría comparezco a exponer:
Que, por medio XXX presente escrito en tiempo y forma, XXX fundamento en los artículos 861, 862 y demás relativos y aplicables XXX Código de Procedimientos Civiles XXX Estado de Coahuila vengo a interponer el recurso de Reconsideración contra el auto de fecha 19 de febrero XXX 2025; considerando el suscrito que me causa el siguiente Agravio:
UNICO. – Que en fecha 20 de marzo XXX 2026, se me notifico un acuerdo de fecha 5 de marzo XXX 2026, donde se me da el termino de 5 días a efecto de pagar las prestaciones a la que fui condenada en la ilegal sentencia interlocutoria de fecha 10 de noviembre XXX año 2025; y en razón de que en fecha 18 de noviembre XXX 2025, se interpuso

[... estructura intermedia omitida ...]

Amparo directo XX/XXXX. Nidia de Jesús Baños Cruz. 27 de febrero de 2014. Unanimidad de votos. Ponente: Edgar Bruno Castrezana Moro, secretario de tribunal autorizado por la Comisión de Carrera Judicial XXX Consejo de la Judicatura Federal para desempeñar las funciones de Magistrado, en términos XXX artículo 81, fracción XXII, de la Ley Orgánica XXX Poder Judicial de la Federación. Secretario: XXXXXXX Valdovinos Pére',
  'assets/drafting-examples/docx/escrito-20-recurso-administrativo.docx',
  '{"address":1,"case_number":9,"context_name":2,"filename_name":80,"phone":1,"placeholder_context_name":2,"placeholder_uppercase_name":17,"uppercase_name":21}'::jsonb
),
(
  'escrito-21-promocion',
  'Ejemplo 21 - Promocion',
  'promocion',
  'general',
  '["escrito","general","promocion","solicitud"]'::jsonb,
  '["[NOMBRE]","C. [NOMBRE] EL RAMO MERCANTIL.","PRESENTE. –","PROTESTO LO NECESARIO","TORREÓN, COAHUILA; A 05 DE MARZO DE 2026.","LIC. [NOMBRE]"]'::jsonb,
  'EXPEDIENTE No. XXX/[NOMBRE]
VS
[NOMBRE]
C. [NOMBRE] EL RAMO MERCANTIL.
PRESENTE. –
LIC. [NOMBRE], de generales ya conocidas dentro de los autos XXX juicio ejecutivo mercantil al rubro indicado; XXX el debido respeto que me merece su Señoría comparezco para exponer:
Que, por medio XXX presente ocurso y vistos los autos XXX expediente en que se actúa, vengo a solicitar atentamente a su Señoría se sirva ordenar la regularización XXX procedimiento y la corrección XXX error material contenido en la sentencia interlocutoria dictada por este H. Juzgado.
Lo anterior, en virtud de que en el proemio de dicha resolución se asentó de manera errónea la fecha de su emisión, siendo menester señalar y aclarar que la fecha correcta en que se dictó corresponde al 03 de octubre de 2025.
A fin de no dejar a mi representada en estado de indefensión, evitar futuras nulidades y dotar de certeza jurídica a las actuaciones judiciales que integran el presente sumario, es imperativo que su Señoría subsane dicha omisión o error mecanográfico mediante la aclaración correspondiente.
Por lo anteriormente expuesto y fundado ante usted C. Juez, atentamente solicito:
ÚNICO. - Se acuerde a la brevedad mi petición, ordenando la regularización y aclaración de la fecha contenida en el proemio de la sentencia interlocutoria de mérito, por estar apegado a estricto derecho.
PROTESTO LO NECESARIO
TORREÓN, COAHUILA; A 05 DE MARZO DE 2026.
LIC. [NOMBRE]',
  'assets/drafting-examples/docx/escrito-21-promocion-general.docx',
  '{"case_number":1,"context_name":3,"filename_name":6,"placeholder_context_name":3,"placeholder_uppercase_name":2,"uppercase_name":6}'::jsonb
),
(
  'escrito-22-promocion',
  'Ejemplo 22 - Promocion',
  'promocion',
  'penal',
  '["audiencia","audio","penal","promocion","video"]'::jsonb,
  '["H. TRIBUNAL LABORAL XXX DISTRITO JUDICIAL DE TORREÓN.","PRESENTE-.","PROTESTO LO NECESARIO.","TORREÓN, COAHUILA; 10 DE [NOMBRE] 2026.","LIC. [NOMBRE]."]'::jsonb,
  'Expediente. Nº XXX/XXXX
H. TRIBUNAL LABORAL XXX DISTRITO JUDICIAL DE TORREÓN.
PRESENTE-.
LIC. [NOMBRE], de generales conocidas dentro de los autos XXX juicio laboral al rubro indicado, XXX el debido respeto que me merece este H. Tribunal Obrero, comparecemos para exponer:
Que, por medio XXX presente escrito y vistos los autos XXX juicio al rubro indicado, atentamente solicitó a su Señoría se me proporcione audio y video de la audiencia preliminar de fecha 14 de noviembre XXX 2025.
Por lo anteriormente expuesto a este Tribunal obrero, atentamente solicito:
Único. - Acordar de conformidad al derecho las solicitudes efectuadas en este escrito por estar realizadas conforme a la ley.
PROTESTO LO NECESARIO.
TORREÓN, COAHUILA; 10 DE [NOMBRE] 2026.
LIC. [NOMBRE].',
  'assets/drafting-examples/docx/escrito-22-promocion-penal.docx',
  '{"case_number":1,"context_name":2,"filename_name":7,"placeholder_context_name":2,"placeholder_uppercase_name":1,"uppercase_name":3}'::jsonb
),
(
  'escrito-23-promocion',
  'Ejemplo 23 - Promocion',
  'promocion',
  'civil',
  '["civil","emplazamiento","preclusion","promocion","rebeldia"]'::jsonb,
  '["MA. [NOMBRE]","[NOMBRE]","C. [NOMBRE] RAMO CIVIL","P R E S E N T E.-","PROTESTO LO NECESARIO","MA. [NOMBRE]."]'::jsonb,
  'EXPEDIENTE No.  XXX/XXXX
MA. [NOMBRE]
VS
[NOMBRE]
C. [NOMBRE] RAMO CIVIL
P R E S E N T E.-
MA. [NOMBRE], XXX la personalidad que tengo debidamente reconocida dentro de los autos XXX Juicio, cuyo número de expediente estadístico señalo al rubro; ante Usted XXX merecido respeto comparezco y EXPONGO:
Que, por medio XXX presente escrito, XXX fundamento en los Artículos 904 y 926 XXX Código Procesal Civil para el Estado de Coahuila, vistos los autos XXX juicio al rubro indicado, toda vez que ya ha causado ejecutoria la Sentencia Definitiva de fecha 27 de febrero XXX año 2024 y la parte demandada no ha cumplido XXX lo ordenado en el considerando CUARTO en el término de cinco días ordenado por su Señoría; atentamente solicito se otorgue la escritura respectiva en rebeldía XXX demandado.
Por lo anteriormente expuesto y fundado a Usted C. Juez; respetuosamente concluyo solicitando:
ÚNICO. – Acordar de conformidad mi solicitud por ser apegada a derecho.
PROTESTO LO NECESARIO
Torreón Coah; a 2 de Mayo XXX 2024
MA. [NOMBRE].',
  'assets/drafting-examples/docx/escrito-23-promocion-civil.docx',
  '{"case_number":1,"context_name":1,"filename_name":14,"placeholder_context_name":1,"placeholder_uppercase_name":4,"uppercase_name":5}'::jsonb
)
on conflict (id) do update set
  title = excluded.title,
  kind = excluded.kind,
  matter = excluded.matter,
  keywords = excluded.keywords,
  structure = excluded.structure,
  source_excerpt = excluded.source_excerpt,
  sanitized_docx_path = excluded.sanitized_docx_path,
  redaction_counts = excluded.redaction_counts,
  is_active = true,
  library_version = public.legal_drafting_examples.library_version + 1,
  updated_at = now();
