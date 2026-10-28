import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FileText, Image as ImageIcon, MessageSquare, Paperclip, Send, X } from 'lucide-react';
import {
  supabase,
  type DespachoChatAdjunto,
  type DespachoChatMensaje,
  type DespachoMember,
  type DespachoRole,
} from '../lib/supabase';

interface DespachoChatProps {
  despachoId: string;
}

const chatFilesBucket = 'despacho-chat-files';
const maxFileSize = 25 * 1024 * 1024;

const roleLabels: Record<DespachoRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Solo lectura',
};

const genericNameLabels: Record<DespachoRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  editor: 'Colaborador',
  viewer: 'Solo lectura',
};

const defaultProfileColor = '#1D4ED8';

interface ModerationDetection {
  category: string;
  terms: string[];
}

const moderationRules: Array<{ category: string; terms: string[] }> = [
  {
    category: 'violencia_o_delito',
    terms: [
      'voy a matar',
      'hay que matar',
      'amenazar a',
      'extorsionar',
      'sobornar al juez',
      'sobornar al secretario',
      'falsificar documentos',
      'fabricar pruebas',
      'desaparecer pruebas',
    ],
  },
  {
    category: 'odio_o_discriminacion',
    terms: [
      'odio racial',
      'raza inferior',
      'discriminar por raza',
      'discriminar por religion',
      'discriminar por orientacion',
      'lenguaje racista',
      'ataque racista',
    ],
  },
  {
    category: 'amenaza_o_acoso',
    terms: [
      'te voy a buscar',
      'te voy a destruir',
      'voy a hacerle dano',
      'chantajear',
      'publicar sus datos',
      'filtrar sus datos',
    ],
  },
];

const normalizeForModeration = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const detectModerationRisk = (value: string): ModerationDetection | null => {
  const normalizedValue = normalizeForModeration(value);

  for (const rule of moderationRules) {
    const matchedTerms = rule.terms.filter((term) => normalizedValue.includes(normalizeForModeration(term)));
    if (matchedTerms.length > 0) {
      return {
        category: rule.category,
        terms: matchedTerms,
      };
    }
  }

  return null;
};

const allowedMimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const acceptMimeTypes = '*/*';

const formatMessageTime = (dateValue: string) => {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(dateValue));
};

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? '';

const getSupportedFileType = (file: File) => {
  const extension = getFileExtension(file.name);
  return (allowedMimeByExtension[extension] ?? file.type) || 'application/octet-stream';
};

const isImageAttachment = (attachment: DespachoChatAdjunto) => {
  return attachment.file_type.startsWith('image/');
};

const safeFileName = (fileName: string) => {
  const extension = getFileExtension(fileName);
  const baseName = fileName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'archivo';

  return extension ? `${baseName}.${extension}` : baseName;
};

export default function DespachoChat({ despachoId }: DespachoChatProps) {
  const [messages, setMessages] = useState<DespachoChatMensaje[]>([]);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Record<string, DespachoChatAdjunto[]>>({});
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<DespachoMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [body, setBody] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const fetchInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  const memberByUserId = useMemo(() => {
    return new Map(members.map((member) => [member.user_id, member]));
  }, [members]);

  const upsertMessage = useCallback((nextMessage: DespachoChatMensaje) => {
    setMessages((currentMessages) => {
      const withoutDuplicate = currentMessages.filter((message) => message.id !== nextMessage.id);
      return [...withoutDuplicate, nextMessage]
        .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
        .slice(-80);
    });
  }, []);

  const fetchMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from('despacho_miembros')
      .select('*')
      .eq('despacho_id', despachoId)
      .order('created_at', { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMembers((data ?? []) as DespachoMember[]);
  }, [despachoId]);

  const fetchAttachments = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) {
      setAttachmentsByMessage({});
      setAttachmentUrls({});
      return;
    }

    const { data, error } = await supabase
      .from('despacho_chat_adjuntos')
      .select('*')
      .in('message_id', messageIds)
      .order('created_at', { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const attachments = (data ?? []) as DespachoChatAdjunto[];
    const grouped = attachments.reduce<Record<string, DespachoChatAdjunto[]>>((accumulator, attachment) => {
      accumulator[attachment.message_id] = [...(accumulator[attachment.message_id] ?? []), attachment];
      return accumulator;
    }, {});

    const signedUrlPairs = await Promise.all(
      attachments.map(async (attachment) => {
        const { data: signedData } = await supabase.storage
          .from(chatFilesBucket)
          .createSignedUrl(attachment.storage_path, 60 * 60);

        return [attachment.id, signedData?.signedUrl ?? ''] as const;
      }),
    );

    setAttachmentsByMessage(grouped);
    setAttachmentUrls(Object.fromEntries(signedUrlPairs));
  }, []);

  const fetchMessages = useCallback(async () => {
    if (fetchInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    fetchInFlightRef.current = true;

    try {
      do {
        refreshQueuedRef.current = false;
        const { data, error } = await supabase
          .from('despacho_chat_mensajes')
          .select('*')
          .eq('despacho_id', despachoId)
          .order('created_at', { ascending: false })
          .limit(80);

        if (error) {
          setErrorMessage(error.message);
          break;
        }

        const nextMessages = ((data ?? []) as DespachoChatMensaje[]).reverse();
        setMessages(nextMessages);
        await fetchAttachments(nextMessages.map((message) => message.id));
      } while (refreshQueuedRef.current);
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [despachoId, fetchAttachments]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? '');
    });
    fetchMembers();
    fetchMessages();
  }, [fetchMembers, fetchMessages]);

  useEffect(() => {
    let disposed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimerRef.current) return;
      setRealtimeState('reconnecting');
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        subscribeToChat();
      }, 1_500);
    };

    const subscribeToChat = () => {
      if (disposed) return;

      const previousChannel = chatChannelRef.current;
      if (previousChannel) {
        chatChannelRef.current = null;
        void supabase.removeChannel(previousChannel);
      }

      setRealtimeState('connecting');
      supabase.realtime.connect();

      const channel = supabase
        .channel(`despacho-chat:${despachoId}`, {
          config: {
            broadcast: { ack: true, self: false },
          },
        })
        .on('broadcast', { event: 'message-created' }, (event) => {
          const signal = event.payload as { despachoId?: string; messageId?: string } | null;
          if (signal?.despachoId === despachoId && signal.messageId) {
            void fetchMessages();
          }
        })
        .on('broadcast', { event: 'attachment-created' }, () => {
          void fetchMessages();
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'despacho_chat_mensajes',
            filter: `despacho_id=eq.${despachoId}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const nextMessage = payload.new as DespachoChatMensaje;
              if (nextMessage?.id) {
                upsertMessage(nextMessage);
                return;
              }
            }
            void fetchMessages();
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'despacho_chat_adjuntos',
            filter: `despacho_id=eq.${despachoId}`,
          },
          () => {
            void fetchMessages();
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'despacho_miembros',
            filter: `despacho_id=eq.${despachoId}`,
          },
          () => {
            void fetchMembers();
          },
        )
        .subscribe((status) => {
          if (disposed) return;

          if (status === 'SUBSCRIBED') {
            clearReconnectTimer();
            setRealtimeState('connected');
            void fetchMessages();
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            void fetchMessages();
            scheduleReconnect();
            return;
          }

          setRealtimeState('connecting');
        });

      chatChannelRef.current = channel;
    };

    subscribeToChat();

    refreshTimerRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible' && chatChannelRef.current?.state !== 'joined') void fetchMessages();
    }, 60_000);

    const refreshOnFocus = () => {
      void fetchMessages();
      if (chatChannelRef.current?.state !== 'joined') {
        scheduleReconnect();
      }
    };

    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('online', refreshOnFocus);

    return () => {
      disposed = true;
      clearReconnectTimer();
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('online', refreshOnFocus);
      if (chatChannelRef.current) {
        const channel = chatChannelRef.current;
        chatChannelRef.current = null;
        void supabase.removeChannel(channel);
      }
    };
  }, [despachoId, fetchMembers, fetchMessages, upsertMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, attachmentsByMessage]);

  useEffect(() => {
    if (!currentUserId || messages.length === 0) return;
    const latestMessageAt = messages[messages.length - 1]?.created_at ?? new Date().toISOString();
    window.localStorage.setItem(`judicial-chat-read:${despachoId}:${currentUserId}`, latestMessageAt);
  }, [currentUserId, despachoId, messages]);

  const getGenericMemberName = (member?: DespachoMember) => {
    if (!member) return 'Colaborador';
    if (member.role === 'owner') return genericNameLabels.owner;

    const sameRoleMembers = members
      .filter((item) => item.role === member.role)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const roleIndex = sameRoleMembers.findIndex((item) => item.id === member.id) + 1;

    return `${genericNameLabels[member.role]} ${roleIndex || 1}`;
  };

  const getMemberDisplayName = (member?: DespachoMember) => {
    if (!member) return 'Colaborador';
    return member.display_name?.trim() || getGenericMemberName(member);
  };

  const getMemberColor = (member?: DespachoMember) => {
    return member?.profile_color || defaultProfileColor;
  };

  const handleFileSelect = (file: File | undefined) => {
    setErrorMessage('');
    if (!file) return;

    if (file.size > maxFileSize) {
      setErrorMessage('El archivo debe pesar 25 MB o menos.');
      return;
    }

    setSelectedFile(file);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = async () => {
    const trimmedBody = body.trim();
    if (sending) return;
    if (!trimmedBody && !selectedFile) return;

    setSending(true);
    setErrorMessage('');

    const { data: sessionData } = await supabase.auth.getSession();
    const senderUserId = sessionData.session?.user.id;
    if (!senderUserId) {
      setErrorMessage('Debes iniciar sesión para enviar mensajes.');
      setSending(false);
      return;
    }

    const messageId = crypto.randomUUID();
    let uploadedPath = '';
    let attachmentPayload: Omit<DespachoChatAdjunto, 'id' | 'created_at'> | null = null;

    if (selectedFile) {
      const fileType = getSupportedFileType(selectedFile);
      const storagePath = `${despachoId}/chat/${messageId}/${Date.now()}-${safeFileName(selectedFile.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(chatFilesBucket)
        .upload(storagePath, selectedFile, {
          contentType: fileType,
          upsert: false,
        });

      if (uploadError) {
        setErrorMessage(uploadError.message);
        setSending(false);
        return;
      }

      uploadedPath = storagePath;
      attachmentPayload = {
        message_id: messageId,
        despacho_id: despachoId,
        storage_path: storagePath,
        file_name: selectedFile.name,
        file_type: fileType,
        file_size: selectedFile.size,
        uploaded_by: senderUserId,
      };
    }

    const messageBody = trimmedBody || `Archivo adjunto: ${selectedFile?.name ?? 'archivo'}`;
    const moderationDetection = detectModerationRisk(messageBody);
    const optimisticMessage: DespachoChatMensaje = {
      id: messageId,
      despacho_id: despachoId,
      sender_user_id: senderUserId,
      body: messageBody,
      created_at: new Date().toISOString(),
    };

    setMessages((currentMessages) => (
      currentMessages.some((message) => message.id === messageId)
        ? currentMessages
        : [...currentMessages, optimisticMessage].slice(-80)
    ));

    const { error: messageError } = await supabase.from('despacho_chat_mensajes').insert([
      {
        id: messageId,
        despacho_id: despachoId,
        sender_user_id: senderUserId,
        body: messageBody,
      },
    ]);

    if (messageError) {
      setMessages((currentMessages) => currentMessages.filter((message) => message.id !== messageId));
      if (uploadedPath) {
        await supabase.storage.from(chatFilesBucket).remove([uploadedPath]);
      }
      setErrorMessage(messageError.message);
      setSending(false);
      return;
    }

    void chatChannelRef.current?.send({
      type: 'broadcast',
      event: 'message-created',
      payload: { despachoId, messageId },
    });

    if (moderationDetection) {
      const updateState = await window.judicialDesktop?.getAppUpdateState?.().catch(() => null);
      void supabase.from('moderation_flags').insert([
        {
          despacho_id: despachoId,
          message_id: messageId,
          user_id: senderUserId,
          matched_category: moderationDetection.category,
          matched_terms: moderationDetection.terms,
          excerpt: messageBody.slice(0, 500),
        },
      ]);
      void supabase.from('support_reports').insert([
        {
          user_id: senderUserId,
          despacho_id: despachoId,
          category: 'seguridad',
          title: `Alerta de chat: ${moderationDetection.category}`,
          description: [
            'Reporte automatico generado por el chat del despacho.',
            `Categoria detectada: ${moderationDetection.category}.`,
            `Terminos coincidentes: ${moderationDetection.terms.join(', ') || 'No informados'}.`,
            '',
            `Extracto: ${messageBody.slice(0, 800)}`,
          ].join('\n'),
          steps_to_reproduce: 'Coincidencia detectada al enviar un mensaje en el chat del despacho.',
          expected_behavior: 'Revisión manual desde el panel de administración antes de aplicar cualquier medida.',
          contains_sensitive_data: true,
          priority: 'high',
          app_version: updateState?.currentVersion ?? null,
          platform: window.judicialDesktop?.platform ?? navigator.platform,
        },
      ]);
    }

    if (attachmentPayload) {
      const { error: attachmentError } = await supabase.from('despacho_chat_adjuntos').insert([attachmentPayload]);
      if (attachmentError) {
        setErrorMessage(`Mensaje enviado, pero no se pudo adjuntar el archivo: ${attachmentError.message}`);
      } else {
        void chatChannelRef.current?.send({
          type: 'broadcast',
          event: 'attachment-created',
          payload: { despachoId, messageId },
        });
      }
    }

    setBody('');
    clearSelectedFile();
    setSending(false);
    fetchMessages();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    sendMessage();
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  };

  const renderAttachment = (attachment: DespachoChatAdjunto, isOwnMessage: boolean) => {
    const signedUrl = attachmentUrls[attachment.id];

    return (
      <a
        key={attachment.id}
        href={signedUrl || undefined}
        target="_blank"
        rel="noreferrer"
        download={attachment.file_name}
        className={`mt-2 block overflow-hidden rounded-md border text-left shadow-sm transition-colors ${
          isOwnMessage
            ? 'border-blue-200 bg-white text-slate-800 hover:bg-blue-50'
            : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-white'
        }`}
      >
        {isImageAttachment(attachment) && signedUrl && (
          <img
            src={signedUrl}
            alt={attachment.file_name}
            className="max-h-48 w-full object-cover"
          />
        )}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="rounded-md bg-blue-50 p-2 text-blue-700">
            {isImageAttachment(attachment) ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{attachment.file_name}</p>
            <p className="text-xs text-slate-500">{formatFileSize(attachment.file_size)}</p>
          </div>
          <Download className="w-4 h-4 text-slate-400" />
        </div>
      </a>
    );
  };

  return (
    <section className="bg-white rounded-md shadow-sm border border-blue-100 overflow-hidden min-h-[520px] flex flex-col">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-blue-50 text-blue-700">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-blue-800">Chat del despacho</h3>
            <p className="text-sm text-slate-500">Mensajes y archivos internos entre colaboradores</p>
          </div>
        </div>
        <div className="text-right">
          <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {messages.length} mensaje(s)
          </span>
          <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold ${
            realtimeState === 'connected' ? 'text-emerald-700' : 'text-amber-700'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${realtimeState === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {realtimeState === 'connected' ? 'En tiempo real' : 'Reconectando'}
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="mx-5 mt-4 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="flex-1 p-5 space-y-4 max-h-[32rem] overflow-y-auto bg-slate-50/60">
        {messages.length === 0 ? (
          <div className="h-full min-h-64 rounded-md border border-dashed border-blue-200 bg-white px-4 py-8 text-center text-sm text-slate-500 flex items-center justify-center">
            Todavia no hay mensajes. Escribe o adjunta un archivo para iniciar la conversacion del despacho.
          </div>
        ) : (
          messages.map((message) => {
            const member = memberByUserId.get(message.sender_user_id);
            const isOwnMessage = message.sender_user_id === currentUserId;
            const attachments = attachmentsByMessage[message.id] ?? [];
            const moderationDetection = detectModerationRisk(message.body);

            return (
              <article
                key={message.id}
                className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
              >
                {member?.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-blue-100"
                  />
                ) : (
                  <div
                    className="h-10 w-10 shrink-0 rounded-full text-white flex items-center justify-center text-sm font-semibold"
                    style={{ backgroundColor: getMemberColor(member) }}
                  >
                    {getMemberDisplayName(member).slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className={`min-w-0 max-w-[82%] ${isOwnMessage ? 'items-end text-right' : ''}`}>
                  <div className={`mb-1 flex flex-wrap items-center gap-2 ${isOwnMessage ? 'justify-end' : ''}`}>
                    <span className="text-sm font-semibold" style={{ color: getMemberColor(member) }}>
                      {getMemberDisplayName(member)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {member ? roleLabels[member.role] : 'Colaborador'}
                    </span>
                    <span className="text-xs text-slate-400">{formatMessageTime(message.created_at)}</span>
                    {moderationDetection && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700"
                        title={`Alerta de moderacion: ${moderationDetection.category}`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Alerta
                      </span>
                    )}
                  </div>
                  <div
                    className={`rounded-md border px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                      moderationDetection
                        ? 'border-red-200 bg-red-50 text-red-950'
                        : isOwnMessage
                        ? 'border-blue-200 bg-blue-700 text-white'
                        : 'border-slate-200 bg-white text-slate-800'
                    }`}
                  >
                    {message.body}
                  </div>
                  {attachments.map((attachment) => renderAttachment(attachment, isOwnMessage))}
                </div>
              </article>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
        {selectedFile && (
          <div className="mb-3 flex items-center gap-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950">
            <Paperclip className="w-4 h-4 text-blue-700" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{selectedFile.name}</p>
              <p className="text-xs text-blue-700">{formatFileSize(selectedFile.size)}</p>
            </div>
            <button
              type="button"
              onClick={clearSelectedFile}
              className="rounded-md p-1 text-blue-700 hover:bg-blue-100"
              title="Quitar archivo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-3">
          <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-blue-200 text-blue-700 transition-colors hover:bg-blue-50">
            <Paperclip className="w-5 h-5" />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={acceptMimeTypes}
              onChange={(event) => handleFileSelect(event.target.files?.[0])}
            />
          </label>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            maxLength={2000}
            rows={2}
            placeholder="Escribe un mensaje para el despacho..."
            className="min-h-11 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={sending || (!body.trim() && !selectedFile)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-blue-700 text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
            title="Enviar mensaje"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>Enter envia. Shift + Enter agrega salto de linea.</span>
          <span>{body.length}/2000</span>
        </div>
      </form>
    </section>
  );
}
