import { useCallback, useEffect, useState } from 'react';
import { supabase, type Cliente, type ClienteMovimiento, type Expediente } from '../lib/supabase';
import { Plus, Users, Search, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

interface ClientesProps {
  despachoId: string;
  canEdit: boolean;
  refreshToken?: number;
}

export default function Clientes({ despachoId, canEdit, refreshToken = 0 }: ClientesProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [movimientos, setMovimientos] = useState<ClienteMovimiento[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [showMovForm, setShowMovForm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    monto_pactado: ''
  });
  const [newMovimiento, setNewMovimiento] = useState<{
    tipo: 'cargo' | 'abono';
    monto: string;
    descripcion: string;
  }>({
    tipo: 'cargo',
    monto: '',
    descripcion: ''
  });

  const fetchClientes = useCallback(async () => {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('nombre');
    if (data) setClientes(data);
  }, [despachoId]);

  const fetchExpedientes = useCallback(async () => {
    const { data } = await supabase
      .from('expedientes')
      .select('*')
      .eq('despacho_id', despachoId);
    if (data) setExpedientes(data);
  }, [despachoId]);

  const fetchMovimientos = useCallback(async () => {
    const { data } = await supabase
      .from('cliente_movimientos')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('created_at', { ascending: false });
    if (data) setMovimientos(data);
  }, [despachoId]);

  useEffect(() => {
    fetchClientes();
    fetchExpedientes();
    fetchMovimientos();
  }, [fetchClientes, fetchExpedientes, fetchMovimientos, refreshToken]);

  const getClienteMovimientos = (clienteId: string) => {
    return movimientos.filter(m => m.cliente_id === clienteId);
  };

  const getClienteExpediente = (clienteId: string) => {
    return expedientes.find(e => e.cliente_id === clienteId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('clientes').insert([{
      nombre: formData.nombre,
      monto_pactado: parseFloat(formData.monto_pactado) || 0,
      total_adeudo: parseFloat(formData.monto_pactado) || 0,
      despacho_id: despachoId
    }]);

    if (!error) {
      setFormData({
        nombre: '',
        monto_pactado: ''
      });
      setShowForm(false);
      fetchClientes();
    }
  };

  const handleAddMovimiento = async (e: React.FormEvent, clienteId: string) => {
    e.preventDefault();
    const monto = parseFloat(newMovimiento.monto);

    const { error: movError } = await supabase.from('cliente_movimientos').insert([{
      cliente_id: clienteId,
      tipo: newMovimiento.tipo,
      monto,
      descripcion: newMovimiento.descripcion,
      despacho_id: despachoId
    }]);

    if (!movError) {
      const cliente = clientes.find(c => c.id === clienteId);
      if (cliente) {
        const newAdeudo = newMovimiento.tipo === 'cargo'
          ? cliente.total_adeudo + monto
          : Math.max(0, cliente.total_adeudo - monto);

        await supabase
          .from('clientes')
          .update({ total_adeudo: newAdeudo })
          .eq('id', clienteId);
      }

      setNewMovimiento({
        tipo: 'cargo',
        monto: '',
        descripcion: ''
      });
      setShowMovForm(null);
      fetchMovimientos();
      fetchClientes();
    }
  };

  const handleDeleteMovimiento = async (movId: string) => {
    const movimiento = movimientos.find(m => m.id === movId);
    if (movimiento) {
      const cliente = clientes.find(c => c.id === movimiento.cliente_id);
      if (cliente) {
        const newAdeudo = movimiento.tipo === 'cargo'
          ? Math.max(0, cliente.total_adeudo - movimiento.monto)
          : cliente.total_adeudo + movimiento.monto;

        await supabase
          .from('clientes')
          .update({ total_adeudo: newAdeudo })
          .eq('id', cliente.id);
      }
    }

    await supabase.from('cliente_movimientos').delete().eq('id', movId);
    fetchMovimientos();
    fetchClientes();
  };

  const filteredClientes = clientes.filter(cliente =>
    cliente.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-md">
            <Users className="w-6 h-6 text-blue-800" />
          </div>
          <h2 className="text-2xl font-bold text-blue-800">Clientes</h2>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-md hover:bg-blue-800 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo Cliente
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="bg-white rounded-md shadow-sm p-6 border border-blue-100">
          <h3 className="text-lg font-semibold mb-4 text-blue-800">Nuevo Cliente</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Cliente *
              </label>
              <input
                type="text"
                required
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-900 focus:border-transparent"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monto Pactado (Honorarios) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.monto_pactado}
                onChange={(e) => setFormData({ ...formData, monto_pactado: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                placeholder="0.00"
              />
            </div>

            <div className="col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-700 text-white rounded-md hover:shadow-lg  transition-all border-b border-blue-700"
              >
                Guardar Cliente
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-md shadow-sm border border-blue-100">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar clientes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-900 focus:border-transparent"
            />
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredClientes.map((cliente) => {
            const expediente = getClienteExpediente(cliente.id);
            return (
              <div key={cliente.id} className="border-b border-gray-200 last:border-b-0">
                <button
                  onClick={() => setExpandedClientId(expandedClientId === cliente.id ? null : cliente.id)}
                  className="w-full px-6 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{cliente.nombre}</h3>
                        {expediente && (
                          <p className="text-sm text-gray-600">Exp: {expediente.numero_expediente}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Adeudo: ${cliente.total_adeudo.toFixed(2)} / Pactado: ${cliente.monto_pactado.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {expandedClientId === cliente.id ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {expandedClientId === cliente.id && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 space-y-4">
                    <div>
                      <h4 className="font-semibold text-gray-800 mb-3">Gestión de Honorarios</h4>

                      <div className="bg-white p-4 rounded-md border border-gray-200 mb-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Monto Pactado</p>
                            <p className="text-lg font-bold text-blue-800">${cliente.monto_pactado.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Adeudo Actual</p>
                            <p className={`text-lg font-bold ${cliente.total_adeudo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              ${cliente.total_adeudo.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Pagado</p>
                            <p className="text-lg font-bold text-green-600">
                              ${Math.max(0, cliente.monto_pactado - cliente.total_adeudo).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <h5 className="text-sm font-medium text-gray-700">Movimientos</h5>
                        {getClienteMovimientos(cliente.id).map((mov) => (
                          <div key={mov.id} className="bg-white p-3 rounded-md border border-gray-200 flex justify-between items-start">
                            <div>
                              <p className={`text-sm font-medium ${mov.tipo === 'cargo' ? 'text-red-600' : 'text-green-600'}`}>
                                {mov.tipo === 'cargo' ? '+ Cargo' : '- Abono'}: ${mov.monto.toFixed(2)}
                              </p>
                              {mov.descripcion && <p className="text-xs text-gray-600 mt-1">{mov.descripcion}</p>}
                              <p className="text-xs text-gray-500 mt-1">{new Date(mov.created_at).toLocaleDateString('es-ES')}</p>
                            </div>
                            {canEdit && (
                              <button
                                onClick={() => handleDeleteMovimiento(mov.id)}
                                className="text-red-600 hover:text-red-700 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {showMovForm === cliente.id && canEdit ? (
                        <form onSubmit={(e) => handleAddMovimiento(e, cliente.id)} className="bg-white p-3 rounded-md border border-blue-100 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Tipo *
                              </label>
                              <select
                                value={newMovimiento.tipo}
                                onChange={(e) => setNewMovimiento({ ...newMovimiento, tipo: e.target.value as 'cargo' | 'abono' })}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                              >
                                <option value="cargo">Cargo</option>
                                <option value="abono">Abono</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Monto *
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                required
                                value={newMovimiento.monto}
                                onChange={(e) => setNewMovimiento({ ...newMovimiento, monto: e.target.value })}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Descripción
                            </label>
                            <input
                              type="text"
                              value={newMovimiento.descripcion}
                              onChange={(e) => setNewMovimiento({ ...newMovimiento, descripcion: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                              placeholder="Ej: Primer pago, Acuerdo..."
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setShowMovForm(null)}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              className="flex-1 px-2 py-1 bg-blue-700 text-white rounded text-sm hover:shadow-lg  transition-all border-b border-blue-700 font-medium"
                            >
                              Guardar
                            </button>
                          </div>
                        </form>
                      ) : canEdit ? (
                        <button
                          onClick={() => setShowMovForm(cliente.id)}
                          className="w-full px-3 py-2 border border-blue-200 text-blue-800 rounded-md text-sm hover:bg-blue-50 font-medium transition-colors"
                        >
                          + Anadir Cargo o Abono
                        </button>
                      ) : (
                        <p className="text-sm text-gray-500">Permiso de solo lectura.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
