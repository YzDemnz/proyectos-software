import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  KeyRound,
  Plus,
  RefreshCcw,
  RotateCcw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { supabase, type Despacho, type DespachoMember, type DespachoRole } from '../lib/supabase';

interface DespachosGateProps {
  userId: string;
  userEmail: string;
  onSelectDespacho: (membership: DespachoMember) => void;
}

const roleLabels: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Solo lectura',
};

const formatSupabaseError = (errorMessage: string) => {
  if (
    errorMessage.includes('schema cache') ||
    errorMessage.includes('create_despacho') ||
    errorMessage.includes('join_despacho_by_code') ||
    errorMessage.includes('request_despacho_deletion') ||
    errorMessage.includes('restore_deleted_despacho') ||
    errorMessage.includes('purge_expired_deleted_despachos') ||
    errorMessage.includes('despacho_miembros')
  ) {
    return 'Falta actualizar la base de datos en Supabase. Aplica el SQL mas reciente y vuelve a intentar.';
  }

  return errorMessage;
};

const getDespacho = (membership: DespachoMember) => membership.despacho as Despacho | undefined;

const membershipRoleWeight: Record<DespachoRole, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

const formatRecoveryDate = (dateValue?: string | null) => {
  if (!dateValue) return 'fecha no disponible';

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(dateValue));
};

export default function DespachosGate({ userId, userEmail, onSelectDespacho }: DespachosGateProps) {
  const [memberships, setMemberships] = useState<DespachoMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DespachoMember | null>(null);
  const [deskName, setDeskName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');

  const activeMemberships = useMemo(() => {
    return memberships.filter((membership) => !getDespacho(membership)?.deleted_at);
  }, [memberships]);

  const deletedOwnedMemberships = useMemo(() => {
    return memberships.filter((membership) => {
      const despacho = getDespacho(membership);
      return membership.role === 'owner' && Boolean(despacho?.deleted_at);
    });
  }, [memberships]);

  const createdByUserCount = useMemo(() => {
    return activeMemberships.filter((membership) => membership.role === 'owner').length;
  }, [activeMemberships]);

  const hasDespachos = activeMemberships.length > 0;
  const hasRecoverableDespachos = deletedOwnedMemberships.length > 0;
  const hasWorkspaceContent = hasDespachos || hasRecoverableDespachos;
  const canCreateDespacho = createdByUserCount < 2;

  const fetchDespachos = useCallback(async () => {
    setLoading(true);
    setMessage('');

    await supabase.rpc('purge_expired_deleted_despachos');

    const { data, error } = await supabase
      .from('despacho_miembros')
      .select('*, despacho:despachos(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      setMessage(formatSupabaseError(error.message));
      setMemberships([]);
    } else {
      const uniqueMemberships = new Map<string, DespachoMember>();
      for (const membership of (data ?? []) as DespachoMember[]) {
        const current = uniqueMemberships.get(membership.despacho_id);
        if (!current || membershipRoleWeight[membership.role] > membershipRoleWeight[current.role]) {
          uniqueMemberships.set(membership.despacho_id, membership);
        }
      }
      setMemberships([...uniqueMemberships.values()]);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchDespachos();
  }, [fetchDespachos]);

  const handleCreateDespacho = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreateDespacho) {
      setMessage('Ya creaste el máximo de 2 despachos.');
      return;
    }

    setCreating(true);
    setMessage('');

    const { error } = await supabase.rpc('create_despacho', {
      despacho_nombre: deskName.trim(),
    });

    if (error) {
      setMessage(formatSupabaseError(error.message));
    } else {
      setDeskName('');
      setMessage('Despacho creado correctamente.');
      await fetchDespachos();
    }

    setCreating(false);
  };

  const handleJoinDespacho = async (event: React.FormEvent) => {
    event.preventDefault();
    setJoining(true);
    setMessage('');

    const { error } = await supabase.rpc('join_despacho_by_code', {
      invitation_code: inviteCode.trim(),
    });

    if (error) {
      setMessage(formatSupabaseError(error.message));
    } else {
      setInviteCode('');
      setMessage('Te uniste al despacho correctamente.');
      await fetchDespachos();
    }

    setJoining(false);
  };

  const handleRequestDeletion = async () => {
    if (!deleteTarget) return;

    const despacho = getDespacho(deleteTarget);
    if (!despacho) return;

    setDeleting(true);
    setMessage('');

    const { error } = await supabase.rpc('request_despacho_deletion', {
      target_despacho_id: despacho.id,
    });

    if (error) {
      setMessage(formatSupabaseError(error.message));
    } else {
      setDeleteTarget(null);
      setMessage('Despacho enviado a papelera. Tienes 4 días para recuperarlo.');
      await fetchDespachos();
    }

    setDeleting(false);
  };

  const handleRestoreDespacho = async (membership: DespachoMember) => {
    const despacho = getDespacho(membership);
    if (!despacho) return;

    setRestoringId(despacho.id);
    setMessage('');

    const { error } = await supabase.rpc('restore_deleted_despacho', {
      target_despacho_id: despacho.id,
    });

    if (error) {
      setMessage(formatSupabaseError(error.message));
    } else {
      setMessage('Despacho recuperado correctamente.');
      await fetchDespachos();
    }

    setRestoringId('');
  };

  const actions = (
    <div className={hasWorkspaceContent ? 'grid grid-cols-2 gap-3' : 'space-y-4'}>
      <form
        onSubmit={handleCreateDespacho}
        className="bg-white border border-blue-100 rounded-md p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-5 h-5 text-blue-700" />
          <h2 className="font-semibold text-slate-950">Crear Despacho</h2>
        </div>
        <input
          value={deskName}
          onChange={(event) => setDeskName(event.target.value)}
          disabled={!canCreateDespacho}
          required
          placeholder={canCreateDespacho ? 'Nombre del despacho' : 'Máximo de 2 despachos creados'}
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={creating || !canCreateDespacho}
          className="mt-3 w-full bg-blue-700 text-white py-2 rounded-md text-sm font-medium transition-colors hover:bg-blue-800 disabled:opacity-50"
        >
          {creating ? 'Creando...' : 'Crear'}
        </button>
      </form>

      <form
        onSubmit={handleJoinDespacho}
        className="bg-white border border-blue-100 rounded-md p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-5 h-5 text-blue-700" />
          <h2 className="font-semibold text-slate-950">Añadir Despacho</h2>
        </div>
        <input
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
          required
          placeholder="Código de invitación"
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm uppercase focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={joining}
          className="mt-3 w-full border border-blue-200 text-blue-700 py-2 rounded-md text-sm font-medium transition-colors hover:bg-blue-50 disabled:opacity-50"
        >
          {joining ? 'Uniendo...' : 'Unirme'}
        </button>
      </form>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center animate-pulse">
          <Briefcase className="mx-auto w-12 h-12 text-blue-700" />
          <p className="mt-3 text-slate-600">Cargando despachos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 animate-slide-in-up">
      {hasWorkspaceContent && (
        <div className="max-w-7xl mx-auto mb-6 flex items-start justify-between gap-6">
          <div className="w-full max-w-xl">{actions}</div>
          <button
            onClick={fetchDespachos}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-700"
          >
            <RefreshCcw className="w-4 h-4" />
            Actualizar
          </button>
        </div>
      )}

      <div className={hasWorkspaceContent ? 'max-w-7xl mx-auto' : 'max-w-2xl mx-auto min-h-[70vh] flex items-center'}>
        <div className="w-full">
          {!hasWorkspaceContent && (
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 rounded-md bg-blue-700 text-white flex items-center justify-center mb-4 shadow-lg shadow-blue-200">
                <Briefcase className="w-8 h-8" />
              </div>
              <h1 className="text-3xl font-bold text-slate-950">Crear Despacho</h1>
              <p className="text-slate-600 mt-2">
                Crea tu espacio de trabajo jurídico o únete al despacho de otro licenciado.
              </p>
            </div>
          )}

          {!hasWorkspaceContent && actions}

          {message && (
            <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              {message}
            </div>
          )}

          {hasDespachos && (
            <div className="mt-6">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-slate-950">Tus despachos</h1>
                  <p className="text-slate-500 text-sm mt-1">
                    Sesión activa: {userEmail}
                  </p>
                </div>
                <span className="text-sm text-slate-500">
                  {createdByUserCount}/2 despachos creados por ti
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeMemberships.map((membership, index) => {
                  const despacho = getDespacho(membership);
                  return (
                    <article
                      key={membership.id}
                      className="bg-white border border-slate-200 rounded-md p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"
                      style={{ animationDelay: `${index * 80}ms` }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-950">
                            {despacho?.nombre ?? 'Despacho'}
                          </h2>
                          <p className="text-sm text-slate-500 mt-1">
                            {roleLabels[membership.role] ?? membership.role}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {membership.role === 'owner' && despacho && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(membership)}
                              title="Eliminar despacho"
                              className="h-10 w-10 rounded-md border border-red-100 bg-red-50 text-red-700 flex items-center justify-center transition-colors hover:bg-red-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <div className="w-10 h-10 rounded-md bg-blue-50 text-blue-700 flex items-center justify-center">
                            <Users className="w-5 h-5" />
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => onSelectDespacho(membership)}
                        className="mt-6 w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-2 rounded-md text-sm font-medium transition-colors hover:bg-blue-800"
                      >
                        Entrar
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {hasRecoverableDespachos && (
            <section className="mt-8 bg-white border border-amber-200 rounded-md shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
                <div>
                  <h2 className="font-semibold text-slate-950">Despachos en papelera</h2>
                  <p className="text-sm text-amber-800">
                    Solo el propietario puede recuperarlos antes de que termine el plazo.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-200">
                {deletedOwnedMemberships.map((membership) => {
                  const despacho = getDespacho(membership);
                  if (!despacho) return null;

                  return (
                    <div key={membership.id} className="px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-950">{despacho.nombre}</h3>
                        <p className="text-sm text-slate-600">
                          Se puede recuperar hasta {formatRecoveryDate(despacho.delete_after)}.
                        </p>
                      </div>
                      <button
                        onClick={() => handleRestoreDespacho(membership)}
                        disabled={restoringId === despacho.id}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {restoringId === despacho.id ? 'Recuperando...' : 'Recuperar'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex min-h-0 items-center justify-center overflow-y-auto bg-slate-950/60 px-4 py-4">
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-md bg-white shadow-2xl animate-soft-fade">
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
              <div className="rounded-md bg-red-50 p-2 text-red-700">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-950">Eliminar despacho</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {getDespacho(deleteTarget)?.nombre ?? 'Despacho'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-700">
                El despacho se ocultará de la lista principal y tendrás 4 días para recuperarlo.
                Despues de ese plazo podra borrarse definitivamente junto con sus expedientes,
                clientes, movimientos y calendario.
              </p>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Esta acción solo puede hacerla el propietario.
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRequestDeletion}
                disabled={deleting}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Si, enviar a papelera'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
