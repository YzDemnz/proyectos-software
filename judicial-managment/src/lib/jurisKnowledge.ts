export type JurisTarget =
  | 'dashboard'
  | 'totalExpedientes'
  | 'expedientes'
  | 'archivo'
  | 'escriba'
  | 'movimientos'
  | 'calendario'
  | 'clientes'
  | 'tribunal'
  | 'configuracion';

export interface JurisAction {
  label: string;
  target?: JurisTarget;
  prompt?: string;
  url?: string;
}

export interface JurisResponse {
  text: string;
  actions: JurisAction[];
}

interface JurisIntent {
  name: string;
  keywords: string[];
  phrases?: string[][];
  response: JurisResponse;
}

const sourceActions: JurisAction[] = [
  {
    label: 'Codigo de Comercio',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/ref/ccom.htm',
  },
  {
    label: 'CNPCF',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CNPCF.pdf',
  },
  {
    label: 'CNPP',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CNPP.pdf',
  },
  {
    label: 'LFT',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf',
  },
];

const appActions: JurisAction[] = [
  { label: 'Panel', target: 'dashboard' },
  { label: 'Expedientes', target: 'expedientes' },
  { label: 'Archivo', target: 'archivo' },
  { label: 'Clientes', target: 'clientes' },
  { label: 'Movimientos', target: 'movimientos' },
  { label: 'Calendario', target: 'calendario' },
  { label: 'Escriba', target: 'escriba' },
  { label: 'Laboral', target: 'tribunal' },
  { label: 'Configuracion', target: 'configuracion' },
];

export const jurisQuickActions: JurisAction[] = [
  { label: 'Crear expediente', prompt: 'Quiero crear un expediente' },
  { label: 'Registrar audiencia', prompt: 'Como registro una audiencia?' },
  { label: 'Subir documentos', prompt: 'Como subo documentos?' },
  { label: 'Archivar expediente', prompt: 'Como archivo un expediente?' },
  { label: 'Mercantil', prompt: 'Explicame procedimientos mercantiles' },
  { label: 'Civil', prompt: 'Explicame fases de materia civil' },
  { label: 'Familiar', prompt: 'Explicame fases de materia familiar' },
  { label: 'Penal', prompt: 'Explicame fases de materia penal' },
  { label: 'Laboral', prompt: 'Explicame conciliacion y juicio laboral' },
  { label: 'Amparo', prompt: 'Explicame juicio de amparo' },
];

export const jurisWelcome: JurisResponse = {
  text: [
    'Centro interno de ayuda para ubicar modulos, ordenar expedientes y registrar tareas frecuentes.',
    'Consulta expedientes, archivo, clientes, movimientos, audiencias, documentos, permisos y materias mercantil, civil, familiar, penal, laboral y amparo.',
    'La informacion es operativa y debe revisarse con la ley vigente, acuerdos publicados y criterio profesional.',
  ].join('\n\n'),
  actions: jurisQuickActions.slice(0, 6),
};

const normalizeInput = (value: string) => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const wordVariants: Record<string, string[]> = {
  abrir: ['abre', 'abrir', 'abreme', 'ir', 'llevar', 'llevame', 'mandame', 'redirige', 'redirigir'],
  agregar: ['agregar', 'agrega', 'anadir', 'anade', 'crear', 'crea', 'nuevo', 'nueva', 'registrar', 'registro', 'registra'],
  audiencia: ['audiencia', 'audiencias'],
  archivo: ['archivo', 'archivado', 'archivar', 'archiva'],
  cliente: ['cliente', 'clientes'],
  colaborador: ['colaborador', 'colaboradores', 'usuario', 'usuarios', 'equipo'],
  configuracion: ['configuracion', 'setting', 'settings', 'ajustes'],
  documento: ['documento', 'documentos', 'archivo', 'archivos', 'pdf', 'word', 'doc', 'docx', 'imagen', 'imagenes'],
  expediente: ['expediente', 'expedientes', 'caso', 'casos'],
  fecha: ['fecha', 'fechas', 'termino', 'terminos', 'plazo', 'plazos'],
  laboral: ['laboral', 'trabajo', 'trabajador', 'patron', 'conciliacion', 'junta'],
  movimiento: ['movimiento', 'movimientos', 'acuerdo', 'acuerdos', 'promocion', 'promociones', 'actuacion'],
  permiso: ['permiso', 'permisos', 'admin', 'administrador', 'editor', 'lectura'],
  subir: ['subir', 'sube', 'adjuntar', 'adjunta', 'cargar', 'carga', 'guardar'],
};

const expandWords = (words: string[]) => {
  const expanded = new Set(words);
  for (const word of words) {
    Object.entries(wordVariants).forEach(([canonical, variants]) => {
      if (word === canonical || variants.includes(word)) {
        expanded.add(canonical);
        variants.forEach((variant) => expanded.add(variant));
      }
    });
  }

  return expanded;
};

const appIntents: JurisIntent[] = [
  {
    name: 'navegacion general',
    keywords: ['abrir', 'modulo', 'menu', 'panel', 'pantalla', 'seccion'],
    phrases: [['que', 'puedes'], ['donde', 'esta'], ['abre', 'modulo']],
    response: {
      text: 'Puedes abrir modulos con frases como "abre clientes", "ir a archivo" o "abrir movimientos". Tambien estan disponibles los accesos directos.',
      actions: appActions,
    },
  },
  {
    name: 'crear expediente',
    keywords: ['agregar', 'expediente', 'juzgado', 'materia', 'partes', 'cliente'],
    phrases: [['crear', 'expediente'], ['nuevo', 'expediente'], ['registrar', 'caso']],
    response: {
      text: [
        'Para crear un expediente:',
        '1. Entra a Expedientes.',
        '2. Elige materia: Mercantil, Civil, Familiar, Letrado o Penal.',
        '3. Selecciona el juzgado.',
        '4. Pulsa Nuevo Expediente.',
        '5. Captura numero, partes, cliente, tipo de juicio y estatus.',
        '6. Si tienes documentos, adjunta PDF, Word o imagenes desde el mismo formulario.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Expedientes', target: 'expedientes' },
        { label: 'Subir documentos', prompt: 'Como subo documentos?' },
      ],
    },
  },
  {
    name: 'modificar expediente',
    keywords: ['modificar', 'editar', 'cambiar', 'corregir', 'estatus', 'expediente'],
    phrases: [['modificar', 'expediente'], ['cambiar', 'estatus'], ['editar', 'expediente']],
    response: {
      text: [
        'Para modificar un expediente:',
        '1. Abre Expedientes.',
        '2. Entra a la materia y juzgado donde esta.',
        '3. Abre el expediente.',
        '4. Pulsa Modificar expediente.',
        '5. Cambia datos, cliente, juzgado, tipo de juicio o estatus.',
        'Si eliges Archivado, se movera al modulo Archivo.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Expedientes', target: 'expedientes' },
        { label: 'Abrir Archivo', target: 'archivo' },
      ],
    },
  },
  {
    name: 'archivo',
    keywords: ['archivo', 'archivado', 'archivar', 'restaurar', 'expediente'],
    phrases: [['archivar', 'expediente'], ['estatus', 'archivado'], ['restaurar', 'expediente']],
    response: {
      text: [
        'El modulo Archivo guarda los expedientes con estatus Archivado.',
        'Para archivar: Expedientes > abrir expediente > Modificar expediente > Estatus: Archivado.',
        'Para restaurar: entra a Archivo y usa Restaurar a Activo.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Archivo', target: 'archivo' },
        { label: 'Abrir Expedientes', target: 'expedientes' },
      ],
    },
  },
  {
    name: 'documentos',
    keywords: ['documento', 'subir', 'descargar', 'adjuntar', 'pdf', 'word', 'imagen', 'expediente', 'movimiento'],
    phrases: [['subir', 'pdf'], ['adjuntar', 'archivo'], ['subir', 'documento']],
    response: {
      text: [
        'Puedes adjuntar documentos en:',
        '- Expedientes: documentos generales del asunto.',
        '- Movimientos: acuerdos, promociones, constancias, notificaciones o escritos ligados a una actuacion.',
        '- Chat: archivos para compartir con colaboradores.',
        'Formatos permitidos: imagenes, PDF, Word .doc y .docx. Limite actual: 25 MB por archivo. Los documentos son privados del despacho.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Expedientes', target: 'expedientes' },
        { label: 'Abrir Movimientos', target: 'movimientos' },
      ],
    },
  },
  {
    name: 'movimientos audiencia calendario',
    keywords: ['movimiento', 'audiencia', 'calendario', 'fecha', 'acuerdo', 'promocion'],
    phrases: [['registrar', 'audiencia'], ['crear', 'movimiento'], ['agregar', 'acuerdo']],
    response: {
      text: [
        'Para registrar una audiencia:',
        '1. Abre Movimientos o entra al expediente y agrega movimiento.',
        '2. En Tipo elige Audiencia.',
        '3. Escribe la fecha como 00/00/0000.',
        '4. Guarda el movimiento.',
        'La app lo agrega automaticamente al Calendario y mantiene relacion con el expediente.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Movimientos', target: 'movimientos' },
        { label: 'Abrir Calendario', target: 'calendario' },
      ],
    },
  },
  {
    name: 'clientes adeudos',
    keywords: ['cliente', 'adeudo', 'pago', 'abono', 'cargo', 'monto', 'cobro'],
    phrases: [['crear', 'cliente'], ['registrar', 'abono'], ['monto', 'pactado']],
    response: {
      text: [
        'En Clientes puedes:',
        '- Registrar clientes.',
        '- Guardar monto pactado.',
        '- Registrar cargos y abonos.',
        '- Ver adeudo total.',
        '- Relacionar clientes con expedientes.',
        'Tip: si un cliente tiene varios asuntos, conviene que cada expediente quede ligado al mismo cliente para ver mejor su historial.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Clientes', target: 'clientes' },
        { label: 'Crear expediente', prompt: 'Quiero crear un expediente' },
      ],
    },
  },
  {
    name: 'colaboradores permisos',
    keywords: ['colaborador', 'permiso', 'codigo', 'admin', 'editor', 'lectura', 'perfil'],
    phrases: [['agregar', 'colaborador'], ['cambiar', 'permiso'], ['solo', 'lectura']],
    response: {
      text: [
        'Los permisos se administran en Configuracion:',
        '- Solo lectura: puede consultar, pero no editar.',
        '- Editor: puede agregar o modificar informacion.',
        '- Administrador: puede administrar permisos de editor/solo lectura.',
        '- Propietario: unico que puede convertir a otros en admin y controlar el despacho completo.',
        'Los codigos de invitacion son diarios y quien se une entra como solo lectura por seguridad.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Configuracion', target: 'configuracion' },
        { label: 'Explicar despacho', prompt: 'Como funciona crear o anadir despacho?' },
      ],
    },
  },
  {
    name: 'despachos',
    keywords: ['despacho', 'biblioteca', 'grupo', 'crear', 'anadir', 'unirme', 'codigo'],
    phrases: [['crear', 'despacho'], ['anadir', 'despacho'], ['codigo', 'despacho']],
    response: {
      text: [
        'Un despacho es como un espacio de trabajo separado.',
        '- Cada usuario puede crear hasta 2 despachos propios.',
        '- Tambien puede pertenecer a despachos de otros abogados.',
        '- Cada despacho tiene expedientes, clientes, movimientos, calendario, chat y configuracion propia.',
        '- Para invitar, el propietario/admin genera codigo y el nuevo usuario entra como solo lectura.',
      ].join('\n'),
      actions: [
        { label: 'Configuracion', target: 'configuracion' },
        { label: 'Panel', target: 'dashboard' },
      ],
    },
  },
];

const legalIntents: JurisIntent[] = [
  {
    name: 'mercantil general',
    keywords: ['mercantil', 'comercio', 'pagare', 'cheque', 'factura', 'credito', 'ejecutivo', 'ordinario', 'oral'],
    phrases: [['procedimiento', 'mercantil'], ['juicio', 'mercantil'], ['mercantil', 'ejecutivo']],
    response: {
      text: [
        'Guia mercantil general:',
        '- Ordinario mercantil: se usa cuando no hay via especial o ejecutiva clara. Suele incluir demanda, emplazamiento, contestacion, pruebas, alegatos, sentencia y ejecucion.',
        '- Ejecutivo mercantil: procede cuando existe documento con fuerza ejecutiva, como titulo de credito u otro documento que traiga aparejada ejecucion. Suele iniciar con requerimiento de pago, embargo y emplazamiento.',
        '- Oral mercantil: privilegia audiencias, inmediacion y concentracion. Puede aplicar segun tipo de asunto y reglas vigentes.',
        '- Ejecutivo mercantil oral: existe como via especial para ciertos asuntos conforme al Codigo de Comercio.',
        'Checklist practico: identificar documento base, monto, intereses, domicilio del demandado, competencia, prestaciones, pruebas, medidas cautelares y etapa de ejecucion.',
      ].join('\n'),
      actions: [
        { label: 'Crear expediente mercantil', prompt: 'Quiero crear un expediente mercantil' },
        { label: 'Codigo de Comercio', url: 'https://www.diputados.gob.mx/LeyesBiblio/ref/ccom.htm' },
      ],
    },
  },
  {
    name: 'mercantil ejecutivo',
    keywords: ['ejecutivo', 'mercantil', 'pagare', 'cheque', 'embargo', 'requerimiento', 'pago'],
    phrases: [['juicio', 'ejecutivo'], ['ejecutivo', 'mercantil'], ['embargo', 'mercantil']],
    response: {
      text: [
        'Juicio ejecutivo mercantil, guia de control:',
        '1. Revisar titulo base: pagare, cheque, contrato o documento con ejecucion.',
        '2. Verificar vencimiento, liquidez, firma, monto, intereses y legitimacion.',
        '3. Preparar demanda con prestaciones y documento base.',
        '4. Solicitar requerimiento de pago, embargo y emplazamiento cuando proceda.',
        '5. Registrar contestacion/oposicion, excepciones y pruebas.',
        '6. Controlar sentencia y etapa de ejecucion/remate/convenio.',
        'Conviene adjuntar titulo base, calculo de saldo, identificacion de partes, constancias de emplazamiento y acuerdos relevantes.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Expedientes', target: 'expedientes' },
        { label: 'Subir documentos', prompt: 'Como subo documentos?' },
      ],
    },
  },
  {
    name: 'mercantil ordinario oral',
    keywords: ['ordinario', 'oral', 'mercantil', 'audiencia', 'pruebas', 'alegatos'],
    phrases: [['ordinario', 'mercantil'], ['oral', 'mercantil'], ['audiencia', 'mercantil']],
    response: {
      text: [
        'Mercantil ordinario/oral, fases de referencia:',
        '- Demanda y admision.',
        '- Emplazamiento.',
        '- Contestacion y, si aplica, reconvencion.',
        '- Fijacion de litis.',
        '- Audiencia preliminar o preparacion, segun via aplicable.',
        '- Admisión y desahogo de pruebas.',
        '- Alegatos.',
        '- Sentencia.',
        '- Recursos o amparo, segun procedencia.',
        '- Ejecucion.',
        'En la app conviene registrar cada acuerdo como movimiento y cada audiencia con fecha para el calendario.',
      ].join('\n'),
      actions: [
        { label: 'Registrar audiencia', prompt: 'Como registro una audiencia?' },
        { label: 'Codigo de Comercio', url: 'https://www.diputados.gob.mx/LeyesBiblio/ref/ccom.htm' },
      ],
    },
  },
  {
    name: 'civil general',
    keywords: ['civil', 'arrendamiento', 'hipotecario', 'prescripcion', 'contrato', 'danos', 'posesion', 'propiedad'],
    phrases: [['materia', 'civil'], ['juicio', 'civil'], ['procedimiento', 'civil']],
    response: {
      text: [
        'Materia civil, fases generales de control:',
        '1. Analisis de accion: cumplimiento, rescisión, nulidad, pago, danos, posesion, propiedad, prescripcion, arrendamiento u otra.',
        '2. Documentos base y legitimacion.',
        '3. Demanda y medidas precautorias si proceden.',
        '4. Admision y emplazamiento.',
        '5. Contestacion, excepciones y reconvencion si existe.',
        '6. Audiencia o etapa procesal aplicable conforme al CNPCF y normas de implementacion local.',
        '7. Pruebas, alegatos, sentencia y ejecucion.',
        'Tip: usa Movimientos para acuerdos y Documentos para contratos, recibos, constancias y pruebas.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Expedientes', target: 'expedientes' },
        { label: 'CNPCF', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CNPCF.pdf' },
      ],
    },
  },
  {
    name: 'letrado general',
    keywords: ['letrado', 'menor', 'cuantia', 'civil', 'mercantil', 'rapido', 'simple'],
    phrases: [['juzgado', 'letrado'], ['materia', 'letrado'], ['menor', 'cuantia']],
    response: {
      text: [
        'Juzgados letrados, guia de organizacion:',
        '- Suelen manejar asuntos de menor complejidad o cuantia conforme a la competencia local.',
        '- Antes de registrar, verifica si el asunto corresponde por materia, cuantia, domicilio y tipo de accion.',
        '- Controla especialmente emplazamiento, acuerdos breves, requerimientos y fechas de audiencia.',
        '- En la app puedes clasificarlo como Letrado y luego elegir el juzgado correspondiente.',
        'Tip: adjunta documento base, identificaciones, comprobantes y constancias de notificacion desde el expediente.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Expedientes', target: 'expedientes' },
        { label: 'Subir documentos', prompt: 'Como subo documentos?' },
      ],
    },
  },
  {
    name: 'familiar general',
    keywords: ['familiar', 'divorcio', 'alimentos', 'custodia', 'convivencia', 'patria', 'potestad', 'sucesion'],
    phrases: [['materia', 'familiar'], ['juicio', 'familiar'], ['alimentos', 'custodia']],
    response: {
      text: [
        'Materia familiar, guia de control:',
        '- Asuntos frecuentes: divorcio, alimentos, guarda y custodia, convivencias, patria potestad, reconocimiento, adopcion, medidas de proteccion y sucesiones familiares cuando aplique.',
        '- Puntos sensibles: interes superior de niñas, niños y adolescentes; medidas provisionales; urgencia; notificaciones; convenios; pruebas psicologicas o de trabajo social.',
        '- Fases comunes: solicitud/demanda, admision, medidas provisionales, emplazamiento, contestacion, audiencias, pruebas, convenio o sentencia, ejecucion y seguimiento.',
        'En Judicial Managment conviene registrar audiencias y fechas de cumplimiento para evitar omisiones.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Calendario', target: 'calendario' },
        { label: 'CNPCF', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CNPCF.pdf' },
      ],
    },
  },
  {
    name: 'sucesiones',
    keywords: ['sucesion', 'sucesorio', 'herencia', 'intestamentario', 'testamentario', 'albacea', 'inventario'],
    phrases: [['juicio', 'sucesorio'], ['sucesion', 'intestamentaria'], ['sucesion', 'testamentaria']],
    response: {
      text: [
        'Sucesiones, checklist de control:',
        '- Identificar si es testamentaria o intestamentaria.',
        '- Acta de defuncion, actas familiares, testamento si existe y documentos de bienes.',
        '- Denuncia o solicitud inicial.',
        '- Reconocimiento de herederos y nombramiento de albacea.',
        '- Inventario y avaluo.',
        '- Administracion, proyecto de particion y adjudicacion.',
        '- Protocolizacion o inscripcion cuando proceda.',
        'En la app conviene usar documentos por etapa: actas, escrituras, certificados, inventario, avaluo y acuerdos.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Expedientes', target: 'expedientes' },
        { label: 'CNPCF', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CNPCF.pdf' },
      ],
    },
  },
  {
    name: 'penal general',
    keywords: ['penal', 'denuncia', 'querella', 'imputacion', 'vinculacion', 'intermedia', 'juicio', 'sentencia'],
    phrases: [['materia', 'penal'], ['procedimiento', 'penal'], ['audiencia', 'inicial']],
    response: {
      text: [
        'Materia penal, etapas de referencia en sistema acusatorio:',
        '- Investigacion inicial: desde denuncia, querella u otro requisito hasta que el imputado queda a disposicion del juez para formulacion de imputacion.',
        '- Investigacion complementaria: desde formulacion de imputacion hasta cierre de investigacion.',
        '- Etapa intermedia: ofrecimiento y admision de medios de prueba, depuracion de hechos controvertidos y auto de apertura a juicio.',
        '- Juicio: desahogo ante tribunal de enjuiciamiento y sentencia.',
        'Control recomendado: audiencias, medidas cautelares, plazos de investigacion, acuerdos probatorios, pruebas y resoluciones.',
      ].join('\n'),
      actions: [
        { label: 'Registrar audiencia', prompt: 'Como registro una audiencia?' },
        { label: 'CNPP', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CNPP.pdf' },
      ],
    },
  },
  {
    name: 'medidas cautelares y providencias',
    keywords: ['medida', 'medidas', 'cautelar', 'cautelares', 'providencia', 'precautoria', 'embargo', 'retencion'],
    phrases: [['medidas', 'cautelares'], ['providencias', 'precautorias'], ['embargo', 'precautorio']],
    response: {
      text: [
        'Medidas cautelares/providencias, guia de control:',
        '- Identifica la finalidad: conservar bienes, evitar dano, asegurar cumplimiento o proteger personas.',
        '- Revisa requisitos de procedencia por materia: apariencia del derecho, peligro en la demora, garantia, urgencia o necesidad.',
        '- Registra en la app: fecha de solicitud, acuerdo, garantia, diligencia, resultado y vencimientos.',
        '- Adjunta pruebas que justifican la medida y constancias de ejecucion.',
        'En mercantil pueden existir providencias precautorias; en familiar y penal hay medidas con logica de proteccion; en laboral hay reglas propias.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Movimientos', target: 'movimientos' },
        { label: 'Registrar plazo', prompt: 'Como controlo terminos y plazos?' },
      ],
    },
  },
  {
    name: 'pruebas',
    keywords: ['prueba', 'pruebas', 'documental', 'testimonial', 'pericial', 'confesional', 'inspeccion', 'oficio'],
    phrases: [['ofrecer', 'pruebas'], ['desahogo', 'pruebas'], ['prueba', 'pericial']],
    response: {
      text: [
        'Control de pruebas:',
        '- Documental: contratos, pagares, recibos, actas, constancias, fotos, correos.',
        '- Testimonial: nombres, domicilios, hechos que conocen y fecha de audiencia.',
        '- Pericial: materia, puntos cuestionados, perito, aceptacion y dictamen.',
        '- Informes/oficios: autoridad o institucion requerida, objeto y plazo.',
        '- Inspeccion: lugar, objeto y puntos a verificar.',
        'En la app: adjunta cada prueba al expediente y registra su admision/desahogo como movimiento.',
      ].join('\n'),
      actions: [
        { label: 'Subir documentos', prompt: 'Como subo documentos?' },
        { label: 'Abrir Movimientos', target: 'movimientos' },
      ],
    },
  },
  {
    name: 'notificaciones emplazamiento',
    keywords: ['notificacion', 'notificaciones', 'emplazamiento', 'cedula', 'actuario', 'boletin', 'estrados'],
    phrases: [['control', 'notificaciones'], ['fecha', 'notificacion'], ['emplazamiento', 'demandado']],
    response: {
      text: [
        'Control de notificaciones y emplazamientos:',
        '- Registra fecha exacta de notificacion.',
        '- Adjunta cedula, razon actuarial, boletin, lista o constancia.',
        '- Anota a quien se notifico y por que medio.',
        '- Calcula plazo conforme a materia y tipo de notificacion.',
        '- Si hay defecto de emplazamiento, marcala como alerta en movimientos.',
        'Tip: usa descripcion de movimiento con formato: Notificado el __ / plazo __ / vence __ / responsable __.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Movimientos', target: 'movimientos' },
        { label: 'Terminos y plazos', prompt: 'Como controlo terminos y plazos?' },
      ],
    },
  },
  {
    name: 'recursos impugnaciones',
    keywords: ['recurso', 'recursos', 'apelacion', 'revocacion', 'queja', 'impugnacion', 'agravios'],
    phrases: [['recurso', 'apelacion'], ['medio', 'impugnacion'], ['formular', 'agravios']],
    response: {
      text: [
        'Recursos e impugnaciones, guia de control:',
        '- Identifica resolucion impugnable y fecha de notificacion.',
        '- Verifica plazo, procedencia, efectos y autoridad que resuelve.',
        '- Define agravios: que parte causa perjuicio, por que es incorrecta y que se solicita.',
        '- Adjunta resolucion, constancia de notificacion y escrito presentado.',
        '- Registra vencimiento en calendario o movimientos.',
        'Si no procede recurso ordinario, revisa si puede existir amparo u otra via conforme al caso.',
      ].join('\n'),
      actions: [
        { label: 'Amparo', prompt: 'Explicame juicio de amparo' },
        { label: 'Registrar plazo', prompt: 'Como controlo terminos y plazos?' },
      ],
    },
  },
  {
    name: 'laboral conciliacion juicio',
    keywords: ['laboral', 'conciliacion', 'trabajador', 'patron', 'despido', 'prestaciones', 'ordinario', 'especial'],
    phrases: [['conciliacion', 'laboral'], ['juicio', 'laboral'], ['procedimiento', 'ordinario', 'laboral']],
    response: {
      text: [
        'Materia laboral, ruta general:',
        '- Conciliacion prejudicial: por regla general, antes de acudir al tribunal las partes deben asistir al Centro de Conciliacion, salvo excepciones legales.',
        '- Si hay convenio, se documenta el acuerdo.',
        '- Si no hay conciliacion, se obtiene constancia y puede seguir el juicio.',
        '- Procedimiento ordinario: conflictos laborales comunes como despido, prestaciones, reconocimiento de derechos.',
        '- Procedimiento especial: asuntos que la LFT tramita por reglas especiales.',
        'En la app, Conciliacion no requiere numero de expediente judicial; registra partes, fecha y si existe hoja/constancia de conciliacion.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Laboral', target: 'tribunal' },
        { label: 'LFT', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf' },
      ],
    },
  },
  {
    name: 'amparo',
    keywords: ['amparo', 'indirecto', 'directo', 'suspension', 'constitucional', 'quejoso', 'autoridad'],
    phrases: [['juicio', 'amparo'], ['amparo', 'indirecto'], ['amparo', 'directo'], ['suspension', 'amparo']],
    response: {
      text: [
        'Amparo, guia operativa muy general:',
        '- Amparo indirecto: suele tramitarse contra actos fuera de juicio, actos de imposible reparacion, normas generales u otros supuestos legales.',
        '- Amparo directo: normalmente procede contra sentencias definitivas, laudos o resoluciones que ponen fin al juicio.',
        '- Elementos de control: quejoso, autoridad responsable, acto reclamado, terceros interesados, conceptos de violacion, suspension, informes y audiencia constitucional o tramite ante colegiado.',
        '- Suspension: medida cautelar que debe revisarse con cuidado segun materia y acto reclamado.',
        'Recomendacion: registrar vencimientos y audiencias como movimientos/calendario.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Calendario', target: 'calendario' },
        { label: 'Ley de Amparo', url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/Ley_Amparo.pdf' },
      ],
    },
  },
  {
    name: 'terminos plazos',
    keywords: ['termino', 'terminos', 'plazo', 'plazos', 'fecha', 'vencimiento', 'notificacion'],
    phrases: [['control', 'plazos'], ['fecha', 'vencimiento'], ['terminos', 'procesales']],
    response: {
      text: [
        'Control de terminos y plazos:',
        '- Captura cada notificacion como movimiento.',
        '- Si hay audiencia, usa tipo Audiencia para enviarla al Calendario.',
        '- En descripcion anota: fecha de notificacion, tipo de acuerdo, plazo, vencimiento estimado y responsable.',
        '- Adjunta acuerdo/notificacion en PDF o imagen.',
        '- Verifica siempre si el plazo corre en dias habiles, naturales, por horas o con reglas especiales de materia.',
        'La app puede ayudar a ordenar, pero no debe sustituir el calculo legal del abogado.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Movimientos', target: 'movimientos' },
        { label: 'Abrir Calendario', target: 'calendario' },
      ],
    },
  },
  {
    name: 'buenas practicas despacho',
    keywords: ['organizar', 'ordenar', 'control', 'despacho', 'flujo', 'protocolo', 'practica'],
    phrases: [['organizar', 'expedientes'], ['control', 'despacho'], ['buenas', 'practicas']],
    response: {
      text: [
        'Buenas practicas para usar Judicial Managment:',
        '1. Crear expediente solo cuando ya tengas materia y juzgado definidos.',
        '2. Subir documento base desde el inicio.',
        '3. Registrar cada acuerdo como movimiento.',
        '4. Si hay audiencia, usar tipo Audiencia para enviarla al calendario.',
        '5. Usar Clientes para controlar adeudos y pagos.',
        '6. Archivar expedientes concluidos para limpiar la vista activa.',
        '7. Usar permisos: solo lectura para invitados nuevos y editor para quien pueda modificar.',
        '8. Escribir descripciones claras: fecha, acto, responsable y siguiente paso.',
      ].join('\n'),
      actions: [
        { label: 'Abrir Expedientes', target: 'expedientes' },
        { label: 'Abrir Configuracion', target: 'configuracion' },
      ],
    },
  },
  {
    name: 'glosario juridico',
    keywords: ['glosario', 'termino', 'que', 'significa', 'concepto', 'palabra'],
    phrases: [['que', 'significa'], ['explicame', 'termino'], ['glosario', 'juridico']],
    response: {
      text: [
        'Glosario rapido:',
        '- Demanda: escrito inicial donde se ejercita una accion.',
        '- Emplazamiento: acto formal para llamar a juicio a la contraparte.',
        '- Contestacion: respuesta del demandado.',
        '- Reconvencion: demanda del demandado contra el actor en el mismo juicio.',
        '- Prueba: medio para acreditar hechos.',
        '- Alegatos: argumentos finales sobre hechos y derecho.',
        '- Sentencia: resolucion que decide el fondo.',
        '- Ejecucion: fase para cumplir o hacer cumplir lo resuelto.',
        '- Acuerdo: determinacion procesal del juzgado.',
        '- Audiencia: acto procesal con comparecencia de partes, juez o autoridad.',
      ].join('\n'),
      actions: [
        { label: 'Mercantil', prompt: 'Explicame procedimientos mercantiles' },
        { label: 'Civil', prompt: 'Explicame fases de materia civil' },
        { label: 'Penal', prompt: 'Explicame fases de materia penal' },
      ],
    },
  },
];

const businessIntents: JurisIntent[] = [
  {
    name: 'suscripcion version limitada',
    keywords: ['suscripcion', 'pago', 'mensual', 'gratis', 'prueba', 'limitada', 'ilimitada'],
    phrases: [['10', 'dias'], ['version', 'limitada'], ['pago', 'mensual']],
    response: {
      text: [
        'Idea de version limitada/ilimitada:',
        '- Gratis: acceso inicial o prueba de 10 dias.',
        '- Limitada: controlar numero de despachos, expedientes, colaboradores, almacenamiento o funciones.',
        '- Ilimitada: desbloquear limites segun suscripcion.',
        '- Debe validarse desde servidor para evitar reinstalaciones o alteraciones locales.',
        'Las condiciones se muestran en el portal de suscripcion cuando el plan esta disponible.',
      ].join('\n'),
      actions: [
        { label: 'Configuracion', target: 'configuracion' },
        { label: 'Panel', target: 'dashboard' },
      ],
    },
  },
];

const intents: JurisIntent[] = [
  ...appIntents,
  ...legalIntents,
  ...businessIntents,
  {
    name: 'ayuda general',
    keywords: ['ayuda', 'puedes', 'hacer', 'como', 'guia', 'orientame'],
    response: {
      text: [
        'Opciones disponibles:',
        '- Usar la app: expedientes, archivo, clientes, movimientos, calendario, documentos, colaboradores y permisos.',
        '- Orientacion por materias: mercantil, civil, familiar, penal, laboral y amparo.',
        '- Buenas practicas: ordenar documentos, registrar audiencias, controlar plazos y archivar expedientes.',
        'Escribe una frase corta, por ejemplo: "subir pdf", "mercantil ejecutivo", "como archivo un expediente" o "fases penal".',
      ].join('\n'),
      actions: jurisQuickActions,
    },
  },
];

const scoreIntent = (input: string, intent: JurisIntent) => {
  const words = expandWords(input.split(' '));
  const keywordScore = intent.keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeInput(keyword);
    return score + (words.has(normalizedKeyword) || input.includes(normalizedKeyword) ? 1 : 0);
  }, 0);
  const phraseScore = (intent.phrases ?? []).reduce((score, phrase) => {
    const matched = phrase.every((word) => {
      const normalizedWord = normalizeInput(word);
      return words.has(normalizedWord) || input.includes(normalizedWord);
    });

    return score + (matched ? 6 : 0);
  }, 0);

  return keywordScore + phraseScore;
};

export const getJurisResponse = (rawInput: string): JurisResponse => {
  const input = normalizeInput(rawInput);
  if (!input) return jurisWelcome;

  const ranked = intents
    .map((intent) => ({ intent, score: scoreIntent(input, intent) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (best && best.score >= 1) {
    return best.intent.response;
  }

  return {
    text: [
      'No se encontro una coincidencia exacta. Puedes ir al modulo correcto o consultar una guia general.',
      'Prueba con frases como "crear expediente", "archivar expediente", "subir PDF", "registrar audiencia", "mercantil ejecutivo", "fases civil", "familiar alimentos" o "amparo suspension".',
    ].join('\n\n'),
    actions: [...appActions, ...jurisQuickActions.slice(4, 10)],
  };
};

export const jurisSources = sourceActions;
