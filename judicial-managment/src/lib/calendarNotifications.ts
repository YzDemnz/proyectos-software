import { supabase, type CalendarioEvento } from './supabase';

const dayMs = 24 * 60 * 60 * 1000;

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * dayMs);

const wasAlreadySent = (eventId: string, kind: string, todayKey: string) => {
  return window.localStorage.getItem(`jm-calendar-notification:${eventId}:${kind}:${todayKey}`) === 'sent';
};

const markAsSent = (eventId: string, kind: string, todayKey: string) => {
  window.localStorage.setItem(`jm-calendar-notification:${eventId}:${kind}:${todayKey}`, 'sent');
};

export const requestCalendarNotificationPermission = async () => {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  return Notification.requestPermission();
};

export const runCalendarNotificationCheck = async (despachoId: string) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const tomorrowKey = toLocalDateKey(addDays(today, 1));

  const { data } = await supabase
    .from('calendario_eventos')
    .select('*')
    .eq('despacho_id', despachoId)
    .in('event_date', [todayKey, tomorrowKey]);

  const events = (data ?? []) as CalendarioEvento[];

  events.forEach((event) => {
    if (event.event_date === todayKey && event.notify_same_day) {
      const kind = 'same-day';
      if (!wasAlreadySent(event.id, kind, todayKey)) {
        new Notification('Audiencia hoy', {
          body: `${event.titulo}${event.descripcion ? ` - ${event.descripcion}` : ''}`,
        });
        markAsSent(event.id, kind, todayKey);
      }
    }

    if (event.event_date === tomorrowKey && event.notify_day_before) {
      const kind = 'day-before';
      if (!wasAlreadySent(event.id, kind, todayKey)) {
        new Notification('Audiencia manana', {
          body: `${event.titulo}${event.descripcion ? ` - ${event.descripcion}` : ''}`,
        });
        markAsSent(event.id, kind, todayKey);
      }
    }
  });
};
