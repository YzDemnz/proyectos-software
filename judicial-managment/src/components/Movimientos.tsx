import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, type DespachoMember, type DocumentAttachment, type Movimiento, type Expediente } from '../lib/supabase';
import { Plus, FileCheck, Search } from 'lucide-react';
import { DocumentAttachmentList, DocumentFilePicker, DocumentQuickUpload } from './DocumentAttachments';
import { createSignedDocumentUrls, uploadDocumentAttachments, type EscribaAttachmentRequest } from '../lib/documentAttachments';
import {
  createAudienceCalendarEvent,
  isAudiencia,
  movimientoTipos,
  parseMexicanDate,
  toDateInputValue,
  toMexicanDateFromDatabase,
} from '../lib/calendar';

interface MovimientosProps {
  despachoId: string;
  canEdit: boolean;
  onOpenInEscriba?: (request: EscribaAttachmentRequest) => void;
  refreshToken?: number;
}

export default function Movimientos({ despachoId, canEdit, onOpenInEscriba, refreshToken = 0 }: MovimientosProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [documentAttachments, setDocumentAttachments] = useState<DocumentAttachment[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [uploadedByNames, setUploadedByNames] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState('');
  const [movimientoFiles, setMovimientoFiles] = useState<File[]>([]);
  const [uploadingMovimientoId, setUploadingMovimientoId] = useState('');
  const [formData, setFormData] = useState({
    expediente_id: '',
    fecha: new Date().toISOString().split('T')[0],
    audiencia_fecha: toDateInputValue(),
    tipo: 'Audiencia',
    descripcion: ''
  });

  const fetchMovimientos = useCallback(async () => {
    const { data } = await supabase
      .from('movimientos')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('fecha', { ascending: false });
    if (data) setMovimientos(data);
  }, [despachoId]);

  const fetchExpedientes = useCallback(async () => {
    const { data } = await supabase
      .from('expedientes')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('numero_expediente');
    if (data) setExpedientes(data);
  }, [despachoId]);

  const fetchDocumentAttachments = useCallback(async () => {
    const { data, error } = await supabase
      .from('document_adjuntos')
      .select('*')
      .eq('despacho_id', despachoId)
      .eq('target_type', 'movimiento')
      .order('created_at', { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    const attachments = (data ?? []) as DocumentAttachment[];
    setDocumentAttachments(attachments);
    setAttachmentUrls(await createSignedDocumentUrls(attachments));
  }, [despachoId]);

  const fetchUploadedByNames = useCallback(async () => {
    const { data } = await supabase
      .from('despacho_miembros')
      .select('user_id,email,display_name')
      .eq('despacho_id', despachoId);
    setUploadedByNames(((data ?? []) as Array<Pick<DespachoMember, 'user_id' | 'email' | 'display_name'>>)
      .reduce<Record<string, string>>((result, member) => {
        result[member.user_id] = member.display_name?.trim() || member.email;
        return result;
      }, {}));
  }, [despachoId]);

  useEffect(() => {
    fetchMovimientos();
    fetchExpedientes();
    fetchDocumentAttachments();
    fetchUploadedByNames();
  }, [fetchMovimientos, fetchExpedientes, fetchDocumentAttachments, fetchUploadedByNames, refreshToken]);

  const movimientoAttachmentsById = useMemo(() => {
    return documentAttachments.reduce<Record<string, DocumentAttachment[]>>((accumulator, attachment) => {
      if (attachment.movimiento_id) {
        accumulator[attachment.movimiento_id] = [
          ...(accumulator[attachment.movimiento_id] ?? []),
          attachment,
        ];
      }

      return accumulator;
    }, {});
  }, [documentAttachments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    const selectedExpediente = expedientes.find((exp) => exp.id === formData.expediente_id);
    const fecha = isAudiencia(formData.tipo)
      ? parseMexicanDate(formData.audiencia_fecha)
      : formData.fecha;

    if (!fecha) {
      setMessage('La fecha de audiencia debe tener el formato dd/mm/aaaa.');
      return;
    }

    const { data, error } = await supabase
      .from('movimientos')
      .insert([
        {
          expediente_id: formData.expediente_id,
          fecha,
          tipo: formData.tipo,
          descripcion: formData.descripcion,
          despacho_id: despachoId,
        },
      ])
      .select('id')
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    let nextMessage = 'Movimiento guardado.';

    if (isAudiencia(formData.tipo) && data?.id) {
      const { error: calendarError } = await createAudienceCalendarEvent({
        despachoId,
        expedienteId: formData.expediente_id,
        movimientoId: data.id,
        expedienteNumero: selectedExpediente?.numero_expediente ?? 'N/A',
        descripcion: formData.descripcion,
        fecha,
      });

      if (calendarError) {
        nextMessage = `Movimiento guardado, pero no se pudo agregar al calendario: ${calendarError.message}`;
      } else {
        nextMessage = 'Movimiento guardado y audiencia agregada al calendario.';
      }
    }

    if (data?.id && movimientoFiles.length > 0) {
      const uploadResult = await uploadDocumentAttachments({
        despachoId,
        targetType: 'movimiento',
        targetId: data.id,
        files: movimientoFiles,
      });

      if (uploadResult.error) {
        nextMessage = `${nextMessage} No se pudieron adjuntar archivos: ${uploadResult.error}`;
      } else {
        nextMessage = `${nextMessage} Archivos adjuntos guardados.`;
      }
    }

    setMessage(nextMessage);
    setFormData({
      expediente_id: '',
      fecha: new Date().toISOString().split('T')[0],
      audiencia_fecha: toDateInputValue(),
      tipo: 'Audiencia',
      descripcion: ''
    });
    setMovimientoFiles([]);
    setShowForm(false);
    fetchMovimientos();
    fetchDocumentAttachments();
  };

  const handleAttachToMovimiento = async (movimientoId: string, files: File[]) => {
    if (files.length === 0) return;

    setUploadingMovimientoId(movimientoId);
    setMessage('');

    const uploadResult = await uploadDocumentAttachments({
      despachoId,
      targetType: 'movimiento',
      targetId: movimientoId,
      files,
    });

    if (uploadResult.error) {
      setMessage(uploadResult.error);
    } else {
      setMessage('Archivos adjuntos guardados.');
      fetchDocumentAttachments();
    }

    setUploadingMovimientoId('');
  };

  const getExpedienteNumero = (id: string) => {
    return expedientes.find(exp => exp.id === id)?.numero_expediente || 'N/A';
  };

  const filteredMovimientos = movimientos.filter(mov =>
    getExpedienteNumero(mov.expediente_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    mov.tipo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mov.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <FileCheck className="w-8 h-8 text-blue-800" />
          <h2 className="text-2xl font-bold text-gray-800">Movimientos</h2>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setMovimientoFiles([]);
              setShowForm(!showForm);
            }}
            className="flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-md hover:bg-blue-800 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo Movimiento
          </button>
        )}
      </div>

      {message && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </div>
      )}

      {showForm && canEdit && (
        <div className="bg-white rounded-md shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Nuevo Movimiento</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expediente *
              </label>
              <select
                required
                value={formData.expediente_id}
                onChange={(e) => setFormData({ ...formData, expediente_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-900 focus:border-transparent"
              >
                <option value="">Seleccionar expediente</option>
                {expedientes.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.numero_expediente} - {exp.partes}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha *
              </label>
              {isAudiencia(formData.tipo) ? (
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  pattern="\d{2}/\d{2}/\d{4}"
                  placeholder="00/00/0000"
                  value={formData.audiencia_fecha}
                  onChange={(e) => setFormData({ ...formData, audiencia_fecha: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                />
              ) : (
                <input
                  type="date"
                  required
                  value={formData.fecha}
                  onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo *
              </label>
              <select
                value={formData.tipo}
                onChange={(e) => {
                  const nextTipo = e.target.value;
                  setFormData({
                    ...formData,
                    tipo: nextTipo,
                    audiencia_fecha: isAudiencia(nextTipo)
                      ? toMexicanDateFromDatabase(formData.fecha)
                      : formData.audiencia_fecha,
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-900 focus:border-transparent"
              >
                {movimientoTipos.map((tipo) => (
                  <option key={tipo}>{tipo}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción *
              </label>
              <textarea
                required
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                placeholder="Detalle del movimiento..."
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Archivos del movimiento
              </label>
              <DocumentFilePicker
                files={movimientoFiles}
                onChange={setMovimientoFiles}
                onError={setMessage}
              />
            </div>

            <div className="col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setMovimientoFiles([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-900 text-white rounded-md hover:bg-blue-800"
              >
                Guardar Movimiento
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-md shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar movimientos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-900 focus:border-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Expediente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Descripción
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Archivos
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMovimientos.map((mov) => (
                <tr key={mov.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(mov.fecha).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {getExpedienteNumero(mov.expediente_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {mov.tipo}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {mov.descripcion}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 min-w-64">
                    <div className="space-y-2">
                      <DocumentAttachmentList
                        attachments={movimientoAttachmentsById[mov.id] ?? []}
                        attachmentUrls={attachmentUrls}
                        compact
                        uploadedByNames={uploadedByNames}
                        relationshipLabel={`Movimiento de ${getExpedienteNumero(mov.expediente_id)}`}
                        linkedExpedienteId={mov.expediente_id}
                        onOpenInEscriba={onOpenInEscriba}
                        emptyText="Sin archivos"
                      />
                      {canEdit && (
                        <DocumentQuickUpload
                          label={uploadingMovimientoId === mov.id ? 'Subiendo...' : 'Adjuntar'}
                          compact
                          disabled={uploadingMovimientoId === mov.id}
                          onError={setMessage}
                          onUpload={(files) => handleAttachToMovimiento(mov.id, files)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
