import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bell, CalendarDays, FileText, Plus } from 'lucide-react';
import { supabase, type CalendarioEvento, type Expediente } from '../lib/supabase';
import { formatEventDate, formatShortDate } from '../lib/calendar';
import {
  requestCalendarNotificationPermission,
  runCalendarNotificationCheck,
} from '../lib/calendarNotifications';

interface CalendarioProps {
  despachoId: string;
  refreshToken?: number;
}

type CalendarEventType = 'audiencia' | 'vencimiento' | 'recordatorio' | 'otro';

const defaultFormState = () => ({
  titulo: '',
  descripcion: '',
  event_date: todayKey(),
  event_time: '',
  tipo: 'recordatorio' as CalendarEventType,
  expediente_id: '',
  notify_day_before: true,
  notify_same_day: true,
});

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const todayKey = () => toLocalDateKey(new Date());

const addDays = (dateValue: string, days: number) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  return toLocalDateKey(date);
};

export default function Calendario({ despachoId, refreshToken = 0 }: CalendarioProps) {
  const [events, setEvents] = useState<CalendarioEvento[]>([]);
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState(defaultFormState);
  const [submitting, setSubmitting] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported',
  );

  const fetchCalendar = useCallback(async () => {
    const [eventsResponse, expedientesResponse] = await Promise.all([
      supabase
        .from('calendario_eventos')
        .select('*')
        .eq('despacho_id', despachoId)
        .order('event_date', { ascending: true }),
      supabase
        .from('expedientes')
        .select('*')
        .eq('despacho_id', despachoId),
    ]);

    if (eventsResponse.error) {
      setMessage(eventsResponse.error.message);
      return;
    }

    setEvents((eventsResponse.data ?? []) as CalendarioEvento[]);
    setExpedientes((expedientesResponse.data ?? []) as Expediente[]);
  }, [despachoId]);

  useEffect(() => {
    void fetchCalendar();
  }, [fetchCalendar, refreshToken]);

  const expedienteById = useMemo(() => {
    return new Map(expedientes.map((expediente) => [expediente.id, expediente]));
  }, [expedientes]);

  const upcomingEvents = useMemo(() => {
    const today = todayKey();
    return events.filter((event) => event.event_date >= today);
  }, [events]);

  const todayEvents = useMemo(() => {
    const today = todayKey();
    return events.filter((event) => event.event_date === today);
  }, [events]);

  const nextSevenDaysEvents = useMemo(() => {
    const today = todayKey();
    const end = addDays(today, 7);
    return events.filter((event) => event.event_date >= today && event.event_date <= end);
  }, [events]);

  const handleNotificationPermission = async () => {
    const permission = await requestCalendarNotificationPermission();
    setNotificationPermission(permission);

    if (permission === 'granted') {
      await runCalendarNotificationCheck(despachoId);
      setMessage('Notificaciones activadas.');
    } else if (permission === 'denied') {
      setMessage('El sistema bloqueo las notificaciones para esta app.');
    } else {
      setMessage('Este equipo no permite notificaciones desde la app.');
    }
  };

  const handleCreateEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (!formData.titulo.trim() || !formData.event_date) {
      setMessage('Agrega título y fecha para guardar la cita.');
      return;
    }

    setSubmitting(true);
    setMessage('');

    const { error } = await supabase.from('calendario_eventos').insert([{
      despacho_id: despachoId,
      expediente_id: formData.expediente_id || null,
      titulo: formData.titulo.trim(),
      descripcion: formData.descripcion.trim(),
      event_date: formData.event_date,
      event_time: formData.event_time || null,
      tipo: formData.tipo,
      notify_day_before: formData.notify_day_before,
      notify_same_day: formData.notify_same_day,
    }]);

    setSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setFormData(defaultFormState());
    setMessage('Cita agregada al calendario.');
    await fetchCalendar();
    await runCalendarNotificationCheck(despachoId).catch(() => undefined);
  };

  const permissionLabel = notificationPermission === 'granted'
    ? 'Notificaciones activas'
    : notificationPermission === 'denied'
      ? 'Notificaciones bloqueadas'
      : 'Activar notificaciones';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-md">
            <CalendarDays className="w-6 h-6 text-blue-700" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Calendario</h2>
            <p className="text-sm text-slate-500">Audiencias y fechas importantes</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href="#calendario-manual"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
          >
            <Plus className="w-4 h-4" />
            Agendar cita
          </a>
          <button
            onClick={handleNotificationPermission}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-50"
          >
            <Bell className="w-4 h-4" />
            {permissionLabel}
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-md border border-blue-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Hoy</p>
          <p className="mt-2 text-3xl font-bold text-blue-800">{todayEvents.length}</p>
        </div>
        <div className="rounded-md border border-blue-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Próximos 7 días</p>
          <p className="mt-2 text-3xl font-bold text-blue-800">{nextSevenDaysEvents.length}</p>
        </div>
        <div className="rounded-md border border-blue-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Audiencias pendientes</p>
          <p className="mt-2 text-3xl font-bold text-blue-800">{upcomingEvents.length}</p>
        </div>
      </div>

      <section id="calendario-manual" className="rounded-md border border-blue-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Agendar manualmente</h3>
            <p className="text-sm text-slate-500">Crea una cita, audiencia, vencimiento o recordatorio directo en el calendario.</p>
          </div>
        </div>

        <form onSubmit={handleCreateEvent} className="grid gap-4 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
            <input
              value={formData.titulo}
              onChange={(event) => setFormData((current) => ({ ...current, titulo: event.target.value }))}
              maxLength={120}
              placeholder="Ej. Audiencia inicial / Cita con cliente"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
            <select
              value={formData.tipo}
              onChange={(event) => setFormData((current) => ({ ...current, tipo: event.target.value as CalendarEventType }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
            >
              <option value="recordatorio">Recordatorio</option>
              <option value="audiencia">Audiencia</option>
              <option value="vencimiento">Vencimiento</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Expediente opcional</label>
            <select
              value={formData.expediente_id}
              onChange={(event) => setFormData((current) => ({ ...current, expediente_id: event.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
            >
              <option value="">Sin expediente</option>
              {expedientes.map((expediente) => (
                <option key={expediente.id} value={expediente.id}>
                  {expediente.numero_expediente} - {expediente.partes}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fecha</label>
            <input
              type="date"
              value={formData.event_date}
              onChange={(event) => setFormData((current) => ({ ...current, event_date: event.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Hora</label>
            <input
              type="time"
              value={formData.event_time}
              onChange={(event) => setFormData((current) => ({ ...current, event_time: event.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Descripción</label>
            <input
              value={formData.descripcion}
              onChange={(event) => setFormData((current) => ({ ...current, descripcion: event.target.value }))}
              maxLength={300}
              placeholder="Detalle breve para identificar la cita"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 lg:col-span-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={formData.notify_day_before}
                onChange={(event) => setFormData((current) => ({ ...current, notify_day_before: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              Avisar un día antes
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={formData.notify_same_day}
                onChange={(event) => setFormData((current) => ({ ...current, notify_same_day: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              Avisar el mismo día
            </label>
          </div>

          <div className="flex justify-end lg:col-span-1">
            <button
              type="submit"
              disabled={submitting || !formData.titulo.trim() || !formData.event_date}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {submitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-md border border-blue-100 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-950">Agenda</h3>
        </div>

        <div className="divide-y divide-slate-200">
          {upcomingEvents.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No hay audiencias pendientes.
            </div>
          ) : (
            upcomingEvents.map((event) => {
              const expediente = event.expediente_id
                ? expedienteById.get(event.expediente_id)
                : null;

              return (
                <article key={event.id} className="p-5 hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-3">
                      <div className="mt-1 h-11 w-11 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                          {formatShortDate(event.event_date)}
                        </p>
                        <h4 className="mt-1 font-semibold text-slate-950">{event.titulo}</h4>
                        <p className="text-sm text-slate-600">{formatEventDate(event.event_date)}</p>
                        {event.descripcion && (
                          <p className="mt-2 text-sm text-slate-700">{event.descripcion}</p>
                        )}
                        {expediente && (
                          <p className="mt-2 text-xs text-slate-500">
                            {expediente.numero_expediente} - {expediente.partes}
                          </p>
                        )}
                      </div>
                    </div>

                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
