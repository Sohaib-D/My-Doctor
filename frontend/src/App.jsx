import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe2,
  HelpCircle,
  Laptop,
  Loader2,
  LogOut,
  Menu,
  Mic,
  MessageCircle,
  Microscope,
  Moon,
  MoreHorizontal,
  Pill,
  Pin,
  Plus,
  Search,
  SendHorizontal,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Sun,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import AuthCard from './components/AuthCard';
import MedicalBackground from './components/MedicalBackground';
import ChatModeView from './components/modes/ChatModeView';
import DrugInfoModeView from './components/modes/DrugInfoModeView';
import ResearchModeView from './components/modes/ResearchModeView';
import WhoStatsModeView from './components/modes/WhoStatsModeView';
import SharedConversationPage from './components/SharedConversationPage';
import {
  RESPONSE_STYLE_OPTIONS,
  normalizePersonalization,
  serializePersonalization,
  toPersonalizationApiPayload,
  usePersonalization,
} from './context/PersonalizationContext';
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
  renderMessageHtml,
  selectFemaleVoice,
} from './utils/chat';

const TOKEN_KEY = 'pd_access_token';
const TOKEN_EXPIRY_KEY = 'pd_access_token_exp_ms';
const USER_KEY = 'pd_user';
const SIDEBAR_WIDTH_KEY = 'pd_sidebar_width';
const SIDEBAR_COLLAPSED_WIDTH = 64;
const SIDEBAR_OPEN_WIDTH = 300;
const SIDEBAR_RESIZE_MIN = 200;
const SIDEBAR_RESIZE_MAX = 400;
const MOBILE_MAX_WIDTH = 767;
const TABLET_MAX_WIDTH = 1199;
const SILENCE_TIMEOUT_MS = 2500;
const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
const AUTH_GENERIC_ERROR = 'Unable to authenticate right now. Please try again.';
const PROFILE_NOT_FOUND_MESSAGE = 'Profile not found.';
const PERSONALIZATION_NOT_FOUND_MESSAGE = 'Personalization not found.';
const APP_SETTINGS_KEY = 'pd_app_settings';
const DAILY_IMAGE_UPLOAD_USAGE_KEY = 'pd_daily_image_upload_usage';
const GUEST_DAILY_IMAGE_UPLOAD_LIMIT = 3;
const USER_DAILY_IMAGE_UPLOAD_LIMIT = 10;
const THEME_CLASS_SYSTEM = 'theme-system';
const THEME_CLASS_LIGHT = 'theme-light';
const THEME_CLASS_DARK = 'theme-dark';
const THEME_MODE_CLASS_LIGHT = 'light';
const THEME_MODE_CLASS_DARK = 'dark';
const SETTINGS_TAB_GENERAL = 'general';
const SETTINGS_TAB_PERSONALIZATION = 'personalization';
const SETTINGS_TAB_MEDICAL = 'medical';
const CHAT_MODES = {
  chat: {
    id: 'chat',
    label: 'CHAT',
    headerTitle: 'Personal Doctor AI',
    headerSubtitle: 'Medical Chat',
    placeholder: 'Ask anything...',
    icon: MessageCircle,
    iconBoxClass:
      'border-violet-300/40 bg-gradient-to-br from-violet-500/35 to-fuchsia-500/25 text-violet-50',
    optionClass:
      'border-violet-300/30 bg-gradient-to-br from-violet-500/12 to-fuchsia-500/10 text-violet-100',
    optionActiveClass: 'border-violet-300/55 bg-violet-500/28 text-violet-50',
  },
  drug: {
    id: 'drug',
    label: 'DRUG INFO',
    headerTitle: 'Personal Doctor AI',
    headerSubtitle: 'Drug Information',
    placeholder: 'Enter drug name...',
    icon: Pill,
    iconBoxClass:
      'border-rose-300/40 bg-gradient-to-br from-pink-500/35 to-orange-500/30 text-rose-50',
    optionClass: 'border-rose-300/30 bg-gradient-to-br from-pink-500/12 to-orange-500/10 text-rose-100',
    optionActiveClass: 'border-rose-300/55 bg-rose-500/26 text-rose-50',
  },
  research: {
    id: 'research',
    label: 'RESEARCH',
    headerTitle: 'Personal Doctor AI',
    headerSubtitle: 'Clinical Research',
    placeholder: 'Search medical research...',
    icon: Microscope,
    iconBoxClass: 'border-sky-300/40 bg-gradient-to-br from-sky-500/30 to-cyan-500/24 text-sky-50',
    optionClass: 'border-sky-300/30 bg-gradient-to-br from-sky-500/12 to-cyan-500/10 text-sky-100',
    optionActiveClass: 'border-sky-300/55 bg-sky-500/24 text-sky-50',
  },
  who: {
    id: 'who',
    label: 'WHO STATS',
    headerTitle: 'Personal Doctor AI',
    headerSubtitle: 'WHO Statistics',
    placeholder: 'Search global health statistics...',
    icon: Globe2,
    iconBoxClass:
      'border-emerald-300/40 bg-gradient-to-br from-blue-500/28 to-emerald-500/26 text-emerald-50',
    optionClass:
      'border-emerald-300/30 bg-gradient-to-br from-blue-500/12 to-emerald-500/10 text-emerald-100',
    optionActiveClass: 'border-emerald-300/55 bg-emerald-500/24 text-emerald-50',
  },
};
const CHAT_MODE_ORDER = ['chat', 'drug', 'research', 'who'];
const DEFAULT_CHAT_MODE = 'chat';

function createDefaultAppSettings() {
  return {
    appearance: 'system',
    language: 'en',
    voice_gender: 'female',
    voice_auto_detect: true,
    display_name: '',
  };
}

function normalizeAppSettings(source) {
  const next = createDefaultAppSettings();
  if (!source || typeof source !== 'object') {
    return next;
  }
  const appearance = String(source.appearance || '').toLowerCase();
  next.appearance = appearance === 'light' || appearance === 'dark' ? appearance : 'system';
  next.language = source.language === 'ur' ? 'ur' : 'en';
  next.voice_gender = 'female';
  next.voice_auto_detect = source.voice_auto_detect !== false;
  next.display_name = String(source.display_name || '').trim();
  return next;
}

function readStoredAppSettings() {
  if (typeof window === 'undefined') {
    return createDefaultAppSettings();
  }
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) {
      return createDefaultAppSettings();
    }
    const parsed = JSON.parse(raw);
    return normalizeAppSettings(parsed);
  } catch {
    return createDefaultAppSettings();
  }
}

function resolveThemeMode(appearance) {
  if (appearance === 'light' || appearance === 'dark') {
    return appearance;
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

function applyAppearanceTheme(appearance) {
  if (typeof document === 'undefined') {
    return;
  }
  const normalizedAppearance = appearance === 'light' || appearance === 'dark' ? appearance : 'system';
  const mode = resolveThemeMode(appearance);
  const root = document.documentElement;

  root.classList.remove(
    THEME_CLASS_SYSTEM,
    THEME_CLASS_LIGHT,
    THEME_CLASS_DARK,
    THEME_MODE_CLASS_LIGHT,
    THEME_MODE_CLASS_DARK
  );
  root.classList.add(`theme-${normalizedAppearance}`);
  root.classList.add(mode === 'dark' ? THEME_CLASS_DARK : THEME_CLASS_LIGHT);
  root.classList.add(mode === 'dark' ? THEME_MODE_CLASS_DARK : THEME_MODE_CLASS_LIGHT);

  root.dataset.appearance = normalizedAppearance;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  root.style.backgroundColor = mode === 'dark' ? '#0f172a' : '#f8fafc';
}

function getLocalDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultDailyImageUploadUsage(now = new Date()) {
  return {
    date: getLocalDateKey(now),
    guest: 0,
    user: 0,
  };
}

function normalizeDailyImageUploadUsage(source, now = new Date()) {
  const fallback = createDefaultDailyImageUploadUsage(now);
  if (!source || typeof source !== 'object') {
    return fallback;
  }

  const date = String(source.date || '');
  if (date !== fallback.date) {
    return fallback;
  }

  const toCount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.floor(parsed);
  };

  return {
    date: fallback.date,
    guest: toCount(source.guest),
    user: toCount(source.user),
  };
}

function readDailyImageUploadUsage() {
  if (typeof window === 'undefined') {
    return createDefaultDailyImageUploadUsage();
  }
  try {
    const raw = window.localStorage.getItem(DAILY_IMAGE_UPLOAD_USAGE_KEY);
    if (!raw) {
      return createDefaultDailyImageUploadUsage();
    }
    const parsed = JSON.parse(raw);
    return normalizeDailyImageUploadUsage(parsed);
  } catch {
    return createDefaultDailyImageUploadUsage();
  }
}

function writeDailyImageUploadUsage(usage) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(DAILY_IMAGE_UPLOAD_USAGE_KEY, JSON.stringify(usage));
  } catch {
    // ignore localStorage write errors
  }
}

function normalizeChatMode(value) {
  const text = String(value || '').toLowerCase();
  return CHAT_MODE_ORDER.includes(text) ? text : DEFAULT_CHAT_MODE;
}

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

function isPersonalizationNotFoundError(error) {
  return (error?.message || '')
    .toLowerCase()
    .includes(PERSONALIZATION_NOT_FOUND_MESSAGE.toLowerCase());
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

function summarizeMessagesForMemory(messages, limit = 8) {
  const pool = Array.isArray(messages) ? messages : [];
  const lines = pool
    .slice(-Math.max(limit * 2, limit))
    .map((entry) => {
      const role = entry?.role === 'assistant' ? 'assistant' : 'user';
      const text = stripMarkdownForSpeech(normalizeMessageText(entry)).slice(0, 220);
      if (!text) {
        return '';
      }
      return `${role}: ${text}`;
    })
    .filter(Boolean);
  return lines.slice(-limit);
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

  const hasDirectAssistantText =
    String(message?.text || '').trim().length > 0 ||
    String(message?.structured?.final_response || '').trim().length > 0;
  if (hasDirectAssistantText) {
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
  const {
    personalization,
    replacePersonalization,
    updatePersonalizationField,
  } = usePersonalization();

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

  const [chatLanguage, setChatLanguage] = useState(() => readStoredAppSettings().language);
  const [activeMode, setActiveMode] = useState(DEFAULT_CHAT_MODE);
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches
      : false
  );
  const [isTabletLayout, setIsTabletLayout] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(
          `(min-width: ${MOBILE_MAX_WIDTH + 1}px) and (max-width: ${TABLET_MAX_WIDTH}px)`
        ).matches
      : false
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
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [sessionMenuOpenId, setSessionMenuOpenId] = useState('');
  const [sessionActionBusyId, setSessionActionBusyId] = useState('');

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [newChatInterfaceVersion, setNewChatInterfaceVersion] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');

  const [draft, setDraft] = useState('');
  const [draftsByMode, setDraftsByMode] = useState(() => ({
    chat: '',
    drug: '',
    research: '',
    who: '',
  }));
  const [attachedImages, setAttachedImages] = useState([]);
  const [composerAttachmentMenuOpen, setComposerAttachmentMenuOpen] = useState(false);
  const [dictationSupported, setDictationSupported] = useState(false);
  const [dictationState, setDictationState] = useState('idle');
  const [voices, setVoices] = useState([]);
  const [speakingMessageId, setSpeakingMessageId] = useState('');
  const [autoVoice, setAutoVoice] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');
  const [reviewSending, setReviewSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(SETTINGS_TAB_GENERAL);
  const [appSettings, setAppSettings] = useState(readStoredAppSettings);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');
  const [preferencesInfo, setPreferencesInfo] = useState('');
  const [personalizationBusy, setPersonalizationBusy] = useState(false);
  const [personalizationSaving, setPersonalizationSaving] = useState(false);
  const [personalizationError, setPersonalizationError] = useState('');
  const [personalizationInfo, setPersonalizationInfo] = useState('');
  const [hasBackendPersonalization, setHasBackendPersonalization] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileInfo, setProfileInfo] = useState('');
  const [hasProfile, setHasProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(createEmptyMedicalProfile);

  const textAreaRef = useRef(null);
  const scrollBottomRef = useRef(null);
  const chatScrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const utteranceRef = useRef(null);
  const autoSpokenMessageRef = useRef('');
  const userMenuRef = useRef(null);
  const shareMenuRef = useRef(null);
  const modeMenuRef = useRef(null);
  const composerAttachmentMenuRef = useRef(null);
  const uploadImageInputRef = useRef(null);
  const captureImageInputRef = useRef(null);
  const reviewCloseTimerRef = useRef(null);
  const sidebarResizeStartXRef = useRef(0);
  const sidebarResizeStartWidthRef = useRef(SIDEBAR_OPEN_WIDTH);
  const personalizationReadyRef = useRef(false);
  const personalizationLastSyncedRef = useRef('');

  const authenticated = Boolean(token);
  const inGuestMode = guestMode && !authenticated;
  const isDesktopLayout = !isMobileLayout && !isTabletLayout;
  const activeModeConfig = CHAT_MODES[normalizeChatMode(activeMode)] || CHAT_MODES[DEFAULT_CHAT_MODE];
  const modeOptions = useMemo(
    () => CHAT_MODE_ORDER.map((mode) => CHAT_MODES[mode]).filter(Boolean),
    []
  );
  const reviewTrimmedLength = reviewText.trim().length;
  const reviewInlineError =
    reviewError || (reviewText.length > 0 && reviewTrimmedLength < 10 ? 'Review must be at least 10 characters.' : '');
  const canSendMessage = Boolean(draft.trim()) || attachedImages.length > 0;
  const effectivePersonalization = useMemo(
    () => normalizePersonalization(personalization),
    [personalization]
  );
  const serializedPersonalization = useMemo(
    () => serializePersonalization(effectivePersonalization),
    [effectivePersonalization]
  );
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );
  const scrollChatToBottom = useCallback((behavior = 'smooth') => {
    const container = chatScrollRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
      return;
    }
    scrollBottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);
  const filteredSessions = useMemo(() => {
    const toTimestamp = (value) => {
      const parsed = new Date(value || '').getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const query = chatSearch.trim().toLowerCase();
    const visibleSessions = sessions
      .filter((session) => !session?.is_archived)
      .sort((left, right) => {
        const pinDiff = Number(Boolean(right?.is_pinned)) - Number(Boolean(left?.is_pinned));
        if (pinDiff !== 0) {
          return pinDiff;
        }
        const leftPinned = toTimestamp(left?.pinned_at || left?.last_message_at || left?.created_at);
        const rightPinned = toTimestamp(right?.pinned_at || right?.last_message_at || right?.created_at);
        return rightPinned - leftPinned;
      });
    if (!query) {
      return visibleSessions;
    }
    return visibleSessions.filter((session) => (session.title || '').toLowerCase().includes(query));
  }, [chatSearch, sessions]);

  useEffect(() => {
    applyAppearanceTheme(appSettings.appearance);
  }, [appSettings.appearance]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
  }, [appSettings]);

  useEffect(() => {
    if (chatLanguage !== appSettings.language) {
      setChatLanguage(appSettings.language);
    }
  }, [appSettings.language, chatLanguage]);

  useEffect(() => {
    if (appSettings.appearance !== 'system' || typeof window === 'undefined') {
      return undefined;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => applyAppearanceTheme('system');
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, [appSettings.appearance]);

  useEffect(() => {
    const nextDraft = draftsByMode[activeMode] || '';
    setDraft((prev) => (prev === nextDraft ? prev : nextDraft));
  }, [activeMode, draftsByMode]);

  useEffect(() => {
    setDraftsByMode((prev) => {
      if (prev[activeMode] === draft) {
        return prev;
      }
      return { ...prev, [activeMode]: draft };
    });
  }, [activeMode, draft]);

  useEffect(
    () => () => {
      if (reviewCloseTimerRef.current) {
        window.clearTimeout(reviewCloseTimerRef.current);
        reviewCloseTimerRef.current = null;
      }
    },
    []
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
    if (reviewCloseTimerRef.current) {
      window.clearTimeout(reviewCloseTimerRef.current);
      reviewCloseTimerRef.current = null;
    }
    setToken('');
    setTokenExpiryMs(0);
    setUser(null);
    setSessions([]);
    setActiveSessionId('');
    setMessages([]);
    setNewChatInterfaceVersion(0);
    setDraft('');
    setDraftsByMode({
      chat: '',
      drug: '',
      research: '',
      who: '',
    });
    setAttachedImages([]);
    setComposerAttachmentMenuOpen(false);
    setActiveMode(DEFAULT_CHAT_MODE);
    setChatError('');
    setShareError('');
    setSessionMenuOpenId('');
    setSessionActionBusyId('');
    setIsSidebarOpen(true);
    setSidebarWidth(SIDEBAR_OPEN_WIDTH);
    setSidebarResizing(false);
    setSearchChatsOpen(false);
    setChatSearch('');
    setModeMenuOpen(false);
    setReviewModalOpen(false);
    setReviewText('');
    setReviewError('');
    setReviewSuccess('');
    setReviewSending(false);
    setSettingsOpen(false);
    setSettingsTab(SETTINGS_TAB_GENERAL);
    setPreferencesBusy(false);
    setPreferencesSaving(false);
    setPreferencesError('');
    setPreferencesInfo('');
    setPersonalizationBusy(false);
    setPersonalizationSaving(false);
    setPersonalizationError('');
    setPersonalizationInfo('');
    setHasBackendPersonalization(false);
    personalizationReadyRef.current = false;
    personalizationLastSyncedRef.current = '';
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
    setSidebarWidth((prev) =>
      prev <= SIDEBAR_COLLAPSED_WIDTH + 4 ? SIDEBAR_OPEN_WIDTH : clampSidebarWidth(prev)
    );
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    setSidebarResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setModeMenuOpen(false);
    setUserMenuOpen(false);
    setSessionMenuOpenId('');
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
        setModeMenuOpen(false);
        setUserMenuOpen(false);
        setSessionMenuOpenId('');
        if (isMobileLayout) {
          setSearchChatsOpen(false);
          setChatSearch('');
        }
      } else {
        setSidebarWidth((current) =>
          current <= SIDEBAR_COLLAPSED_WIDTH + 4 ? SIDEBAR_OPEN_WIDTH : clampSidebarWidth(current)
        );
      }
      return next;
    });
  }, [isMobileLayout]);

  const handleSidebarResizeStart = useCallback(
    (event) => {
      if (!isDesktopLayout || !isSidebarOpen) {
        return;
      }
      setSidebarResizing(true);
      sidebarResizeStartXRef.current = event.clientX;
      sidebarResizeStartWidthRef.current = sidebarWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      event.preventDefault();
    },
    [isDesktopLayout, isSidebarOpen, sidebarWidth]
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
      const first = nextSessions[0].id;
      setActiveSessionId(first);
      return first;
    },
    [token]
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
    const behavior = loadingHistory ? 'auto' : 'smooth';
    const frame = window.requestAnimationFrame(() => {
      scrollChatToBottom(behavior);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadingHistory, sending, sortedMessages, shareRouteId, scrollChatToBottom]);

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
    const mobileMedia = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const tabletMedia = window.matchMedia(
      `(min-width: ${MOBILE_MAX_WIDTH + 1}px) and (max-width: ${TABLET_MAX_WIDTH}px)`
    );
    const sync = () => {
      const mobile = mobileMedia.matches;
      const tablet = tabletMedia.matches;
      setIsMobileLayout(mobile);
      setIsTabletLayout(tablet);
      if (!mobile && !tablet) {
        return;
      }
      if (mobile) {
        setIsSidebarOpen(false);
      }
      setSidebarResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    sync();
    mobileMedia.addEventListener('change', sync);
    tabletMedia.addEventListener('change', sync);
    return () => {
      mobileMedia.removeEventListener('change', sync);
      tabletMedia.removeEventListener('change', sync);
    };
  }, [shareRouteId]);

  useEffect(() => {
    if (authenticated) {
      setIsSidebarOpen(!isMobileLayout);
      setSidebarWidth((prev) =>
        prev <= SIDEBAR_COLLAPSED_WIDTH + 4 ? SIDEBAR_OPEN_WIDTH : clampSidebarWidth(prev)
      );
    }
  }, [authenticated, isMobileLayout]);

  useEffect(() => {
    if (shareRouteId) return;
    const onPointerDown = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
      if (shareMenuRef.current && !shareMenuRef.current.contains(event.target)) {
        setShareMenuOpen(false);
      }
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target)) {
        setModeMenuOpen(false);
      }
      if (
        composerAttachmentMenuRef.current &&
        !composerAttachmentMenuRef.current.contains(event.target)
      ) {
        setComposerAttachmentMenuOpen(false);
      }
      if (event.target instanceof Element && !event.target.closest('[data-session-menu]')) {
        setSessionMenuOpenId('');
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
      const configuredLang = appSettings.language === 'ur' ? 'ur-PK' : 'en-US';
      const lang = appSettings.voice_auto_detect
        ? containsUrdu(speechText)
          ? 'ur-PK'
          : 'en-US'
        : configuredLang;
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
    [appSettings.language, appSettings.voice_auto_detect, stopSpeaking, voices]
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

  const applyUserSettings = useCallback((payload) => {
    if (!payload) {
      return;
    }
    setAppSettings((prev) =>
      normalizeAppSettings({
        ...prev,
        ...payload,
        display_name: payload.display_name ?? prev.display_name,
      })
    );
  }, []);

  const loadUserSettings = useCallback(
    async (authToken = token) => {
      if (!authToken) {
        return null;
      }
      const payload = await api.getSettings(authToken);
      applyUserSettings(payload);
      return payload;
    },
    [applyUserSettings, token]
  );

  const loadPersonalization = useCallback(
    async (authToken = token) => {
      if (!authToken) {
        setHasBackendPersonalization(false);
        return null;
      }
      const payload = await api.getPersonalization(authToken);
      const normalized = normalizePersonalization(payload);
      replacePersonalization(normalized);
      setHasBackendPersonalization(true);
      personalizationLastSyncedRef.current = serializePersonalization(normalized);
      return normalized;
    },
    [replacePersonalization, token]
  );

  useEffect(() => {
    if (!authenticated || shareRouteId) {
      return;
    }
    loadUserSettings(token).catch(() => {
      // keep local settings if backend settings are unavailable
    });
  }, [authenticated, loadUserSettings, shareRouteId, token]);

  useEffect(() => {
    if (shareRouteId) {
      return;
    }
    if (!authenticated || !token) {
      personalizationReadyRef.current = true;
      personalizationLastSyncedRef.current = '';
      setHasBackendPersonalization(false);
      setPersonalizationBusy(false);
      setPersonalizationSaving(false);
      setPersonalizationError('');
      return;
    }

    let cancelled = false;
    personalizationReadyRef.current = false;
    setPersonalizationBusy(true);
    setPersonalizationError('');
    const hydrate = async () => {
      try {
        await loadPersonalization(token);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isPersonalizationNotFoundError(error)) {
          setHasBackendPersonalization(false);
          personalizationLastSyncedRef.current = '';
        } else {
          setPersonalizationError(error?.message || 'Unable to load personalization.');
        }
      } finally {
        if (!cancelled) {
          personalizationReadyRef.current = true;
          setPersonalizationBusy(false);
        }
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [authenticated, loadPersonalization, shareRouteId, token]);

  useEffect(() => {
    if (shareRouteId) {
      return;
    }
    if (!settingsOpen) {
      return;
    }

    if (!authenticated || !token || inGuestMode) {
      setPersonalizationSaving(false);
      setPersonalizationError('');
      setPersonalizationInfo('Personalization saved on this device.');
      return;
    }

    if (!personalizationReadyRef.current) {
      return;
    }

    if (serializedPersonalization === personalizationLastSyncedRef.current) {
      return;
    }

    setPersonalizationError('');
    const timer = window.setTimeout(async () => {
      setPersonalizationSaving(true);
      try {
        const requestBody = toPersonalizationApiPayload(effectivePersonalization);
        let payload;
        if (hasBackendPersonalization) {
          payload = await api.updatePersonalization(requestBody, token);
        } else {
          try {
            payload = await api.createPersonalization(requestBody, token);
          } catch (error) {
            if ((error?.message || '').toLowerCase().includes('already exists')) {
              payload = await api.updatePersonalization(requestBody, token);
            } else {
              throw error;
            }
          }
        }
        const normalized = normalizePersonalization(payload);
        replacePersonalization(normalized);
        setHasBackendPersonalization(true);
        personalizationLastSyncedRef.current = serializePersonalization(normalized);
        setPersonalizationInfo('Personalization saved.');
      } catch (error) {
        setPersonalizationError(error?.message || 'Unable to save personalization.');
      } finally {
        setPersonalizationSaving(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    authenticated,
    effectivePersonalization,
    hasBackendPersonalization,
    inGuestMode,
    replacePersonalization,
    serializedPersonalization,
    settingsOpen,
    shareRouteId,
    token,
  ]);

  const handlePreferenceFieldChange = useCallback((key, value) => {
    setAppSettings((prev) => normalizeAppSettings({ ...prev, [key]: value }));
    setPreferencesError('');
    setPreferencesInfo('');
  }, []);

  const handlePersonalizationFieldChange = useCallback(
    (key, value) => {
      updatePersonalizationField(key, value);
      setPersonalizationError('');
      if (!authenticated || inGuestMode) {
        setPersonalizationInfo('Personalization saved on this device.');
      } else {
        setPersonalizationInfo('');
      }
    },
    [authenticated, inGuestMode, updatePersonalizationField]
  );

  const handleQuickAppearanceChange = useCallback(
    (appearance) => {
      handlePreferenceFieldChange('appearance', appearance);
    },
    [handlePreferenceFieldChange]
  );

  const handleQuickLanguageChange = useCallback(
    (language) => {
      handlePreferenceFieldChange('language', language);
    },
    [handlePreferenceFieldChange]
  );

  const handlePreferencesSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setPreferencesSaving(true);
      setPreferencesError('');
      setPreferencesInfo('');
      try {
        const normalized = normalizeAppSettings(appSettings);
        if (token) {
          const payload = await api.updateSettings(
            {
              appearance: normalized.appearance,
              language: normalized.language,
              voice_gender: 'female',
              voice_auto_detect: normalized.voice_auto_detect,
              display_name: normalized.display_name || null,
            },
            token
          );
          applyUserSettings(payload);
          setUser((prev) => {
            if (!prev) {
              return prev;
            }
            const nextUser = { ...prev, full_name: payload.display_name || null };
            localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
            return nextUser;
          });
          setPreferencesInfo('Settings saved.');
        } else {
          setPreferencesInfo('Settings saved on this device.');
        }
      } catch (error) {
        setPreferencesError(error?.message || 'Unable to save settings.');
      } finally {
        setPreferencesSaving(false);
      }
    },
    [appSettings, applyUserSettings, token]
  );

  const handleOpenSettings = useCallback(async () => {
    setSettingsOpen(true);
    setSettingsTab(SETTINGS_TAB_GENERAL);
    setPreferencesBusy(Boolean(token));
    setPreferencesSaving(false);
    setPreferencesError('');
    setPreferencesInfo('');
    setPersonalizationBusy(Boolean(token));
    setPersonalizationSaving(false);
    setPersonalizationError('');
    setPersonalizationInfo('');
    setProfileBusy(true);
    setProfileSaving(false);
    setProfileError('');
    setProfileInfo('');
    if (!token) {
      setPersonalizationBusy(false);
      setProfileBusy(false);
      return;
    }
    try {
      await loadUserSettings(token);
    } catch (error) {
      setPreferencesError(error?.message || 'Unable to load settings.');
    } finally {
      setPreferencesBusy(false);
    }
    try {
      await loadPersonalization(token);
    } catch (error) {
      if (isPersonalizationNotFoundError(error)) {
        setHasBackendPersonalization(false);
      } else {
        setPersonalizationError(error?.message || 'Unable to load personalization.');
      }
    } finally {
      setPersonalizationBusy(false);
    }
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
  }, [loadMedicalProfile, loadPersonalization, loadUserSettings, token]);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingsTab(SETTINGS_TAB_GENERAL);
    setPreferencesBusy(false);
    setPreferencesSaving(false);
    setPreferencesError('');
    setPreferencesInfo('');
    setPersonalizationBusy(false);
    setPersonalizationSaving(false);
    setPersonalizationError('');
    setPersonalizationInfo('');
    setProfileSaving(false);
    setProfileError('');
    setProfileInfo('');
  }, []);

  const handleOpenPersonalizationSettings = useCallback(async () => {
    await handleOpenSettings();
    setSettingsTab(SETTINGS_TAB_PERSONALIZATION);
    setUserMenuOpen(false);
  }, [handleOpenSettings]);

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
    setModeMenuOpen(false);
    setGuestMode(true);
  }, []);

  const handleExitGuestMode = useCallback(() => {
    if (reviewCloseTimerRef.current) {
      window.clearTimeout(reviewCloseTimerRef.current);
      reviewCloseTimerRef.current = null;
    }
    stopSpeaking();
    stopDictation(true);
    setGuestMode(false);
    setSessions([]);
    setActiveSessionId('');
    setMessages([]);
    setNewChatInterfaceVersion(0);
    setDraft('');
    setDraftsByMode({
      chat: '',
      drug: '',
      research: '',
      who: '',
    });
    setAttachedImages([]);
    setComposerAttachmentMenuOpen(false);
    setActiveMode(DEFAULT_CHAT_MODE);
    setChatError('');
    setShareError('');
    setSessionMenuOpenId('');
    setSessionActionBusyId('');
    setModeMenuOpen(false);
    setReviewModalOpen(false);
    setReviewText('');
    setReviewError('');
    setReviewSuccess('');
    setReviewSending(false);
    setSettingsOpen(false);
    setSettingsTab(SETTINGS_TAB_GENERAL);
    setPreferencesBusy(false);
    setPreferencesSaving(false);
    setPreferencesError('');
    setPreferencesInfo('');
    setPersonalizationBusy(false);
    setPersonalizationSaving(false);
    setPersonalizationError('');
    setPersonalizationInfo('');
    setHasBackendPersonalization(false);
    personalizationReadyRef.current = false;
    personalizationLastSyncedRef.current = '';
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
      setSessionMenuOpenId('');
      setActiveSessionId(sessionId);
      await loadHistory(sessionId);
      if (isMobileLayout) {
        closeSidebar();
      }
    },
    [closeSidebar, isMobileLayout, loadHistory]
  );

  const handleNewChat = useCallback(() => {
    setSessionMenuOpenId('');
    setActiveSessionId('');
    setMessages([]);
    setDraft('');
    setAttachedImages([]);
    setComposerAttachmentMenuOpen(false);
    setDraftsByMode({
      chat: '',
      drug: '',
      research: '',
      who: '',
    });
    setChatError('');
    setShareError('');
    setShareMenuOpen(false);
    setNewChatInterfaceVersion((prev) => prev + 1);
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

  const handleModeSelection = useCallback(
    (mode) => {
      const nextMode = normalizeChatMode(mode);
      setModeMenuOpen(false);
      if (nextMode === activeMode) {
        return;
      }
      setActiveMode(nextMode);
      setChatError('');
      setShareError('');
    },
    [activeMode]
  );

  const handleModeSuggestion = useCallback((text) => {
    const next = String(text || '').trim();
    setDraft(next);
    if (textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, []);

  const renderModeInterface = useMemo(() => {
    if (activeMode === 'drug') {
      return <DrugInfoModeView key={`drug-${newChatInterfaceVersion}`} onSuggestion={handleModeSuggestion} />;
    }
    if (activeMode === 'research') {
      return <ResearchModeView key={`research-${newChatInterfaceVersion}`} onSuggestion={handleModeSuggestion} />;
    }
    if (activeMode === 'who') {
      return <WhoStatsModeView key={`who-${newChatInterfaceVersion}`} onSuggestion={handleModeSuggestion} />;
    }
    return <ChatModeView key={`chat-${newChatInterfaceVersion}`} onSuggestion={handleModeSuggestion} />;
  }, [activeMode, handleModeSuggestion, newChatInterfaceVersion]);

  const handleOpenReviewModal = useCallback(() => {
    if (reviewCloseTimerRef.current) {
      window.clearTimeout(reviewCloseTimerRef.current);
      reviewCloseTimerRef.current = null;
    }
    setReviewModalOpen(true);
    setReviewText('');
    setReviewError('');
    setReviewSuccess('');
    setReviewSending(false);
    setUserMenuOpen(false);
  }, []);

  const handleCloseReviewModal = useCallback(() => {
    if (reviewSending) {
      return;
    }
    if (reviewCloseTimerRef.current) {
      window.clearTimeout(reviewCloseTimerRef.current);
      reviewCloseTimerRef.current = null;
    }
    setReviewModalOpen(false);
    setReviewError('');
    setReviewSuccess('');
    setReviewSending(false);
  }, [reviewSending]);

  const handleReviewSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const normalized = reviewText.trim();
      if (normalized.length < 10) {
        setReviewError('Review must be at least 10 characters.');
        return;
      }

      setReviewSending(true);
      setReviewError('');
      setReviewSuccess('');

      try {
        const payload = {
          review: normalized,
          user_email: user?.email || undefined,
          user_name: user?.full_name || (inGuestMode ? 'Guest User' : undefined),
        };
        await api.sendReview(payload, token || undefined);
        setReviewSuccess('Thank you for your feedback!');
        setReviewText('');
        if (reviewCloseTimerRef.current) {
          window.clearTimeout(reviewCloseTimerRef.current);
        }
        reviewCloseTimerRef.current = window.setTimeout(() => {
          setReviewModalOpen(false);
          setReviewSuccess('');
          setReviewSending(false);
          reviewCloseTimerRef.current = null;
        }, 1300);
      } catch (error) {
        setReviewError(error?.message || 'Unable to send review right now. Please try again.');
      } finally {
        setReviewSending(false);
      }
    },
    [inGuestMode, reviewText, token, user?.email, user?.full_name]
  );

  const handleToggleSessionMenu = useCallback((sessionId) => {
    setSessionMenuOpenId((prev) => (prev === sessionId ? '' : sessionId));
  }, []);

  const handlePinSession = useCallback(
    async (session) => {
      if (!token || inGuestMode || !session?.id) {
        return;
      }
      setSessionActionBusyId(session.id);
      setChatError('');
      try {
        await api.pinChat(session.id, !Boolean(session.is_pinned), token);
        await refreshSessions(activeSessionId || session.id, token);
      } catch (error) {
        setChatError(error.message);
      } finally {
        setSessionActionBusyId('');
        setSessionMenuOpenId('');
      }
    },
    [activeSessionId, inGuestMode, refreshSessions, token]
  );

  const handleArchiveSession = useCallback(
    async (session) => {
      if (!token || inGuestMode || !session?.id) {
        return;
      }
      setSessionActionBusyId(session.id);
      setChatError('');
      try {
        await api.archiveChat(session.id, true, token);
        if (activeSessionId === session.id) {
          const nextSessionId = await refreshSessions('', token);
          if (nextSessionId) {
            await loadHistory(nextSessionId, token);
          } else {
            setMessages([]);
          }
        } else {
          await refreshSessions(activeSessionId, token);
        }
      } catch (error) {
        setChatError(error.message);
      } finally {
        setSessionActionBusyId('');
        setSessionMenuOpenId('');
      }
    },
    [activeSessionId, inGuestMode, loadHistory, refreshSessions, token]
  );

  const handleDeleteSession = useCallback(
    async (session) => {
      if (!token || inGuestMode || !session?.id) {
        return;
      }
      setSessionActionBusyId(session.id);
      setChatError('');
      try {
        await api.deleteChat(session.id, token);
        if (activeSessionId === session.id) {
          const nextSessionId = await refreshSessions('', token);
          if (nextSessionId) {
            await loadHistory(nextSessionId, token);
          } else {
            setMessages([]);
          }
        } else {
          await refreshSessions(activeSessionId, token);
        }
      } catch (error) {
        setChatError(error.message);
      } finally {
        setSessionActionBusyId('');
        setSessionMenuOpenId('');
      }
    },
    [activeSessionId, inGuestMode, loadHistory, refreshSessions, token]
  );

  const addImageAttachments = useCallback(
    (fileList) => {
      const selectedFiles = Array.from(fileList || []);
      if (!selectedFiles.length) {
        return;
      }

      const current = Array.isArray(attachedImages) ? attachedImages : [];
      const currentKeys = new Set(current.map((item) => item.key));
      const next = [...current];
      let skippedItems = false;
      let skippedByLimit = false;
      const usage = readDailyImageUploadUsage();
      const usageField = inGuestMode ? 'guest' : 'user';
      const dailyLimit = inGuestMode ? GUEST_DAILY_IMAGE_UPLOAD_LIMIT : USER_DAILY_IMAGE_UPLOAD_LIMIT;
      const remainingUploads = Math.max(0, dailyLimit - Number(usage[usageField] || 0));
      let acceptedCount = 0;

      if (remainingUploads <= 0) {
        setChatError(
          inGuestMode
            ? `Guest image limit reached (${GUEST_DAILY_IMAGE_UPLOAD_LIMIT}/day). Create an account to upload up to ${USER_DAILY_IMAGE_UPLOAD_LIMIT} images per day.`
            : `Daily image limit reached (${USER_DAILY_IMAGE_UPLOAD_LIMIT}/day). Try again tomorrow.`
        );
        return;
      }

      for (const file of selectedFiles) {
        if (!file || typeof file !== 'object') {
          skippedItems = true;
          continue;
        }
        if (!String(file.type || '').startsWith('image/')) {
          skippedItems = true;
          continue;
        }
        if (Number(file.size || 0) > MAX_IMAGE_ATTACHMENT_SIZE_BYTES) {
          skippedItems = true;
          continue;
        }

        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (currentKeys.has(key)) {
          skippedItems = true;
          continue;
        }
        if (next.length >= MAX_IMAGE_ATTACHMENTS) {
          skippedItems = true;
          continue;
        }
        if (acceptedCount >= remainingUploads) {
          skippedItems = true;
          skippedByLimit = true;
          continue;
        }

        currentKeys.add(key);
        next.push({
          id: `${key}-${Math.random().toString(36).slice(2, 8)}`,
          key,
          name: file.name,
          size: file.size,
        });
        acceptedCount += 1;
      }

      if (next.length === current.length) {
        if (skippedByLimit) {
          setChatError(
            inGuestMode
              ? `Guest image limit reached (${GUEST_DAILY_IMAGE_UPLOAD_LIMIT}/day). Create an account to upload up to ${USER_DAILY_IMAGE_UPLOAD_LIMIT} images per day.`
              : `Daily image limit reached (${USER_DAILY_IMAGE_UPLOAD_LIMIT}/day). Try again tomorrow.`
          );
          return;
        }
        setChatError('Only image files up to 10MB are supported.');
        return;
      }

      setAttachedImages(next);
      if (acceptedCount > 0) {
        const nextUsage = {
          ...usage,
          [usageField]: Number(usage[usageField] || 0) + acceptedCount,
        };
        writeDailyImageUploadUsage(nextUsage);
      }
      if (skippedItems) {
        if (skippedByLimit) {
          const remainingAfterAdd = Math.max(0, remainingUploads - acceptedCount);
          setChatError(
            inGuestMode
              ? `Some files were skipped. Guest limit is ${GUEST_DAILY_IMAGE_UPLOAD_LIMIT}/day. ${remainingAfterAdd} upload${remainingAfterAdd === 1 ? '' : 's'} left today.`
              : `Some files were skipped. Daily limit is ${USER_DAILY_IMAGE_UPLOAD_LIMIT}/day. ${remainingAfterAdd} upload${remainingAfterAdd === 1 ? '' : 's'} left today.`
          );
        } else {
          setChatError(
            `Some files were skipped. You can attach up to ${MAX_IMAGE_ATTACHMENTS} images and each must be under 10MB.`
          );
        }
      } else {
        setChatError('');
      }
    },
    [attachedImages, inGuestMode]
  );

  const handleUploadImageSelect = useCallback(
    (event) => {
      addImageAttachments(event.target.files);
      event.target.value = '';
      setComposerAttachmentMenuOpen(false);
    },
    [addImageAttachments]
  );

  const handleCaptureImageSelect = useCallback(
    (event) => {
      addImageAttachments(event.target.files);
      event.target.value = '';
      setComposerAttachmentMenuOpen(false);
    },
    [addImageAttachments]
  );

  const handleOpenUploadImagePicker = useCallback(() => {
    setComposerAttachmentMenuOpen(false);
    if (uploadImageInputRef.current) {
      uploadImageInputRef.current.click();
    }
  }, []);

  const handleOpenCaptureImagePicker = useCallback(() => {
    setComposerAttachmentMenuOpen(false);
    if (captureImageInputRef.current) {
      captureImageInputRef.current.click();
    }
  }, []);

  const handleRemoveAttachedImage = useCallback((attachmentId) => {
    setAttachedImages((prev) => prev.filter((item) => item.id !== attachmentId));
  }, []);

  const handleSendMessage = useCallback(async () => {
    const attachmentText = attachedImages.length
      ? `Attached image${attachedImages.length > 1 ? 's' : ''}:\n${attachedImages
          .map((item, index) => `${index + 1}. ${item.name}`)
          .join('\n')}`
      : '';
    const text = [draft.trim(), attachmentText].filter(Boolean).join('\n\n');
    if (!text || sending || (!token && !inGuestMode)) return;

    const temporaryId = `pending-${Date.now()}`;
    const nowIso = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      {
        id: temporaryId,
        role: 'user',
        text,
        session_id: activeSessionId || '',
        mode: normalizeChatMode(activeMode),
        created_at: nowIso,
      },
    ]);
    window.requestAnimationFrame(() => {
      scrollChatToBottom('smooth');
    });
    setDraft('');
    setAttachedImages([]);
    setComposerAttachmentMenuOpen(false);
    setSending(true);
    setChatError('');

    try {
      const language = containsUrdu(text) ? 'ur' : chatLanguage;
      let profilePayload = undefined;
      const personalizationPayload = normalizePersonalization(effectivePersonalization);
      personalizationPayload.recent_chat_summaries =
        inGuestMode && personalizationPayload.allow_memory && personalizationPayload.allow_chat_reference
          ? summarizeMessagesForMemory(sortedMessages, 8)
          : [];
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
          mode: normalizeChatMode(activeMode),
          profile: profilePayload,
          personalization: personalizationPayload,
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
            mode: result.mode || normalizeChatMode(activeMode),
            created_at: new Date().toISOString(),
          },
        ]);
        window.requestAnimationFrame(() => {
          scrollChatToBottom('smooth');
        });
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
  }, [
    activeMode,
    activeSessionId,
    attachedImages,
    chatLanguage,
    draft,
    inGuestMode,
    loadHistory,
    loadMedicalProfile,
    effectivePersonalization,
    refreshSessions,
    sending,
    scrollChatToBottom,
    sortedMessages,
    token,
  ]);

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

  const inlineSidebarWidth = isSidebarOpen ? sidebarWidth : SIDEBAR_COLLAPSED_WIDTH;
  const overlaySidebarWidth = `min(${SIDEBAR_OPEN_WIDTH}px, 88vw)`;
  const mainContentOffset = isMobileLayout ? 0 : inlineSidebarWidth;
  const ActiveModeIcon = activeModeConfig.icon;

  return (
    <div className="app-shell relative flex h-screen min-h-0 flex-col overflow-hidden bg-slatebg text-slate-100">
      {/* ── Dr. Amna rich message styles ─────────────────────────────────── */}
      <style>{`
        .message-rich { font-size: 14px; line-height: 1.7; color: #e2e8f0; }
        .message-rich strong { color: #a5f3fc; font-weight: 700; }
        .message-rich code { background: rgba(255,255,255,0.1); padding: 1px 5px; border-radius: 4px; font-family: monospace; font-size: 0.88em; }
        .message-rich p { margin: 4px 0; }
        .message-rich ul { margin: 6px 0 8px 0; padding-left: 0; list-style: none; }
        .message-rich ol { margin: 6px 0 8px 0; padding-left: 18px; }
        .message-rich li { margin-bottom: 5px; line-height: 1.65; }
        .message-rich h4 { color: #7dd3fc; font-weight: 700; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; margin: 10px 0 4px 0; }
        @keyframes drAmnaTyping {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-3px); }
        }
        .dr-amna-dot { width: 7px; height: 7px; border-radius: 50%; background: #7dd3fc; display: inline-block; animation: drAmnaTyping 1.2s ease-in-out infinite; }
        .dr-amna-dot:nth-child(2) { animation-delay: 0.18s; }
        .dr-amna-dot:nth-child(3) { animation-delay: 0.36s; }
      `}</style>
      <MedicalBackground opacity={0.15} />
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {isMobileLayout && isSidebarOpen && (
          <button
            type="button"
            onClick={closeSidebar}
            className="absolute inset-0 z-30 bg-slate-950/65 backdrop-blur-sm"
            aria-label="Close sidebar overlay"
          />
        )}

        <aside
          className={`sidebar-shell group fixed left-0 top-0 z-40 h-full border-r border-white/10 bg-slate-950/90 backdrop-blur transition-[width,transform] duration-300 ${
            isMobileLayout ? (isSidebarOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'
          }`}
          style={{ width: isMobileLayout ? overlaySidebarWidth : `${inlineSidebarWidth}px` }}
        >
          <div className="flex h-full flex-col">
            <div className={isSidebarOpen ? (isMobileLayout ? 'p-4' : 'p-3') : 'flex justify-center px-2 py-3'}>
              {!isSidebarOpen && (
                <div className="w-full text-center">
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    className="mobile-touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/30 bg-emerald-300/15 text-emerald-200 hover:bg-emerald-300/20 hover:text-emerald-100"
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
                      className="mobile-touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10 hover:text-white"
                      aria-label="Collapse sidebar"
                    >
                      <Menu size={16} />
                    </button>
                  </div>
                  <div className="space-y-1">
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="mobile-touch-target flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-base text-slate-100 hover:bg-white/10"
                  >
                    <Plus size={18} />
                    New chat
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleSearchChats}
                    className="mobile-touch-target flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-base text-slate-100 hover:bg-white/10"
                  >
                    <Search size={18} />
                    Search chats
                  </button>
                  <div ref={modeMenuRef} className="relative" data-mode-menu>
                    <button
                      type="button"
                      onClick={() => setModeMenuOpen((prev) => !prev)}
                      className={`mobile-touch-target flex w-full items-center justify-between gap-3 rounded-xl border px-2.5 py-2 text-left text-sm transition ${activeModeConfig.optionClass}`}
                      aria-label="Select mode"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${activeModeConfig.iconBoxClass}`}
                        >
                          <ActiveModeIcon size={15} />
                        </span>
                        <span className="truncate font-semibold">{activeModeConfig.label}</span>
                      </span>
                      <ChevronDown
                        size={15}
                        className={`shrink-0 transition-transform duration-200 ${modeMenuOpen ? 'rotate-180' : 'rotate-0'}`}
                      />
                    </button>
                    <div
                      className={`absolute left-0 right-0 z-30 mt-2 origin-top rounded-2xl border border-white/15 bg-slate-900/95 p-2 shadow-chat transition-all duration-200 ${
                        modeMenuOpen
                          ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
                          : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
                      }`}
                    >
                      <div className="space-y-2">
                        {modeOptions.map((mode) => {
                          const ModeIcon = mode.icon;
                          const isActive = mode.id === activeMode;
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() => handleModeSelection(mode.id)}
                              className={`mobile-touch-target flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold tracking-wide transition ${
                                isActive ? mode.optionActiveClass : mode.optionClass
                              }`}
                            >
                              <span
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${mode.iconBoxClass}`}
                              >
                                <ModeIcon size={15} />
                              </span>
                              <span>{mode.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
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
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
                {filteredSessions.map((session) => (
                  <div key={session.id} className="group relative mb-1">
                    <button
                      type="button"
                      onClick={() => handleSelectSession(session.id)}
                      className={`w-full rounded-lg px-3 py-2 pr-10 text-left transition ${
                        activeSessionId === session.id ? 'bg-emerald-500/20 text-emerald-100' : 'hover:bg-white/5'
                      }`}
                    >
                      <p className="truncate text-sm font-medium">{session.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatSessionDate(session.last_message_at || session.created_at)}
                      </p>
                    </button>

                    {!inGuestMode && (
                      <div data-session-menu className="absolute right-1 top-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleSessionMenu(session.id);
                          }}
                          disabled={sessionActionBusyId === session.id}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                            sessionMenuOpenId === session.id
                              ? 'bg-white/10 text-white opacity-100'
                              : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
                          }`}
                          aria-label="Conversation options"
                        >
                          <MoreHorizontal size={15} />
                        </button>

                        {sessionMenuOpenId === session.id && (
                          <div
                            data-session-menu
                            className="absolute right-0 top-8 z-30 w-36 rounded-lg border border-white/15 bg-slate-900/95 p-1 shadow-chat"
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handlePinSession(session);
                              }}
                              disabled={sessionActionBusyId === session.id}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Pin size={14} />
                              {session.is_pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleArchiveSession(session);
                              }}
                              disabled={sessionActionBusyId === session.id}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Archive size={14} />
                              Archive
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteSession(session);
                              }}
                              disabled={sessionActionBusyId === session.id}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {!filteredSessions.length && (
                  <p className="px-2 pt-2 text-sm text-slate-400">{chatSearch.trim() ? 'No chats found.' : 'No chats yet.'}</p>
                )}
              </div>
            )}

            <div className={isSidebarOpen ? 'px-2 pb-1' : 'px-2 pb-2'}>
              {isSidebarOpen ? (
                <button
                  type="button"
                  onClick={handleOpenReviewModal}
                  className="mobile-touch-target flex w-full items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10"
                >
                  <HelpCircle size={15} />
                  Give Review
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenReviewModal}
                  className="mobile-touch-target mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                  aria-label="Give Review"
                  title="Give Review"
                >
                  <HelpCircle size={16} />
                </button>
              )}
            </div>

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
                    ? 'mobile-touch-target flex w-full items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/10'
                    : 'mobile-touch-target mx-auto flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10'
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
                  <button type="button" onClick={handleOpenPersonalizationSettings} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><SlidersHorizontal size={15} />Personalization</button>
                  <button type="button" onClick={handleOpenSettings} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><Settings size={15} />Settings</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><HelpCircle size={15} />Help</button>
                  <button type="button" onClick={inGuestMode ? handleExitGuestMode : logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-200 hover:bg-red-500/20"><LogOut size={15} />{inGuestMode ? 'Sign in' : 'Log out'}</button>
                </div>
              )}
            </div>
          </div>
          {isDesktopLayout && isSidebarOpen && (
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
          className="chat-main relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden transition-[margin-left] duration-300"
          style={{ marginLeft: `${mainContentOffset}px` }}
        >
          <header className={`shrink-0 flex items-center justify-between border-b border-white/10 bg-slate-900/80 backdrop-blur ${isMobileLayout ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
            <div className="flex items-center gap-3">
              {isMobileLayout && (
                <button type="button" onClick={toggleSidebar} className="mobile-touch-target rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Toggle sidebar">
                  <Menu size={18} />
                </button>
              )}
              <div>
                <h1 className="text-sm font-semibold text-white sm:text-base">{activeModeConfig.headerTitle}</h1>
                <p className="text-xs text-slate-400">
                  {activeModeConfig.headerSubtitle}
                  {' • '}
                  {inGuestMode ? 'Guest mode' : user?.email}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex items-center gap-1 rounded-2xl border border-violet-300/25 bg-slate-900/85 p-1">
                <button
                  type="button"
                  onClick={() => handleQuickAppearanceChange('light')}
                  className={`mobile-touch-target inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                    appSettings.appearance === 'light'
                      ? 'bg-violet-500/35 text-violet-50'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Light theme"
                  aria-label="Set light theme"
                >
                  <Sun size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAppearanceChange('dark')}
                  className={`mobile-touch-target inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                    appSettings.appearance === 'dark'
                      ? 'bg-violet-500/35 text-violet-50'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Dark theme"
                  aria-label="Set dark theme"
                >
                  <Moon size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAppearanceChange('system')}
                  className={`mobile-touch-target inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                    appSettings.appearance === 'system'
                      ? 'bg-violet-500/35 text-violet-50'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                  title="System theme"
                  aria-label="Use system theme"
                >
                  <Laptop size={16} />
                </button>
              </div>

              <div className="inline-flex items-center gap-1 rounded-2xl border border-violet-300/25 bg-slate-900/85 p-1">
                <button
                  type="button"
                  onClick={() => handleQuickLanguageChange('en')}
                  className={`mobile-touch-target rounded-xl px-4 py-1.5 text-sm font-semibold transition ${
                    appSettings.language === 'en'
                      ? 'bg-violet-500/35 text-violet-50'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                  aria-label="Switch language to English"
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLanguageChange('ur')}
                  className={`mobile-touch-target rounded-xl px-4 py-1.5 text-sm font-semibold transition ${
                    appSettings.language === 'ur'
                      ? 'bg-violet-500/35 text-violet-50'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                  aria-label="Switch language to Urdu"
                >
                  اردو
                </button>
              </div>

              {inGuestMode && (
                <button type="button" onClick={handleExitGuestMode} className="mobile-touch-target inline-flex items-center gap-2 rounded-lg border border-cyan-300/35 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/10">
                  Sign in
                </button>
              )}
              <div ref={shareMenuRef} className="relative">
                <button type="button" onClick={() => setShareMenuOpen((prev) => !prev)} className="mobile-touch-target inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10">
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

          <section
            ref={chatScrollRef}
            className={`chat-scroll-area min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${isMobileLayout ? 'px-3 py-4 pb-36' : 'px-4 py-5 pb-32'}`}
          >
            <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-4">
              {loadingHistory && <div className="flex items-center gap-2 text-sm text-slate-300"><Loader2 size={15} className="animate-spin" />Loading conversation...</div>}
              {!sortedMessages.length && !loadingHistory && (
                <div className="space-y-3">
                  {renderModeInterface}
                  <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-center text-slate-300">
                    Start a conversation. Enter sends message and Shift+Enter inserts a new line.
                  </div>
                </div>
              )}

              {sortedMessages.map((message) => (
                <div key={message.id} className={`message-bubble max-w-3xl rounded-2xl px-4 py-3 break-words ${message.role === 'user' ? 'ml-auto bg-emerald-500/15 text-emerald-100' : 'mr-auto border border-white/10 bg-slate-800/80 text-slate-100'}`}>
                  {message.role === 'assistant' ? (
                    <div
                      className="message-rich text-sm leading-6"
                      dangerouslySetInnerHTML={{ __html: renderMessageHtml(message) }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-6">{normalizeMessageText(message)}</p>
                  )}
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
                <div className="message-bubble mr-auto max-w-3xl rounded-2xl border border-white/10 bg-slate-800/80 px-4 py-3 text-slate-100 break-words">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '14px', flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
                    }}>🩺</div>
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center', paddingTop: '2px' }}>
                      <span className="dr-amna-dot"></span>
                      <span className="dr-amna-dot"></span>
                      <span className="dr-amna-dot"></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={scrollBottomRef} />
            </div>
          </section>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
          <div className={`composer-shell pointer-events-auto bg-transparent ${isMobileLayout ? 'px-3 py-1.5' : 'px-4 py-1.5'}`}>
            <div className="mx-auto w-full max-w-2xl">
              {(chatError || shareError) && <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{chatError || shareError}</div>}
              <div className="rounded-2xl border border-white/15 bg-slate-900/80 p-2">
                <input
                  ref={uploadImageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadImageSelect}
                  className="hidden"
                />
                <input
                  ref={captureImageInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCaptureImageSelect}
                  className="hidden"
                />
                <textarea ref={textAreaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSendMessage(); } }} placeholder={activeModeConfig.placeholder} rows={1} className="max-h-28 min-h-[32px] w-full resize-none bg-transparent px-1 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
                {attachedImages.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {attachedImages.map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100"
                      >
                        <span className="max-w-[180px] truncate">{item.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachedImage(item.id)}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-emerald-100/80 hover:bg-emerald-500/20 hover:text-emerald-50"
                          aria-label={`Remove ${item.name}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-h-[22px] items-center gap-2 text-xs text-slate-300">
                    {dictationState === 'listening' && <span className="text-xs text-emerald-300/90">Listening...</span>}
                    {dictationState === 'processing' && <span className="text-xs text-amber-200/90">Processing speech...</span>}
                    {speakingMessageId && <span className="text-xs text-cyan-200/90">Speaking...</span>}
                  </div>
                  <div
                    ref={composerAttachmentMenuRef}
                    className={`relative flex items-center gap-2 ${isMobileLayout ? 'w-full justify-end' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => setComposerAttachmentMenuOpen((prev) => !prev)}
                      className="mobile-touch-target inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-slate-200 transition hover:bg-white/10 hover:text-white"
                      aria-label="Add image"
                      title="Add image"
                    >
                      <Plus size={18} />
                    </button>
                    <div
                      className={`absolute bottom-11 right-0 z-30 w-44 origin-bottom-right rounded-xl border border-white/15 bg-slate-900/95 p-1.5 shadow-chat transition-all duration-150 ${
                        composerAttachmentMenuOpen
                          ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
                          : 'pointer-events-none translate-y-1 scale-95 opacity-0'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={handleOpenUploadImagePicker}
                        className="mobile-touch-target flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/10"
                      >
                        <Upload size={15} />
                        Upload image
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenCaptureImagePicker}
                        className="mobile-touch-target flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/10"
                      >
                        <Camera size={15} />
                        Take picture
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={toggleDictation}
                      disabled={!dictationSupported}
                      className={`mobile-touch-target inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent transition ${
                        dictationState === 'listening'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      title="Dictate"
                      aria-label="Dictate"
                    >
                      {dictationState === 'processing' ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
                    </button>

                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={sending || !canSendMessage}
                      className="mobile-touch-target inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={16} />}
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <footer className={`pointer-events-none bg-transparent text-center text-xs text-slate-400 ${isMobileLayout ? 'px-3 py-1.5' : 'px-4 py-1.5'}`}>
            Not a substitute for professional medical advice. © 2026 Sohaib Shahid. All Rights Reserved.
          </footer>
          </div>
        </main>
      </div>
      {reviewModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={handleCloseReviewModal}
            aria-label="Close review modal"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900/95 p-4 sm:p-5 shadow-chat">
            <p className="text-xs uppercase tracking-wider text-slate-400">Feedback</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Send Your Review</h2>
            <form className="mt-4 space-y-3" onSubmit={handleReviewSubmit}>
              <div>
                <textarea
                  value={reviewText}
                  onChange={(event) => {
                    setReviewText(event.target.value);
                    if (reviewError) {
                      setReviewError('');
                    }
                    if (reviewSuccess) {
                      setReviewSuccess('');
                    }
                  }}
                  rows={4}
                  maxLength={2000}
                  placeholder="Write your feedback..."
                  className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                  disabled={reviewSending}
                />
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span>{reviewText.length}/2000</span>
                  <span>{reviewTrimmedLength < 10 ? 'Minimum 10 characters' : 'Looks good'}</span>
                </div>
              </div>

              {reviewInlineError && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {reviewInlineError}
                </p>
              )}

              {reviewSuccess && (
                <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  Thank you for your feedback!
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleCloseReviewModal}
                  disabled={reviewSending}
                  className="mobile-touch-target rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSending || reviewTrimmedLength < 10}
                  className="mobile-touch-target inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {reviewSending && <Loader2 size={15} className="animate-spin" />}
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {settingsOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
            onClick={handleCloseSettings}
            aria-label="Close settings"
          />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-white/15 bg-slate-900/95 p-5 shadow-chat">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Settings</p>
                <h2 className="text-lg font-semibold text-white">Preferences</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseSettings}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <div className="mb-4 inline-flex w-full max-w-lg items-center gap-1 rounded-xl border border-white/15 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setSettingsTab(SETTINGS_TAB_GENERAL)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  settingsTab === SETTINGS_TAB_GENERAL
                    ? 'bg-cyan-500/20 text-cyan-100'
                    : 'text-slate-300 hover:bg-white/10 hover:text-slate-100'
                }`}
              >
                General
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab(SETTINGS_TAB_PERSONALIZATION)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  settingsTab === SETTINGS_TAB_PERSONALIZATION
                    ? 'bg-cyan-500/20 text-cyan-100'
                    : 'text-slate-300 hover:bg-white/10 hover:text-slate-100'
                }`}
              >
                Personalization
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab(SETTINGS_TAB_MEDICAL)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  settingsTab === SETTINGS_TAB_MEDICAL
                    ? 'bg-cyan-500/20 text-cyan-100'
                    : 'text-slate-300 hover:bg-white/10 hover:text-slate-100'
                }`}
              >
                Medical Profile
              </button>
            </div>
            <div className="max-h-[78vh] overflow-y-auto pr-1">
              {settingsTab === SETTINGS_TAB_GENERAL && (
                <>
              {preferencesError && (
                <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {preferencesError}
                </p>
              )}
              {preferencesInfo && (
                <p className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  {preferencesInfo}
                </p>
              )}

              <form className="space-y-4" onSubmit={handlePreferencesSubmit}>
                <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-sm font-semibold text-white">Appearance</h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => handlePreferenceFieldChange('appearance', 'light')}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                        appSettings.appearance === 'light'
                          ? 'border-cyan-300/50 bg-cyan-500/15 text-cyan-100'
                          : 'border-white/15 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      Light
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreferenceFieldChange('appearance', 'dark')}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                        appSettings.appearance === 'dark'
                          ? 'border-cyan-300/50 bg-cyan-500/15 text-cyan-100'
                          : 'border-white/15 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      Dark
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreferenceFieldChange('appearance', 'system')}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                        appSettings.appearance === 'system'
                          ? 'border-cyan-300/50 bg-cyan-500/15 text-cyan-100'
                          : 'border-white/15 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      System
                    </button>
                  </div>
                </section>

                <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-sm font-semibold text-white">Language</h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => handlePreferenceFieldChange('language', 'en')}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                        appSettings.language === 'en'
                          ? 'border-cyan-300/50 bg-cyan-500/15 text-cyan-100'
                          : 'border-white/15 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreferenceFieldChange('language', 'ur')}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                        appSettings.language === 'ur'
                          ? 'border-cyan-300/50 bg-cyan-500/15 text-cyan-100'
                          : 'border-white/15 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      Urdu
                    </button>
                  </div>
                </section>

                <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-sm font-semibold text-white">Voice</h3>
                  <div className="mt-2 space-y-2 text-sm text-slate-200">
                    <p>Female (default)</p>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={appSettings.voice_auto_detect}
                        onChange={(event) =>
                          handlePreferenceFieldChange('voice_auto_detect', event.target.checked)
                        }
                        className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400 focus:ring-cyan-400/40"
                      />
                      Auto language detection
                    </label>
                  </div>
                </section>

                <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-sm font-semibold text-white">Account</h3>
                  <label className="mt-2 block text-sm text-slate-300" htmlFor="settings_display_name">
                    Change display name
                  </label>
                  <input
                    id="settings_display_name"
                    value={appSettings.display_name}
                    onChange={(event) => handlePreferenceFieldChange('display_name', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                    placeholder="Your name"
                    maxLength={200}
                  />
                </section>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={preferencesBusy || preferencesSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-950 hover:bg-cyan-400 disabled:opacity-60"
                  >
                    {(preferencesBusy || preferencesSaving) && <Loader2 size={15} className="animate-spin" />}
                    Save settings
                  </button>
                </div>
              </form>
                </>
              )}

              {settingsTab !== SETTINGS_TAB_GENERAL && <div className="my-5 border-t border-white/10" />}

              {settingsTab === SETTINGS_TAB_PERSONALIZATION && (
                <div className="space-y-4">
                  {personalizationError && (
                    <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      {personalizationError}
                    </p>
                  )}
                  {personalizationInfo && (
                    <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                      {personalizationInfo}
                    </p>
                  )}

                  <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">Response Style</h3>
                    <p className="mt-1 text-xs text-slate-400">Adjust tone without changing assistant capability.</p>
                    <select
                      value={effectivePersonalization.response_style}
                      onChange={(event) =>
                        handlePersonalizationFieldChange('response_style', event.target.value)
                      }
                      className="mt-3 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                      disabled={personalizationBusy || personalizationSaving}
                    >
                      {RESPONSE_STYLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </section>

                  <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">Custom Instructions</h3>
                    <label htmlFor="personalization_instructions" className="mt-1 block text-xs text-slate-400">
                      How should the assistant respond to you?
                    </label>
                    <textarea
                      id="personalization_instructions"
                      value={effectivePersonalization.custom_instructions}
                      onChange={(event) =>
                        handlePersonalizationFieldChange('custom_instructions', event.target.value)
                      }
                      rows={4}
                      maxLength={4000}
                      className="mt-2 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                      placeholder="Example: Explain in simple language and use step-by-step format."
                      disabled={personalizationBusy || personalizationSaving}
                    />
                  </section>

                  <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">About You</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="personalization_nickname" className="mb-1 block text-sm text-slate-300">
                          Nickname
                        </label>
                        <input
                          id="personalization_nickname"
                          value={effectivePersonalization.nickname}
                          onChange={(event) => handlePersonalizationFieldChange('nickname', event.target.value)}
                          className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                          placeholder="How should I call you?"
                          maxLength={120}
                          disabled={personalizationBusy || personalizationSaving}
                        />
                      </div>
                      <div>
                        <label htmlFor="personalization_occupation" className="mb-1 block text-sm text-slate-300">
                          Occupation
                        </label>
                        <input
                          id="personalization_occupation"
                          value={effectivePersonalization.occupation}
                          onChange={(event) => handlePersonalizationFieldChange('occupation', event.target.value)}
                          className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                          placeholder="Your profession"
                          maxLength={160}
                          disabled={personalizationBusy || personalizationSaving}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label htmlFor="personalization_about_user" className="mb-1 block text-sm text-slate-300">
                        About You
                      </label>
                      <textarea
                        id="personalization_about_user"
                        value={effectivePersonalization.about_user}
                        onChange={(event) => handlePersonalizationFieldChange('about_user', event.target.value)}
                        rows={3}
                        maxLength={2000}
                        className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                        placeholder="Interests and preferences."
                        disabled={personalizationBusy || personalizationSaving}
                      />
                    </div>
                  </section>

                  <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">Memory Controls</h3>
                    <div className="mt-3 space-y-3">
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-200">Allow assistant to remember my preferences</span>
                        <button
                          type="button"
                          onClick={() =>
                            handlePersonalizationFieldChange('allow_memory', !effectivePersonalization.allow_memory)
                          }
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                            effectivePersonalization.allow_memory ? 'bg-cyan-500' : 'bg-slate-700'
                          }`}
                          aria-pressed={effectivePersonalization.allow_memory}
                          disabled={personalizationBusy || personalizationSaving}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                              effectivePersonalization.allow_memory ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-200">Allow assistant to reference previous chats</span>
                        <button
                          type="button"
                          onClick={() =>
                            handlePersonalizationFieldChange(
                              'allow_chat_reference',
                              !effectivePersonalization.allow_chat_reference
                            )
                          }
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                            effectivePersonalization.allow_chat_reference ? 'bg-cyan-500' : 'bg-slate-700'
                          } ${!effectivePersonalization.allow_memory ? 'cursor-not-allowed opacity-50' : ''}`}
                          aria-pressed={effectivePersonalization.allow_chat_reference}
                          disabled={
                            personalizationBusy ||
                            personalizationSaving ||
                            !effectivePersonalization.allow_memory
                          }
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                              effectivePersonalization.allow_chat_reference ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </label>
                    </div>
                    {(personalizationBusy || personalizationSaving) && (
                      <p className="mt-3 inline-flex items-center gap-2 text-xs text-cyan-200">
                        <Loader2 size={14} className="animate-spin" />
                        Saving...
                      </p>
                    )}
                  </section>
                </div>
              )}

              {settingsTab === SETTINGS_TAB_MEDICAL && (
                <>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Medical Profile</p>
                <h3 className="mt-1 text-base font-semibold text-white">Health context</h3>
              </div>
              {profileError && (
                <p className="mb-3 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {profileError}
                </p>
              )}
              {profileInfo && (
                <p className="mb-3 mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  {profileInfo}
                </p>
              )}
              {token ? (
                <form className="mt-3 space-y-3" onSubmit={handleProfileSubmit}>
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
              ) : (
                <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                  Sign in to manage medical profile.
                </p>
              )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
