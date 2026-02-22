import React, { useEffect, useState } from 'react';
import { Loader2, Stethoscope } from 'lucide-react';

import MedicalBackground from './MedicalBackground';
import { api } from '../services/api';
import { containsUrdu, formatTime, normalizeMessageText, renderMessageHtml } from '../utils/chat';

export default function SharedConversationPage({ shareId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [conversation, setConversation] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await api.getSharedConversation(shareId);
        if (!cancelled) {
          setConversation(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-slatebg text-slate-100">
      <MedicalBackground />
      <header className="relative z-10 border-b border-white/10 bg-slate-900/85 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
          <div className="pd-stethoscope-emerald rounded-lg bg-emerald-500/20 p-2 text-emerald-300">
            <Stethoscope size={18} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Shared Conversation</p>
            <h1 className="text-base font-semibold text-white">
              {conversation?.title || 'Personal Doctor AI'}
            </h1>
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 size={15} className="animate-spin" />
              Loading shared conversation...
            </div>
          )}
          {error && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

          {(conversation?.messages || []).map((message) => {
            const messageText = normalizeMessageText(message);
            const urduScriptClass = containsUrdu(messageText) ? 'urdu-left-align' : '';
            return (
              <div
                key={message.id}
                className={`max-w-3xl rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'ml-auto bg-emerald-500/15 text-emerald-100'
                    : 'mr-auto border border-white/10 bg-slate-800/80 text-slate-100'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div
                    className={`message-rich text-sm leading-6 ${urduScriptClass}`.trim()}
                    dangerouslySetInnerHTML={{ __html: renderMessageHtml(message) }}
                  />
                ) : (
                  <p className={`whitespace-pre-wrap text-sm leading-6 ${urduScriptClass}`.trim()}>
                    {messageText}
                  </p>
                )}
                <div className="mt-2 text-[11px] text-slate-400">{formatTime(message.created_at)}</div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-slate-900/85 px-4 py-2 text-center text-xs text-slate-400 backdrop-blur">
        Not a substitute for professional medical advice. Sohaib Shahid — All Rights Reserved.
      </footer>
    </div>
  );
}
