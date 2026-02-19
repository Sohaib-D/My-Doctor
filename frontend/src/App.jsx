import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  HelpCircle,
  Image,
  Loader2,
  LogOut,
  Menu,
  Mic,
  Plus,
  Search,
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
const SIDEBAR_WIDTH_KEY = 'pd_sidebar_width';
const SIDEBAR_COLLAPSED_WIDTH = 64;
const SIDEBAR_OPEN_WIDTH = 240;
const SIDEBAR_RESIZE_MAX = Math.round(SIDEBAR_OPEN_WIDTH * 1.18);
const SIDEBAR_RESIZE_MIN = Math.round(SIDEBAR_RESIZE_MAX * 0.4);
const SILENCE_TIMEOUT_MS = 2500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
const AUTH_GENERIC_ERROR = 'Unable to authenticate right now. Please try again.';
const PROFILE_NOT_FOUND_MESSAGE = 'Profile not found.';

function clampSidebarWidth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return SIDEBAR_OPEN_WIDTH;
  }
  return Math.max(SIDEBAR_RESIZE_MIN, Math.min(SIDEBAR_RESIZE_MAX, Math.round(numeric)));
}

function createEmptyMedicalProfile() {
  return {
    age: '',
    gender: '',
    medical_history: '',
    allergies: '',
    medications: '',
    chronic_conditions: '',
  };
}

function isProfileNotFoundError(error) {
  return (error?.message || '').toLowerCase().includes(PROFILE_NOT_FOUND_MESSAGE.toLowerCase());
}

function profileToForm(profile) {
  return {
    age: profile?.age === null || profile?.age === undefined ? '' : String(profile.age),
    gender: profile?.gender || '',
    medical_history: profile?.medical_history || '',
    allergies: profile?.allergies || '',
    medications: profile?.medications || '',
    chronic_conditions: profile?.chronic_conditions || '',
  };
}

function formToProfilePayload(form) {
  const parseAge = () => {
    const raw = String(form.age || '').trim();
    if (!raw) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    const integerAge = Math.trunc(numeric);
    if (integerAge < 0 || integerAge > 130) return null;
    return integerAge;
  };
  const clean = (value) => {
    const text = String(value || '').trim();
    return text || null;
  };
  return {
    age: parseAge(),
    gender: clean(form.gender),
    medical_history: clean(form.medical_history),
    allergies: clean(form.allergies),
    medications: clean(form.medications),
    chronic_conditions: clean(form.chronic_conditions),
  };
}

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

function stripMarkdownForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^#+\s+/gm, '')
    .replace(/[>*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSpokenExplanation(message) {
  const rawText = normalizeMessageText(message);
  const cleaned = stripMarkdownForSpeech(rawText);
  if (!cleaned) {
    return '';
  }

  if (message?.role !== 'assistant') {
    return cleaned;
  }

  if (message?.structured && typeof message.structured === 'object') {
    const parts = [];
    if (message.structured.symptoms) {
      parts.push(`Symptoms suggest ${stripMarkdownForSpeech(message.structured.symptoms)}.`);
    }
    if (message.structured.possible_causes) {
      parts.push(`Possible causes include ${stripMarkdownForSpeech(message.structured.possible_causes)}.`);
    }
    if (message.structured.advice) {
      parts.push(`Recommended advice is ${stripMarkdownForSpeech(message.structured.advice)}.`);
    }
    if (message.structured.urgency_level) {
      parts.push(`Urgency level is ${stripMarkdownForSpeech(message.structured.urgency_level)}.`);
    }
    if (message.structured.when_to_see_doctor) {
      parts.push(`See a doctor when ${stripMarkdownForSpeech(message.structured.when_to_see_doctor)}.`);
    }
    const structuredExplanation = parts.join(' ');
    if (structuredExplanation) {
      return `Here is a simple explanation. ${structuredExplanation}`;
    }
  }

  const listItems = String(rawText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
    .map((line) => stripMarkdownForSpeech(line.replace(/^[-*+]\s+|^\d+[.)]\s+/, '')))
    .filter(Boolean)
    .slice(0, 4);

  if (listItems.length >= 2) {
    const sequence = ['First', 'Then', 'Also', 'Finally'];
    const explainedList = listItems
      .map((item, index) => `${sequence[index] || 'Also'}, ${item}.`)
      .join(' ');
    return `Here is a simple explanation. ${explainedList}`;
  }

  const sentenceMatches = cleaned.match(/[^.!?]+[.!?]?/g) || [];
  const summary = sentenceMatches
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' ');

  return `Here is a simple explanation. ${summary || cleaned}`;
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
  const [guestMode, setGuestMode] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [pendingVerificationLogin, setPendingVerificationLogin] = useState({ email: '', password: '' });

  const [chatLanguage, setChatLanguage] = useState('en');
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)').matches : false
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    typeof window !== 'undefined'
      ? clampSidebarWidth(window.localStorage.getItem(SIDEBAR_WIDTH_KEY) || SIDEBAR_OPEN_WIDTH)
      : SIDEBAR_OPEN_WIDTH
  );
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [searchChatsOpen, setSearchChatsOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileInfo, setProfileInfo] = useState('');
  const [hasProfile, setHasProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(createEmptyMedicalProfile);

  const textAreaRef = useRef(null);
  const scrollBottomRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const utteranceRef = useRef(null);
  const autoSpokenMessageRef = useRef('');
  const userMenuRef = useRef(null);
  const shareMenuRef = useRef(null);
  const sidebarResizeStartXRef = useRef(0);
  const sidebarResizeStartWidthRef = useRef(SIDEBAR_OPEN_WIDTH);

  const authenticated = Boolean(token);
  const inGuestMode = guestMode && !authenticated;
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );
  const filteredSessions = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) {
      return sessions;
    }
    return sessions.filter((session) => (session.title || '').toLowerCase().includes(query));
  }, [chatSearch, sessions]);

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
    setIsSidebarOpen(true);
    setSidebarWidth(SIDEBAR_OPEN_WIDTH);
    setSidebarResizing(false);
    setSearchChatsOpen(false);
    setChatSearch('');
    setSettingsOpen(false);
    setProfileBusy(false);
    setProfileSaving(false);
    setProfileError('');
    setProfileInfo('');
    setHasProfile(false);
    setProfileForm(createEmptyMedicalProfile());
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const openSidebar = useCallback(() => {
    setIsSidebarOpen(true);
    setSidebarWidth((prev) => (prev <= SIDEBAR_RESIZE_MIN + 4 ? SIDEBAR_OPEN_WIDTH : clampSidebarWidth(prev)));
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    setSidebarResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setUserMenuOpen(false);
    if (isMobileLayout) {
      setSearchChatsOpen(false);
      setChatSearch('');
    }
  }, [isMobileLayout]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      if (!next) {
        setSidebarResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setUserMenuOpen(false);
        if (isMobileLayout) {
          setSearchChatsOpen(false);
          setChatSearch('');
        }
      } else {
        setSidebarWidth((current) =>
          current <= SIDEBAR_RESIZE_MIN + 4 ? SIDEBAR_OPEN_WIDTH : clampSidebarWidth(current)
        );
      }
      return next;
    });
  }, [isMobileLayout]);

  const handleSidebarResizeStart = useCallback(
    (event) => {
      if (isMobileLayout || !isSidebarOpen) {
        return;
      }
      setSidebarResizing(true);
      sidebarResizeStartXRef.current = event.clientX;
      sidebarResizeStartWidthRef.current = sidebarWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      event.preventDefault();
    },
    [isMobileLayout, isSidebarOpen, sidebarWidth]
  );

  const logout = useCallback(async () => {
    stopSpeaking();
    stopDictation(true);
    try {
      await firebaseLogout();
    } catch {
      // ignore
    }
    clearLocalSession();
    setGuestMode(false);
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
    if (!sidebarResizing) {
      return undefined;
    }

    const onPointerMove = (event) => {
      const delta = event.clientX - sidebarResizeStartXRef.current;
      setSidebarWidth(clampSidebarWidth(sidebarResizeStartWidthRef.current + delta));
    };

    const onPointerUp = () => {
      setSidebarResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    return () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [sidebarResizing]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clampSidebarWidth(sidebarWidth)));
  }, [sidebarWidth]);

  useEffect(() => {
    if (shareRouteId) return;
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => {
      const isMobile = media.matches;
      setIsMobileLayout(isMobile);
      if (isMobile) {
        setSidebarResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [shareRouteId]);

  useEffect(() => {
    if (authenticated) {
      setIsSidebarOpen(true);
      setSidebarWidth((prev) => (prev <= SIDEBAR_RESIZE_MIN + 4 ? SIDEBAR_OPEN_WIDTH : clampSidebarWidth(prev)));
    }
  }, [authenticated]);

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
      const speechText = buildSpokenExplanation(message);
      if (!speechText.trim()) return;

      stopSpeaking();
      const utterance = new SpeechSynthesisUtterance(speechText);
      const lang = containsUrdu(speechText) ? 'ur-PK' : 'en-US';
      utterance.lang = lang;
      utterance.rate = lang.startsWith('ur') ? 0.88 : 0.93;
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
    setGuestMode(false);
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
      setGuestMode(false);
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
    setGuestMode(false);
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

  const loadMedicalProfile = useCallback(
    async (authToken = token) => {
      if (!authToken) {
        setHasProfile(false);
        setProfileForm(createEmptyMedicalProfile());
        return null;
      }
      const payload = await api.getProfile(authToken);
      setHasProfile(true);
      setProfileForm(profileToForm(payload));
      return payload;
    },
    [token]
  );

  const handleOpenSettings = useCallback(async () => {
    if (!token) {
      return;
    }
    setSettingsOpen(true);
    setProfileBusy(true);
    setProfileSaving(false);
    setProfileError('');
    setProfileInfo('');
    try {
      await loadMedicalProfile(token);
    } catch (error) {
      if (isProfileNotFoundError(error)) {
        setHasProfile(false);
        setProfileForm(createEmptyMedicalProfile());
      } else {
        setProfileError(error?.message || 'Unable to load profile.');
      }
    } finally {
      setProfileBusy(false);
    }
  }, [loadMedicalProfile, token]);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    setProfileSaving(false);
    setProfileError('');
    setProfileInfo('');
  }, []);

  const handleProfileFieldChange = useCallback((key, value) => {
    setProfileForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleProfileSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!token) {
        return;
      }
      setProfileSaving(true);
      setProfileError('');
      setProfileInfo('');
      const payload = formToProfilePayload(profileForm);
      try {
        if (hasProfile) {
          await api.updateProfile(payload, token);
        } else {
          await api.createProfile(payload, token);
          setHasProfile(true);
        }
        setProfileInfo('Medical profile saved.');
      } catch (error) {
        if (!hasProfile && (error?.message || '').toLowerCase().includes('already exists')) {
          await api.updateProfile(payload, token);
          setHasProfile(true);
          setProfileInfo('Medical profile saved.');
        } else {
          setProfileError(error?.message || 'Unable to save profile.');
        }
      } finally {
        setProfileSaving(false);
      }
    },
    [hasProfile, profileForm, token]
  );

  const handleContinueAsGuest = useCallback(() => {
    setAuthBusy(false);
    setAuthError('');
    setAuthInfo('');
    setResendBusy(false);
    setShowResendVerification(false);
    setPendingVerificationLogin({ email: '', password: '' });
    setSettingsOpen(false);
    setGuestMode(true);
  }, []);

  const handleExitGuestMode = useCallback(() => {
    stopSpeaking();
    stopDictation(true);
    setGuestMode(false);
    setSessions([]);
    setActiveSessionId('');
    setMessages([]);
    setDraft('');
    setChatError('');
    setShareError('');
    setSettingsOpen(false);
    setSearchChatsOpen(false);
    setChatSearch('');
    setProfileBusy(false);
    setProfileSaving(false);
    setProfileError('');
    setProfileInfo('');
    setHasProfile(false);
    setProfileForm(createEmptyMedicalProfile());
    setAuthMode('login');
    setAuthBusy(false);
    setAuthError('');
    setAuthInfo('');
    setResendBusy(false);
    setShowResendVerification(false);
    setPendingVerificationLogin({ email: '', password: '' });
  }, [stopDictation, stopSpeaking]);

  const handleSelectSession = useCallback(
    async (sessionId) => {
      setActiveSessionId(sessionId);
      await loadHistory(sessionId);
      if (isMobileLayout) {
        closeSidebar();
      }
    },
    [closeSidebar, isMobileLayout, loadHistory]
  );

  const handleNewChat = useCallback(() => {
    setActiveSessionId('');
    setMessages([]);
    setChatError('');
    if (isMobileLayout) {
      closeSidebar();
    }
  }, [closeSidebar, isMobileLayout]);

  const handleToggleSearchChats = useCallback(() => {
    setSearchChatsOpen((prev) => {
      const next = !prev;
      if (!next) {
        setChatSearch('');
      }
      return next;
    });
  }, []);

  const handleSendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || (!token && !inGuestMode)) return;

    const temporaryId = `pending-${Date.now()}`;
    const nowIso = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      { id: temporaryId, role: 'user', text, session_id: activeSessionId || '', created_at: nowIso },
    ]);
    setDraft('');
    setSending(true);
    setChatError('');

    try {
      const language = containsUrdu(text) ? 'ur' : chatLanguage;
      let profilePayload = undefined;
      if (token) {
        try {
          const loadedProfile = await loadMedicalProfile(token);
          if (loadedProfile) {
            profilePayload = {
              age: loadedProfile.age,
              gender: loadedProfile.gender,
              medical_history: loadedProfile.medical_history,
              allergies: loadedProfile.allergies,
              medications: loadedProfile.medications,
              chronic_conditions: loadedProfile.chronic_conditions,
            };
          }
        } catch (profileError) {
          if (!isProfileNotFoundError(profileError)) {
            throw profileError;
          }
        }
      }
      const result = await api.chat(
        {
          message: text,
          session_id: activeSessionId || undefined,
          language,
          profile: profilePayload,
        },
        token
      );
      const currentId = result.session_id;
      if (inGuestMode) {
        if (currentId) {
          setActiveSessionId(currentId);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: result.message_id || `assistant-${Date.now()}`,
            role: 'assistant',
            text: result.response || '',
            structured: result.structured || null,
            session_id: currentId || activeSessionId || '',
            emergency: Boolean(result.emergency),
            language: result.language || language,
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        setActiveSessionId(currentId);
        await refreshSessions(currentId);
        await loadHistory(currentId);
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((message) => (message.id === temporaryId ? { ...message, failed: true } : message))
      );
      setChatError(error.message);
    } finally {
      setSending(false);
    }
  }, [activeSessionId, chatLanguage, draft, inGuestMode, loadHistory, loadMedicalProfile, refreshSessions, sending, token]);

  const copyShareLink = useCallback(async () => {
    if (inGuestMode) {
      setShareError('Sign in to create shareable links.');
      return;
    }
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
  }, [activeSessionId, inGuestMode, token]);

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

  if (!authenticated && !inGuestMode) {
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
        onContinueAsGuest={handleContinueAsGuest}
      />
    );
  }

  const desktopSidebarWidth = isSidebarOpen ? sidebarWidth : SIDEBAR_COLLAPSED_WIDTH;
  const mobileSidebarWidth = `min(${SIDEBAR_OPEN_WIDTH}px, 85vw)`;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-slatebg text-slate-100">
      <MedicalBackground opacity={0.15} />
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {isMobileLayout && isSidebarOpen && (
          <button
            type="button"
            onClick={closeSidebar}
            className="absolute inset-0 z-30 bg-slate-950/60 backdrop-blur-sm"
            aria-label="Close sidebar overlay"
          />
        )}

        <aside
          className={`group fixed left-0 top-0 z-40 h-full border-r border-white/10 bg-slate-950/90 backdrop-blur transition-[width,transform] duration-300 ${
            isMobileLayout ? (isSidebarOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'
          }`}
          style={{ width: isMobileLayout ? mobileSidebarWidth : `${desktopSidebarWidth}px` }}
        >
          <div className="flex h-full flex-col">
            <div className={isSidebarOpen ? 'p-3' : 'flex justify-center px-2 py-3'}>
              {!isSidebarOpen && (
                <div className="w-full text-center">
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/30 bg-emerald-300/15 text-emerald-200 hover:bg-emerald-300/20 hover:text-emerald-100"
                    aria-label="Open sidebar"
                  >
                    <Stethoscope size={18} />
                  </button>
                </div>
              )}

              {isSidebarOpen && (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-cyan-200">
                        <Stethoscope size={16} />
                      </div>
                      <p className="truncate text-sm font-semibold text-slate-100">Personal Doctor AI</p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleSidebar}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10 hover:text-white"
                      aria-label="Collapse sidebar"
                    >
                      <Menu size={16} />
                    </button>
                  </div>
                  <div className="space-y-1">
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-base text-slate-100 hover:bg-white/10"
                  >
                    <Plus size={18} />
                    New chat
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleSearchChats}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-base text-slate-100 hover:bg-white/10"
                  >
                    <Search size={18} />
                    Search chats
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-base text-slate-100 hover:bg-white/10"
                  >
                    <Image size={18} />
                    Images
                  </button>
                  {searchChatsOpen && (
                    <input
                      type="text"
                      value={chatSearch}
                      onChange={(event) => setChatSearch(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                      placeholder="Search conversations..."
                    />
                  )}
                </div>
                </div>
              )}
            </div>
            {isSidebarOpen && (
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {filteredSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => handleSelectSession(session.id)}
                    className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition ${
                      activeSessionId === session.id ? 'bg-emerald-500/20 text-emerald-100' : 'hover:bg-white/5'
                    }`}
                  >
                    <p className="truncate text-sm font-medium">{session.title}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatSessionDate(session.last_message_at || session.created_at)}
                    </p>
                  </button>
                ))}
                {!filteredSessions.length && (
                  <p className="px-2 pt-2 text-sm text-slate-400">{chatSearch.trim() ? 'No chats found.' : 'No chats yet.'}</p>
                )}
              </div>
            )}

            <div ref={userMenuRef} className={`relative mt-auto border-t border-white/10 ${isSidebarOpen ? 'p-2' : 'p-3'}`}>
              <button
                type="button"
                onClick={() => {
                  if (!isSidebarOpen) {
                    openSidebar();
                    return;
                  }
                  setUserMenuOpen((prev) => !prev);
                }}
                className={
                  isSidebarOpen
                    ? 'flex w-full items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/10'
                    : 'mx-auto flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10'
                }
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-sm font-semibold text-cyan-100">
                  {getInitials(user)}
                </div>
                {isSidebarOpen && (
                  <>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-medium text-slate-100">{inGuestMode ? 'Guest User' : user?.full_name || 'User'}</p>
                      <p className="truncate text-xs text-slate-400">{inGuestMode ? 'Not signed in' : user?.email}</p>
                    </div>
                    {userMenuOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </>
                )}
              </button>
              {isSidebarOpen && userMenuOpen && (
                <div className="absolute bottom-14 left-2 right-2 rounded-xl border border-white/15 bg-slate-900/95 p-1 shadow-chat">
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><Sparkles size={15} />Upgrade plan</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><SlidersHorizontal size={15} />Personalization</button>
                  <button type="button" onClick={handleOpenSettings} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><Settings size={15} />Settings</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><HelpCircle size={15} />Help</button>
                  <button type="button" onClick={inGuestMode ? handleExitGuestMode : logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-200 hover:bg-red-500/20"><LogOut size={15} />{inGuestMode ? 'Sign in' : 'Log out'}</button>
                </div>
              )}
            </div>
          </div>
          {!isMobileLayout && isSidebarOpen && (
            <button
              type="button"
              onMouseDown={handleSidebarResizeStart}
              className="absolute right-0 top-0 z-50 h-full w-2 cursor-col-resize"
              aria-label="Resize sidebar"
            >
              <span
                className={`absolute right-0 top-1/2 h-20 -translate-y-1/2 border-r border-white/20 ${
                  sidebarResizing ? 'opacity-100' : 'opacity-0 transition-opacity group-hover:opacity-100'
                }`}
              />
            </button>
          )}
        </aside>

        <main
          className="flex min-h-0 min-w-0 flex-1 flex-col transition-[margin-left] duration-300"
          style={{ marginLeft: isMobileLayout ? '0px' : `${desktopSidebarWidth}px` }}
        >
          <header className="shrink-0 flex items-center justify-between border-b border-white/10 bg-slate-900/80 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              {isMobileLayout && (
                <button type="button" onClick={toggleSidebar} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Toggle sidebar">
                  <Menu size={18} />
                </button>
              )}
              <div>
                <h1 className="text-sm font-semibold text-white sm:text-base">Personal Doctor AI</h1>
                <p className="text-xs text-slate-400">{inGuestMode ? 'Guest mode' : user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {inGuestMode && (
                <button type="button" onClick={handleExitGuestMode} className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/35 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/10">
                  Sign in
                </button>
              )}
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

          {inGuestMode && (
            <div className="shrink-0 border-b border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-100">
              You are using Guest Mode. Chats will not be saved.
            </div>
          )}

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
              {sending && (
                <div className="mr-auto border border-white/10 bg-slate-800/80 text-slate-100 max-w-3xl rounded-2xl px-4 py-3">
                  <p className="text-sm leading-6 text-slate-200">
                    Assistant <span className="animate-pulse">...</span>
                  </p>
                </div>
              )}
              <div ref={scrollBottomRef} />
            </div>
          </section>

          <div className="shrink-0 border-t border-white/10 bg-slate-900/85 px-4 py-4 backdrop-blur">
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
          <footer className="shrink-0 border-t border-white/10 bg-slate-900/85 px-4 py-2 text-center text-xs text-slate-400 backdrop-blur">
            Not a substitute for professional medical advice. Sohaib Shahid - All Rights Reserved.
          </footer>
        </main>
      </div>
      {settingsOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
            onClick={handleCloseSettings}
            aria-label="Close settings"
          />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/15 bg-slate-900/95 p-5 shadow-chat">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Settings</p>
                <h2 className="text-lg font-semibold text-white">Medical Profile</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseSettings}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>
            {profileError && (
              <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {profileError}
              </p>
            )}
            {profileInfo && (
              <p className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {profileInfo}
              </p>
            )}
            <form className="space-y-3" onSubmit={handleProfileSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-slate-300" htmlFor="profile_age">
                    Age
                  </label>
                  <input
                    id="profile_age"
                    type="number"
                    min={0}
                    max={130}
                    value={profileForm.age}
                    onChange={(event) => handleProfileFieldChange('age', event.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                    placeholder="e.g. 29"
                    disabled={profileBusy || profileSaving}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300" htmlFor="profile_gender">
                    Gender
                  </label>
                  <select
                    id="profile_gender"
                    value={profileForm.gender}
                    onChange={(event) => handleProfileFieldChange('gender', event.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                    disabled={profileBusy || profileSaving}
                  >
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-300" htmlFor="profile_medical_history">
                  Medical History
                </label>
                <textarea
                  id="profile_medical_history"
                  value={profileForm.medical_history}
                  onChange={(event) => handleProfileFieldChange('medical_history', event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                  placeholder="Past medical history"
                  disabled={profileBusy || profileSaving}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-300" htmlFor="profile_allergies">
                  Allergies
                </label>
                <textarea
                  id="profile_allergies"
                  value={profileForm.allergies}
                  onChange={(event) => handleProfileFieldChange('allergies', event.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                  placeholder="Known allergies"
                  disabled={profileBusy || profileSaving}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-300" htmlFor="profile_medications">
                  Medications
                </label>
                <textarea
                  id="profile_medications"
                  value={profileForm.medications}
                  onChange={(event) => handleProfileFieldChange('medications', event.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                  placeholder="Current medications"
                  disabled={profileBusy || profileSaving}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-300" htmlFor="profile_chronic_conditions">
                  Chronic Conditions
                </label>
                <textarea
                  id="profile_chronic_conditions"
                  value={profileForm.chronic_conditions}
                  onChange={(event) => handleProfileFieldChange('chronic_conditions', event.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                  placeholder="Chronic conditions"
                  disabled={profileBusy || profileSaving}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={profileBusy || profileSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {(profileBusy || profileSaving) && <Loader2 size={15} className="animate-spin" />}
                  Save profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

