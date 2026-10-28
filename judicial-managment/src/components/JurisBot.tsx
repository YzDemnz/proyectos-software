import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Send, Sparkles } from 'lucide-react';
import JurisFace from './JurisFace';
import {
  getJurisResponse,
  jurisQuickActions,
  jurisSources,
  jurisWelcome,
  type JurisAction,
  type JurisTarget,
} from '../lib/jurisKnowledge';

interface JurisBotProps {
  onNavigate: (section: JurisTarget) => void;
}

interface JurisMessage {
  id: string;
  sender: 'juris' | 'user';
  text: string;
  actions?: JurisAction[];
}

const createJurisMessage = (text: string, actions: JurisAction[] = []): JurisMessage => ({
  id: crypto.randomUUID(),
  sender: 'juris',
  text,
  actions: actions.filter((action) => action.target !== 'escriba'),
});

const basicQuickActions = jurisQuickActions.filter((action) => action.target !== 'escriba');

export default function JurisBot({ onNavigate }: JurisBotProps) {
  const [messages, setMessages] = useState<JurisMessage[]>([
    createJurisMessage(jurisWelcome.text, jurisWelcome.actions),
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const sendPrompt = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const response = getJurisResponse(trimmed);
    const userMessage: JurisMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      text: trimmed,
    };

    setMessages((current) => [
      ...current,
      userMessage,
      createJurisMessage(response.text, response.actions),
    ]);
    setInput('');
  };

  const handleAction = (action: JurisAction) => {
    if (action.url) {
      window.open(action.url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (action.target) {
      onNavigate(action.target);
      return;
    }

    if (action.prompt) {
      sendPrompt(action.prompt);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    sendPrompt(input);
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-md border border-blue-100 bg-white shadow-sm">
        <div className="border-b border-blue-100 bg-blue-50 px-6 py-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <JurisFace />
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  <Sparkles className="w-4 h-4" />
                  Centro interno
                </div>
                <h2 className="mt-3 text-3xl font-bold text-slate-950">Ayuda del despacho</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Consulta accesos, pasos y tareas frecuentes del despacho.
                </p>
              </div>
            </div>
            <div className="rounded-md border border-blue-100 bg-white px-4 py-3 text-sm text-slate-600">
              Escribe una acción como crear expediente, subir PDF o registrar audiencia.
            </div>
          </div>
        </div>

        <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-h-[560px] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5">
              {messages.map((message) => {
                const isUser = message.sender === 'user';

                return (
                  <article
                    key={message.id}
                    className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    {isUser ? (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white">
                        Yo
                      </div>
                    ) : (
                      <JurisFace compact />
                    )}

                    <div className={`max-w-[82%] ${isUser ? 'text-right' : ''}`}>
                      <div
                        className={`rounded-md border px-4 py-3 text-sm leading-relaxed shadow-sm ${
                          isUser
                            ? 'border-blue-200 bg-blue-700 text-white'
                            : 'border-slate-200 bg-white text-slate-800'
                        }`}
                      >
                        {message.text}
                      </div>

                      {!isUser && message.actions && message.actions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {message.actions.map((action) => (
                            <button
                              key={`${message.id}-${action.label}`}
                              type="button"
                              onClick={() => handleAction(action)}
                              className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                            >
                              {action.label}
                              {action.target && <ArrowRight className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
              <div className="flex items-end gap-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      sendPrompt(input);
                    }
                  }}
                  rows={2}
                  maxLength={800}
                  placeholder="Que quieres hacer?"
                  className="min-h-11 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-blue-700 text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
                  title="Enviar"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-2 flex justify-end text-xs text-slate-400">{input.length}/800</div>
            </form>
          </div>

          <aside className="border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
              <Bot className="w-4 h-4" />
              Atajos
            </div>
            <div className="mt-4 space-y-2">
              {basicQuickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => handleAction(action)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
                >
                  {action.label}
                </button>
              ))}
            </div>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fuentes oficiales
              </p>
              <div className="mt-3 space-y-2">
                {jurisSources.map((source) => (
                  <button
                    key={source.label}
                    type="button"
                    onClick={() => handleAction(source)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
