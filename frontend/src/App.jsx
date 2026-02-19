import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  LogOut,
  Menu,
  Mic,
  Plus,
  SendHorizontal,
  Stethoscope,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { api } from './services/api';

const TOKEN_KEY = 'pd_jwt_token';
const USER_KEY = 'pd_user';

function parseStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSessionDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function normalizeMessageText(message) {
  if (message.structured) {
    const sections = [
      `Symptoms: ${message.structured.symptoms}`,
      `Possible Causes: ${message.structured.possible_causes}`,
      `Advice: ${message.structured.advice}`,
      `Urgency: ${message.structured.urgency_level}`,
      `When to See Doctor: ${message.structured.when_to_see_doctor}`,
    ];
    return sections.join('\n');
  }
  return message.text || '';
}

function AuthCard({ onSubmit, mode, setMode, busy, error }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
  });

  const title = mode === 'login' ? 'Welcome Back' : 'Create Account';

  const submit = async (event) => {
    event.preventDefault();
    await onSubmit({
      mode,
      email: form.email,
      password: form.password,
      full_name: form.fullName,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slatebg px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-panel p-8 shadow-chat">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300">
            <Stethoscope size={18} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Personal Doctor AI</p>
            <h1 className="text-xl font-semibold text-white">{title}</h1>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-emerald-400/40 placeholder:text-slate-500 focus:ring-2"
              placeholder="you@example.com"
              required
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="full_name">
                Full name
              </label>
              <input
                id="full_name"
                type="text"
                value={form.fullName}
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-emerald-400/40 placeholder:text-slate-500 focus:ring-2"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-emerald-400/40 placeholder:text-slate-500 focus:ring-2"
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </div>

          {error && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="mt-5 text-sm text-slate-300 underline decoration-slate-500 underline-offset-4 hover:text-white"
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(parseStoredUser);
  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [chatError, setChatError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [dictationSupported, setDictationSupported] = useState(false);

  const textareaRef = useRef(null);
  const streamRef = useRef(null);

  const authenticated = Boolean(token);
  const logout = useCallback(() => {
    setToken('');
    setUser(null);
    setSessions([]);
    setMessages([]);
    setActiveSessionId('');
    setChatError('');
    setAuthError('');
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const syncLayout = () => setSidebarOpen(!media.matches);
    syncLayout();
    media.addEventListener('change', syncLayout);
    return () => media.removeEventListener('change', syncLayout);
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setDictationSupported(Boolean(SpeechRecognition));
  }, []);

  useEffect(
    () => () => {
      if (streamRef.current) {
        streamRef.current.stop();
        streamRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    },
    []
  );

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.style.height = '0px';
    const next = Math.min(textareaRef.current.scrollHeight, 220);
    textareaRef.current.style.height = `${next}px`;
  }, [draft]);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const me = await api.me(token);
        if (cancelled) {
          return;
        }
        setUser(me);
        localStorage.setItem(USER_KEY, JSON.stringify(me));

        const result = await api.sessions(token);
        if (cancelled) {
          return;
        }
        const nextSessions = result?.sessions || [];
        setSessions(nextSessions);

        if (nextSessions.length) {
          const firstId = nextSessions[0].id;
          setActiveSessionId(firstId);
          setLoadingHistory(true);
          const history = await api.history(token, firstId);
          if (!cancelled) {
            setMessages(history?.messages || []);
          }
          setLoadingHistory(false);
        } else {
          setActiveSessionId('');
          setMessages([]);
        }
      } catch {
        if (!cancelled) {
          logout();
        }
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [authenticated, logout, token]);

  useEffect(() => {
    if (!voiceEnabled || !messages.length || !('speechSynthesis' in window)) {
      return;
    }
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(normalizeMessageText(last));
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [messages, voiceEnabled]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );

  const refreshSessions = async (preferredSessionId = '') => {
    const result = await api.sessions(token);
    const nextSessions = result?.sessions || [];
    setSessions(nextSessions);

    if (!nextSessions.length) {
      setActiveSessionId('');
      return '';
    }

    if (preferredSessionId && nextSessions.some((session) => session.id === preferredSessionId)) {
      setActiveSessionId(preferredSessionId);
      return preferredSessionId;
    }

    if (activeSessionId && nextSessions.some((session) => session.id === activeSessionId)) {
      return activeSessionId;
    }

    setActiveSessionId(nextSessions[0].id);
    return nextSessions[0].id;
  };

  const loadHistory = async (sessionId) => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    setLoadingHistory(true);
    setChatError('');
    try {
      const history = await api.history(token, sessionId);
      setMessages(history?.messages || []);
    } catch (error) {
      setChatError(error.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAuthSubmit = async ({ mode, email, password, full_name }) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const payload = mode === 'register' ? { email, password, full_name } : { email, password };
      const result = mode === 'register' ? await api.register(payload) : await api.login(payload);
      setToken(result.access_token);
      setUser(result.user);
      localStorage.setItem(TOKEN_KEY, result.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleNewChat = () => {
    setActiveSessionId('');
    setMessages([]);
    setChatError('');
  };

  const handleSelectSession = async (sessionId) => {
    setActiveSessionId(sessionId);
    await loadHistory(sessionId);
    if (window.matchMedia('(max-width: 900px)').matches) {
      setSidebarOpen(false);
    }
  };

  const handleSendMessage = async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) {
      return;
    }

    const pendingId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        role: 'user',
        text: trimmed,
        session_id: activeSessionId || '',
        created_at: new Date().toISOString(),
      },
    ]);
    setDraft('');
    setSending(true);
    setChatError('');

    try {
      const result = await api.chat(
        {
          message: trimmed,
          session_id: activeSessionId || undefined,
          language: 'en',
        },
        token
      );

      const nextSessionId = result.session_id;
      setActiveSessionId(nextSessionId);
      await refreshSessions(nextSessionId);
      await loadHistory(nextSessionId);
    } catch (error) {
      setMessages((prev) => prev.map((msg) => (msg.id === pendingId ? { ...msg, failed: true } : msg)));
      setChatError(error.message);
    } finally {
      setSending(false);
    }
  };

  const stopDictation = () => {
    if (streamRef.current) {
      streamRef.current.stop();
      streamRef.current = null;
    }
    setDictating(false);
  };

  const toggleDictation = () => {
    if (!dictationSupported) {
      setChatError('Speech dictation is not supported in this browser.');
      return;
    }

    if (dictating) {
      stopDictation();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setChatError('Speech dictation is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      setDraft((prev) => `${prev}${prev ? ' ' : ''}${transcript.trim()}`.trim());
    };

    recognition.onerror = () => {
      setChatError('Dictation failed. Check microphone permissions and try again.');
      setDictating(false);
    };

    recognition.onend = () => {
      setDictating(false);
      streamRef.current = null;
    };

    streamRef.current = recognition;
    setDictating(true);
    setChatError('');
    recognition.start();
  };

  if (!authenticated) {
    return <AuthCard onSubmit={handleAuthSubmit} mode={authMode} setMode={setAuthMode} busy={authBusy} error={authError} />;
  }

  return (
    <div className="flex h-screen flex-col bg-slatebg text-slate-100">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={`${
            sidebarOpen ? 'w-72' : 'w-0'
          } shrink-0 border-r border-white/10 bg-[#0b1220] transition-all duration-200`}
        >
          <div className={`${sidebarOpen ? 'flex' : 'hidden'} h-full flex-col`}>
            <div className="border-b border-white/10 p-3">
              <button
                type="button"
                onClick={handleNewChat}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-medium hover:bg-white/10"
              >
                <Plus size={16} />
                New chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => handleSelectSession(session.id)}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition ${
                    activeSessionId === session.id ? 'bg-emerald-500/20 text-emerald-200' : 'hover:bg-white/5'
                  }`}
                >
                  <p className="truncate text-sm font-medium">{session.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatSessionDate(session.last_message_at || session.created_at)}</p>
                </button>
              ))}
              {!sessions.length && <p className="px-2 pt-2 text-sm text-slate-400">No chats yet.</p>}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/10 bg-panel px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"
                aria-label="Toggle sidebar"
              >
                <Menu size={18} />
              </button>
              <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300">
                <Stethoscope size={18} />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-white sm:text-base">Personal Doctor AI</h1>
                <p className="text-xs text-slate-400">{user?.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10"
            >
              <LogOut size={14} />
              Logout
            </button>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto bg-[#111827] px-4 py-5">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
              {loadingHistory && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 size={15} className="animate-spin" />
                  Loading chat...
                </div>
              )}

              {!sortedMessages.length && !loadingHistory && (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-6 text-center text-slate-300">
                  Start a conversation. Enter sends message, Shift+Enter adds a new line.
                </div>
              )}

              {sortedMessages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-3xl rounded-2xl px-4 py-3 shadow-sm ${
                    message.role === 'user'
                      ? 'ml-auto bg-emerald-500/15 text-emerald-100'
                      : 'mr-auto border border-white/10 bg-panelSoft text-slate-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-6">{normalizeMessageText(message)}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
                    <span>{formatTime(message.created_at)}</span>
                  </div>
                  {message.failed && (
                    <p className="mt-2 rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200">Failed to persist. Retry.</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-white/10 bg-panel px-4 py-4">
            <div className="mx-auto w-full max-w-4xl">
              {chatError && (
                <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {chatError}
                </div>
              )}

              <div className="rounded-2xl border border-white/15 bg-slate-900 p-3">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Message Personal Doctor AI..."
                  rows={1}
                  className="max-h-56 min-h-[44px] w-full resize-none bg-transparent px-1 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleDictation}
                      className={`rounded-lg p-2 transition ${
                        dictating ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                      title="Dictate"
                      aria-label="Dictate"
                    >
                      <Mic size={18} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setVoiceEnabled((prev) => !prev)}
                      className={`rounded-lg p-2 transition ${
                        voiceEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                      title="Use Voice"
                      aria-label="Use Voice"
                    >
                      {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={sending || !draft.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={16} />}
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer className="border-t border-white/10 bg-[#0b1220] px-4 py-2 text-center text-xs text-slate-400">
        Not a substitute for professional medical advice. Sohaib Shahid All Rights Reserved.
      </footer>
    </div>
  );
}
