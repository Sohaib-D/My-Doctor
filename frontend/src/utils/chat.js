export function containsUrdu(text) {
  return /[\u0600-\u06FF]/.test(text || '');
}

export function decodeJwtExpiryMs(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return null;
    }
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = Number(decoded?.exp || 0);
    if (!exp) {
      return null;
    }
    return exp * 1000;
  } catch {
    return null;
  }
}

export function parseStoredUser() {
  const raw = localStorage.getItem('pd_user');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function formatTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatSessionDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function normalizeMessageText(message) {
  if (message?.structured) {
    const sections = [
      `Symptoms: ${message.structured.symptoms}`,
      `Possible Causes: ${message.structured.possible_causes}`,
      `Advice: ${message.structured.advice}`,
      `Urgency: ${message.structured.urgency_level}`,
      `When to See Doctor: ${message.structured.when_to_see_doctor}`,
    ];
    return sections.join('\n');
  }
  return message?.text || '';
}

export function getPasswordStrength(password) {
  const hasLength = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const score = [hasLength, hasLower, hasUpper, hasDigit].filter(Boolean).length;

  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score === 2) return { score, label: 'Fair', color: 'bg-amber-500' };
  if (score === 3) return { score, label: 'Good', color: 'bg-lime-500' };
  return { score, label: 'Strong', color: 'bg-emerald-500' };
}

export function getInitials(user) {
  if (!user?.full_name && !user?.email) {
    return 'U';
  }
  const source = (user.full_name || user.email || '').trim();
  if (!source) {
    return 'U';
  }
  const segments = source.split(/\s+/).slice(0, 2);
  return segments.map((segment) => segment[0]?.toUpperCase() || '').join('') || 'U';
}

export function selectFemaleVoice(voices, lang) {
  const languagePrefix = lang.toLowerCase().startsWith('ur') ? 'ur' : 'en';
  const matching = voices.filter((voice) => voice.lang?.toLowerCase().startsWith(languagePrefix));
  const femaleHints = ['female', 'woman', 'zira', 'aria', 'sara', 'emma', 'heera', 'nida'];
  const female = matching.find((voice) =>
    femaleHints.some((hint) => voice.name.toLowerCase().includes(hint))
  );
  return female || matching[0] || voices[0] || null;
}

