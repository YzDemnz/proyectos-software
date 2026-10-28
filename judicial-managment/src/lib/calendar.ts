import { supabase } from './supabase';

export const movimientoTipos = [
  'Audiencia',
  'Presentacion de Pruebas',
  'Alegatos',
  'Resolucion',
  'Apelacion',
  'Otros',
];

export const isAudiencia = (tipo: string) => tipo.trim().toLowerCase() === 'audiencia';

export const toDateInputValue = (date = new Date()) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
};

export const toMexicanDateFromDatabase = (value: string) => {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return '';

  return `${day}/${month}/${year}`;
};

export const parseMexicanDate = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const [, rawDay, rawMonth, rawYear] = match;
  const day = Number(rawDay);
  const month = Number(rawMonth);
  const year = Number(rawYear);
  const date = new Date(year, month - 1, day);
  const isValidDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!isValidDate) return null;

  return `${rawYear}-${rawMonth}-${rawDay}`;
};

export const formatEventDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'full',
  }).format(new Date(year, month - 1, day));
};

export const formatShortDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
};

interface AudienceCalendarEventInput {
  despachoId: string;
  expedienteId: string;
  movimientoId: string;
  expedienteNumero: string;
  descripcion: string;
  fecha: string;
}

export const createAudienceCalendarEvent = async ({
  despachoId,
  expedienteId,
  movimientoId,
  expedienteNumero,
  descripcion,
  fecha,
}: AudienceCalendarEventInput) => {
  return supabase.from('calendario_eventos').insert([
    {
      despacho_id: despachoId,
      expediente_id: expedienteId,
      movimiento_id: movimientoId,
      titulo: `Audiencia - Expediente ${expedienteNumero}`,
      descripcion,
      event_date: fecha,
      tipo: 'audiencia',
      notify_day_before: true,
      notify_same_day: true,
    },
  ]);
};
