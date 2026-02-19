import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  HelpCircle,
  Loader2,
  LogOut,
  Menu,
  Mic,
  Plus,
  SendHorizontal,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Volume2,
  VolumeX,
} from 'lucide-react';

import AuthCard from './components/AuthCard';
import MedicalBackground from './components/MedicalBackground';
import SharedConversationPage from './components/SharedConversationPage';
import { api } from './services/api';
import {
  firebaseLogout,
  getFirebaseIdToken,
  getFirebaseUser,
  loginWithEmailAndPassword,
  loginWithGoogle,
  resendVerificationEmail,
  signupWithEmailAndPassword,
  subscribeToIdTokenChanges,
} from './services/firebase';
import {
  containsUrdu,
  decodeJwtExpiryMs,
  formatSessionDate,
  formatTime,
  getInitials,
  normalizeMessageText,
  parseStoredUser,
  selectFemaleVoice,
} from './utils/chat';

const TOKEN_KEY = 'pd_access_token';
const TOKEN_EXPIRY_KEY = 'pd_access_token_exp_ms';
const USER_KEY = 'pd_user';
const SILENCE_TIMEOUT_MS = 2500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
const AUTH_GENERIC_ERROR = 'Unable to authenticate right now. Please try again.';

function toAuthMessage(error) {
  const rawMessage = (error?.message || '').trim();
  if (!rawMessage) {
    return AUTH_GENERIC_ERROR;
  }
  const statusMatch = rawMessage.match(/^Request failed \((\d{3})\)\.?$/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status >= 500) {
      return 'Server error. Please try again in a moment.';
    }
    return AUTH_GENERIC_ERROR;
  }
  return rawMessage;
}

export default function App() {
  const shareRouteId = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    const match = window.location.pathname.match(/^\/share\/([^/]+)$/);
    return match ? match[1] : '';
  }, []);

  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [tokenExpiryMs, setTokenExpiryMs] = useState(() => Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0));
  const [user, setUser] = useState(parseStoredUser);

  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [pendingVerificationLogin, setPendingVerificationLogin] = useState({ email: '', password: '' });

  const [chatLanguage, setChatLanguage] = useState('en');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');

  const [draft, setDraft] = useState('');
  const [dictationSupported, setDictationSupported] = useState(false);
  const [dictationState, setDictationState] = useState('idle');
  const [voices, setVoices] = useState([]);
  const [speakingMessageId, setSpeakingMessageId] = useState('');
  const [autoVoice, setAutoVoice] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');

  const textAreaRef = useRef(null);
  const scrollBottomRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const utteranceRef = useRef(null);
  const autoSpokenMessageRef = useRef('');
  const userMenuRef = useRef(null);
  const shareMenuRef = useRef(null);

  const authenticated = Boolean(token);
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setSpeakingMessageId('');
  }, []);

  const stopDictation = useCallback(
    (manual = true) => {
      clearSilenceTimer();
      const recognition = recognitionRef.current;
      if (!recognition) {
        setDictationState('idle');
        return;
      }
      try {
        recognition.stop();
      } catch {
        // no-op
      }
      recognitionRef.current = null;
      setDictationState(manual ? 'idle' : 'processing');
      if (!manual) {
        window.setTimeout(() => setDictationState('idle'), 350);
      }
    },
    [clearSilenceTimer]
  );

  const clearLocalSession = useCallback(() => {
    setToken('');
    setTokenExpiryMs(0);
    setUser(null);
    setSessions([]);
    setActiveSessionId('');
    setMessages([]);
    setDraft('');
    setChatError('');
    setShareError('');
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const logout = useCallback(async () => {
    stopSpeaking();
    stopDictation(true);
    try {
      await firebaseLogout();
    } catch {
      // ignore
    }
    clearLocalSession();
  }, [clearLocalSession, stopDictation, stopSpeaking]);

  const applyBackendSession = useCallback((payload) => {
    const nextToken = payload.access_token;
    const expiry = decodeJwtExpiryMs(nextToken) || Date.now() + 1000 * 60 * 30;
    setToken(nextToken);
    setTokenExpiryMs(expiry);
    setUser(payload.user);
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiry));
    localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  }, []);

  const exchangeFirebaseForBackendToken = useCallback(async () => {
    const firebaseToken = await getFirebaseIdToken(true);
    const backendSession = await api.loginWithFirebaseToken(firebaseToken);
    applyBackendSession(backendSession);
    return backendSession;
  }, [applyBackendSession]);

  const loadHistory = useCallback(
    async (sessionId, authToken = token) => {
      if (!sessionId || !authToken) {
        setMessages([]);
        return;
      }
      setLoadingHistory(true);
      setChatError('');
      try {
        const history = await api.history(authToken, sessionId);
        setMessages(history?.messages || []);
      } catch (error) {
        setChatError(error.message);
      } finally {
        setLoadingHistory(false);
      }
    },
    [token]
  );

  const refreshSessions = useCallback(
    async (preferredSessionId = '', authToken = token) => {
      if (!authToken) {
        setSessions([]);
        return '';
      }
      const payload = await api.sessions(authToken);
      const nextSessions = payload?.sessions || [];
      setSessions(nextSessions);
      if (!nextSessions.length) {
        setActiveSessionId('');
        return '';
      }
      if (preferredSessionId && nextSessions.some((entry) => entry.id === preferredSessionId)) {
        setActiveSessionId(preferredSessionId);
        return preferredSessionId;
      }
      if (activeSessionId && nextSessions.some((entry) => entry.id === activeSessionId)) {
        return activeSessionId;
      }
      const first = nextSessions[0].id;
      setActiveSessionId(first);
      return first;
    },
    [activeSessionId, token]
  );

  useEffect(() => {
    if (shareRouteId) {
      return;
    }

    let cancelled = false;
    const unsubscribe = subscribeToIdTokenChanges(async (firebaseUser) => {
      if (cancelled) {
        return;
      }
      if (!firebaseUser) {
        clearLocalSession();
        return;
      }

      const passwordProvider = firebaseUser.providerData.some(
        (provider) => provider.providerId === 'password'
      );
      if (passwordProvider && !firebaseUser.emailVerified) {
        setAuthError('Please verify your email before login.');
        setAuthInfo('');
        try {
          await firebaseLogout();
        } catch {
          // ignore
        }
        clearLocalSession();
        return;
      }

      try {
        setAuthError('');
        await exchangeFirebaseForBackendToken();
      } catch (error) {
        if (!cancelled) {
          setAuthError(toAuthMessage(error));
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [clearLocalSession, exchangeFirebaseForBackendToken, shareRouteId]);

  useEffect(() => {
    if (!authenticated || shareRouteId) {
      return;
    }
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const me = await api.me(token);
        if (cancelled) return;
        setUser(me);
        localStorage.setItem(USER_KEY, JSON.stringify(me));

        const sessionId = await refreshSessions('', token);
        if (cancelled) return;
        if (sessionId) {
          await loadHistory(sessionId, token);
        } else {
          setMessages([]);
        }
      } catch (error) {
        if (!cancelled) {
          setChatError(error.message);
          clearLocalSession();
        }
      }
    };
    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [authenticated, clearLocalSession, loadHistory, refreshSessions, shareRouteId, token]);

  useEffect(() => {
    if (shareRouteId) return;
    if (!textAreaRef.current) return;
    textAreaRef.current.style.height = '0px';
    textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 220)}px`;
  }, [draft, shareRouteId]);

  useEffect(() => {
    if (shareRouteId) return;
    scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [loadingHistory, sending, sortedMessages, shareRouteId]);

  useEffect(() => {
    if (shareRouteId) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setDictationSupported(Boolean(SpeechRecognition));
  }, [shareRouteId]);

  useEffect(() => {
    if (shareRouteId || !('speechSynthesis' in window)) return undefined;
    const syncVoices = () => setVoices(window.speechSynthesis.getVoices());
    syncVoices();
    window.speechSynthesis.addEventListener('voiceschanged', syncVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', syncVoices);
  }, [shareRouteId]);

  useEffect(() => {
    if (shareRouteId) return;
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => setSidebarOpen(!media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [shareRouteId]);

  useEffect(() => {
    if (shareRouteId) return;
    const onPointerDown = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
      if (shareMenuRef.current && !shareMenuRef.current.contains(event.target)) {
        setShareMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [shareRouteId]);

  useEffect(() => {
    if (!token || !tokenExpiryMs || shareRouteId) return;
    const msUntilExpiry = tokenExpiryMs - Date.now();
    if (msUntilExpiry <= 0) {
      logout();
      return;
    }
    const timer = window.setTimeout(() => logout(), msUntilExpiry);
    return () => window.clearTimeout(timer);
  }, [logout, shareRouteId, token, tokenExpiryMs]);

  useEffect(() => {
    if (!token || !tokenExpiryMs || shareRouteId) return;
    const msUntilRefresh = tokenExpiryMs - Date.now() - 60_000;
    if (msUntilRefresh <= 0) {
      const currentUser = getFirebaseUser();
      if (currentUser) {
        exchangeFirebaseForBackendToken().catch(() => logout());
      }
      return;
    }
    const timer = window.setTimeout(() => {
      const currentUser = getFirebaseUser();
      if (!currentUser) {
        logout();
        return;
      }
      exchangeFirebaseForBackendToken().catch(() => logout());
    }, msUntilRefresh);
    return () => window.clearTimeout(timer);
  }, [exchangeFirebaseForBackendToken, logout, shareRouteId, token, tokenExpiryMs]);

  useEffect(
    () => () => {
      clearSilenceTimer();
      stopDictation(true);
      stopSpeaking();
    },
    [clearSilenceTimer, stopDictation, stopSpeaking]
  );

  const speakMessage = useCallback(
    (message) => {
      if (!('speechSynthesis' in window)) {
        setChatError('Text-to-speech is not supported in this browser.');
        return;
      }
      const text = normalizeMessageText(message);
      if (!text.trim()) return;

      stopSpeaking();
      const utterance = new SpeechSynthesisUtterance(text);
      const lang = containsUrdu(text) ? 'ur-PK' : 'en-US';
      utterance.lang = lang;
      utterance.rate = 0.92;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const selectedVoice = selectFemaleVoice(voices, lang);
      if (selectedVoice) utterance.voice = selectedVoice;

      utterance.onend = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null;
          setSpeakingMessageId('');
        }
      };
      utterance.onerror = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null;
          setSpeakingMessageId('');
        }
      };

      utteranceRef.current = utterance;
      setSpeakingMessageId(message.id);
      window.speechSynthesis.speak(utterance);
    },
    [stopSpeaking, voices]
  );

  const toggleMessageSpeech = useCallback(
    (message) => {
      if (speakingMessageId === message.id) {
        stopSpeaking();
        return;
      }
      speakMessage(message);
    },
    [speakMessage, speakingMessageId, stopSpeaking]
  );

  useEffect(() => {
    if (!autoVoice) {
      autoSpokenMessageRef.current = '';
      return;
    }
    const lastAssistant = [...sortedMessages].reverse().find((message) => message.role === 'assistant');
    if (!lastAssistant) return;
    if (autoSpokenMessageRef.current === lastAssistant.id) return;
    autoSpokenMessageRef.current = lastAssistant.id;
    speakMessage(lastAssistant);
  }, [autoVoice, sortedMessages, speakMessage]);

  const startDictation = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setChatError('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = chatLanguage === 'ur' ? 'ur-PK' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    setDictationState('listening');
    setChatError('');

    const resetSilenceTimer = () => {
      clearSilenceTimer();
      silenceTimerRef.current = window.setTimeout(() => stopDictation(false), SILENCE_TIMEOUT_MS);
    };

    recognition.onstart = resetSilenceTimer;
    recognition.onresult = (event) => {
      resetSilenceTimer();
      let chunk = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript?.trim();
        if (!transcript || !event.results[index].isFinal) continue;
        chunk += `${chunk ? ' ' : ''}${transcript}`;
      }
      if (chunk) {
        setDraft((prev) => `${prev}${prev ? ' ' : ''}${chunk}`.trim());
      }
    };
    recognition.onerror = () => {
      clearSilenceTimer();
      recognitionRef.current = null;
      setDictationState('idle');
      setChatError('Voice input failed. Check microphone permissions and try again.');
    };
    recognition.onend = () => {
      clearSilenceTimer();
      recognitionRef.current = null;
      setDictationState('idle');
    };

    try {
      recognition.start();
      resetSilenceTimer();
    } catch {
      clearSilenceTimer();
      recognitionRef.current = null;
      setDictationState('idle');
      setChatError('Unable to start voice dictation.');
    }
  }, [chatLanguage, clearSilenceTimer, stopDictation]);

  const toggleDictation = useCallback(() => {
    if (recognitionRef.current) {
      stopDictation(true);
      return;
    }
    startDictation();
  }, [startDictation, stopDictation]);

  const handleEmailSignup = useCallback(async ({ email, password, confirmPassword, fullName }) => {
    setAuthBusy(true);
    setAuthError('');
    setAuthInfo('');
    setShowResendVerification(false);
    setPendingVerificationLogin({ email: '', password: '' });
    const normalizedEmail = (email || '').trim();
    try {
      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        throw new Error('Please enter a valid email address.');
      }
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }
      if (!PASSWORD_PATTERN.test(password)) {
        throw new Error(PASSWORD_RULE_MESSAGE);
      }
      await signupWithEmailAndPassword(normalizedEmail, password, fullName);
      setAuthError('');
      setAuthInfo('Verification email sent. Please check your inbox.');
      setAuthMode('login');
    } catch (error) {
      setAuthError(toAuthMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleEmailLogin = useCallback(
    async ({ email, password }) => {
      setAuthBusy(true);
      setAuthError('');
      setAuthInfo('');
      setShowResendVerification(false);
      setPendingVerificationLogin({ email: '', password: '' });
      const normalizedEmail = (email || '').trim();
      try {
        if (!EMAIL_PATTERN.test(normalizedEmail)) {
          throw new Error('Please enter a valid email address.');
        }
        await loginWithEmailAndPassword(normalizedEmail, password);
        await exchangeFirebaseForBackendToken();
      } catch (error) {
        setAuthError(toAuthMessage(error));
        if (error?.code === 'auth/email-not-verified') {
          setShowResendVerification(true);
          setPendingVerificationLogin({ email: normalizedEmail, password });
        } else {
          setShowResendVerification(false);
          setPendingVerificationLogin({ email: '', password: '' });
        }
      } finally {
        setAuthBusy(false);
      }
    },
    [exchangeFirebaseForBackendToken]
  );

  const handleGoogleLogin = useCallback(async () => {
    setAuthBusy(true);
    setAuthError('');
    setAuthInfo('');
    setShowResendVerification(false);
    setPendingVerificationLogin({ email: '', password: '' });
    try {
      await loginWithGoogle();
      await exchangeFirebaseForBackendToken();
    } catch (error) {
      setAuthError(toAuthMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }, [exchangeFirebaseForBackendToken]);

  const handleResendVerification = useCallback(async () => {
    const email = pendingVerificationLogin.email;
    const password = pendingVerificationLogin.password;
    if (!email || !password) {
      setAuthError('Please login again to resend verification.');
      setShowResendVerification(false);
      return;
    }
    const confirmed = window.confirm(
      'Please check your Spam/Junk folder before requesting another email.'
    );
    if (!confirmed) {
      return;
    }
    setResendBusy(true);
    setAuthError('');
    setAuthInfo('');
    try {
      await resendVerificationEmail(email, password);
      setAuthError('Please verify your email before login.');
      setAuthInfo('Verification email sent. Please check your inbox.');
      setShowResendVerification(true);
    } catch (error) {
      setAuthError(toAuthMessage(error));
    } finally {
      setResendBusy(false);
    }
  }, [pendingVerificationLogin]);

  const handleAuthModeChange = useCallback((mode) => {
    setAuthMode(mode);
    setAuthBusy(false);
    setAuthError('');
    setAuthInfo('');
    setResendBusy(false);
    setShowResendVerification(false);
    setPendingVerificationLogin({ email: '', password: '' });
  }, []);

  const handleSelectSession = useCallback(
    async (sessionId) => {
      setActiveSessionId(sessionId);
      await loadHistory(sessionId);
      if (window.matchMedia('(max-width: 900px)').matches) {
        setSidebarOpen(false);
      }
    },
    [loadHistory]
  );

  const handleNewChat = useCallback(() => {
    setActiveSessionId('');
    setMessages([]);
    setChatError('');
  }, []);

  const handleSendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || !token) return;

    const temporaryId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: temporaryId, role: 'user', text, session_id: activeSessionId || '', created_at: new Date().toISOString() },
    ]);
    setDraft('');
    setSending(true);
    setChatError('');

    try {
      const language = containsUrdu(text) ? 'ur' : chatLanguage;
      const result = await api.chat({ message: text, session_id: activeSessionId || undefined, language }, token);
      const currentId = result.session_id;
      setActiveSessionId(currentId);
      await refreshSessions(currentId);
      await loadHistory(currentId);
    } catch (error) {
      setMessages((prev) =>
        prev.map((message) => (message.id === temporaryId ? { ...message, failed: true } : message))
      );
      setChatError(error.message);
    } finally {
      setSending(false);
    }
  }, [activeSessionId, chatLanguage, draft, loadHistory, refreshSessions, sending, token]);

  const copyShareLink = useCallback(async () => {
    if (!activeSessionId || !token) {
      setShareError('Start or select a conversation first.');
      return;
    }
    setShareBusy(true);
    setShareError('');
    try {
      const payload = await api.createShare(activeSessionId, token);
      await navigator.clipboard.writeText(payload.share_url);
      setShareMenuOpen(false);
    } catch (error) {
      setShareError(error.message);
    } finally {
      setShareBusy(false);
    }
  }, [activeSessionId, token]);

  const copyChatText = useCallback(async () => {
    if (!sortedMessages.length) {
      setShareError('No messages available to copy.');
      return;
    }
    setShareError('');
    try {
      const text = sortedMessages
        .map((message) => `${message.role === 'user' ? 'You' : 'Assistant'}: ${normalizeMessageText(message)}`)
        .join('\n\n');
      await navigator.clipboard.writeText(text);
      setShareMenuOpen(false);
    } catch {
      setShareError('Clipboard copy failed.');
    }
  }, [sortedMessages]);

  if (shareRouteId) {
    return <SharedConversationPage shareId={shareRouteId} />;
  }

  if (!authenticated) {
    return (
      <AuthCard
        mode={authMode}
        busy={authBusy}
        error={authError}
        info={authInfo}
        showResendVerification={showResendVerification}
        resendBusy={resendBusy}
        onModeChange={handleAuthModeChange}
        onEmailLogin={handleEmailLogin}
        onEmailSignup={handleEmailSignup}
        onGoogleLogin={handleGoogleLogin}
        onResendVerification={handleResendVerification}
      />
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-slatebg text-slate-100">
      <MedicalBackground opacity={0.2} />
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} flex shrink-0 flex-col border-r border-white/10 bg-slate-950/85 transition-all duration-200 backdrop-blur`}>
          <div className={`${sidebarOpen ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>
            <div className="border-b border-white/10 p-3">
              <button type="button" onClick={handleNewChat} className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-medium hover:bg-white/10">
                <Plus size={16} />
                New chat
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {sessions.map((session) => (
                <button key={session.id} type="button" onClick={() => handleSelectSession(session.id)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition ${activeSessionId === session.id ? 'bg-emerald-500/20 text-emerald-100' : 'hover:bg-white/5'}`}>
                  <p className="truncate text-sm font-medium">{session.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatSessionDate(session.last_message_at || session.created_at)}</p>
                </button>
              ))}
              {!sessions.length && <p className="px-2 pt-2 text-sm text-slate-400">No chats yet.</p>}
            </div>

            <div ref={userMenuRef} className="relative border-t border-white/10 p-2">
              <button type="button" onClick={() => setUserMenuOpen((prev) => !prev)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/10">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-sm font-semibold text-cyan-100">{getInitials(user)}</div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-slate-100">{user?.full_name || 'User'}</p>
                  <p className="truncate text-xs text-slate-400">{user?.email}</p>
                </div>
                {userMenuOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-14 left-2 right-2 rounded-xl border border-white/15 bg-slate-900/95 p-1 shadow-chat">
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><Sparkles size={15} />Upgrade plan</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><SlidersHorizontal size={15} />Personalization</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><Settings size={15} />Settings</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><HelpCircle size={15} />Help</button>
                  <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-200 hover:bg-red-500/20"><LogOut size={15} />Log out</button>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/10 bg-slate-900/80 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setSidebarOpen((prev) => !prev)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Toggle sidebar">
                <Menu size={18} />
              </button>
              <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300"><Stethoscope size={18} /></div>
              <div>
                <h1 className="text-sm font-semibold text-white sm:text-base">Personal Doctor AI</h1>
                <p className="text-xs text-slate-400">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div ref={shareMenuRef} className="relative">
                <button type="button" onClick={() => setShareMenuOpen((prev) => !prev)} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10">
                  <Share2 size={14} />Share
                </button>
                {shareMenuOpen && (
                  <div className="absolute right-0 top-10 z-30 w-56 rounded-xl border border-white/15 bg-slate-900/95 p-1 shadow-chat">
                    <button type="button" onClick={copyShareLink} disabled={shareBusy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-60">
                      {shareBusy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}Copy shareable link
                    </button>
                    <button type="button" onClick={copyChatText} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10">
                      <Copy size={14} />Copy chat text
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
              {loadingHistory && <div className="flex items-center gap-2 text-sm text-slate-300"><Loader2 size={15} className="animate-spin" />Loading conversation...</div>}
              {!sortedMessages.length && !loadingHistory && <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-center text-slate-300">Start a conversation. Enter sends message and Shift+Enter inserts a new line.</div>}

              {sortedMessages.map((message) => (
                <div key={message.id} className={`max-w-3xl rounded-2xl px-4 py-3 ${message.role === 'user' ? 'ml-auto bg-emerald-500/15 text-emerald-100' : 'mr-auto border border-white/10 bg-slate-800/80 text-slate-100'}`}>
                  <p className="whitespace-pre-wrap text-sm leading-6">{normalizeMessageText(message)}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
                    <div className="flex items-center gap-2">
                      {message.role === 'assistant' && (
                        <button type="button" onClick={() => toggleMessageSpeech(message)} className={`rounded-md p-1 transition ${speakingMessageId === message.id ? 'bg-emerald-500/20 text-emerald-200' : 'hover:bg-white/10 hover:text-white'}`} aria-label={speakingMessageId === message.id ? 'Stop speaking' : 'Speak message'}>
                          {speakingMessageId === message.id ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        </button>
                      )}
                      <span>{formatTime(message.created_at)}</span>
                    </div>
                  </div>
                  {message.failed && <p className="mt-2 rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200">Failed to send. Please retry.</p>}
                </div>
              ))}
              <div ref={scrollBottomRef} />
            </div>
          </section>

          <div className="border-t border-white/10 bg-slate-900/85 px-4 py-4 backdrop-blur">
            <div className="mx-auto w-full max-w-4xl">
              {(chatError || shareError) && <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{chatError || shareError}</div>}
              <div className="rounded-2xl border border-white/15 bg-slate-900 p-3">
                <textarea ref={textAreaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSendMessage(); } }} placeholder="Message Personal Doctor AI..." rows={1} className="max-h-56 min-h-[44px] w-full resize-none bg-transparent px-1 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setChatLanguage((prev) => (prev === 'en' ? 'ur' : 'en'))} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10" title="Toggle language">
                      {chatLanguage === 'en' ? 'EN' : 'UR'}
                    </button>
                    <button type="button" onClick={toggleDictation} disabled={!dictationSupported} className={`rounded-lg p-2 transition ${dictationState === 'listening' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-50`} title="Dictate" aria-label="Dictate">
                      {dictationState === 'processing' ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
                    </button>
                    <button type="button" onClick={() => setAutoVoice((prev) => !prev)} className={`rounded-lg p-2 transition ${autoVoice ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`} title="Use Voice" aria-label="Use Voice">
                      {autoVoice ? <Volume2 size={18} /> : <VolumeX size={18} />}
                    </button>
                    {dictationState === 'listening' && <span className="text-xs text-emerald-300/90">Listening...</span>}
                    {speakingMessageId && <span className="text-xs text-cyan-200/90">Speaking...</span>}
                  </div>
                  <button type="button" onClick={handleSendMessage} disabled={sending || !draft.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50">
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={16} />}Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
      <footer className="relative z-10 border-t border-white/10 bg-slate-900/85 px-4 py-2 text-center text-xs text-slate-400 backdrop-blur">
        Not a substitute for professional medical advice. Sohaib Shahid — All Rights Reserved.
      </footer>
    </div>
  );
}
