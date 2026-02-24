import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileText,
  Globe2,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Menu,
  Mic,
  MessageCircle,
  Microscope,
  MoreHorizontal,
  Pencil,
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
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import AuthCard from './components/AuthCard';
import DrAmnaCharacter from './components/DrAmnaCharacter';
import MedicalBackground from './components/MedicalBackground';
import ChatModeView from './components/modes/ChatModeView';
import DrugInfoModeView from './components/modes/DrugInfoModeView';
import ResearchModeView from './components/modes/ResearchModeView';
import WhoStatsModeView from './components/modes/WhoStatsModeView';
import SharedConversationPage from './components/SharedConversationPage';
import TypewriterText from './components/TypewriterText';
import {
  RESPONSE_STYLE_OPTIONS,
  normalizePersonalization,
  serializePersonalization,
  toPersonalizationApiPayload,
  usePersonalization,
} from './context/PersonalizationContext';
import { api } from './services/api';
import {
  requestGoogleIdToken,
} from './services/googleAuth';
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

// Detects real mobile/touch hardware regardless of viewport width or desktop site mode.
// Three-signal detection for maximum reliability across all Android (including Infinix/Tecno/etc)
// and iPhone/iPad devices:
//   1. UA check  — catches normal mobile browsers (not desktop site mode)
//   2. Touch points — phones always have maxTouchPoints > 1; desktops rarely do
//   3. Physical screen size via window.screen — unchanged even in desktop site mode
// All three are checked so no single signal failure causes wrong result.
const isRealMobileDevice = () => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  // Signal 1: user agent (works in normal mobile mode; stripped in desktop site mode)
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
  // Signal 2: touch capability — real phones always have maxTouchPoints > 1
  const hasTouch = navigator.maxTouchPoints > 1;
  // Signal 3: physical screen dimensions — small on phones, large on desktops
  // window.screen reports hardware pixels, NOT affected by desktop site mode
  const smallPhysicalScreen = Math.min(window.screen.width, window.screen.height) <= 900;
  // A real mobile device satisfies either (UA match) OR (touch + small screen)
  // This covers Infinix/generic Android in desktop site mode (UA stripped, but touch+screen remain)
  return mobileUA || (hasTouch && smallPhysicalScreen);
};

// Narrower sidebar width for real mobile devices using desktop site mode
const MOBILE_DESKTOP_SIDEBAR_WIDTH = 220;
const SILENCE_TIMEOUT_MS = 2000;
const MAX_IMAGE_ATTACHMENTS = 10;
const MAX_IMAGE_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_ATTACHMENT_CHARS = 12000;
const ATTACHMENT_PICKER_ACCEPT =
  'image/*,.txt,.md,.csv,.json,.xml,.html,.htm,.log,.rtf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
const AUTH_GENERIC_ERROR = 'Unable to authenticate right now. Please try again.';
const AUTH_LAST_EMAIL_KEY = 'pd_last_auth_email';
const GUEST_DEVICE_ID_KEY = 'pd_guest_device_id';
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
const APPEARANCE_CYCLE = ['dark', 'light', 'system'];
const SETTINGS_TAB_GENERAL = 'general';
const SETTINGS_TAB_PERSONALIZATION = 'personalization';
const SETTINGS_TAB_MEDICAL = 'medical';
const LOGIN_DESKTOP_POPUP_SESSION_KEY = 'pd_login_desktop_popup_dismissed';
const PULL_REFRESH_TRIGGER_PX = 150;
const MOBILE_DOUBLE_TAP_ZOOM_SCALE = 1.24;
const DOUBLE_TAP_GESTURE_MS = 320;
const DOUBLE_TAP_MOVE_TOLERANCE_PX = 24;
const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  'txt','md','csv','json','xml','html','htm','log','rtf','yaml','yml','ini','conf',
]);
const TEXT_ATTACHMENT_MIME_TYPES = new Set([
  'application/json','application/xml','application/xhtml+xml','application/rtf',
]);
const IMAGE_ATTACHMENT_EXTENSIONS = new Set([
  'png','jpg','jpeg','webp','gif','bmp','heic','heif',
]);
const CHAT_MODES = {
  chat: {
    id: 'chat',
    label: 'CHAT',
    headerTitle: 'Personal Doctor AI',
    headerSubtitle: 'Medical Chat',
    placeholder: 'Ask anything...',
    icon: MessageCircle,
    iconBoxClass: 'border-violet-300/40 bg-gradient-to-br from-violet-500/35 to-fuchsia-500/25 text-violet-50',
    optionClass: 'border-violet-300/30 bg-gradient-to-br from-violet-500/12 to-fuchsia-500/10 text-violet-100',
    optionActiveClass: 'border-violet-300/55 bg-violet-500/28 text-violet-50',
  },
  drug: {
    id: 'drug',
    label: 'DRUG INFO',
    headerTitle: 'Personal Doctor AI',
    headerSubtitle: 'Drug Information',
    placeholder: 'Enter drug name...',
    icon: Pill,
    iconBoxClass: 'border-rose-300/40 bg-gradient-to-br from-pink-500/35 to-orange-500/30 text-rose-50',
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
    iconBoxClass: 'border-emerald-300/40 bg-gradient-to-br from-blue-500/28 to-emerald-500/26 text-emerald-50',
    optionClass: 'border-emerald-300/30 bg-gradient-to-br from-blue-500/12 to-emerald-500/10 text-emerald-100',
    optionActiveClass: 'border-emerald-300/55 bg-emerald-500/24 text-emerald-50',
  },
};
const CHAT_MODE_ORDER = ['chat', 'drug', 'research', 'who'];
const DEFAULT_CHAT_MODE = 'chat';
const MODE_TEXT_BY_LANGUAGE = {
  en: {
    chat: { headerTitle: 'Personal Doctor AI', headerSubtitle: 'Medical Chat', placeholder: 'Ask anything...' },
    drug: { headerTitle: 'Personal Doctor AI', headerSubtitle: 'Drug Information', placeholder: 'Enter drug name...' },
    research: { headerTitle: 'Personal Doctor AI', headerSubtitle: 'Clinical Research', placeholder: 'Search medical research...' },
    who: { headerTitle: 'Personal Doctor AI', headerSubtitle: 'WHO Statistics', placeholder: 'Search global health statistics...' },
  },
  ur: {
    chat: { headerTitle: 'Personal Doctor AI', headerSubtitle: 'طبی چیٹ', placeholder: 'اپنا سوال لکھیں...' },
    drug: { headerTitle: 'Personal Doctor AI', headerSubtitle: 'ادویات کی معلومات', placeholder: 'دوائی کا نام لکھیں...' },
    research: { headerTitle: 'Personal Doctor AI', headerSubtitle: 'طبی تحقیق', placeholder: 'طبی تحقیق تلاش کریں...' },
    who: { headerTitle: 'Personal Doctor AI', headerSubtitle: 'عالمی صحت کے اعدادوشمار', placeholder: 'عالمی صحت کے اعدادوشمار تلاش کریں...' },
  },
};

const CHAT_EMPTY_SUGGESTIONS_BY_LANGUAGE = {
  en: ['What are early signs of diabetes?','How to lower blood pressure?','What is ibuprofen used for?'],
  ur: ['ذیابیطس کی ابتدائی علامات کیا ہیں؟','بلڈ پریشر کم کرنے کے طریقے کیا ہیں؟','آئیبوپروفین کس لیے استعمال ہوتی ہے؟'],
};

function createDefaultAppSettings() {
  return { appearance: 'system', language: 'en', voice_gender: 'female', voice_auto_detect: true, display_name: '' };
}

function normalizeAppSettings(source) {
  const next = createDefaultAppSettings();
  if (!source || typeof source !== 'object') return next;
  const appearance = String(source.appearance || '').toLowerCase();
  next.appearance = appearance === 'light' || appearance === 'dark' || appearance === 'system' ? appearance : 'system';
  next.language = source.language === 'ur' ? 'ur' : 'en';
  next.voice_gender = 'female';
  next.voice_auto_detect = source.voice_auto_detect !== false;
  next.display_name = String(source.display_name || '').trim();
  return next;
}

function readStoredAppSettings() {
  if (typeof window === 'undefined') return createDefaultAppSettings();
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return createDefaultAppSettings();
    return normalizeAppSettings(JSON.parse(raw));
  } catch { return createDefaultAppSettings(); }
}

function resolveThemeMode(appearance) {
  if (appearance === 'light' || appearance === 'dark') return appearance;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyAppearanceTheme(appearance) {
  if (typeof document === 'undefined') return;
  const normalizedAppearance = appearance === 'light' || appearance === 'dark' ? appearance : 'system';
  const mode = resolveThemeMode(appearance);
  const root = document.documentElement;
  root.classList.remove(THEME_CLASS_SYSTEM, THEME_CLASS_LIGHT, THEME_CLASS_DARK, THEME_MODE_CLASS_LIGHT, THEME_MODE_CLASS_DARK);
  root.classList.add(`theme-${normalizedAppearance}`);
  root.classList.add(mode === 'dark' ? THEME_CLASS_DARK : THEME_CLASS_LIGHT);
  root.classList.add(mode === 'dark' ? THEME_MODE_CLASS_DARK : THEME_MODE_CLASS_LIGHT);
  root.dataset.appearance = normalizedAppearance;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  root.style.backgroundColor = mode === 'dark' ? '#0f172a' : '#edf1f8';
}

function getLocalDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultDailyImageUploadUsage(now = new Date()) {
  return { date: getLocalDateKey(now), guest: 0, user: 0 };
}

function normalizeDailyImageUploadUsage(source, now = new Date()) {
  const fallback = createDefaultDailyImageUploadUsage(now);
  if (!source || typeof source !== 'object') return fallback;
  const date = String(source.date || '');
  if (date !== fallback.date) return fallback;
  const toCount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
  };
  return { date: fallback.date, guest: toCount(source.guest), user: toCount(source.user) };
}

function readDailyImageUploadUsage() {
  if (typeof window === 'undefined') return createDefaultDailyImageUploadUsage();
  try {
    const raw = window.localStorage.getItem(DAILY_IMAGE_UPLOAD_USAGE_KEY);
    if (!raw) return createDefaultDailyImageUploadUsage();
    return normalizeDailyImageUploadUsage(JSON.parse(raw));
  } catch { return createDefaultDailyImageUploadUsage(); }
}

function writeDailyImageUploadUsage(usage) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DAILY_IMAGE_UPLOAD_USAGE_KEY, JSON.stringify(usage)); } catch {}
}

function getFileExtension(name) {
  const text = String(name || '');
  const dot = text.lastIndexOf('.');
  if (dot < 0 || dot === text.length - 1) return '';
  return text.slice(dot + 1).toLowerCase();
}

function isImageAttachment(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return IMAGE_ATTACHMENT_EXTENSIONS.has(getFileExtension(file?.name || ''));
}

function isTextAttachment(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.startsWith('text/')) return true;
  if (TEXT_ATTACHMENT_MIME_TYPES.has(mime)) return true;
  return TEXT_ATTACHMENT_EXTENSIONS.has(getFileExtension(file?.name || ''));
}

function normalizeAttachmentText(raw) {
  return String(raw || '').replace(/\u0000/g, '').trim().slice(0, MAX_TEXT_ATTACHMENT_CHARS);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
      reader.readAsDataURL(file);
    } catch (error) { reject(error); }
  });
}

async function extractAttachmentText(file) {
  if (!isTextAttachment(file)) return '';
  try {
    const text = await file.text();
    return normalizeAttachmentText(text);
  } catch { return ''; }
}

function normalizeChatMode(value) {
  const text = String(value || '').toLowerCase();
  return CHAT_MODE_ORDER.includes(text) ? text : DEFAULT_CHAT_MODE;
}

function clampSidebarWidth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return SIDEBAR_OPEN_WIDTH;
  return Math.max(SIDEBAR_RESIZE_MIN, Math.min(SIDEBAR_RESIZE_MAX, Math.round(numeric)));
}

function createEmptyMedicalProfile() {
  return { age: '', gender: '', medical_history: '', allergies: '', medications: '', chronic_conditions: '' };
}

function isProfileNotFoundError(error) {
  return (error?.message || '').toLowerCase().includes(PROFILE_NOT_FOUND_MESSAGE.toLowerCase());
}

function isPersonalizationNotFoundError(error) {
  return (error?.message || '').toLowerCase().includes(PERSONALIZATION_NOT_FOUND_MESSAGE.toLowerCase());
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
  const clean = (value) => { const text = String(value || '').trim(); return text || null; };
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
  if (!rawMessage || rawMessage === '[object Object]') return AUTH_GENERIC_ERROR;
  const statusMatch = rawMessage.match(/^Request failed \((\d{3})\)\.?$/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status >= 500) return 'Server error. Please try again in a moment.';
    return AUTH_GENERIC_ERROR;
  }
  return rawMessage;
}

function readStoredAuthEmail() {
  if (typeof window === 'undefined') return '';
  try {
    const value = String(window.localStorage.getItem(AUTH_LAST_EMAIL_KEY) || '').trim().toLowerCase();
    return EMAIL_PATTERN.test(value) ? value : '';
  } catch { return ''; }
}

function saveStoredAuthEmail(email) {
  if (typeof window === 'undefined') return;
  try {
    const normalized = String(email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) return;
    window.localStorage.setItem(AUTH_LAST_EMAIL_KEY, normalized);
  } catch {}
}

function _createGuestDeviceId() {
  const prefix = 'guest-';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID().replace(/-/g, '')}`;
  }
  const randomPart = Math.random().toString(36).slice(2, 14);
  return `${prefix}${Date.now().toString(36)}${randomPart}`;
}

function readOrCreateGuestDeviceId() {
  if (typeof window === 'undefined') return '';
  const isValid = (value) => /^[A-Za-z0-9_-]{8,128}$/.test(String(value || '').trim());
  try {
    const existing = String(window.localStorage.getItem(GUEST_DEVICE_ID_KEY) || '').trim();
    if (isValid(existing)) return existing;
    const created = _createGuestDeviceId();
    if (isValid(created)) {
      window.localStorage.setItem(GUEST_DEVICE_ID_KEY, created);
      return created;
    }
  } catch {}
  const fallback = _createGuestDeviceId();
  return isValid(fallback) ? fallback : '';
}

function createPendingVerificationLogin() {
  return { email: '', password: '', fullName: '', loginToken: '', maskedEmail: '' };
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
    .replace(/[•▪▶►›]/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, ' ')
    .replace(/[>*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROMAN_URDU_SPEECH_HINTS = new Set([
  'aap', 'ap', 'main', 'mein', 'mai', 'mujhe', 'mujhy', 'mujh',
  'kya', 'kia', 'kyun', 'kyu', 'kaise', 'kese', 'hain', 'hai', 'ho', 'hun', 'hoon',
  'mera', 'meri', 'mere', 'aapka', 'apka', 'aapki', 'apki', 'aapke', 'apke',
  'dard', 'bukhar', 'khansi', 'saans', 'tabiyat', 'thakan', 'kamzori',
  'dawai', 'ilaaj', 'masla', 'pet', 'pait', 'sar', 'sir', 'behtar', 'theek', 'thik',
  'assalam', 'salam', 'salaam', 'alaikum', 'walikum', 'walaikum', 'asalam',
  'lekin', 'aur', 'magar', 'haan', 'han', 'nahi', 'nahin', 'naheen',
]);

function isLikelyRomanUrduForSpeech(text) {
  const value = String(text || '').toLowerCase();
  if (!value || containsUrdu(value)) return false;
  const tokens = value.match(/[a-z']+/g) || [];
  if (!tokens.length) return false;
  const hits = tokens.reduce((count, token) => (ROMAN_URDU_SPEECH_HINTS.has(token) ? count + 1 : count), 0);
  return hits >= 2;
}

function resolveSpeechVariant(text, fallbackLanguage = 'en') {
  if (containsUrdu(text)) return 'ur';
  if (isLikelyRomanUrduForSpeech(text)) return 'roman_urdu';
  if (String(fallbackLanguage || '').toLowerCase() === 'ur') return 'ur';
  return 'en';
}

function summarizeMessagesForMemory(messages, limit = 8) {
  const pool = Array.isArray(messages) ? messages : [];
  const lines = pool
    .slice(-Math.max(limit * 2, limit))
    .map((entry) => {
      const role = entry?.role === 'assistant' ? 'assistant' : 'user';
      const text = stripMarkdownForSpeech(normalizeMessageText(entry)).slice(0, 220);
      if (!text) return '';
      return `${role}: ${text}`;
    })
    .filter(Boolean);
  return lines.slice(-limit);
}

function buildSpokenExplanation(message) {
  return stripMarkdownForSpeech(normalizeMessageText(message));
}

function normalizeRomanUrduSpeechTextLatin(text) {
  let normalized = String(text || '');
  normalized = normalized
    .replace(/\b(?:as+|a)?s?ala?m(?:\s+o|\s+u)?\s+a?la?ikum\b/gi, 'Assa laam o Alaikum')
    .replace(/\b(?:wa|w)?a?la?ikum\s+(?:as+)?s?ala?m\b/gi, 'Wa alaikum Assalaam')
    .replace(/\bin\s*sha\s*allah\b/gi, 'In sha Allah')
    .replace(/\bkhuda\s+hafiz\b/gi, 'Khuda Hafiz')
    .replace(/[\/|]/g, ' ')
    .replace(/[_~*`]/g, ' ')
    .replace(/\s{2,}/g, ' ');
  return normalized.replace(/\s+/g, ' ').trim();
}

function selectEnglishVoiceForRomanUrdu(voices) {
  const pool = Array.isArray(voices) ? voices : [];
  if (!pool.length) return null;
  const femaleHints = ['female', 'woman', 'zira', 'aria', 'sara', 'emma', 'heera', 'nida', 'neural'];
  const englishVoices = pool.filter((voice) => String(voice?.lang || '').toLowerCase().startsWith('en'));
  if (!englishVoices.length) return null;
  const femaleEnglish = englishVoices.find((voice) =>
    femaleHints.some((hint) => String(voice?.name || '').toLowerCase().includes(hint))
  );
  return femaleEnglish || englishVoices[0] || null;
}

function isUrduFamilyLanguageTag(tag) {
  const lang = String(tag || '').trim().toLowerCase();
  if (!lang) return false;
  return (
    lang.startsWith('ur') ||
    lang.startsWith('hi') ||
    lang.startsWith('pa') ||
    lang.startsWith('sd')
  );
}

function normalizeSpeechNamePronunciation(text, speechVariant) {
  let value = String(text || '');
  const variant = String(speechVariant || '').toLowerCase();
  if (!value) return '';
  if (!['en', 'roman_urdu'].includes(variant)) return value;
  const replacement = 'Doctor Aamna';
  value = value.replace(/\b(?:dr\.?|doctor)\s*\.?\s*a?amna\b/gi, replacement);
  if (variant === 'roman_urdu') {
    value = normalizeRomanUrduSpeechTextLatin(value);
  }
  return value;
}

export default function App() {
  const { personalization, replacePersonalization, updatePersonalizationField } = usePersonalization();

  const shareRouteId = useMemo(() => {
    if (typeof window === 'undefined') return '';
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
  const [authLastEmail, setAuthLastEmail] = useState(readStoredAuthEmail);
  const [showLoginDesktopPopup, setShowLoginDesktopPopup] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [pendingVerificationLogin, setPendingVerificationLogin] = useState(createPendingVerificationLogin);

  const [chatLanguage, setChatLanguage] = useState(() => readStoredAppSettings().language);
  const [activeMode, setActiveMode] = useState(DEFAULT_CHAT_MODE);

  // ── Mobile: always start collapsed ──────────────────────────────────────
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches : false
  );
  const [isTabletLayout, setIsTabletLayout] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(min-width: ${MOBILE_MAX_WIDTH + 1}px) and (max-width: ${TABLET_MAX_WIDTH}px)`).matches
      : false
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    // Always collapse on real mobile viewports
    if (window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches) return false;
    // Also collapse when a real mobile device requests desktop site (wide viewport but mobile hardware)
    if (isRealMobileDevice()) return false;
    return true;
  });
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
  const [sessionSelectionMode, setSessionSelectionMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [mobileDoubleTapZoomed, setMobileDoubleTapZoomed] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [newChatInterfaceVersion, setNewChatInterfaceVersion] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);

  const [draft, setDraft] = useState('');
  const [draftsByMode, setDraftsByMode] = useState(() => ({ chat: '', drug: '', research: '', who: '' }));
  const [isComposerFocusedMobile, setIsComposerFocusedMobile] = useState(false);
  const [mobileKeyboardOffset, setMobileKeyboardOffset] = useState(0);
  const [attachedImages, setAttachedImages] = useState([]);
  const [composerAttachmentMenuOpen, setComposerAttachmentMenuOpen] = useState(false);
  const [cameraCaptureOpen, setCameraCaptureOpen] = useState(false);
  const [cameraCaptureBusy, setCameraCaptureBusy] = useState(false);
  const [cameraCaptureError, setCameraCaptureError] = useState('');
  const [cameraFacingMode, setCameraFacingMode] = useState('environment');
  const [dictationSupported, setDictationSupported] = useState(false);
  const [dictationState, setDictationState] = useState('idle');
  const [voices, setVoices] = useState([]);
  const [speakingMessageId, setSpeakingMessageId] = useState('');
  const [autoVoice, setAutoVoice] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
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
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const reviewCloseTimerRef = useRef(null);
  const sidebarResizeStartXRef = useRef(0);
  const sidebarResizeStartWidthRef = useRef(SIDEBAR_OPEN_WIDTH);
  const personalizationReadyRef = useRef(false);
  const personalizationLastSyncedRef = useRef('');
  const sendSequenceRef = useRef(0);
  const conversationResetRef = useRef(0);

  const authenticated = Boolean(token);
  const inGuestMode = guestMode && !authenticated;
  const guestDeviceId = useMemo(() => readOrCreateGuestDeviceId(), []);
  const isRealMobileUser = isRealMobileDevice();
  const isDesktopLayout = !isMobileLayout && !isTabletLayout;
  const uiLanguage = appSettings.language === 'ur' ? 'ur' : 'en';
  const isUrduUI = uiLanguage === 'ur';

  const ui = useMemo(
    () =>
      isUrduUI
        ? {
            feedbackMinChars: 'فیڈبیک کم از کم 10 حروف پر مشتمل ہونا چاہیے۔',
            feedbackThanks: 'آپ کے فیڈبیک کا شکریہ!',
            feedbackSendError: 'اس وقت فیڈبیک نہیں بھیجا جا سکا۔ دوبارہ کوشش کریں۔',
            searchConversations: 'گفتگو تلاش کریں...',
            noChatsFound: 'کوئی چیٹ نہیں ملی۔',
            noChatsYet: 'ابھی تک کوئی چیٹ نہیں ہے۔',
            guestUser: 'مہمان صارف',
            notSignedIn: 'سائن اِن نہیں',
            guestModeNotice: 'آپ گیسٹ موڈ استعمال کر رہے ہیں۔ چیٹس محفوظ نہیں ہوں گی۔',
            signedIn: 'سائن اِن',
            loadingConversation: 'گفتگو لوڈ ہو رہی ہے...',
            heroTitle: 'آج میں آپ کی کیسے مدد کر سکتی ہوں؟',
            heroDescription: 'علامات، ادویات، بیماریوں اور صحت سے متعلق سوالات کے لیے واضح اور مستند طبی رہنمائی حاصل کریں۔',
            startConversationHint: 'گفتگو شروع کریں۔ Enter سے پیغام بھیجیں اور Shift+Enter سے نئی سطر بنائیں۔',
            youLabel: 'آپ',
            assistantLabel: 'اسسٹنٹ',
            failedToSend: 'پیغام نہیں بھیجا جا سکا۔ براہ کرم دوبارہ کوشش کریں۔',
            listening: 'سن رہا ہے...',
            processingSpeech: 'آواز کو پراسیس کیا جا رہا ہے...',
            speaking: 'پڑھ رہا ہے...',
            footerDisclaimer: 'یہ پیشہ ورانہ طبی مشورے کا متبادل نہیں ہے۔ © 2026 Sohaib Shahid. All Rights Reserved.',
            helpLabel: 'مدد',
            helpTitle: 'یہ چیٹ بوٹ کیسے کام کرتا ہے',
            helpHowItWorks: 'کام کرنے کا طریقہ',
            helpHowItWorksBody: 'آپ کا پیغام موجودہ سیشن کی چیٹ ہسٹری کے ساتھ میڈیکل اسسٹنٹ کو بھیجا جاتا ہے، جس سے پہلے بتائی گئی علامات یاد رہتی ہیں۔',
            helpContext1: 'فعال سیشن میں گفتگو کا تسلسل برقرار رکھتا ہے۔',
            helpContext2: 'آپ کی زبان کے انداز میں جواب دیتا ہے (انگریزی، اردو اسکرپٹ، یا رومن اردو)۔',
            helpContext3: 'خطرناک علامات پر فوری توجہ کی ہدایت دیتا ہے۔',
            helpBestWayTitle: 'بہتر سوال کیسے پوچھیں',
            helpBest1: 'اپنی بنیادی علامت اور آغاز کا وقت لکھیں۔',
            helpBest2: 'شدت، محرکات، اور بہتر/بدتر ہونے کی وجوہات بتائیں۔',
            helpBest3: 'الرجی، دائمی بیماری اور موجودہ ادویات کا ذکر کریں۔',
            helpBest4: 'اسی چیٹ میں فالو اَپ سوال کریں تاکہ سیاق برقرار رہے۔',
            helpFeatureTitle: 'فیچر گائیڈ',
            helpFeatureChat: 'Chat: علامات اور اگلے اقدامات کے لیے رہنمائی۔',
            helpFeatureDrug: 'Drug Info: ادویات کے استعمال، اثرات اور احتیاطیں۔',
            helpFeatureResearch: 'Research: طبی تحقیق کا آسان خلاصہ۔',
            helpFeatureWho: 'WHO Stats: عالمی صحت کے اعدادوشمار اور رجحانات۔',
            helpFeatureVoice: 'Voice: اسسٹنٹ کے جواب کو آواز میں سنیں۔',
            helpFeatureEditCopy: 'Edit/Copy: پیغامات کو آسانی سے ایڈٹ اور کاپی کریں۔',
            helpFeatureGuest: 'Guest mode: باہر جانے پر چیٹس محفوظ نہیں رہتیں۔',
            feedbackHeading: 'فیڈبیک',
            feedbackTitle: 'اپنا فیڈبیک بھیجیں',
            feedbackPlaceholder: 'اپنا فیڈبیک لکھیں...',
            feedbackMinHint: 'کم از کم 10 حروف',
            feedbackLooksGood: 'درست ہے',
            feedbackRatingLabel: 'ریٹنگ',
            feedbackRatingOptional: 'اختیاری',
            feedbackRatingClear: 'ریٹنگ ہٹائیں',
          }
        : {
            feedbackMinChars: 'Feedback must be at least 10 characters.',
            feedbackThanks: 'Thank you for your feedback!',
            feedbackSendError: 'Unable to send feedback right now. Please try again.',
            searchConversations: 'Search conversations...',
            noChatsFound: 'No chats found.',
            noChatsYet: 'No chats yet.',
            guestUser: 'Guest User',
            notSignedIn: 'Not signed in',
            guestModeNotice: 'You are using Guest Mode. Chats will not be saved.',
            signedIn: 'Signed in',
            loadingConversation: 'Loading conversation...',
            heroTitle: 'How can I help you today?',
            heroDescription: 'Get clear, evidence-based medical information. Ask about symptoms, medications, conditions, or anything health-related.',
            startConversationHint: 'Start a conversation. Enter sends message and Shift+Enter inserts a new line.',
            youLabel: 'You',
            assistantLabel: 'Assistant',
            failedToSend: 'Failed to send. Please retry.',
            listening: 'Listening...',
            processingSpeech: 'Processing speech...',
            speaking: 'Speaking...',
            footerDisclaimer: 'Not a substitute for professional medical advice. © 2026 Sohaib Shahid. All Rights Reserved.',
            helpLabel: 'Help',
            helpTitle: 'How this chatbot works',
            helpHowItWorks: 'How it works',
            helpHowItWorksBody: 'Your message is sent to the medical assistant with your current chat history in the same session. This helps it remember previous symptoms and continue the same context.',
            helpContext1: 'Keeps conversation context inside the active session.',
            helpContext2: 'Replies in your language style (English, Urdu script, or Roman Urdu).',
            helpContext3: 'Highlights urgent situations when red-flag symptoms are detected.',
            helpBestWayTitle: 'Best way to ask',
            helpBest1: 'Start with your main symptom and since when it started.',
            helpBest2: 'Mention severity, triggers, and what makes it better or worse.',
            helpBest3: 'Add important history: allergies, chronic illness, and current medicines.',
            helpBest4: 'Ask follow-up questions in the same chat to keep context intact.',
            helpFeatureTitle: 'Feature guide',
            helpFeatureChat: 'Chat: general symptom guidance and next-step triage.',
            helpFeatureDrug: 'Drug Info: medicine uses, side effects, and precautions.',
            helpFeatureResearch: 'Research: simplified medical evidence summaries.',
            helpFeatureWho: 'WHO Stats: public-health indicators and trend insights.',
            helpFeatureVoice: 'Voice: tap speaker icon to read assistant replies aloud.',
            helpFeatureEditCopy: 'Edit/Copy: edit sent prompts and copy any message quickly.',
            helpFeatureGuest: 'Guest mode: chats are not saved after you leave.',
            feedbackHeading: 'Feedback',
            feedbackTitle: 'Send Your Feedback',
            feedbackPlaceholder: 'Write your feedback...',
            feedbackMinHint: 'Minimum 10 characters',
            feedbackLooksGood: 'Looks good',
            feedbackRatingLabel: 'Rating',
            feedbackRatingOptional: 'Optional',
            feedbackRatingClear: 'Clear rating',
          },
    [isUrduUI]
  );

  const activeModeKey = normalizeChatMode(activeMode);
  const activeModeBaseConfig = CHAT_MODES[activeModeKey] || CHAT_MODES[DEFAULT_CHAT_MODE];
  const localizedModeText = MODE_TEXT_BY_LANGUAGE[uiLanguage]?.[activeModeKey] || MODE_TEXT_BY_LANGUAGE.en[activeModeKey];
  const activeModeConfig = {
    ...activeModeBaseConfig,
    headerTitle: localizedModeText?.headerTitle || activeModeBaseConfig.headerTitle,
    headerSubtitle: localizedModeText?.headerSubtitle || activeModeBaseConfig.headerSubtitle,
    placeholder: localizedModeText?.placeholder || activeModeBaseConfig.placeholder,
  };
  const modeOptions = useMemo(() => CHAT_MODE_ORDER.map((mode) => CHAT_MODES[mode]).filter(Boolean), []);
  const chatEmptySuggestions = CHAT_EMPTY_SUGGESTIONS_BY_LANGUAGE[uiLanguage] || CHAT_EMPTY_SUGGESTIONS_BY_LANGUAGE.en;
  const reviewTrimmedLength = reviewText.trim().length;
  const reviewInlineError = reviewError || (reviewText.length > 0 && reviewTrimmedLength < 10 ? ui.feedbackMinChars : '');
  const canSendMessage = Boolean(draft.trim()) || attachedImages.length > 0;
  const effectivePersonalization = useMemo(() => normalizePersonalization(personalization), [personalization]);
  const serializedPersonalization = useMemo(() => serializePersonalization(effectivePersonalization), [effectivePersonalization]);
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );
  const updateScrollToLatestVisibility = useCallback(() => {
    const container = chatScrollRef.current;
    if (!container) { setShowScrollToLatest(false); return; }
    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
    setShowScrollToLatest(distanceFromBottom > 140);
  }, []);
  const handleChatScroll = useCallback(() => { updateScrollToLatestVisibility(); }, [updateScrollToLatestVisibility]);
  const scrollChatToBottom = useCallback((behavior = 'smooth') => {
    const container = chatScrollRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
      setShowScrollToLatest(false);
      return;
    }
    scrollBottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    setShowScrollToLatest(false);
  }, []);

  const filteredSessions = useMemo(() => {
    const toTimestamp = (value) => { const parsed = new Date(value || '').getTime(); return Number.isFinite(parsed) ? parsed : 0; };
    const query = chatSearch.trim().toLowerCase();
    const visibleSessions = sessions
      .filter((session) => !session?.is_archived)
      .sort((left, right) => {
        const pinDiff = Number(Boolean(right?.is_pinned)) - Number(Boolean(left?.is_pinned));
        if (pinDiff !== 0) return pinDiff;
        const leftPinned = toTimestamp(left?.pinned_at || left?.last_message_at || left?.created_at);
        const rightPinned = toTimestamp(right?.pinned_at || right?.last_message_at || right?.created_at);
        return rightPinned - leftPinned;
      });
    if (!query) return visibleSessions;
    return visibleSessions.filter((session) => (session.title || '').toLowerCase().includes(query));
  }, [chatSearch, sessions]);

  useEffect(() => {
    setSelectedSessionIds((prev) => prev.filter((sessionId) => sessions.some((entry) => entry.id === sessionId)));
  }, [sessions]);

  useEffect(() => {
    if (!inGuestMode) return;
    setSessionSelectionMode(false);
    setSelectedSessionIds([]);
  }, [inGuestMode]);

  useEffect(() => { applyAppearanceTheme(appSettings.appearance); }, [appSettings.appearance]);
  useEffect(() => { if (typeof window !== 'undefined') window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings)); }, [appSettings]);
  useEffect(() => { if (chatLanguage !== appSettings.language) setChatLanguage(appSettings.language); }, [appSettings.language, chatLanguage]);

  useEffect(() => {
    if (appSettings.appearance !== 'system' || typeof window === 'undefined') return undefined;
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
    setDraftsByMode((prev) => { if (prev[activeMode] === draft) return prev; return { ...prev, [activeMode]: draft }; });
  }, [activeMode, draft]);

  useEffect(() => () => { if (reviewCloseTimerRef.current) { window.clearTimeout(reviewCloseTimerRef.current); reviewCloseTimerRef.current = null; } }, []);

  const clearSilenceTimer = useCallback(() => { if (silenceTimerRef.current) { window.clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; } }, []);
  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      const synthesis = window.speechSynthesis;
      try { synthesis.cancel(); } catch {}
      if (synthesis.paused) {
        try { synthesis.resume(); } catch {}
      }
      // Some mobile engines require a second cancel pass to clear pending speech immediately.
      try { synthesis.cancel(); } catch {}
    }
    utteranceRef.current = null;
    setSpeakingMessageId('');
  }, []);
  const stopDictation = useCallback((manual = true) => {
    clearSilenceTimer();
    const recognition = recognitionRef.current;
    if (!recognition) { setDictationState('idle'); return; }
    try { recognition.stop(); } catch {}
    recognitionRef.current = null;
    setDictationState(manual ? 'idle' : 'processing');
    if (!manual) window.setTimeout(() => setDictationState('idle'), 350);
  }, [clearSilenceTimer]);

  const stopCameraCaptureStream = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (stream) { stream.getTracks().forEach((track) => track.stop()); cameraStreamRef.current = null; }
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  }, []);

  const attachCameraStreamToVideo = useCallback((stream) => {
    window.requestAnimationFrame(() => {
      const videoElement = cameraVideoRef.current;
      if (!videoElement) return;
      videoElement.srcObject = stream;
      const maybePlay = videoElement.play?.();
      if (maybePlay && typeof maybePlay.catch === 'function') maybePlay.catch(() => {});
    });
  }, []);

  const createCameraCaptureStream = useCallback(async (preferredFacingMode = 'environment') => {
    const attempted = new Set();
    const modesToTry = [preferredFacingMode, preferredFacingMode === 'environment' ? 'user' : 'environment', null];
    let lastError = null;
    for (const mode of modesToTry) {
      const key = mode || 'any';
      if (attempted.has(key)) continue;
      attempted.add(key);
      try {
        const constraints = mode
          ? { video: { facingMode: { ideal: mode } }, audio: false }
          : { video: true, audio: false };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        return { stream, facingMode: mode || preferredFacingMode };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('camera-open-failed');
  }, []);

  const closeCameraCapture = useCallback(() => {
    setCameraCaptureOpen(false); setCameraCaptureBusy(false); setCameraCaptureError('');
    stopCameraCaptureStream();
  }, [stopCameraCaptureStream]);

  const openCameraCapture = useCallback(async () => {
    setComposerAttachmentMenuOpen(false);
    setCameraCaptureError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      if (captureImageInputRef.current) captureImageInputRef.current.click();
      return;
    }
    setCameraCaptureBusy(true);
    try {
      stopCameraCaptureStream();
      const { stream, facingMode } = await createCameraCaptureStream(cameraFacingMode);
      cameraStreamRef.current = stream;
      setCameraFacingMode(facingMode);
      setCameraCaptureOpen(true);
      attachCameraStreamToVideo(stream);
    } catch {
      if (captureImageInputRef.current) captureImageInputRef.current.click();
      else setChatError('Unable to access camera. Check camera permissions and try again.');
    } finally {
      setCameraCaptureBusy(false);
    }
  }, [attachCameraStreamToVideo, cameraFacingMode, createCameraCaptureStream, stopCameraCaptureStream]);

  const handleSwitchCamera = useCallback(async () => {
    if (cameraCaptureBusy || !navigator.mediaDevices?.getUserMedia) return;
    const nextFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraCaptureBusy(true);
    setCameraCaptureError('');
    try {
      stopCameraCaptureStream();
      const { stream, facingMode } = await createCameraCaptureStream(nextFacingMode);
      cameraStreamRef.current = stream;
      setCameraFacingMode(facingMode);
      attachCameraStreamToVideo(stream);
    } catch {
      setCameraCaptureError('Unable to switch camera. Check camera permissions and try again.');
    } finally {
      setCameraCaptureBusy(false);
    }
  }, [attachCameraStreamToVideo, cameraCaptureBusy, cameraFacingMode, createCameraCaptureStream, stopCameraCaptureStream]);

  useEffect(() => () => { stopCameraCaptureStream(); }, [stopCameraCaptureStream]);

  const clearLocalSession = useCallback(() => {
    if (reviewCloseTimerRef.current) { window.clearTimeout(reviewCloseTimerRef.current); reviewCloseTimerRef.current = null; }
    setToken(''); setTokenExpiryMs(0); setUser(null);
    setSessions([]); setActiveSessionId(''); setMessages([]); setNewChatInterfaceVersion(0);
    setDraft(''); setDraftsByMode({ chat: '', drug: '', research: '', who: '' });
    setAttachedImages([]); setComposerAttachmentMenuOpen(false);
    setCameraCaptureOpen(false); setCameraCaptureBusy(false); setCameraCaptureError(''); setCameraFacingMode('environment');
    stopCameraCaptureStream();
    setActiveMode(DEFAULT_CHAT_MODE); setChatError(''); setShowScrollToLatest(false);
    setShareError(''); setSessionMenuOpenId(''); setSessionActionBusyId(''); setSessionSelectionMode(false); setSelectedSessionIds([]);
    setIsSidebarOpen(isMobileLayout ? false : !isRealMobileDevice());
    setSidebarWidth(SIDEBAR_OPEN_WIDTH); setSidebarResizing(false);
    setSearchChatsOpen(false); setChatSearch(''); setModeMenuOpen(false);
    setReviewModalOpen(false); setReviewText(''); setReviewError(''); setReviewSuccess(''); setReviewSending(false);
    setSettingsOpen(false); setSettingsTab(SETTINGS_TAB_GENERAL);
    setPreferencesBusy(false); setPreferencesSaving(false); setPreferencesError(''); setPreferencesInfo('');
    setPersonalizationBusy(false); setPersonalizationSaving(false); setPersonalizationError(''); setPersonalizationInfo('');
    setHasBackendPersonalization(false);
    personalizationReadyRef.current = false; personalizationLastSyncedRef.current = '';
    setProfileBusy(false); setProfileSaving(false); setProfileError(''); setProfileInfo('');
    setHasProfile(false); setProfileForm(createEmptyMedicalProfile());
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_EXPIRY_KEY); localStorage.removeItem(USER_KEY);
  }, [isMobileLayout, stopCameraCaptureStream]);

  const openSidebar = useCallback(() => {
    setIsSidebarOpen(true);
    setSidebarWidth((prev) => {
      const targetOpen = (!isMobileLayout && isRealMobileDevice()) ? MOBILE_DESKTOP_SIDEBAR_WIDTH : SIDEBAR_OPEN_WIDTH;
      return prev <= SIDEBAR_COLLAPSED_WIDTH + 4 ? targetOpen : clampSidebarWidth(prev);
    });
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false); setSidebarResizing(false);
    document.body.style.cursor = ''; document.body.style.userSelect = '';
    setModeMenuOpen(false); setUserMenuOpen(false); setSessionMenuOpenId('');
    if (isMobileLayout) { setSearchChatsOpen(false); setChatSearch(''); }
  }, [isMobileLayout]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      if (!next) {
        setSidebarResizing(false);
        document.body.style.cursor = ''; document.body.style.userSelect = '';
        setModeMenuOpen(false); setUserMenuOpen(false); setSessionMenuOpenId('');
        if (isMobileLayout) { setSearchChatsOpen(false); setChatSearch(''); }
      } else {
        setSidebarWidth((current) => current <= SIDEBAR_COLLAPSED_WIDTH + 4 ? SIDEBAR_OPEN_WIDTH : clampSidebarWidth(current));
      }
      return next;
    });
  }, [isMobileLayout]);

  const handleSidebarSurfaceClick = useCallback((event) => {
    if (isMobileLayout || isSidebarOpen) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
    openSidebar();
  }, [isMobileLayout, isSidebarOpen, openSidebar]);

  const handleSidebarResizeStart = useCallback((event) => {
    if (!isDesktopLayout || !isSidebarOpen) return;
    setSidebarResizing(true);
    sidebarResizeStartXRef.current = event.clientX;
    sidebarResizeStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    event.preventDefault();
  }, [isDesktopLayout, isSidebarOpen, sidebarWidth]);

  const logout = useCallback(async () => {
    stopSpeaking(); stopDictation(true); clearLocalSession(); setGuestMode(false);
  }, [clearLocalSession, stopDictation, stopSpeaking]);

  const applyBackendSession = useCallback((payload) => {
    const nextToken = payload.access_token;
    const expiry = decodeJwtExpiryMs(nextToken) || Date.now() + 1000 * 60 * 30;
    const signedInEmail = String(payload?.user?.email || '').trim().toLowerCase();
    setToken(nextToken); setTokenExpiryMs(expiry); setUser(payload.user);
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiry));
    localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    if (EMAIL_PATTERN.test(signedInEmail)) { saveStoredAuthEmail(signedInEmail); setAuthLastEmail(signedInEmail); }
  }, []);

  const completeOtpVerification = useCallback(async ({ email, loginToken, otp }) => {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedLoginToken = (loginToken || '').trim();
    const normalizedOtp = String(otp || '').trim();
    if (!normalizedEmail || !normalizedLoginToken || !normalizedOtp) return false;
    const payload = await api.verifyOtp({ email: normalizedEmail, login_token: normalizedLoginToken, otp: normalizedOtp });
    applyBackendSession(payload);
    setAuthError(''); setAuthInfo(''); setShowResendVerification(false);
    setPendingVerificationLogin(createPendingVerificationLogin());
    return true;
  }, [applyBackendSession]);

  const loadHistory = useCallback(async (sessionId, authToken = token) => {
    if (!sessionId || !authToken) { setMessages([]); return; }
    setLoadingHistory(true); setChatError('');
    try {
      const history = await api.history(authToken, sessionId);
      setMessages(history?.messages || []);
    } catch (error) { setChatError(error.message); }
    finally { setLoadingHistory(false); }
  }, [token]);

  const refreshSessions = useCallback(async (preferredSessionId = '', authToken = token, options = {}) => {
    const autoSelect = options?.autoSelect !== false;
    if (!authToken) { setSessions([]); return ''; }
    const payload = await api.sessions(authToken);
    const nextSessions = payload?.sessions || [];
    setSessions(nextSessions);
    if (!nextSessions.length) { setActiveSessionId(''); return ''; }
    if (preferredSessionId && nextSessions.some((entry) => entry.id === preferredSessionId)) {
      setActiveSessionId(preferredSessionId); return preferredSessionId;
    }
    if (!autoSelect) { setActiveSessionId(''); return ''; }
    const first = nextSessions[0].id;
    setActiveSessionId(first);
    return first;
  }, [token]);

  useEffect(() => {
    if (!authenticated || shareRouteId) return;
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const me = await api.me(token);
        if (cancelled) return;
        setUser(me); localStorage.setItem(USER_KEY, JSON.stringify(me));
        await refreshSessions('', token, { autoSelect: false });
        if (cancelled) return;
        setActiveSessionId('');
        setMessages([]);
      } catch (error) {
        if (!cancelled) { setChatError(error.message); clearLocalSession(); }
      }
    };
    bootstrap();
    return () => { cancelled = true; };
  }, [authenticated, clearLocalSession, loadHistory, refreshSessions, shareRouteId, token]);

  useEffect(() => {
    if (shareRouteId || !textAreaRef.current) return;
    textAreaRef.current.style.height = '0px';
    textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 220)}px`;
  }, [draft, attachedImages.length, shareRouteId]);

  useEffect(() => {
    if (shareRouteId) return;
    const behavior = loadingHistory ? 'auto' : 'smooth';
    const frame = window.requestAnimationFrame(() => { scrollChatToBottom(behavior); });
    return () => window.cancelAnimationFrame(frame);
  }, [loadingHistory, sending, sortedMessages, shareRouteId, scrollChatToBottom]);

  useEffect(() => {
    if (shareRouteId) { setShowScrollToLatest(false); return; }
    const frame = window.requestAnimationFrame(() => { updateScrollToLatestVisibility(); });
    return () => window.cancelAnimationFrame(frame);
  }, [shareRouteId, sortedMessages, loadingHistory, updateScrollToLatestVisibility]);

  useEffect(() => {
    if (shareRouteId) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setDictationSupported(Boolean(SpeechRecognition));
  }, [shareRouteId]);

  useEffect(() => {
    if (shareRouteId || !('speechSynthesis' in window)) return undefined;
    const synthesis = window.speechSynthesis;
    const syncVoices = () => setVoices(synthesis.getVoices());
    syncVoices();
    const pollId = window.setInterval(() => {
      const list = synthesis.getVoices();
      if (list.length) {
        setVoices(list);
        window.clearInterval(pollId);
      }
    }, 120);
    const pollTimeoutId = window.setTimeout(() => window.clearInterval(pollId), 2400);
    synthesis.addEventListener('voiceschanged', syncVoices);
    return () => {
      synthesis.removeEventListener('voiceschanged', syncVoices);
      window.clearInterval(pollId);
      window.clearTimeout(pollTimeoutId);
    };
  }, [shareRouteId]);

  useEffect(() => {
    if (!sidebarResizing) return undefined;
    const onPointerMove = (event) => {
      const delta = event.clientX - sidebarResizeStartXRef.current;
      setSidebarWidth(clampSidebarWidth(sidebarResizeStartWidthRef.current + delta));
    };
    const onPointerUp = () => { setSidebarResizing(false); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', onPointerMove); window.addEventListener('mouseup', onPointerUp);
    return () => {
      window.removeEventListener('mousemove', onPointerMove); window.removeEventListener('mouseup', onPointerUp);
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    };
  }, [sidebarResizing]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clampSidebarWidth(sidebarWidth)));
  }, [sidebarWidth]);

  useEffect(() => {
    if (shareRouteId) return;
    const mobileMedia = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const tabletMedia = window.matchMedia(`(min-width: ${MOBILE_MAX_WIDTH + 1}px) and (max-width: ${TABLET_MAX_WIDTH}px)`);
    const sync = () => {
      const mobile = mobileMedia.matches;
      const tablet = tabletMedia.matches;
      setIsMobileLayout(mobile); setIsTabletLayout(tablet);
      if (mobile) { setIsSidebarOpen(false); }
      setSidebarResizing(false); document.body.style.cursor = ''; document.body.style.userSelect = '';
    };
    sync();
    mobileMedia.addEventListener('change', sync); tabletMedia.addEventListener('change', sync);
    return () => { mobileMedia.removeEventListener('change', sync); tabletMedia.removeEventListener('change', sync); };
  }, [shareRouteId]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    const root = document.documentElement;
    const syncRealMobileClass = () => {
      root.classList.toggle('real-mobile-device', isRealMobileDevice());
    };
    syncRealMobileClass();
    window.addEventListener('resize', syncRealMobileClass);
    window.addEventListener('orientationchange', syncRealMobileClass);
    return () => {
      window.removeEventListener('resize', syncRealMobileClass);
      window.removeEventListener('orientationchange', syncRealMobileClass);
      root.classList.remove('real-mobile-device');
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || shareRouteId || !isRealMobileUser) {
      setMobileDoubleTapZoomed(false);
      return undefined;
    }

    let lastTapAt = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    const onTouchEnd = (event) => {
      if (event.changedTouches.length !== 1) {
        lastTapAt = 0;
        return;
      }
      const target = event.target;
      if (
        target instanceof Element
        && target.closest('button, a, input, textarea, select, label, video, [role="button"], [data-ignore-double-tap-zoom]')
      ) {
        return;
      }

      const touch = event.changedTouches[0];
      const now = Date.now();
      const delta = now - lastTapAt;
      const distance = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);
      if (delta > 0 && delta <= DOUBLE_TAP_GESTURE_MS && distance <= DOUBLE_TAP_MOVE_TOLERANCE_PX) {
        setMobileDoubleTapZoomed((prev) => !prev);
        lastTapAt = 0;
        return;
      }
      lastTapAt = now;
      lastTapX = touch.clientX;
      lastTapY = touch.clientY;
    };

    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isRealMobileUser, shareRouteId]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    if (!isRealMobileUser || !mobileDoubleTapZoomed) {
      root.classList.remove('mobile-doubletap-zoom');
      root.style.removeProperty('--pd-mobile-zoom-scale');
      return undefined;
    }
    root.classList.add('mobile-doubletap-zoom');
    root.style.setProperty('--pd-mobile-zoom-scale', String(MOBILE_DOUBLE_TAP_ZOOM_SCALE));
    return () => {
      root.classList.remove('mobile-doubletap-zoom');
      root.style.removeProperty('--pd-mobile-zoom-scale');
    };
  }, [isRealMobileUser, mobileDoubleTapZoomed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (authenticated || inGuestMode || shareRouteId || !isRealMobileDevice()) {
      setShowLoginDesktopPopup(false);
      return;
    }
    const dismissed = window.sessionStorage.getItem(LOGIN_DESKTOP_POPUP_SESSION_KEY) === '1';
    setShowLoginDesktopPopup(!dismissed);
  }, [authenticated, inGuestMode, shareRouteId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (shareRouteId || authenticated || inGuestMode || !isRealMobileDevice()) return undefined;

    let tracking = false;
    let startY = 0;
    let maxPull = 0;

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) { tracking = false; return; }
      const scrollTop = Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
      if (scrollTop > 0) { tracking = false; return; }
      tracking = true;
      startY = event.touches[0].clientY;
      maxPull = 0;
    };

    const onTouchMove = (event) => {
      if (!tracking || event.touches.length !== 1) return;
      const delta = event.touches[0].clientY - startY;
      if (delta <= 0) { tracking = false; maxPull = 0; return; }
      maxPull = Math.max(maxPull, delta);
    };

    const onTouchEnd = () => {
      if (tracking && maxPull >= PULL_REFRESH_TRIGGER_PX) {
        window.location.reload();
      }
      tracking = false;
      maxPull = 0;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('touchmove', onTouchMove, true);
      window.removeEventListener('touchend', onTouchEnd, true);
      window.removeEventListener('touchcancel', onTouchEnd, true);
    };
  }, [authenticated, inGuestMode, shareRouteId]);

  useEffect(() => {
    if (!authenticated || shareRouteId || !isRealMobileDevice()) return undefined;
    const scrollElement = chatScrollRef.current;
    if (!scrollElement) return undefined;

    let tracking = false;
    let startY = 0;
    let maxPull = 0;

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) { tracking = false; return; }
      if (scrollElement.scrollTop > 0) { tracking = false; return; }
      tracking = true;
      startY = event.touches[0].clientY;
      maxPull = 0;
    };

    const onTouchMove = (event) => {
      if (!tracking || event.touches.length !== 1) return;
      if (scrollElement.scrollTop > 0) { tracking = false; maxPull = 0; return; }
      const delta = event.touches[0].clientY - startY;
      if (delta <= 0) { tracking = false; maxPull = 0; return; }
      maxPull = Math.max(maxPull, delta);
    };

    const onTouchEnd = () => {
      if (tracking && maxPull >= PULL_REFRESH_TRIGGER_PX) {
        window.location.reload();
      }
      tracking = false;
      maxPull = 0;
    };

    scrollElement.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    scrollElement.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    scrollElement.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    scrollElement.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });

    return () => {
      scrollElement.removeEventListener('touchstart', onTouchStart, true);
      scrollElement.removeEventListener('touchmove', onTouchMove, true);
      scrollElement.removeEventListener('touchend', onTouchEnd, true);
      scrollElement.removeEventListener('touchcancel', onTouchEnd, true);
    };
  }, [authenticated, shareRouteId, activeSessionId, newChatInterfaceVersion]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isRealMobileUser) {
      setIsComposerFocusedMobile(false);
      setMobileKeyboardOffset(0);
      return undefined;
    }
    if (!isComposerFocusedMobile) {
      setMobileKeyboardOffset(0);
      return undefined;
    }
    const viewport = window.visualViewport;
    if (!viewport) {
      setMobileKeyboardOffset(0);
      return undefined;
    }

    const syncKeyboardOffset = () => {
      const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setMobileKeyboardOffset(Math.round(keyboardInset));
    };

    syncKeyboardOffset();
    viewport.addEventListener('resize', syncKeyboardOffset);
    viewport.addEventListener('scroll', syncKeyboardOffset);
    window.addEventListener('orientationchange', syncKeyboardOffset);

    return () => {
      viewport.removeEventListener('resize', syncKeyboardOffset);
      viewport.removeEventListener('scroll', syncKeyboardOffset);
      window.removeEventListener('orientationchange', syncKeyboardOffset);
    };
  }, [isComposerFocusedMobile, isRealMobileUser]);

  useEffect(() => {
    if (authenticated) {
      // Keep sidebar collapsed on real mobile hardware even in desktop site mode
      setIsSidebarOpen(!isMobileLayout && !isRealMobileDevice());
      setSidebarWidth((prev) => {
      const targetOpen = (!isMobileLayout && isRealMobileDevice()) ? MOBILE_DESKTOP_SIDEBAR_WIDTH : SIDEBAR_OPEN_WIDTH;
      return prev <= SIDEBAR_COLLAPSED_WIDTH + 4 ? targetOpen : clampSidebarWidth(prev);
    });
    }
  }, [authenticated, isMobileLayout]);

  useEffect(() => {
    if (shareRouteId) return;
    const onPointerDown = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) setUserMenuOpen(false);
      if (shareMenuRef.current && !shareMenuRef.current.contains(event.target)) setShareMenuOpen(false);
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target)) setModeMenuOpen(false);
      if (composerAttachmentMenuRef.current && !composerAttachmentMenuRef.current.contains(event.target)) setComposerAttachmentMenuOpen(false);
      if (event.target instanceof Element && !event.target.closest('[data-session-menu]')) setSessionMenuOpenId('');
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [shareRouteId]);

  useEffect(() => {
    if (!token || !tokenExpiryMs || shareRouteId) return;
    const msUntilExpiry = tokenExpiryMs - Date.now();
    if (msUntilExpiry <= 0) { logout(); return; }
    const timer = window.setTimeout(() => logout(), msUntilExpiry);
    return () => window.clearTimeout(timer);
  }, [logout, shareRouteId, token, tokenExpiryMs]);

  useEffect(() => () => { clearSilenceTimer(); stopDictation(true); stopSpeaking(); }, [clearSilenceTimer, stopDictation, stopSpeaking]);

  const speakMessage = useCallback((message) => {
    if (!('speechSynthesis' in window)) { setChatError('Text-to-speech is not supported in this browser.'); return; }
    const baseSpeechText = buildSpokenExplanation(message);
    if (!baseSpeechText.trim()) return;
    const speechVariant = resolveSpeechVariant(baseSpeechText, appSettings.language);
    const isRomanUrduSpeech = speechVariant === 'roman_urdu';
    const targetMessageId = String(message?.id || '');
    const synthesis = window.speechSynthesis;
    try { synthesis.getVoices(); } catch {}
    try {
      if (synthesis.paused) synthesis.resume();
      if (synthesis.speaking || synthesis.pending || utteranceRef.current) synthesis.cancel();
    } catch {}
    utteranceRef.current = null;
    setSpeakingMessageId(targetMessageId);
    const configuredLang = appSettings.language === 'ur' ? 'ur-PK' : 'en-US';
    const preferredLang = isRomanUrduSpeech
      ? 'en-US'
      : appSettings.voice_auto_detect
        ? speechVariant === 'ur' ? 'ur-PK' : 'en-US'
        : configuredLang;
    const liveVoices = synthesis.getVoices();
    const voicePool = (liveVoices && liveVoices.length) ? liveVoices : voices;
    const selectedVoice = isRomanUrduSpeech
      ? selectEnglishVoiceForRomanUrdu(voicePool)
      : selectFemaleVoice(voicePool, preferredLang, baseSpeechText);
    const selectedVoiceLang = String(selectedVoice?.lang || '').trim();
    const speechText = normalizeSpeechNamePronunciation(baseSpeechText, speechVariant);
    if (!speechText.trim()) {
      utteranceRef.current = null;
      setSpeakingMessageId('');
      return;
    }
    const lang = isRomanUrduSpeech ? 'en-US' : (selectedVoiceLang || preferredLang);
    const isUrduFamily = !isRomanUrduSpeech && (isUrduFamilyLanguageTag(lang) || speechVariant === 'ur');
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = lang;
    utterance.rate = isRomanUrduSpeech ? 0.9 : (isUrduFamily ? 0.9 : 0.95);
    utterance.pitch = isRomanUrduSpeech ? 1.0 : (isUrduFamily ? 1.0 : 1.05);
    utterance.volume = 1.0;
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.__pdMessageId = targetMessageId;
    utterance.onend = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      setSpeakingMessageId('');
    };
    utteranceRef.current = utterance;
    synthesis.speak(utterance);
  }, [appSettings.language, appSettings.voice_auto_detect, voices]);

  const toggleMessageSpeech = useCallback((message) => {
    const targetMessageId = String(message?.id || '');
    const activeMessageId = String(utteranceRef.current?.__pdMessageId || '');
    if (speakingMessageId === targetMessageId || activeMessageId === targetMessageId) { stopSpeaking(); return; }
    speakMessage(message);
  }, [speakMessage, speakingMessageId, stopSpeaking]);

  useEffect(() => {
    if (!autoVoice) { autoSpokenMessageRef.current = ''; return; }
    const lastAssistant = [...sortedMessages].reverse().find((message) => message.role === 'assistant');
    if (!lastAssistant) return;
    if (autoSpokenMessageRef.current === lastAssistant.id) return;
    autoSpokenMessageRef.current = lastAssistant.id;
    speakMessage(lastAssistant);
  }, [autoVoice, sortedMessages, speakMessage]);

  const startDictation = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setChatError('Speech recognition is not supported in this browser.'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = chatLanguage === 'ur' ? 'ur-PK' : 'en-US';
    recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    setDictationState('listening'); setChatError('');
    const armSilenceTimer = () => { clearSilenceTimer(); silenceTimerRef.current = window.setTimeout(() => stopDictation(false), SILENCE_TIMEOUT_MS); };
    recognition.onstart = () => {};
    recognition.onresult = (event) => {
      armSilenceTimer();
      let chunk = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript?.trim();
        if (!transcript || !event.results[index].isFinal) continue;
        chunk += `${chunk ? ' ' : ''}${transcript}`;
      }
      if (chunk) setDraft((prev) => `${prev}${prev ? ' ' : ''}${chunk}`.trim());
    };
    recognition.onerror = () => { clearSilenceTimer(); recognitionRef.current = null; setDictationState('idle'); setChatError('Voice input failed. Check microphone permissions and try again.'); };
    recognition.onend = () => { clearSilenceTimer(); recognitionRef.current = null; setDictationState('idle'); };
    try { recognition.start(); }
    catch { clearSilenceTimer(); recognitionRef.current = null; setDictationState('idle'); setChatError('Unable to start voice dictation.'); }
  }, [chatLanguage, clearSilenceTimer, stopDictation]);

  const toggleDictation = useCallback(() => {
    if (recognitionRef.current) { stopDictation(true); return; }
    startDictation();
  }, [startDictation, stopDictation]);

  const handleRequestSignupOtp = useCallback(async ({ email, password, confirmPassword, fullName }) => {
    setGuestMode(false); setAuthBusy(true); setAuthError(''); setAuthInfo('');
    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedFullName = (fullName || '').trim();
    try {
      if (!EMAIL_PATTERN.test(normalizedEmail)) throw new Error('Please enter a valid email address.');
      if (password !== confirmPassword) throw new Error('Passwords do not match.');
      if (!PASSWORD_PATTERN.test(password || '')) throw new Error(PASSWORD_RULE_MESSAGE);
      const payload = await api.signupWithEmail({ email: normalizedEmail, password, full_name: normalizedFullName || undefined });
      const maskedEmail = payload?.masked_email || normalizedEmail;
      setPendingVerificationLogin({ email: normalizedEmail, password, fullName: normalizedFullName, loginToken: payload?.login_token || '', maskedEmail });
      saveStoredAuthEmail(normalizedEmail); setAuthLastEmail(normalizedEmail);
      setShowResendVerification(true);
      setAuthInfo('OTP sent successfuly!\nCheck your spam folder!');
      return true;
    } catch (error) {
      setAuthError(toAuthMessage(error));
      return false;
    } finally { setAuthBusy(false); }
  }, []);

  const handleEmailSignup = useCallback(async ({ email, password, confirmPassword, fullName, otp }) => {
    setGuestMode(false); setAuthBusy(true); setAuthError(''); setAuthInfo('');
    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedOtp = String(otp || '').trim();
    try {
      if (!EMAIL_PATTERN.test(normalizedEmail)) throw new Error('Please enter a valid email address.');
      if (password !== confirmPassword) throw new Error('Passwords do not match.');
      if (!PASSWORD_PATTERN.test(password)) throw new Error(PASSWORD_RULE_MESSAGE);
      if (!normalizedOtp) throw new Error('Please request OTP first, then enter OTP to create your account.');
      const pendingEmail = (pendingVerificationLogin.email || '').trim().toLowerCase();
      const pendingLoginToken = (pendingVerificationLogin.loginToken || '').trim();
      if (!pendingLoginToken || pendingEmail !== normalizedEmail) throw new Error('Please request OTP first, then enter OTP to create your account.');
      await completeOtpVerification({ email: normalizedEmail, loginToken: pendingLoginToken, otp: normalizedOtp });
    } catch (error) {
      if (normalizedOtp) setShowResendVerification(true);
      setAuthError(toAuthMessage(error));
    } finally { setAuthBusy(false); }
  }, [completeOtpVerification, pendingVerificationLogin.email, pendingVerificationLogin.loginToken]);

  const handleEmailLogin = useCallback(async ({ email, password }) => {
    setGuestMode(false); setAuthBusy(true); setAuthError(''); setAuthInfo('');
    setShowResendVerification(false); setPendingVerificationLogin(createPendingVerificationLogin());
    const normalizedEmail = (email || '').trim().toLowerCase();
    try {
      if (!EMAIL_PATTERN.test(normalizedEmail)) throw new Error('Please enter a valid email address.');
      const backendSession = await api.loginWithEmail({ email: normalizedEmail, password });
      applyBackendSession(backendSession);
    } catch (error) {
      const message = toAuthMessage(error);
      if (message.toLowerCase().includes('not verified')) {
        setShowResendVerification(true);
        setPendingVerificationLogin({ email: normalizedEmail, password, fullName: '', loginToken: '', maskedEmail: normalizedEmail });
        setAuthError('Email not verified. Use Resend OTP to receive a new code.'); setAuthInfo('');
      } else { setAuthError(message); setShowResendVerification(false); setPendingVerificationLogin(createPendingVerificationLogin()); }
    } finally { setAuthBusy(false); }
  }, [applyBackendSession]);

  const handleRequestPasswordReset = useCallback(async ({ email }) => {
    setGuestMode(false); setAuthBusy(true); setAuthError(''); setAuthInfo('');
    const normalizedEmail = (email || '').trim().toLowerCase();
    try {
      if (!EMAIL_PATTERN.test(normalizedEmail)) throw new Error('Please enter a valid email address.');
      await api.requestPasswordReset({ email: normalizedEmail });
      saveStoredAuthEmail(normalizedEmail);
      setAuthInfo('OTP sent successfuly!\nCheck your spam folder!');
      return true;
    } catch (error) { setAuthError(toAuthMessage(error)); return false; }
    finally { setAuthBusy(false); }
  }, []);

  const handleResetPassword = useCallback(async ({ email, otp, newPassword, confirmPassword }) => {
    setGuestMode(false); setAuthBusy(true); setAuthError(''); setAuthInfo('');
    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedOtp = String(otp || '').trim();
    try {
      if (!EMAIL_PATTERN.test(normalizedEmail)) throw new Error('Please enter a valid email address.');
      if (!normalizedOtp) throw new Error('Please enter the reset OTP sent to your email.');
      if (newPassword !== confirmPassword) throw new Error('Passwords do not match.');
      if (!PASSWORD_PATTERN.test(newPassword || '')) throw new Error(PASSWORD_RULE_MESSAGE);
      const payload = await api.resetPassword({ email: normalizedEmail, otp: normalizedOtp, new_password: newPassword });
      saveStoredAuthEmail(normalizedEmail); setAuthLastEmail(normalizedEmail);
      setAuthMode('login'); setShowResendVerification(false); setPendingVerificationLogin(createPendingVerificationLogin());
      setAuthInfo(payload?.message || 'Password reset successful. Please sign in.');
      return true;
    } catch (error) { setAuthError(toAuthMessage(error)); return false; }
    finally { setAuthBusy(false); }
  }, []);

  const handleGoogleLogin = useCallback(async () => {
    setGuestMode(false); setAuthBusy(true); setAuthError(''); setAuthInfo('');
    setShowResendVerification(false); setPendingVerificationLogin(createPendingVerificationLogin());
    try {
      const googleIdToken = await requestGoogleIdToken();
      const backendSession = await api.loginWithGoogleToken(googleIdToken);
      applyBackendSession(backendSession);
    } catch (error) { setAuthError(toAuthMessage(error)); }
    finally { setAuthBusy(false); }
  }, [applyBackendSession]);

  const handleResendVerification = useCallback(async () => {
    const email = (pendingVerificationLogin.email || '').trim().toLowerCase();
    const password = pendingVerificationLogin.password;
    const fullName = (pendingVerificationLogin.fullName || '').trim();
    if (!email || !password) { setAuthError('Please login again to resend OTP.'); setShowResendVerification(false); return; }
    const confirmed = window.confirm('Please check your Spam/Junk folder before requesting another OTP email.');
    if (!confirmed) return;
    setResendBusy(true); setAuthError(''); setAuthInfo('');
    try {
      const payload = await api.signupWithEmail({ email, password, full_name: fullName || undefined });
      const maskedEmail = payload?.masked_email || email;
      setAuthInfo('OTP sent successfully - check your spam folder.');
      setPendingVerificationLogin({ email, password, fullName, loginToken: payload?.login_token || '', maskedEmail });
      setShowResendVerification(true);
    } catch (error) { setAuthError(toAuthMessage(error)); }
    finally { setResendBusy(false); }
  }, [pendingVerificationLogin]);

  const handleAuthModeChange = useCallback((mode) => {
    setAuthMode(mode); setAuthBusy(false); setAuthError(''); setAuthInfo('');
    setResendBusy(false); setShowResendVerification(false); setPendingVerificationLogin(createPendingVerificationLogin());
  }, []);

  const dismissLoginDesktopPopup = useCallback(() => {
    setShowLoginDesktopPopup(false);
    try { window.sessionStorage.setItem(LOGIN_DESKTOP_POPUP_SESSION_KEY, '1'); } catch {}
  }, []);

  const loadMedicalProfile = useCallback(async (authToken = token) => {
    if (!authToken) { setHasProfile(false); setProfileForm(createEmptyMedicalProfile()); return null; }
    const payload = await api.getProfile(authToken);
    setHasProfile(true); setProfileForm(profileToForm(payload));
    return payload;
  }, [token]);

  const applyUserSettings = useCallback((payload) => {
    if (!payload) return;
    setAppSettings((prev) => normalizeAppSettings({ ...prev, ...payload, display_name: payload.display_name ?? prev.display_name }));
  }, []);

  const loadUserSettings = useCallback(async (authToken = token) => {
    if (!authToken) return null;
    const payload = await api.getSettings(authToken);
    applyUserSettings(payload);
    return payload;
  }, [applyUserSettings, token]);

  const loadPersonalization = useCallback(async (authToken = token) => {
    if (!authToken) { setHasBackendPersonalization(false); return null; }
    const payload = await api.getPersonalization(authToken);
    const normalized = normalizePersonalization(payload);
    replacePersonalization(normalized);
    setHasBackendPersonalization(true);
    personalizationLastSyncedRef.current = serializePersonalization(normalized);
    return normalized;
  }, [replacePersonalization, token]);

  useEffect(() => {
    if (!authenticated || shareRouteId) return;
    loadUserSettings(token).catch(() => {});
  }, [authenticated, loadUserSettings, shareRouteId, token]);

  useEffect(() => {
    if (shareRouteId) return;
    if (!authenticated || !token) {
      personalizationReadyRef.current = true; personalizationLastSyncedRef.current = '';
      setHasBackendPersonalization(false); setPersonalizationBusy(false); setPersonalizationSaving(false); setPersonalizationError('');
      return;
    }
    let cancelled = false;
    personalizationReadyRef.current = false; setPersonalizationBusy(true); setPersonalizationError('');
    const hydrate = async () => {
      try { await loadPersonalization(token); }
      catch (error) {
        if (cancelled) return;
        if (isPersonalizationNotFoundError(error)) { setHasBackendPersonalization(false); personalizationLastSyncedRef.current = ''; }
        else setPersonalizationError(error?.message || (isUrduUI ? 'پرسنلائزیشن لوڈ نہیں ہو سکی۔' : 'Unable to load personalization.'));
      } finally { if (!cancelled) { personalizationReadyRef.current = true; setPersonalizationBusy(false); } }
    };
    hydrate();
    return () => { cancelled = true; };
  }, [authenticated, isUrduUI, loadPersonalization, shareRouteId, token]);

  useEffect(() => {
    if (shareRouteId || !settingsOpen) return;
    if (!authenticated || !token || inGuestMode) {
      setPersonalizationSaving(false); setPersonalizationError('');
      setPersonalizationInfo(isUrduUI ? 'پرسنلائزیشن اس ڈیوائس پر محفوظ ہو گئی۔' : 'Personalization saved on this device.');
      return;
    }
    if (!personalizationReadyRef.current) return;
    if (serializedPersonalization === personalizationLastSyncedRef.current) return;
    setPersonalizationError('');
    const timer = window.setTimeout(async () => {
      setPersonalizationSaving(true);
      try {
        const requestBody = toPersonalizationApiPayload(effectivePersonalization);
        let payload;
        if (hasBackendPersonalization) { payload = await api.updatePersonalization(requestBody, token); }
        else {
          try { payload = await api.createPersonalization(requestBody, token); }
          catch (error) {
            if ((error?.message || '').toLowerCase().includes('already exists')) payload = await api.updatePersonalization(requestBody, token);
            else throw error;
          }
        }
        const normalized = normalizePersonalization(payload);
        replacePersonalization(normalized); setHasBackendPersonalization(true);
        personalizationLastSyncedRef.current = serializePersonalization(normalized);
        setPersonalizationInfo(isUrduUI ? 'پرسنلائزیشن محفوظ ہو گئی۔' : 'Personalization saved.');
      } catch (error) { setPersonalizationError(error?.message || (isUrduUI ? 'پرسنلائزیشن محفوظ نہیں ہو سکی۔' : 'Unable to save personalization.')); }
      finally { setPersonalizationSaving(false); }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [authenticated, effectivePersonalization, hasBackendPersonalization, inGuestMode, replacePersonalization, serializedPersonalization, settingsOpen, shareRouteId, token, isUrduUI]);

  const handlePreferenceFieldChange = useCallback((key, value) => {
    setAppSettings((prev) => normalizeAppSettings({ ...prev, [key]: value }));
    setPreferencesError(''); setPreferencesInfo('');
  }, []);

  const handlePersonalizationFieldChange = useCallback((key, value) => {
    updatePersonalizationField(key, value); setPersonalizationError('');
    if (!authenticated || inGuestMode) setPersonalizationInfo(isUrduUI ? 'پرسنلائزیشن اس ڈیوائس پر محفوظ ہو گئی۔' : 'Personalization saved on this device.');
    else setPersonalizationInfo('');
  }, [authenticated, inGuestMode, isUrduUI, updatePersonalizationField]);

  const handleQuickLanguageChange = useCallback((language) => { handlePreferenceFieldChange('language', language); }, [handlePreferenceFieldChange]);
  const handleCycleAppearance = useCallback(() => {
    const current = ['light','dark','system'].includes(appSettings.appearance) ? appSettings.appearance : 'dark';
    const currentIndex = APPEARANCE_CYCLE.indexOf(current);
    const nextAppearance = APPEARANCE_CYCLE[(currentIndex + 1) % APPEARANCE_CYCLE.length];
    handlePreferenceFieldChange('appearance', nextAppearance);
  }, [appSettings.appearance, handlePreferenceFieldChange]);

  const handlePreferencesSubmit = useCallback(async (event) => {
    event.preventDefault(); setPreferencesSaving(true); setPreferencesError(''); setPreferencesInfo('');
    try {
      const normalized = normalizeAppSettings(appSettings);
      if (token) {
        const payload = await api.updateSettings({ appearance: normalized.appearance, language: normalized.language, voice_gender: 'female', voice_auto_detect: normalized.voice_auto_detect, display_name: normalized.display_name || null }, token);
        applyUserSettings(payload);
        setUser((prev) => { if (!prev) return prev; const nextUser = { ...prev, full_name: payload.display_name || null }; localStorage.setItem(USER_KEY, JSON.stringify(nextUser)); return nextUser; });
        setPreferencesInfo(isUrduUI ? 'ترتیبات محفوظ ہو گئیں۔' : 'Settings saved.');
      } else { setPreferencesInfo(isUrduUI ? 'ترتیبات اس ڈیوائس پر محفوظ ہو گئیں۔' : 'Settings saved on this device.'); }
    } catch (error) { setPreferencesError(error?.message || (isUrduUI ? 'ترتیبات محفوظ نہیں ہو سکیں۔' : 'Unable to save settings.')); }
    finally { setPreferencesSaving(false); }
  }, [appSettings, applyUserSettings, isUrduUI, token]);

  const handleOpenSettings = useCallback(async () => {
    setSettingsOpen(true); setSettingsTab(SETTINGS_TAB_GENERAL);
    setPreferencesBusy(Boolean(token)); setPreferencesSaving(false); setPreferencesError(''); setPreferencesInfo('');
    setPersonalizationBusy(Boolean(token)); setPersonalizationSaving(false); setPersonalizationError(''); setPersonalizationInfo('');
    setProfileBusy(true); setProfileSaving(false); setProfileError(''); setProfileInfo('');
    if (!token) { setPersonalizationBusy(false); setProfileBusy(false); return; }
    try { await loadUserSettings(token); } catch (error) { setPreferencesError(error?.message || (isUrduUI ? 'ترتیبات لوڈ نہیں ہو سکیں۔' : 'Unable to load settings.')); }
    finally { setPreferencesBusy(false); }
    try { await loadPersonalization(token); }
    catch (error) { if (isPersonalizationNotFoundError(error)) setHasBackendPersonalization(false); else setPersonalizationError(error?.message || (isUrduUI ? 'پرسنلائزیشن لوڈ نہیں ہو سکی۔' : 'Unable to load personalization.')); }
    finally { setPersonalizationBusy(false); }
    try { await loadMedicalProfile(token); }
    catch (error) { if (isProfileNotFoundError(error)) { setHasProfile(false); setProfileForm(createEmptyMedicalProfile()); } else setProfileError(error?.message || (isUrduUI ? 'پروفائل لوڈ نہیں ہو سکا۔' : 'Unable to load profile.')); }
    finally { setProfileBusy(false); }
  }, [isUrduUI, loadMedicalProfile, loadPersonalization, loadUserSettings, token]);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false); setSettingsTab(SETTINGS_TAB_GENERAL);
    setPreferencesBusy(false); setPreferencesSaving(false); setPreferencesError(''); setPreferencesInfo('');
    setPersonalizationBusy(false); setPersonalizationSaving(false); setPersonalizationError(''); setPersonalizationInfo('');
    setProfileSaving(false); setProfileError(''); setProfileInfo('');
  }, []);

  const handleOpenPersonalizationSettings = useCallback(async () => {
    await handleOpenSettings(); setSettingsTab(SETTINGS_TAB_PERSONALIZATION); setUserMenuOpen(false);
  }, [handleOpenSettings]);

  const handleProfileFieldChange = useCallback((key, value) => { setProfileForm((prev) => ({ ...prev, [key]: value })); }, []);

  const handleProfileSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (!token) return;
    setProfileSaving(true); setProfileError(''); setProfileInfo('');
    const payload = formToProfilePayload(profileForm);
    try {
      if (hasProfile) await api.updateProfile(payload, token);
      else { await api.createProfile(payload, token); setHasProfile(true); }
      setProfileInfo(isUrduUI ? 'میڈیکل پروفائل محفوظ ہو گیا۔' : 'Medical profile saved.');
    } catch (error) {
      if (!hasProfile && (error?.message || '').toLowerCase().includes('already exists')) {
        await api.updateProfile(payload, token); setHasProfile(true);
        setProfileInfo(isUrduUI ? 'میڈیکل پروفائل محفوظ ہو گیا۔' : 'Medical profile saved.');
      } else setProfileError(error?.message || (isUrduUI ? 'پروفائل محفوظ نہیں ہو سکا۔' : 'Unable to save profile.'));
    } finally { setProfileSaving(false); }
  }, [hasProfile, isUrduUI, profileForm, token]);

  const handleContinueAsGuest = useCallback(() => {
    setAuthBusy(false); setAuthError(''); setAuthInfo(''); setResendBusy(false);
    setShowResendVerification(false); setPendingVerificationLogin(createPendingVerificationLogin());
    setSettingsOpen(false); setModeMenuOpen(false); setGuestMode(true);
  }, []);

  const handleExitGuestMode = useCallback(() => {
    if (reviewCloseTimerRef.current) { window.clearTimeout(reviewCloseTimerRef.current); reviewCloseTimerRef.current = null; }
    stopSpeaking(); stopDictation(true); setGuestMode(false);
    setSessions([]); setActiveSessionId(''); setMessages([]); setNewChatInterfaceVersion(0);
    setDraft(''); setDraftsByMode({ chat: '', drug: '', research: '', who: '' });
    setAttachedImages([]); setComposerAttachmentMenuOpen(false); setActiveMode(DEFAULT_CHAT_MODE);
    setChatError(''); setShareError(''); setSessionMenuOpenId(''); setSessionActionBusyId(''); setSessionSelectionMode(false); setSelectedSessionIds([]);
    setModeMenuOpen(false); setReviewModalOpen(false); setReviewText(''); setReviewError(''); setReviewSuccess(''); setReviewSending(false);
    setSettingsOpen(false); setSettingsTab(SETTINGS_TAB_GENERAL);
    setPreferencesBusy(false); setPreferencesSaving(false); setPreferencesError(''); setPreferencesInfo('');
    setPersonalizationBusy(false); setPersonalizationSaving(false); setPersonalizationError(''); setPersonalizationInfo('');
    setHasBackendPersonalization(false); personalizationReadyRef.current = false; personalizationLastSyncedRef.current = '';
    setSearchChatsOpen(false); setChatSearch('');
    setProfileBusy(false); setProfileSaving(false); setProfileError(''); setProfileInfo('');
    setHasProfile(false); setProfileForm(createEmptyMedicalProfile());
    setAuthMode('login'); setAuthBusy(false); setAuthError(''); setAuthInfo('');
    setResendBusy(false); setShowResendVerification(false); setPendingVerificationLogin(createPendingVerificationLogin());
  }, [stopCameraCaptureStream, stopDictation, stopSpeaking]);

  const invalidatePendingSend = useCallback(() => { sendSequenceRef.current += 1; conversationResetRef.current += 1; setSending(false); }, []);

  const handleToggleSessionSelectionMode = useCallback(() => {
    setSessionMenuOpenId('');
    setSessionSelectionMode((prev) => {
      const next = !prev;
      if (!next) setSelectedSessionIds([]);
      return next;
    });
  }, []);

  const handleToggleSessionSelection = useCallback((sessionId) => {
    const normalized = String(sessionId || '').trim();
    if (!normalized) return;
    setSelectedSessionIds((prev) => (
      prev.includes(normalized)
        ? prev.filter((entry) => entry !== normalized)
        : [...prev, normalized]
    ));
  }, []);

  const deleteSessionBatch = useCallback(async (sessionIds, { all = false } = {}) => {
    if (!token || inGuestMode) return;
    const uniqueIds = Array.from(new Set((sessionIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!uniqueIds.length) return;

    const confirmationMessage = all
      ? `Delete all ${uniqueIds.length} saved chats? This cannot be undone.`
      : `Delete ${uniqueIds.length} selected chat${uniqueIds.length === 1 ? '' : 's'}? This cannot be undone.`;
    if (!window.confirm(confirmationMessage)) return;

    setSessionActionBusyId('__bulk__');
    setChatError('');
    try {
      for (const sessionId of uniqueIds) {
        await api.deleteChat(sessionId, token);
      }
      const deletedSet = new Set(uniqueIds);
      const preferredAfterDelete = activeSessionId && !deletedSet.has(activeSessionId) ? activeSessionId : '';
      await refreshSessions(preferredAfterDelete, token, { autoSelect: false });
      if (!preferredAfterDelete) {
        setActiveSessionId('');
        setMessages([]);
      }
      setSessionSelectionMode(false);
      setSelectedSessionIds([]);
      setSessionMenuOpenId('');
    } catch (error) {
      setChatError(error?.message || 'Unable to delete chats right now. Please try again.');
    } finally {
      setSessionActionBusyId('');
    }
  }, [activeSessionId, inGuestMode, refreshSessions, token]);

  const handleDeleteSelectedSessions = useCallback(async () => {
    await deleteSessionBatch(selectedSessionIds, { all: false });
  }, [deleteSessionBatch, selectedSessionIds]);

  const handleDeleteAllSessions = useCallback(async () => {
    await deleteSessionBatch(sessions.map((session) => session.id), { all: true });
  }, [deleteSessionBatch, sessions]);

  const handleSelectSession = useCallback(async (sessionId) => {
    invalidatePendingSend(); setSessionMenuOpenId(''); setActiveSessionId(sessionId);
    setSessionSelectionMode(false); setSelectedSessionIds([]);
    await loadHistory(sessionId);
    if (isMobileLayout) closeSidebar();
  }, [closeSidebar, invalidatePendingSend, isMobileLayout, loadHistory]);

  const handleNewChat = useCallback(() => {
    invalidatePendingSend(); setSessionMenuOpenId(''); setActiveSessionId(''); setMessages([]);
    setSessionSelectionMode(false); setSelectedSessionIds([]);
    setDraft(''); setAttachedImages([]); setComposerAttachmentMenuOpen(false);
    setDraftsByMode({ chat: '', drug: '', research: '', who: '' });
    setChatError(''); setShareError(''); setShareMenuOpen(false);
    setNewChatInterfaceVersion((prev) => prev + 1);
    if (isMobileLayout) closeSidebar();
  }, [closeSidebar, invalidatePendingSend, isMobileLayout]);

  const handleToggleSearchChats = useCallback(() => {
    setSearchChatsOpen((prev) => { const next = !prev; if (!next) setChatSearch(''); return next; });
  }, []);

  const handleModeSelection = useCallback((mode) => {
    const nextMode = normalizeChatMode(mode);
    setModeMenuOpen(false);
    if (nextMode === activeMode) return;
    setActiveMode(nextMode); setChatError(''); setShareError('');
  }, [activeMode]);

  const handleModeSuggestion = useCallback((text) => {
    const next = String(text || '').trim();
    setDraft(next);
    if (textAreaRef.current) textAreaRef.current.focus();
  }, []);

  const renderModeInterface = useMemo(() => {
    if (activeMode === 'drug') return <DrugInfoModeView key={`drug-${newChatInterfaceVersion}`} onSuggestion={handleModeSuggestion} />;
    if (activeMode === 'research') return <ResearchModeView key={`research-${newChatInterfaceVersion}`} onSuggestion={handleModeSuggestion} />;
    if (activeMode === 'who') return <WhoStatsModeView key={`who-${newChatInterfaceVersion}`} onSuggestion={handleModeSuggestion} />;
    return <ChatModeView key={`chat-${newChatInterfaceVersion}`} onSuggestion={handleModeSuggestion} />;
  }, [activeMode, handleModeSuggestion, newChatInterfaceVersion]);

  const handleOpenReviewModal = useCallback(() => {
    if (reviewCloseTimerRef.current) { window.clearTimeout(reviewCloseTimerRef.current); reviewCloseTimerRef.current = null; }
    setReviewModalOpen(true); setReviewText(''); setReviewRating(0); setReviewError(''); setReviewSuccess(''); setReviewSending(false); setUserMenuOpen(false);
  }, []);

  const handleOpenHelpModal = useCallback(() => { setHelpModalOpen(true); setUserMenuOpen(false); }, []);
  const handleCloseHelpModal = useCallback(() => { setHelpModalOpen(false); }, []);

  const handleCloseReviewModal = useCallback(() => {
    if (reviewSending) return;
    if (reviewCloseTimerRef.current) { window.clearTimeout(reviewCloseTimerRef.current); reviewCloseTimerRef.current = null; }
    setReviewModalOpen(false); setReviewError(''); setReviewSuccess(''); setReviewSending(false);
  }, [reviewSending]);

  const handleReviewSubmit = useCallback(async (event) => {
    event.preventDefault();
    const normalized = reviewText.trim();
    if (normalized.length < 10) { setReviewError(ui.feedbackMinChars); return; }
    setReviewSending(true); setReviewError(''); setReviewSuccess('');
    try {
      const payload = { feedback: normalized, rating: reviewRating > 0 ? reviewRating : undefined, user_email: user?.email || undefined, user_name: user?.full_name || (inGuestMode ? 'Guest User' : undefined) };
      await api.sendFeedback(payload, token || undefined);
      setReviewSuccess(ui.feedbackThanks); setReviewText(''); setReviewRating(0);
      if (reviewCloseTimerRef.current) window.clearTimeout(reviewCloseTimerRef.current);
      reviewCloseTimerRef.current = window.setTimeout(() => { setReviewModalOpen(false); setReviewSuccess(''); setReviewSending(false); reviewCloseTimerRef.current = null; }, 1300);
    } catch (error) { setReviewError(error?.message || ui.feedbackSendError); }
    finally { setReviewSending(false); }
  }, [inGuestMode, reviewRating, reviewText, token, ui.feedbackMinChars, ui.feedbackSendError, ui.feedbackThanks, user?.email, user?.full_name]);

  const handleToggleSessionMenu = useCallback((sessionId) => { setSessionMenuOpenId((prev) => (prev === sessionId ? '' : sessionId)); }, []);

  const handlePinSession = useCallback(async (session) => {
    if (!token || inGuestMode || !session?.id) return;
    setSessionActionBusyId(session.id); setChatError('');
    try { await api.pinChat(session.id, !Boolean(session.is_pinned), token); await refreshSessions(activeSessionId || session.id, token); }
    catch (error) { setChatError(error.message); }
    finally { setSessionActionBusyId(''); setSessionMenuOpenId(''); }
  }, [activeSessionId, inGuestMode, refreshSessions, token]);

  const handleArchiveSession = useCallback(async (session) => {
    if (!token || inGuestMode || !session?.id) return;
    setSessionActionBusyId(session.id); setChatError('');
    try {
      await api.archiveChat(session.id, true, token);
      if (activeSessionId === session.id) {
        const nextSessionId = await refreshSessions('', token);
        if (nextSessionId) await loadHistory(nextSessionId, token); else setMessages([]);
      } else await refreshSessions(activeSessionId, token);
    } catch (error) { setChatError(error.message); }
    finally { setSessionActionBusyId(''); setSessionMenuOpenId(''); }
  }, [activeSessionId, inGuestMode, loadHistory, refreshSessions, token]);

  const handleDeleteSession = useCallback(async (session) => {
    if (!token || inGuestMode || !session?.id) return;
    setSessionActionBusyId(session.id); setChatError('');
    try {
      await api.deleteChat(session.id, token);
      if (activeSessionId === session.id) {
        const nextSessionId = await refreshSessions('', token);
        if (nextSessionId) await loadHistory(nextSessionId, token); else setMessages([]);
      } else await refreshSessions(activeSessionId, token);
    } catch (error) { setChatError(error.message); }
    finally { setSessionActionBusyId(''); setSessionMenuOpenId(''); }
  }, [activeSessionId, inGuestMode, loadHistory, refreshSessions, token]);

  const addImageAttachments = useCallback(async (fileList) => {
    const selectedFiles = Array.from(fileList || []);
    if (!selectedFiles.length) return;
    const current = Array.isArray(attachedImages) ? attachedImages : [];
    const currentKeys = new Set(current.map((item) => item.key));
    const next = [...current];
    let skippedItems = false, skippedByDailyImageLimit = false, skippedByReadError = false, skippedByUnsupportedType = false;
    const usage = readDailyImageUploadUsage();
    const usageField = inGuestMode ? 'guest' : 'user';
    const dailyImageLimit = inGuestMode ? GUEST_DAILY_IMAGE_UPLOAD_LIMIT : USER_DAILY_IMAGE_UPLOAD_LIMIT;
    let remainingImageUploads = Math.max(0, dailyImageLimit - Number(usage[usageField] || 0));
    let acceptedImageCount = 0;
    for (const file of selectedFiles) {
      if (!file || typeof file !== 'object') { skippedItems = true; skippedByUnsupportedType = true; continue; }
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (currentKeys.has(key)) { skippedItems = true; continue; }
      if (next.length >= MAX_IMAGE_ATTACHMENTS) { skippedItems = true; continue; }
      const isImage = isImageAttachment(file);
      const maxSize = isImage ? MAX_IMAGE_ATTACHMENT_SIZE_BYTES : MAX_FILE_ATTACHMENT_SIZE_BYTES;
      if (Number(file.size || 0) > maxSize) { skippedItems = true; continue; }
      if (isImage && remainingImageUploads <= 0) { skippedItems = true; skippedByDailyImageLimit = true; continue; }
      const item = { id: `${key}-${Math.random().toString(36).slice(2, 8)}`, key, name: file.name, size: Number(file.size || 0), mimeType: String(file.type || '').toLowerCase() || 'application/octet-stream', kind: isImage ? 'image' : 'file', textContent: '', imageDataUrl: '' };
      if (isImage) {
        try { item.imageDataUrl = await readFileAsDataUrl(file); acceptedImageCount += 1; remainingImageUploads -= 1; }
        catch { skippedItems = true; skippedByReadError = true; continue; }
      } else { item.textContent = await extractAttachmentText(file); }
      currentKeys.add(key); next.push(item);
    }
    if (next.length === current.length) {
      if (skippedByDailyImageLimit) { setChatError(inGuestMode ? `Guest image limit reached (${GUEST_DAILY_IMAGE_UPLOAD_LIMIT}/day). Create an account to upload up to ${USER_DAILY_IMAGE_UPLOAD_LIMIT} images per day.` : `Daily image limit reached (${USER_DAILY_IMAGE_UPLOAD_LIMIT}/day). Try again tomorrow.`); return; }
      setChatError(`Only supported photos/files up to 10MB are allowed. You can attach up to ${MAX_IMAGE_ATTACHMENTS} items.`); return;
    }
    setAttachedImages(next);
    if (acceptedImageCount > 0) { const nextUsage = { ...usage, [usageField]: Number(usage[usageField] || 0) + acceptedImageCount }; writeDailyImageUploadUsage(nextUsage); }
    if (skippedItems) {
      const reasons = [];
      if (skippedByDailyImageLimit) { const remainingAfterAdd = Math.max(0, remainingImageUploads); reasons.push(inGuestMode ? `Guest image limit is ${GUEST_DAILY_IMAGE_UPLOAD_LIMIT}/day (${remainingAfterAdd} left today).` : `Daily image limit is ${USER_DAILY_IMAGE_UPLOAD_LIMIT}/day (${remainingAfterAdd} left today).`); }
      if (skippedByUnsupportedType) reasons.push('Unsupported file types were skipped.');
      if (skippedByReadError) reasons.push('Some files could not be read.');
      if (!reasons.length) reasons.push(`Max ${MAX_IMAGE_ATTACHMENTS} attachments allowed.`);
      setChatError(`Some attachments were skipped. ${reasons.join(' ')}`);
    } else { setChatError(''); }
  }, [attachedImages, inGuestMode]);

  const handleUploadImageSelect = useCallback(async (event) => { await addImageAttachments(event.target.files); event.target.value = ''; setComposerAttachmentMenuOpen(false); }, [addImageAttachments]);
  const handleCaptureImageSelect = useCallback(async (event) => { await addImageAttachments(event.target.files); event.target.value = ''; setComposerAttachmentMenuOpen(false); }, [addImageAttachments]);

  const handleComposerPaste = useCallback(async (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const pastedImages = [];
    if (clipboard.items && clipboard.items.length > 0) {
      for (const item of Array.from(clipboard.items)) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (!file) continue;
        const normalizedMime = String(file.type || item.type || '').toLowerCase();
        const isImage = normalizedMime.startsWith('image/') || isImageAttachment(file);
        if (!isImage) continue;
        const extFromMime = normalizedMime.startsWith('image/') ? normalizedMime.slice('image/'.length).split(/[+;]/)[0] : '';
        const fallbackExt = extFromMime || getFileExtension(file.name) || 'png';
        const normalizedExt = String(fallbackExt).replace(/[^a-z0-9]/gi, '') || 'png';
        const normalizedName = typeof file.name === 'string' && file.name.trim() ? file.name : `pasted-image-${Date.now()}-${pastedImages.length + 1}.${normalizedExt}`;
        const normalizedFile = typeof file.name === 'string' && file.name.trim() && String(file.type || '').toLowerCase().startsWith('image/') ? file : new File([file], normalizedName, { type: normalizedMime || 'image/png', lastModified: Date.now() });
        pastedImages.push(normalizedFile);
      }
    }
    if (!pastedImages.length && clipboard.files && clipboard.files.length > 0) {
      for (const file of Array.from(clipboard.files)) {
        if (!file || !isImageAttachment(file)) continue;
        if (String(file.type || '').toLowerCase().startsWith('image/') && file.name) { pastedImages.push(file); continue; }
        const fallbackExt = getFileExtension(file.name) || 'png';
        const normalizedExt = String(fallbackExt).replace(/[^a-z0-9]/gi, '') || 'png';
        const normalizedName = typeof file.name === 'string' && file.name.trim() ? file.name : `pasted-image-${Date.now()}-${pastedImages.length + 1}.${normalizedExt}`;
        pastedImages.push(new File([file], normalizedName, { type: String(file.type || '').toLowerCase() || 'image/png', lastModified: Date.now() }));
      }
    }
    if (!pastedImages.length) return;
    event.preventDefault();
    await addImageAttachments(pastedImages);
    setComposerAttachmentMenuOpen(false);
  }, [addImageAttachments]);

  const handleOpenUploadImagePicker = useCallback(() => { setComposerAttachmentMenuOpen(false); if (uploadImageInputRef.current) uploadImageInputRef.current.click(); }, []);
  const handleOpenCaptureImagePicker = useCallback(() => { openCameraCapture(); }, [openCameraCapture]);

  const handleCameraCapturePhoto = useCallback(async () => {
    const video = cameraVideoRef.current;
    if (!video) { setCameraCaptureError('Camera preview is not ready yet.'); return; }
    const width = video.videoWidth || 1280, height = video.videoHeight || 720;
    if (!width || !height) { setCameraCaptureError('Unable to capture image right now. Please try again.'); return; }
    setCameraCaptureBusy(true); setCameraCaptureError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('camera-canvas-context-failed');
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => { canvas.toBlob((result) => { if (result) { resolve(result); return; } reject(new Error('camera-blob-capture-failed')); }, 'image/jpeg', 0.92); });
      const capturedFile = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      await addImageAttachments([capturedFile]);
      closeCameraCapture();
    } catch { setCameraCaptureError('Unable to capture image. Please try again.'); }
    finally { setCameraCaptureBusy(false); }
  }, [addImageAttachments, closeCameraCapture]);

  const handleRemoveAttachedImage = useCallback((attachmentId) => { setAttachedImages((prev) => prev.filter((item) => item.id !== attachmentId)); }, []);

  const handleSendMessage = useCallback(async () => {
    const trimmedDraft = draft.trim();
    const attachmentCount = attachedImages.length;
    const attachmentLabel = attachmentCount ? `📎 ${attachmentCount}` : '';
    const text = [trimmedDraft, attachmentLabel].filter(Boolean).join('\n\n');
    const requestAttachments = attachedImages.map((item) => ({ name: item.name, mime_type: item.mimeType || '', size: Number(item.size || 0), text_content: item.kind === 'file' ? item.textContent || '' : '', image_data_url: item.kind === 'image' ? item.imageDataUrl || '' : '' }));
    if (!text || sending || (!token && !inGuestMode)) return;
    const temporaryId = `pending-${Date.now()}`;
    const nowIso = new Date().toISOString();
    setMessages((prev) => [...prev, { id: temporaryId, role: 'user', text, session_id: activeSessionId || '', mode: normalizeChatMode(activeMode), created_at: nowIso }]);
    window.requestAnimationFrame(() => { scrollChatToBottom('smooth'); });
    setDraft(''); setAttachedImages([]); setComposerAttachmentMenuOpen(false);
    setSending(true); setChatError('');
    const requestSequence = sendSequenceRef.current + 1;
    sendSequenceRef.current = requestSequence;
    const requestConversationVersion = conversationResetRef.current;
    try {
      const languageProbe = trimmedDraft || text;
      const languageVariant = resolveSpeechVariant(languageProbe, chatLanguage);
      const language = languageVariant === 'ur' ? 'ur' : 'en';
      let profilePayload = undefined;
      const personalizationPayload = normalizePersonalization(effectivePersonalization);
      personalizationPayload.recent_chat_summaries = inGuestMode && personalizationPayload.allow_memory && personalizationPayload.allow_chat_reference ? summarizeMessagesForMemory(sortedMessages, 8) : [];
      if (token) {
        try { const loadedProfile = await loadMedicalProfile(token); if (loadedProfile) profilePayload = { age: loadedProfile.age, gender: loadedProfile.gender, medical_history: loadedProfile.medical_history, allergies: loadedProfile.allergies, medications: loadedProfile.medications, chronic_conditions: loadedProfile.chronic_conditions }; }
        catch (profileError) { if (!isProfileNotFoundError(profileError)) throw profileError; }
      }
      const result = await api.chat({
        message: text,
        session_id: activeSessionId || undefined,
        guest_device_id: inGuestMode ? guestDeviceId : undefined,
        language,
        mode: normalizeChatMode(activeMode),
        attachments: requestAttachments,
        profile: profilePayload,
        personalization: personalizationPayload,
      }, token);
      if (requestSequence !== sendSequenceRef.current || requestConversationVersion !== conversationResetRef.current) return;
      const currentId = result.session_id;
      if (inGuestMode) {
        if (currentId) setActiveSessionId(currentId);
        setMessages((prev) => [...prev, { id: result.message_id || `assistant-${Date.now()}`, role: 'assistant', text: result.response || '', structured: result.structured || null, session_id: currentId || activeSessionId || '', emergency: Boolean(result.emergency), language: result.language || language, mode: result.mode || normalizeChatMode(activeMode), created_at: new Date().toISOString() }]);
        window.requestAnimationFrame(() => { scrollChatToBottom('smooth'); });
      } else {
        setActiveSessionId(currentId);
        await refreshSessions(currentId);
        await loadHistory(currentId);
      }
    } catch (error) {
      if (requestSequence !== sendSequenceRef.current || requestConversationVersion !== conversationResetRef.current) return;
      setMessages((prev) => prev.map((message) => (message.id === temporaryId ? { ...message, failed: true } : message)));
      setChatError(error.message);
    } finally { if (requestSequence === sendSequenceRef.current) setSending(false); }
  }, [activeMode, activeSessionId, attachedImages, chatLanguage, draft, guestDeviceId, inGuestMode, loadHistory, loadMedicalProfile, effectivePersonalization, refreshSessions, sending, scrollChatToBottom, sortedMessages, token]);

  const copyShareLink = useCallback(async () => {
    if (inGuestMode) { setShareError('Sign in to create shareable links.'); return; }
    if (!activeSessionId || !token) { setShareError('Start or select a conversation first.'); return; }
    setShareBusy(true); setShareError('');
    try { const payload = await api.createShare(activeSessionId, token); await navigator.clipboard.writeText(payload.share_url); setShareMenuOpen(false); }
    catch (error) { setShareError(error.message); }
    finally { setShareBusy(false); }
  }, [activeSessionId, inGuestMode, token]);

  const copyChatText = useCallback(async () => {
    if (!sortedMessages.length) { setShareError('No messages available to copy.'); return; }
    setShareError('');
    try {
      const text = sortedMessages.map((message) => `${message.role === 'user' ? 'You' : 'Assistant'}: ${normalizeMessageText(message)}`).join('\n\n');
      await navigator.clipboard.writeText(text); setShareMenuOpen(false);
    } catch { setShareError('Clipboard copy failed.'); }
  }, [sortedMessages]);

  const copyMessageText = useCallback(async (message) => {
    const content = String(normalizeMessageText(message) || '').trim();
    if (!content) return;
    try { await navigator.clipboard.writeText(content); setChatError(''); }
    catch { setChatError('Clipboard copy failed.'); }
  }, []);

  const editUserMessage = useCallback((message) => {
    const content = String(normalizeMessageText(message) || '').trim();
    if (!content) return;
    setDraft(content); setChatError('');
    if (textAreaRef.current) {
      textAreaRef.current.focus();
      const cursor = content.length;
      if (typeof textAreaRef.current.setSelectionRange === 'function') textAreaRef.current.setSelectionRange(cursor, cursor);
    }
  }, []);

  if (shareRouteId) return <SharedConversationPage shareId={shareRouteId} />;

  if (!authenticated && !inGuestMode) {
    return (
      <>
        <AuthCard
          mode={authMode} busy={authBusy} error={authError} info={authInfo} initialEmail={authLastEmail}
          showResendVerification={showResendVerification} resendBusy={resendBusy}
          onModeChange={handleAuthModeChange} onEmailLogin={handleEmailLogin} onEmailSignup={handleEmailSignup}
          onRequestSignupOtp={handleRequestSignupOtp}
          onRequestPasswordReset={handleRequestPasswordReset} onResetPassword={handleResetPassword}
          onGoogleLogin={handleGoogleLogin} onResendVerification={handleResendVerification}
          onContinueAsGuest={handleContinueAsGuest}
        />
        {showLoginDesktopPopup && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center sm:p-4">
            <button
              type="button"
              onClick={dismissLoginDesktopPopup}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
              aria-label="Close desktop recommendation"
            />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-cyan-300/25 bg-slate-900/95 p-4 shadow-chat sm:p-5">
              <p className="text-xs uppercase tracking-wider text-cyan-200/90">Recommended</p>
              <div className="mt-2 flex items-start gap-3">
                <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-500/10 text-cyan-200">
                  <Monitor size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-white">Use Desktop site for a better experience</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    On Android and iPhone browsers, opening this app in Desktop site mode gives a more stable layout and better camera controls.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={dismissLoginDesktopPopup}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // On real mobile devices using desktop site mode, use a narrower sidebar
  // so it doesn't eat too much of the small screen.
  const effectiveSidebarOpenWidth = (!isMobileLayout && isRealMobileDevice())
    ? MOBILE_DESKTOP_SIDEBAR_WIDTH
    : sidebarWidth;
  const inlineSidebarWidth = isSidebarOpen ? effectiveSidebarOpenWidth : SIDEBAR_COLLAPSED_WIDTH;
  const overlaySidebarWidth = `min(${SIDEBAR_OPEN_WIDTH}px, 85vw)`;
  const mainContentOffset = isMobileLayout ? 0 : inlineSidebarWidth;
  const ActiveModeIcon = activeModeConfig.icon;
  const isEmptyChatState = !loadingHistory && !sortedMessages.length && activeMode === 'chat';
  const typingIndicatorDotColor = '#a7f3d0';
  const typingIndicatorLogoIcon = '#a7f3d0';
  const typingIndicatorLogoGlow = 'drop-shadow(0 2px 6px rgba(16,185,129,0.35))';

  return (
    <div className={`app-shell relative flex min-h-0 flex-col ${isRealMobileUser ? 'overflow-auto' : 'overflow-hidden'} bg-slatebg text-slate-100`}>
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
        .dr-amna-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; animation: drAmnaTyping 1.2s ease-in-out infinite; }
        .dr-amna-dot:nth-child(2) { animation-delay: 0.18s; }
        .dr-amna-dot:nth-child(3) { animation-delay: 0.36s; }
      `}</style>
      <MedicalBackground opacity={0.15} />

      <div className={`relative z-10 flex min-h-0 flex-1 ${isRealMobileUser ? 'overflow-auto' : 'overflow-hidden'}`}>
        {/* Mobile overlay backdrop */}
        {isMobileLayout && isSidebarOpen && (
          <button
            type="button"
            onClick={closeSidebar}
            className="mobile-overlay-backdrop absolute inset-0 z-30"
            aria-label="Close sidebar overlay"
          />
        )}

        {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
        <aside
          className={`sidebar-shell group fixed left-0 top-0 z-40 h-full border-r border-white/10 bg-slate-950/90 backdrop-blur transition-[width,transform] duration-300 ${
            isMobileLayout
              ? isSidebarOpen
                ? 'translate-x-0 shadow-2xl'
                : '-translate-x-full'
              : 'translate-x-0'
          }`}
          onClick={handleSidebarSurfaceClick}
          style={{ width: isMobileLayout ? overlaySidebarWidth : `${inlineSidebarWidth}px` }}
        >
          <div className="flex h-full flex-col">
            {/* Sidebar header */}
            <div className={isSidebarOpen ? (isMobileLayout ? 'p-4' : 'p-3') : 'flex justify-center px-2 py-3'}>
              {!isSidebarOpen && (
                <div className="w-full text-center">
                  <div className="flex flex-col items-center gap-2">
                    <button type="button" onClick={toggleSidebar}
                      className="pd-stethoscope-emerald mobile-touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/30 bg-emerald-300/15 text-emerald-200 hover:bg-emerald-300/20 hover:text-emerald-100"
                      aria-label="Open sidebar" title="Open sidebar"
                    ><Stethoscope size={18} /></button>
                    <button type="button" onClick={handleNewChat}
                      className="mobile-touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
                      aria-label="New chat" title="New chat"
                    ><Plus size={17} /></button>
                    <button type="button" onClick={() => { openSidebar(); setSearchChatsOpen(true); }}
                      className="mobile-touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
                      aria-label="Search chats" title="Search chats"
                    ><Search size={17} /></button>
                  </div>
                </div>
              )}

              {isSidebarOpen && (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="sidebar-logo-box pd-stethoscope-cyan inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-cyan-200">
                        <Stethoscope size={16} />
                      </div>
                      <p className="pd-logo-text truncate text-sm font-semibold text-slate-100">Personal Doctor AI</p>
                    </div>
                    <button type="button" onClick={toggleSidebar}
                      className="sidebar-logo-box mobile-touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10 hover:text-white"
                      aria-label="Collapse sidebar"
                    ><Menu size={16} /></button>
                  </div>

                  <div className="space-y-1">
                    <button type="button" onClick={handleNewChat}
                      className="mobile-touch-target flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-base text-slate-100 hover:bg-white/10"
                    ><Plus size={18} />New chat</button>
                    <button type="button" onClick={handleToggleSearchChats}
                      className="mobile-touch-target flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-base text-slate-100 hover:bg-white/10"
                    ><Search size={18} />Search chats</button>

                    <div ref={modeMenuRef} className="relative" data-mode-menu>
                      <button type="button" onClick={() => setModeMenuOpen((prev) => !prev)}
                        className={`mobile-touch-target flex w-full items-center justify-between gap-3 rounded-xl border px-2.5 py-2 text-left text-sm transition ${activeModeConfig.optionClass}`}
                        aria-label="Select mode"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${activeModeConfig.iconBoxClass}`}>
                            <ActiveModeIcon size={15} />
                          </span>
                          <span className="truncate font-semibold">{activeModeConfig.label}</span>
                        </span>
                        <ChevronDown size={15} className={`shrink-0 transition-transform duration-200 ${modeMenuOpen ? 'rotate-180' : 'rotate-0'}`} />
                      </button>
                      <div className={`absolute left-0 right-0 z-30 mt-2 origin-top rounded-2xl border border-white/15 bg-slate-900/95 p-2 shadow-chat transition-all duration-200 ${modeMenuOpen ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-95 opacity-0'}`}>
                        <div className="space-y-2">
                          {modeOptions.map((mode) => {
                            const ModeIcon = mode.icon;
                            const isActive = mode.id === activeMode;
                            return (
                              <button key={mode.id} type="button" onClick={() => handleModeSelection(mode.id)}
                                className={`mobile-touch-target flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold tracking-wide transition ${isActive ? mode.optionActiveClass : mode.optionClass}`}
                              >
                                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${mode.iconBoxClass}`}><ModeIcon size={15} /></span>
                                <span>{mode.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {searchChatsOpen && (
                      <input type="text" value={chatSearch} onChange={(e) => setChatSearch(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                        placeholder={ui.searchConversations}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sessions list */}
            {isSidebarOpen && (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
                {!inGuestMode && sessions.length > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
                    <button
                      type="button"
                      onClick={handleToggleSessionSelectionMode}
                      disabled={sessionActionBusyId === '__bulk__'}
                      className="mobile-touch-target inline-flex items-center gap-1.5 rounded-md border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-60"
                    >
                      {sessionSelectionMode ? 'Cancel' : 'Select chats'}
                    </button>
                    {sessionSelectionMode && (
                      <>
                        <button
                          type="button"
                          onClick={handleDeleteSelectedSessions}
                          disabled={sessionActionBusyId === '__bulk__' || selectedSessionIds.length === 0}
                          className="mobile-touch-target inline-flex items-center gap-1.5 rounded-md border border-red-400/40 px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                        >
                          {sessionActionBusyId === '__bulk__' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          Delete selected ({selectedSessionIds.length})
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteAllSessions}
                          disabled={sessionActionBusyId === '__bulk__'}
                          className="mobile-touch-target inline-flex items-center gap-1.5 rounded-md border border-red-500/50 px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                        >
                          Delete all
                        </button>
                      </>
                    )}
                  </div>
                )}
                {filteredSessions.map((session) => (
                  <div key={session.id} className="group relative mb-1">
                    {sessionSelectionMode && !inGuestMode && (
                      <label className="absolute left-2 top-1/2 z-10 -translate-y-1/2">
                        <input
                          type="checkbox"
                          checked={selectedSessionIds.includes(session.id)}
                          onChange={() => handleToggleSessionSelection(session.id)}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4 rounded border-white/20 bg-slate-900 text-red-400"
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (sessionSelectionMode && !inGuestMode) {
                          handleToggleSessionSelection(session.id);
                          return;
                        }
                        handleSelectSession(session.id);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left transition ${
                        sessionSelectionMode && !inGuestMode ? 'pl-9 pr-3' : 'pr-10'
                      } ${
                        selectedSessionIds.includes(session.id)
                          ? 'border border-red-500/40 bg-red-500/15 text-red-100'
                          : activeSessionId === session.id
                            ? 'bg-emerald-500/20 text-emerald-100'
                            : 'hover:bg-white/5'
                      }`}
                    >
                      <p className="truncate text-sm font-medium">{session.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatSessionDate(session.last_message_at || session.created_at)}</p>
                    </button>
                    {!inGuestMode && !sessionSelectionMode && (
                      <div data-session-menu className="absolute right-1 top-1">
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleSessionMenu(session.id); }} disabled={sessionActionBusyId === session.id}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${sessionMenuOpenId === session.id ? 'bg-white/10 text-white opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}
                          aria-label="Conversation options"
                        ><MoreHorizontal size={15} /></button>
                        {sessionMenuOpenId === session.id && (
                          <div data-session-menu className="absolute right-0 top-8 z-30 w-36 rounded-lg border border-white/15 bg-slate-900/95 p-1 shadow-chat">
                            <button type="button" onClick={(e) => { e.stopPropagation(); handlePinSession(session); }} disabled={sessionActionBusyId === session.id} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"><Pin size={14} />{session.is_pinned ? 'Unpin' : 'Pin'}</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleArchiveSession(session); }} disabled={sessionActionBusyId === session.id} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"><Archive size={14} />Archive</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteSession(session); }} disabled={sessionActionBusyId === session.id} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"><Trash2 size={14} />Delete</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {!filteredSessions.length && (
                  <p className="px-2 pt-2 text-sm text-slate-400">{chatSearch.trim() ? ui.noChatsFound : ui.noChatsYet}</p>
                )}
              </div>
            )}

            {/* Feedback button */}
            <div className={isSidebarOpen ? 'px-2 pb-1' : 'px-2 pb-2'}>
              {isSidebarOpen ? (
                <button type="button" onClick={handleOpenReviewModal}
                  className="mobile-touch-target flex w-full items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10"
                ><HelpCircle size={15} />Give Feedback</button>
              ) : (
                <button type="button" onClick={handleOpenReviewModal}
                  className="mobile-touch-target mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                  aria-label="Give Feedback" title="Give Feedback"
                ><HelpCircle size={16} /></button>
              )}
            </div>

            {/* User menu */}
            <div ref={userMenuRef} className={`relative mt-auto border-t border-white/10 ${isSidebarOpen ? 'p-2' : 'p-3'}`}>
              <button type="button"
                onClick={() => { if (!isSidebarOpen) { openSidebar(); return; } setUserMenuOpen((prev) => !prev); }}
                className={isSidebarOpen ? 'mobile-touch-target flex w-full items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/10' : 'mobile-touch-target mx-auto flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10'}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-sm font-semibold text-cyan-100">
                  {getInitials(user)}
                </div>
                {isSidebarOpen && (
                  <>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-medium text-slate-100">{inGuestMode ? ui.guestUser : user?.full_name || 'User'}</p>
                      <p className="truncate text-xs text-slate-400">{inGuestMode ? ui.notSignedIn : user?.email}</p>
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
                  <button type="button" onClick={handleOpenHelpModal} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><HelpCircle size={15} />Help</button>
                  <button type="button" onClick={inGuestMode ? handleExitGuestMode : logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-200 hover:bg-red-500/20"><LogOut size={15} />{inGuestMode ? 'Sign in' : 'Log out'}</button>
                </div>
              )}
            </div>
          </div>

          {/* Resize handle (desktop only) */}
          {isDesktopLayout && isSidebarOpen && (
            <button type="button" onMouseDown={handleSidebarResizeStart}
              className="absolute right-0 top-0 z-50 h-full w-2 cursor-col-resize" aria-label="Resize sidebar"
            >
              <span className={`absolute right-0 top-1/2 h-20 -translate-y-1/2 border-r border-white/20 ${sidebarResizing ? 'opacity-100' : 'opacity-0 transition-opacity group-hover:opacity-100'}`} />
            </button>
          )}
        </aside>

        {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
        <main
          className={`chat-main relative flex min-h-0 min-w-0 flex-1 flex-col ${isRealMobileUser ? 'overflow-x-auto' : 'overflow-x-hidden'} transition-[margin-left] duration-300`}
          style={{ marginLeft: `${mainContentOffset}px` }}
        >
          {/* Header */}
          <header className={`shrink-0 flex items-center justify-between border-b border-white/10 bg-slate-900/80 backdrop-blur ${isMobileLayout ? 'mobile-header px-3 py-2' : 'px-4 py-3'}`}>
            <div className="flex min-w-0 items-center gap-2">
              {isMobileLayout && (
                <button type="button" onClick={toggleSidebar}
                  className="shrink-0 rounded-md p-1 text-slate-300 hover:bg-white/10 hover:text-white"
                  aria-label="Toggle sidebar"
                ><Menu size={16} /></button>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-white">{activeModeConfig.headerTitle}</h1>
                {!isMobileLayout && (
                  <p className="truncate text-xs text-slate-400">
                    {inGuestMode ? ui.guestModeNotice : `${activeModeConfig.headerSubtitle} • ${user?.email || ui.signedIn}`}
                  </p>
                )}
                {isMobileLayout && (
                  <p className="truncate text-xs text-slate-400">{activeModeConfig.headerSubtitle}</p>
                )}
              </div>
            </div>

            {/* Header actions — compact on mobile */}
            <div className={`flex shrink-0 items-center ${isMobileLayout ? 'gap-1' : 'gap-1.5'}`}>
              <button type="button" onClick={handleCycleAppearance}
                className={`inline-flex items-center justify-center border border-white/15 text-slate-200 transition hover:bg-white/10 hover:text-white ${isMobileLayout ? 'h-6 w-6 rounded-full' : 'mobile-touch-target h-8 w-8 rounded-full'}`}
                aria-label={`Switch appearance (${appSettings.appearance})`} title={`Appearance: ${appSettings.appearance}`}
              >
                {appSettings.appearance === 'light' ? <Sun size={isMobileLayout ? 12 : 15} /> : appSettings.appearance === 'dark' ? <Moon size={isMobileLayout ? 12 : 15} /> : <Monitor size={isMobileLayout ? 12 : 15} />}
              </button>

              {/* Language toggle — compact on mobile */}
              <div className={`inline-flex border border-violet-300/25 bg-slate-900/85 ${isMobileLayout ? 'flex-col items-stretch gap-0.5 rounded-lg p-0.5' : 'items-center gap-1 rounded-xl p-1'}`}>
                <button type="button" onClick={() => handleQuickLanguageChange('en')}
                  className={`font-semibold transition ${isMobileLayout ? 'w-full rounded-md px-1.5 py-0 text-[10px] leading-4' : 'rounded-lg px-2.5 py-1 text-xs'} ${appSettings.language === 'en' ? 'bg-violet-500/35 text-violet-50' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
                >EN</button>
                <button type="button" onClick={() => handleQuickLanguageChange('ur')}
                  className={`font-semibold transition ${isMobileLayout ? 'w-full rounded-md px-1.5 py-0 text-[10px] leading-4' : 'rounded-lg px-2.5 py-1 text-xs'} ${appSettings.language === 'ur' ? 'bg-violet-500/35 text-violet-50' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
                >اردو</button>
              </div>

              {/* Share — icon only on mobile */}
              <div ref={shareMenuRef} className="relative">
                <button type="button" onClick={() => setShareMenuOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 text-slate-200 transition hover:text-white ${isMobileLayout ? 'h-6 w-6 justify-center rounded-md' : 'mobile-touch-target rounded-lg px-3 py-1.5 text-sm'}`}
                  title="Share"
                >
                  <Share2 size={isMobileLayout ? 12 : 14} />
                  {!isMobileLayout && <span>Share</span>}
                </button>
                {shareMenuOpen && (
                  <div className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-white/15 bg-slate-900/95 p-1 shadow-chat">
                    <button type="button" onClick={copyShareLink} disabled={shareBusy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-60">
                      {shareBusy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}Copy shareable link
                    </button>
                    <button type="button" onClick={copyChatText} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><Copy size={14} />Copy chat text</button>
                  </div>
                )}
              </div>

              {/* Sign in button (guest) */}
              {inGuestMode && (
                <button type="button" onClick={handleExitGuestMode}
                  className={`inline-flex items-center gap-1 border border-cyan-300/35 text-cyan-100 hover:bg-cyan-500/10 transition ${isMobileLayout ? 'h-6 rounded-md px-1.5 text-[10px]' : 'mobile-touch-target gap-2 rounded-lg px-3 py-1.5 text-sm'}`}
                >Sign in</button>
              )}
            </div>
          </header>

          {/* Chat scroll area */}
          <section
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            className={`chat-scroll-area min-h-0 flex-1 overflow-y-auto ${isRealMobileUser ? 'overflow-x-auto' : 'overflow-x-hidden'} ${
              isMobileLayout
                ? isEmptyChatState ? 'px-3 py-2 pb-32' : 'px-3 py-2 pb-32'
                : isEmptyChatState ? 'px-4 py-3 pb-24' : 'px-4 py-5 pb-32'
            }`}
          >
            <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-4">
              {loadingHistory && (
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Loader2 size={15} className="animate-spin" />{ui.loadingConversation}
                </div>
              )}

              {!sortedMessages.length && !loadingHistory && (
                activeMode === 'chat' ? (
                  <div className="chat-empty-hero relative mx-auto w-full max-w-[920px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/20 px-4 py-6 sm:px-6 sm:py-7">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(167,243,208,0.08),transparent_55%)]" />
                    <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
                      <div className="pd-stethoscope-emerald inline-flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-300/15 text-emerald-200 shadow-[0_10px_24px_rgba(16,185,129,0.16)] sm:h-[68px] sm:w-[68px]">
                        <Stethoscope size={22} strokeWidth={1.8} />
                      </div>
                      <h2 className="mt-3 text-lg font-semibold tracking-tight text-violet-100 sm:mt-4 sm:text-2xl">
                        {ui.heroTitle}
                      </h2>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
                        {ui.heroDescription}
                      </p>
                      <div className="mt-4 flex w-full max-w-[840px] flex-col gap-2 sm:grid sm:grid-cols-3">
                        {chatEmptySuggestions.map((suggestion, index) => (
                          <button key={suggestion} type="button" onClick={() => handleModeSuggestion(suggestion)}
                            className="mobile-touch-target rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white text-left sm:text-center"
                          >
                            <TypewriterText text={suggestion} startDelay={index * 220} speed={22} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-[920px]">{renderModeInterface}</div>
                )
              )}

              {/* Messages */}
              {sortedMessages.map((message) => {
                const messageText = normalizeMessageText(message);
                const isUrduScriptMessage = containsUrdu(messageText);
                const urduScriptClass = isUrduScriptMessage ? 'urdu-left-align' : '';
                return (
                  <div key={message.id}
                    className={`relative inline-flex w-fit flex-col ${
                      message.role === 'user'
                        ? `ml-auto items-end ${isMobileLayout ? 'max-w-[92%]' : 'max-w-[70%]'}`
                        : `${isMobileLayout ? 'mr-auto max-w-[92%]' : 'mr-auto max-w-3xl'} items-start`
                    }`}
                  >
                    <div
                      className={`message-bubble break-words w-fit max-w-full ${
                        isMobileLayout ? 'rounded-2xl px-3 py-2.5' : 'rounded-2xl px-4 py-3'
                      } ${
                        message.role === 'user'
                          ? 'ml-auto inline-block min-h-[52px] bg-emerald-500/15 text-emerald-100'
                          : 'mr-auto border border-white/10 bg-slate-800/80 text-slate-100'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <div className={`message-rich text-sm leading-6 ${urduScriptClass}`.trim()}
                          style={isUrduScriptMessage ? { direction: 'rtl', textAlign: 'right' } : {}}
                          dangerouslySetInnerHTML={{ __html: renderMessageHtml(message) }}
                        />
                      ) : (
                        <p className={`inline-block whitespace-pre-wrap text-sm leading-6 ${urduScriptClass}`.trim()}
                          style={isUrduScriptMessage ? { direction: 'rtl', textAlign: 'right' } : {}}
                        >{messageText}</p>
                      )}
                      {message.failed && (
                        <p className="mt-2 rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200">{ui.failedToSend}</p>
                      )}
                    </div>
                    <div className={`mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400 ${
                      message.role === 'assistant' ? 'self-start' : 'self-end'
                    }`}>
                      <button type="button" onClick={() => copyMessageText(message)}
                        className="rounded-md p-1 transition hover:bg-white/10 hover:text-white"
                        aria-label="Copy" title="Copy"
                      ><Copy size={13} /></button>
                      {message.role === 'user' && (
                        <button type="button" onClick={() => editUserMessage(message)}
                          className="rounded-md p-1 transition hover:bg-white/10 hover:text-white"
                          aria-label="Edit" title="Edit"
                        ><Pencil size={13} /></button>
                      )}
                      {message.role === 'assistant' && (
                        <button type="button" onClick={() => toggleMessageSpeech(message)}
                          className={`rounded-md p-1 transition ${speakingMessageId === message.id ? 'bg-emerald-500/20 text-emerald-200' : 'hover:bg-white/10 hover:text-white'}`}
                          aria-label={speakingMessageId === message.id ? 'Stop speaking' : 'Speak'}
                        >{speakingMessageId === message.id ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>
                      )}
                      <span className={message.role === 'assistant' ? '' : 'ml-1'}>{formatTime(message.created_at)}</span>
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {sending && (
                <div className="mr-auto px-1 py-1 text-slate-100 break-words">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="pd-stethoscope-emerald inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5">
                      <Stethoscope size={20} strokeWidth={1.9} style={{ color: typingIndicatorLogoIcon, filter: typingIndicatorLogoGlow, flexShrink: 0 }} />
                    </div>
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center', paddingTop: '2px' }}>
                      <span className="dr-amna-dot" style={{ background: typingIndicatorDotColor }}></span>
                      <span className="dr-amna-dot" style={{ background: typingIndicatorDotColor }}></span>
                      <span className="dr-amna-dot" style={{ background: typingIndicatorDotColor }}></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={scrollBottomRef} />
            </div>
          </section>

          {/* Scroll to bottom button */}
          {showScrollToLatest && sortedMessages.length > 0 && (
            <div className="pointer-events-none absolute z-30" style={{ left: '50%', transform: 'translateX(-50%)', bottom: isMobileLayout ? 148 : 114 }}>
              <button type="button" onClick={() => scrollChatToBottom('smooth')}
                className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300/40 bg-slate-900/90 text-emerald-200 shadow-[0_8px_20px_rgba(16,185,129,0.25)] transition hover:bg-slate-800 hover:text-emerald-100"
                aria-label="Jump to latest message"
              ><ChevronDown size={18} /></button>
            </div>
          )}

          {/* Dr. Amna character — HIDDEN on mobile */}
          {!isMobileLayout && (
            <div
              className="pointer-events-none absolute z-30"
              style={{ right: isTabletLayout ? 8 : 12, bottom: isTabletLayout ? 50 : 50 }}
              aria-hidden="true"
            >
              <DrAmnaCharacter
                width={isTabletLayout ? 116 : 126}
                style={{ opacity: 0.99, filter: 'drop-shadow(0 8px 14px rgba(2, 6, 23, 0.45)) drop-shadow(0 0 14px rgba(125, 211, 252, 0.28))' }}
              />
            </div>
          )}

          {/* ── COMPOSER ─────────────────────────────────────────────────── */}
          <div
            className={`pointer-events-none inset-x-0 z-20 ${isRealMobileUser && isComposerFocusedMobile ? 'fixed bottom-0' : 'absolute bottom-0'}`}
            style={{
              paddingBottom: isRealMobileUser && isComposerFocusedMobile
                ? `calc(env(safe-area-inset-bottom, 0px) + ${mobileKeyboardOffset}px)`
                : 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            <div className={`composer-shell pointer-events-auto bg-transparent ${isMobileLayout ? 'px-2 py-0.5' : 'px-4 py-1.5'}`}>
              <div className={`mx-auto w-full ${isMobileLayout ? 'max-w-full' : 'max-w-2xl'}`}>
                {(chatError || shareError) && (
                  <div className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {chatError || shareError}
                  </div>
                )}

                {/* Status indicators on mobile — above composer */}
                {isMobileLayout && (dictationState !== 'idle' || speakingMessageId) && (
                  <div className="mb-1.5 flex items-center gap-3 px-1 text-xs">
                    {dictationState === 'listening' && <span className="text-emerald-300/90">{ui.listening}</span>}
                    {dictationState === 'processing' && <span className="text-amber-200/90">{ui.processingSpeech}</span>}
                    {speakingMessageId && <span className="text-cyan-200/90">{ui.speaking}</span>}
                  </div>
                )}

                <div className={`rounded-2xl border border-white/15 bg-slate-900/85 backdrop-blur-sm ${isMobileLayout ? 'p-1' : 'p-1.5'}`}>
                  <input ref={uploadImageInputRef} type="file" accept={ATTACHMENT_PICKER_ACCEPT} multiple onChange={handleUploadImageSelect} className="hidden" />
                  <input ref={captureImageInputRef} type="file" accept="image/*" capture="environment" onChange={handleCaptureImageSelect} className="hidden" />

                  <div className="relative">
                    <textarea
                      ref={textAreaRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onFocus={() => { if (isRealMobileUser) setIsComposerFocusedMobile(true); }}
                      onBlur={() => {
                        if (!isRealMobileUser) return;
                        setIsComposerFocusedMobile(false);
                        setMobileKeyboardOffset(0);
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                      onPaste={handleComposerPaste}
                      placeholder={activeModeConfig.placeholder}
                      rows={1}
                      className={`max-h-20 w-full resize-none bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500 ${isMobileLayout ? 'min-h-[24px] px-1 py-0' : 'min-h-[26px] px-1'} ${attachedImages.length > 0 ? 'pt-10' : ''}`}
                    />
                    {attachedImages.length > 0 && (
                      <div className="pointer-events-auto absolute left-1 top-1 z-10 flex max-w-[90%] flex-wrap justify-start gap-1.5">
                        {attachedImages.map((item) => (
                          <span key={item.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-100">
                            <span className="max-w-[120px] truncate">{item.name}</span>
                            <button type="button" onClick={() => handleRemoveAttachedImage(item.id)}
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-emerald-100/80 hover:bg-emerald-500/20"
                              aria-label={`Remove ${item.name}`}
                            ><X size={12} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Composer action bar */}
                  <div className={`flex items-center justify-between gap-1 ${isMobileLayout ? 'mt-0' : 'mt-1.5'}`}>
                    {/* Left: status (desktop) */}
                    {!isMobileLayout && (
                      <div className="flex min-h-[22px] items-center gap-2 text-xs text-slate-300">
                        {dictationState === 'listening' && <span className="text-emerald-300/90">{ui.listening}</span>}
                        {dictationState === 'processing' && <span className="text-amber-200/90">{ui.processingSpeech}</span>}
                        {speakingMessageId && <span className="text-cyan-200/90">{ui.speaking}</span>}
                      </div>
                    )}
                    {isMobileLayout && <div />}

                    {/* Right: action buttons */}
                    <div ref={composerAttachmentMenuRef} className="relative flex items-center gap-1">
                      {/* Attachment menu */}
                      <button type="button" onClick={() => setComposerAttachmentMenuOpen((prev) => !prev)}
                        className={`mobile-touch-target inline-flex items-center justify-center rounded-xl border border-transparent text-slate-200 transition hover:bg-white/10 hover:text-white ${isMobileLayout ? 'h-7 w-7' : 'h-9 w-9'}`}
                        aria-label="Add photos and files"
                      ><Plus size={16} /></button>
                      <div className={`absolute bottom-12 right-0 z-30 w-52 origin-bottom-right rounded-xl border border-white/15 bg-slate-900/95 p-1.5 shadow-chat transition-all duration-150 ${composerAttachmentMenuOpen ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-1 scale-95 opacity-0'}`}>
                        <button type="button" onClick={handleOpenUploadImagePicker} className="mobile-touch-target flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-white/10"><Upload size={15} />Add Photos and Files</button>
                        <button type="button" onClick={handleOpenCaptureImagePicker} className="mobile-touch-target flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-white/10"><Camera size={15} />Take picture</button>
                      </div>

                      {/* Mic */}
                      <button type="button" onClick={toggleDictation} disabled={!dictationSupported}
                        className={`mobile-touch-target inline-flex items-center justify-center rounded-xl border border-transparent transition ${dictationState === 'listening' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-50 ${isMobileLayout ? 'h-7 w-7' : 'h-9 w-9'}`}
                        title="Dictate" aria-label="Dictate"
                      >{dictationState === 'processing' ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}</button>

                      {/* Send button */}
                      <button type="button" onClick={handleSendMessage} disabled={sending || !canSendMessage}
                        className={`mobile-touch-target inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50 ${isMobileLayout ? 'h-7 w-7 justify-center' : 'px-3 py-2 text-sm gap-2'}`}
                      >
                        {sending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
                        {!isMobileLayout && <span>Send</span>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <footer className={`pointer-events-none bg-transparent text-center text-slate-400/50 ${isMobileLayout ? 'px-2 py-0.5 text-[9px] leading-tight' : 'px-4 py-1.5 text-xs'}`}>
              {ui.footerDisclaimer}
            </footer>
          </div>
        </main>
      </div>

      {/* ── CAMERA CAPTURE MODAL ─────────────────────────────────────────── */}
      {cameraCaptureOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={closeCameraCapture} aria-label="Close camera" />
          <div className={`relative z-10 flex w-full flex-col bg-slate-900/95 shadow-chat ${isMobileLayout ? 'h-[95dvh] rounded-t-2xl border-t border-white/15 p-4 pb-6' : 'h-[92vh] max-w-4xl rounded-2xl border border-white/15 p-4'}`}>
            <h2 className="text-base font-semibold text-white">Take picture</h2>
            <p className="mt-1 text-xs text-slate-300">Capture a photo and attach it to this conversation.</p>
            {cameraCaptureError && <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{cameraCaptureError}</p>}
            <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black">
              <video ref={cameraVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleSwitchCamera}
                disabled={cameraCaptureBusy || !navigator.mediaDevices?.getUserMedia}
                className="mobile-touch-target inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-60"
              >
                {cameraCaptureBusy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                Switch camera
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={closeCameraCapture} className="mobile-touch-target rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">Cancel</button>
                <button type="button" onClick={handleCameraCapturePhoto} disabled={cameraCaptureBusy}
                  className="mobile-touch-target inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
                >{cameraCaptureBusy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}Capture</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HELP MODAL ───────────────────────────────────────────────────── */}
      {helpModalOpen && (
        <div className="absolute inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={handleCloseHelpModal} aria-label="Close help" />
          <div className={`relative z-10 w-full bg-slate-900/95 shadow-chat ${isMobileLayout ? 'max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t border-white/15 p-4 pb-8' : 'max-w-2xl rounded-2xl border border-white/15 p-4 sm:p-5'}`}>
            <p className="text-xs uppercase tracking-wider text-slate-400">{ui.helpLabel}</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{ui.helpTitle}</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-200">
              <section className="rounded-xl border border-white/10 bg-white/5 p-3">
                <h3 className="text-sm font-semibold text-white">{ui.helpHowItWorks}</h3>
                <p className="mt-1 leading-6 text-slate-300">{ui.helpHowItWorksBody}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
                  <li>{ui.helpContext1}</li><li>{ui.helpContext2}</li><li>{ui.helpContext3}</li>
                </ul>
              </section>
              <section className="rounded-xl border border-white/10 bg-white/5 p-3">
                <h3 className="text-sm font-semibold text-white">{ui.helpBestWayTitle}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
                  <li>{ui.helpBest1}</li><li>{ui.helpBest2}</li><li>{ui.helpBest3}</li><li>{ui.helpBest4}</li>
                </ul>
              </section>
              <section className="rounded-xl border border-white/10 bg-white/5 p-3">
                <h3 className="text-sm font-semibold text-white">{ui.helpFeatureTitle}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
                  <li>{ui.helpFeatureChat}</li><li>{ui.helpFeatureDrug}</li><li>{ui.helpFeatureResearch}</li>
                  <li>{ui.helpFeatureWho}</li><li>{ui.helpFeatureVoice}</li><li>{ui.helpFeatureEditCopy}</li>
                  <li>{ui.helpFeatureGuest}</li>
                </ul>
              </section>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={handleCloseHelpModal} className="mobile-touch-target rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── FEEDBACK MODAL ───────────────────────────────────────────────── */}
      {reviewModalOpen && (
        <div className="absolute inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={handleCloseReviewModal} aria-label="Close feedback" />
          <div className={`relative z-10 w-full bg-slate-900/95 shadow-chat ${isMobileLayout ? 'rounded-t-2xl border-t border-white/15 p-4 pb-8' : 'max-w-lg rounded-2xl border border-white/15 p-4 sm:p-5'}`}>
            <p className="text-xs uppercase tracking-wider text-slate-400">{ui.feedbackHeading}</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{ui.feedbackTitle}</h2>
            <form className="mt-4 space-y-3" onSubmit={handleReviewSubmit}>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                  <span>{ui.feedbackRatingLabel}</span>
                  <button type="button" onClick={() => setReviewRating(0)} disabled={reviewSending || reviewRating === 0} className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200 disabled:cursor-default disabled:opacity-40">{ui.feedbackRatingClear}</button>
                </div>
                <div className="flex items-center gap-1.5">
                  {[1,2,3,4,5].map((value) => {
                    const active = value <= reviewRating;
                    return (
                      <button key={`star-${value}`} type="button" onClick={() => setReviewRating(value)} disabled={reviewSending}
                        className={`mobile-touch-target rounded-md border px-2 py-1 text-base leading-none transition ${active ? 'border-amber-300/60 bg-amber-400/15 text-amber-300' : 'border-white/15 bg-slate-950 text-slate-500 hover:text-slate-300'}`}
                        aria-label={`${ui.feedbackRatingLabel} ${value}`} aria-pressed={active}
                      >★</button>
                    );
                  })}
                  <span className="ml-1 text-xs text-slate-400">{ui.feedbackRatingOptional}</span>
                </div>
              </div>
              <div>
                <textarea value={reviewText} onChange={(e) => { setReviewText(e.target.value); if (reviewError) setReviewError(''); if (reviewSuccess) setReviewSuccess(''); }}
                  rows={4} maxLength={2000} placeholder={ui.feedbackPlaceholder}
                  className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                  disabled={reviewSending}
                />
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span>{reviewText.length}/2000</span>
                  <span>{reviewTrimmedLength < 10 ? ui.feedbackMinHint : ui.feedbackLooksGood}</span>
                </div>
              </div>
              {reviewInlineError && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{reviewInlineError}</p>}
              {reviewSuccess && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{ui.feedbackThanks}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={handleCloseReviewModal} disabled={reviewSending} className="mobile-touch-target rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-60">Cancel</button>
                <button type="submit" disabled={reviewSending || reviewTrimmedLength < 10} className="mobile-touch-target inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60">
                  {reviewSending && <Loader2 size={15} className="animate-spin" />}Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SETTINGS MODAL ───────────────────────────────────────────────── */}
      {settingsOpen && (
        <div className="absolute inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={handleCloseSettings} aria-label="Close settings" />
          <div className={`relative z-10 w-full bg-slate-900/95 shadow-chat ${isMobileLayout ? 'max-h-[92vh] rounded-t-2xl border-t border-white/15' : 'max-w-3xl rounded-2xl border border-white/15'}`}>
            <div className={`flex items-center justify-between gap-3 border-b border-white/10 ${isMobileLayout ? 'p-4' : 'p-5'}`}>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">{isUrduUI ? 'ترتیبات' : 'Settings'}</p>
                <h2 className="text-lg font-semibold text-white">{isUrduUI ? 'ترجیحات' : 'Preferences'}</h2>
              </div>
              <button type="button" onClick={handleCloseSettings} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10">Close</button>
            </div>

            {/* Settings tabs — scrollable on mobile */}
            <div className={`border-b border-white/10 ${isMobileLayout ? 'px-4 py-2' : 'px-5 py-3'}`}>
              <div className="flex items-center gap-1 overflow-x-auto">
                {[
                  { id: SETTINGS_TAB_GENERAL, label: 'General' },
                  { id: SETTINGS_TAB_PERSONALIZATION, label: 'Personalization' },
                  { id: SETTINGS_TAB_MEDICAL, label: 'Medical Profile' },
                ].map((tab) => (
                  <button key={tab.id} type="button" onClick={() => setSettingsTab(tab.id)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap ${settingsTab === tab.id ? 'bg-cyan-500/20 text-cyan-100' : 'text-slate-300 hover:bg-white/10 hover:text-slate-100'}`}
                  >{tab.label}</button>
                ))}
              </div>
            </div>

            <div className={`overflow-y-auto ${isMobileLayout ? 'max-h-[calc(92dvh-130px)] p-4' : 'max-h-[78vh] p-5'}`}>
              {settingsTab === SETTINGS_TAB_GENERAL && (
                <>
                  {preferencesError && <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{preferencesError}</p>}
                  {preferencesInfo && <p className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{preferencesInfo}</p>}
                  <form className="space-y-4" onSubmit={handlePreferencesSubmit}>
                    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <h3 className="text-sm font-semibold text-white">{isUrduUI ? 'ظاہری صورت' : 'Appearance'}</h3>
                      <div className="mt-2 grid gap-2 grid-cols-3">
                        {['light','dark','system'].map((a) => (
                          <button key={a} type="button" onClick={() => handlePreferenceFieldChange('appearance', a)}
                            className={`rounded-lg border px-3 py-2 text-sm capitalize transition ${appSettings.appearance === a ? 'border-cyan-300/50 bg-cyan-500/15 text-cyan-100' : 'border-white/15 text-slate-200 hover:bg-white/10'}`}
                          >{a}</button>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <h3 className="text-sm font-semibold text-white">{isUrduUI ? 'زبان' : 'Language'}</h3>
                      <div className="mt-2 grid gap-2 grid-cols-2">
                        {[{value:'en',label:'English'},{value:'ur',label:'Urdu'}].map((lang) => (
                          <button key={lang.value} type="button" onClick={() => handlePreferenceFieldChange('language', lang.value)}
                            className={`rounded-lg border px-3 py-2 text-sm transition ${appSettings.language === lang.value ? 'border-cyan-300/50 bg-cyan-500/15 text-cyan-100' : 'border-white/15 text-slate-200 hover:bg-white/10'}`}
                          >{lang.label}</button>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <h3 className="text-sm font-semibold text-white">{isUrduUI ? 'آواز' : 'Voice'}</h3>
                      <div className="mt-2 space-y-2 text-sm text-slate-200">
                        <p>{isUrduUI ? 'خاتون (ڈیفالٹ)' : 'Female (default)'}</p>
                        <label className="inline-flex items-center gap-2">
                          <input type="checkbox" checked={appSettings.voice_auto_detect} onChange={(e) => handlePreferenceFieldChange('voice_auto_detect', e.target.checked)} className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400" />
                          {isUrduUI ? 'خودکار زبان کی شناخت' : 'Auto language detection'}
                        </label>
                      </div>
                    </section>
                    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <h3 className="text-sm font-semibold text-white">{isUrduUI ? 'اکاؤنٹ' : 'Account'}</h3>
                      <label className="mt-2 block text-sm text-slate-300" htmlFor="settings_display_name">{isUrduUI ? 'ڈسپلے نام' : 'Display name'}</label>
                      <input id="settings_display_name" value={appSettings.display_name} onChange={(e) => handlePreferenceFieldChange('display_name', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                        placeholder={isUrduUI ? 'آپ کا نام' : 'Your name'} maxLength={200}
                      />
                    </section>
                    <div className="flex justify-end">
                      <button type="submit" disabled={preferencesBusy || preferencesSaving} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-950 hover:bg-cyan-400 disabled:opacity-60">
                        {(preferencesBusy || preferencesSaving) && <Loader2 size={15} className="animate-spin" />}Save settings
                      </button>
                    </div>
                  </form>
                </>
              )}

              {settingsTab === SETTINGS_TAB_PERSONALIZATION && (
                <div className="space-y-4">
                  {personalizationError && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{personalizationError}</p>}
                  {personalizationInfo && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{personalizationInfo}</p>}
                  <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">{isUrduUI ? 'جواب کا انداز' : 'Response Style'}</h3>
                    <select value={effectivePersonalization.response_style} onChange={(e) => handlePersonalizationFieldChange('response_style', e.target.value)}
                      className="mt-3 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                      disabled={personalizationBusy || personalizationSaving}
                    >
                      {RESPONSE_STYLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </section>
                  <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">{isUrduUI ? 'حسبِ ضرورت ہدایات' : 'Custom Instructions'}</h3>
                    <textarea id="personalization_instructions" value={effectivePersonalization.custom_instructions} onChange={(e) => handlePersonalizationFieldChange('custom_instructions', e.target.value)}
                      rows={4} maxLength={4000}
                      className="mt-2 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2"
                      placeholder={isUrduUI ? 'مثال: آسان زبان میں وضاحت کریں۔' : 'Example: Explain in simple language.'}
                      disabled={personalizationBusy || personalizationSaving}
                    />
                  </section>
                  <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">{isUrduUI ? 'آپ کے بارے میں' : 'About You'}</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="personalization_nickname" className="mb-1 block text-sm text-slate-300">{isUrduUI ? 'عرفی نام' : 'Nickname'}</label>
                        <input id="personalization_nickname" value={effectivePersonalization.nickname} onChange={(e) => handlePersonalizationFieldChange('nickname', e.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2" placeholder={isUrduUI ? 'آپ کا نام' : 'How should I call you?'} maxLength={120} disabled={personalizationBusy || personalizationSaving} />
                      </div>
                      <div>
                        <label htmlFor="personalization_occupation" className="mb-1 block text-sm text-slate-300">{isUrduUI ? 'پیشہ' : 'Occupation'}</label>
                        <input id="personalization_occupation" value={effectivePersonalization.occupation} onChange={(e) => handlePersonalizationFieldChange('occupation', e.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2" placeholder={isUrduUI ? 'آپ کا پیشہ' : 'Your profession'} maxLength={160} disabled={personalizationBusy || personalizationSaving} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label htmlFor="personalization_about_user" className="mb-1 block text-sm text-slate-300">{isUrduUI ? 'آپ کے بارے میں' : 'About You'}</label>
                      <textarea id="personalization_about_user" value={effectivePersonalization.about_user} onChange={(e) => handlePersonalizationFieldChange('about_user', e.target.value)} rows={3} maxLength={2000} className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2" placeholder={isUrduUI ? 'دلچسپیاں اور ترجیحات۔' : 'Interests and preferences.'} disabled={personalizationBusy || personalizationSaving} />
                    </div>
                  </section>
                  <section className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">{isUrduUI ? 'میموری کنٹرولز' : 'Memory Controls'}</h3>
                    <div className="mt-3 space-y-3">
                      {[
                        { key: 'allow_memory', label: isUrduUI ? 'اسسٹنٹ کو میری ترجیحات یاد رکھنے دیں' : 'Allow assistant to remember my preferences', disabled: false },
                        { key: 'allow_chat_reference', label: isUrduUI ? 'اسسٹنٹ کو پچھلی چیٹس کا حوالہ دینے دیں' : 'Allow assistant to reference previous chats', disabled: !effectivePersonalization.allow_memory },
                      ].map((toggle) => (
                        <label key={toggle.key} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-200">{toggle.label}</span>
                          <button type="button" onClick={() => handlePersonalizationFieldChange(toggle.key, !effectivePersonalization[toggle.key])}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${effectivePersonalization[toggle.key] ? 'bg-cyan-500' : 'bg-slate-700'} ${toggle.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                            aria-pressed={effectivePersonalization[toggle.key]} disabled={personalizationBusy || personalizationSaving || toggle.disabled}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${effectivePersonalization[toggle.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </label>
                      ))}
                    </div>
                    {(personalizationBusy || personalizationSaving) && (
                      <p className="mt-3 inline-flex items-center gap-2 text-xs text-cyan-200">
                        <Loader2 size={14} className="animate-spin" />{isUrduUI ? 'محفوظ کیا جا رہا ہے...' : 'Saving...'}
                      </p>
                    )}
                  </section>
                </div>
              )}

              {settingsTab === SETTINGS_TAB_MEDICAL && (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400">{isUrduUI ? 'میڈیکل پروفائل' : 'Medical Profile'}</p>
                    <h3 className="mt-1 text-base font-semibold text-white">{isUrduUI ? 'صحت کا سیاق' : 'Health context'}</h3>
                  </div>
                  {profileError && <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{profileError}</p>}
                  {profileInfo && <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{profileInfo}</p>}
                  {token ? (
                    <form className="mt-3 space-y-3" onSubmit={handleProfileSubmit}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm text-slate-300" htmlFor="profile_age">{isUrduUI ? 'عمر' : 'Age'}</label>
                          <input id="profile_age" type="number" min={0} max={130} value={profileForm.age} onChange={(e) => handleProfileFieldChange('age', e.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2" placeholder={isUrduUI ? 'مثال: 29' : 'e.g. 29'} disabled={profileBusy || profileSaving} />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-slate-300" htmlFor="profile_gender">{isUrduUI ? 'جنس' : 'Gender'}</label>
                          <select id="profile_gender" value={profileForm.gender} onChange={(e) => handleProfileFieldChange('gender', e.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2" disabled={profileBusy || profileSaving}>
                            <option value="">{isUrduUI ? 'متعین نہیں' : 'Not specified'}</option>
                            <option value="male">{isUrduUI ? 'مرد' : 'Male'}</option>
                            <option value="female">{isUrduUI ? 'خاتون' : 'Female'}</option>
                            <option value="other">{isUrduUI ? 'دیگر' : 'Other'}</option>
                            <option value="prefer_not_to_say">{isUrduUI ? 'بتانا نہیں چاہتے' : 'Prefer not to say'}</option>
                          </select>
                        </div>
                      </div>
                      {[
                        { id: 'profile_medical_history', key: 'medical_history', label: isUrduUI ? 'طبی سابقہ' : 'Medical History', placeholder: isUrduUI ? 'گزشتہ طبی تاریخ' : 'Past medical history', rows: 3 },
                        { id: 'profile_allergies', key: 'allergies', label: isUrduUI ? 'الرجیز' : 'Allergies', placeholder: isUrduUI ? 'معروف الرجیز' : 'Known allergies', rows: 2 },
                        { id: 'profile_medications', key: 'medications', label: isUrduUI ? 'ادویات' : 'Medications', placeholder: isUrduUI ? 'موجودہ ادویات' : 'Current medications', rows: 2 },
                        { id: 'profile_chronic_conditions', key: 'chronic_conditions', label: isUrduUI ? 'دائمی بیماریاں' : 'Chronic Conditions', placeholder: isUrduUI ? 'دائمی بیماریاں' : 'Chronic conditions', rows: 2 },
                      ].map((field) => (
                        <div key={field.id}>
                          <label className="mb-1 block text-sm text-slate-300" htmlFor={field.id}>{field.label}</label>
                          <textarea id={field.id} value={profileForm[field.key]} onChange={(e) => handleProfileFieldChange(field.key, e.target.value)} rows={field.rows} className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-2" placeholder={field.placeholder} disabled={profileBusy || profileSaving} />
                        </div>
                      ))}
                      <div className="flex justify-end">
                        <button type="submit" disabled={profileBusy || profileSaving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60">
                          {(profileBusy || profileSaving) && <Loader2 size={15} className="animate-spin" />}Save profile
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">{isUrduUI ? 'میڈیکل پروفائل منیج کرنے کے لیے سائن اِن کریں۔' : 'Sign in to manage medical profile.'}</p>
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
