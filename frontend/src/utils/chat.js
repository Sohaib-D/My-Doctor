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

const STRUCTURED_PLACEHOLDER_VALUES = new Set([
  'Not specified',
  'Needs clinical evaluation',
  'Consult a licensed doctor for personalized care.',
  'Seek medical care if symptoms worsen or persist.',
]);

function normalizeTextValue(value) {
  return String(value || '').trim();
}

function isPlaceholderValue(value) {
  return STRUCTURED_PLACEHOLDER_VALUES.has(normalizeTextValue(value));
}

function buildStructuredFallbackText(structured) {
  if (!structured || typeof structured !== 'object') {
    return '';
  }

  const finalResponse = normalizeTextValue(structured.final_response);
  if (finalResponse) {
    return finalResponse;
  }

  const chunks = [];
  const advice = normalizeTextValue(structured.advice);
  const whenToSeeDoctor = normalizeTextValue(structured.when_to_see_doctor);
  const possibleCauses = normalizeTextValue(structured.possible_causes);

  if (advice && !isPlaceholderValue(advice)) {
    chunks.push(advice);
  }
  if (whenToSeeDoctor && !isPlaceholderValue(whenToSeeDoctor)) {
    chunks.push(whenToSeeDoctor);
  }
  if (possibleCauses && !isPlaceholderValue(possibleCauses)) {
    chunks.push(possibleCauses);
  }

  return chunks.join('\n\n');
}

function buildModePromptFallback(mode) {
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'drug') {
    return '💊 Please share the exact medicine name (generic or brand) so I can provide accurate **drug information**.';
  }
  if (normalized === 'research') {
    return '📋 Please share the study topic, abstract, or link so I can provide an **evidence-focused summary**.';
  }
  if (normalized === 'who') {
    return '🌍 Please share indicator, country/region, and year range so I can return a proper **WHO-style stats table**.';
  }
  return '🩺 Please share your **main symptom**, duration, and severity so I can guide you clearly.';
}

export function normalizeMessageText(message) {
  const directText = normalizeTextValue(message?.text);
  if (directText) {
    return directText;
  }

  const structuredFallback = buildStructuredFallbackText(message?.structured);
  if (structuredFallback) {
    return structuredFallback;
  }

  return buildModePromptFallback(message?.mode);
}

// ─── HTML escaping ─────────────────────────────────────────────────────────

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Inline rich text: bold + code — with cyan highlight for bold ──────────

function applyInlineStyles(str) {
  let s = escapeHtml(str);
  s = s.replace(/<span style="color:[^>]+">([^<]+)<\/span>/g, '$1');
  // **bold** → warm teal highlight
  s = s.replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="color:#ffffff;font-weight:700">$1</strong>'
  );
  // __bold__ alternative
  s = s.replace(
    /__(.+?)__/g,
    '<strong style="color:#ffffff;font-weight:700">$1</strong>'
  );
  // `code`
  s = s.replace(
    /`([^`]+?)`/g,
    '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:0.88em;color:#ffffff">$1</code>'
  );
  return s;
}

// ─── Markdown preprocessor ─────────────────────────────────────────────────

/**
 * preprocessMarkdown
 *
 * Normalises a potentially single-line markdown string (as returned by Groq JSON)
 * into properly newline-separated markdown that the line-by-line parser can handle.
 *
 * Groq often returns final_response as a flat JSON string with no real \n characters,
 * so patterns like "## Heading - item1, - item2" need splitting before parsing.
 */
function preprocessMarkdown(raw) {
  let t = raw.replace(/\r\n/g, '\n');

  // 1. Ensure every ## heading starts on its own line
  //    "text. ## Heading" → "text.\n\n## Heading"
  t = t.replace(/([^\n])\s*(#{1,4}\s+)/g, '$1\n\n$2');

  // 2. Split inline bullets after heading
  t = t.replace(/(#{1,4}[^\n]+?)\s{1,3}-\s+/gm, '$1\n- ');

  // 2. Split bullets that follow a period, colon, or Devanagari danda
  //    "Heading: - item" → "Heading:\n- item"
  //    "sentence. - item" → "sentence.\n- item"
  t = t.replace(/([.:\u0964])\s*[-•]\s+/g, '$1\n- ');

  // 3. Split comma-separated bullets: ", - item" → "\n- item"
  //    This is the key fix — Groq sometimes writes "item1, - item2, - item3"
  t = t.replace(/,\s*[-•]\s+/g, '\n- ');

  // 4. Consecutive inline bullets not yet separated: "word. - next" → "word.\n- next"
  t = t.replace(/([a-zA-Z\u0600-\u06FF\u0900-\u097F]\.)\s*[-•]\s+/g, '$1\n- ');

  // 5. Remove trailing colon from heading lines (cleaner look)
  //    "## 🔬 Section:\n- item" → "## 🔬 Section\n- item"
  t = t.replace(/(^#{1,4}[^\n]+):\n/gm, '$1\n');

  // 6. Collapse 3+ newlines → 2
  t = t.replace(/\n{3,}/g, '\n\n');

  // 8. Ensure at least one blank line before bullets for spacing
  t = t.replace(/(^- )/gm, '\n$1');

  return t;
}

// ─── Main render function ──────────────────────────────────────────────────

/**
 * renderMessageHtml
 *
 * Converts markdown-formatted assistant text into richly styled HTML.
 * Uses INLINE STYLES throughout so it works regardless of what CSS is present.
 *   • ## Headings  → sky-blue, left-accent border  (NO uppercase — preserves original casing)
 *   • **bold**     → cyan (#a5f3fc), bold weight
 *   • - bullets    → chevron-prefixed list items, each on its own line
 *   • Plain text   → light slate color
 */
export function renderMessageHtml(message) {
  const rawText = normalizeMessageText(message);
  if (!rawText) return '';

  const processed = preprocessMarkdown(rawText);
  const lines = processed.split('\n');
  const parts = [];
  let pendingParaLines = [];
  let inUl = false;
  let inOl = false;

  const S = {
    h1: 'display:block;font-size:14px;font-weight:700;color:#ffffff;margin:18px 0 6px 0;line-height:1.5',
    h2: 'display:block;font-size:13.5px;font-weight:700;color:#ffffff;margin:16px 0 6px 0;line-height:1.5',
    h3: 'display:block;font-size:13px;font-weight:600;color:#ffffff;margin:14px 0 5px 0;line-height:1.5',
    h4: 'display:block;font-size:12.5px;font-weight:600;color:#ffffff;margin:12px 0 4px 0',
    ul: 'margin:6px 0 12px 0;padding:0;list-style:none',
    ol: 'margin:6px 0 12px 0;padding-left:18px',
    li: 'margin-bottom:6px;color:#ffffff;line-height:1.7',
    p:  'margin:6px 0;color:#ffffff;line-height:1.75',
    hr: 'border:none;border-top:1px solid rgba(255,255,255,0.15);margin:14px 0',
  };

  const flushPara = () => {
    if (!pendingParaLines.length) return;
    parts.push(`<div style="${S.p}">${pendingParaLines.join('<br/>')}</div>`);
    pendingParaLines = [];
  };

  const closeLists = () => {
    if (inUl) { parts.push('</ul>'); inUl = false; }
    if (inOl) { parts.push('</ol>'); inOl = false; }
  };

  for (const line of lines) {
    const t = line.trim();

    if (!t) {
      flushPara();
      closeLists();
      continue;
    }

    if (/^---+$/.test(t)) {
      flushPara();
      closeLists();
      parts.push(`<hr style="${S.hr}"/>`);
      continue;
    }

    const hm = t.match(/^(#{1,4})\s+(.+)$/);
    if (hm) {
      flushPara();
      closeLists();
      const lvl = hm[1].length;
      const htxt = applyInlineStyles(hm[2].trim());
      const hs = lvl === 1 ? S.h1 : lvl === 2 ? S.h2 : lvl === 3 ? S.h3 : S.h4;
      parts.push(`<div style="${hs}">${htxt}</div>`);
      continue;
    }

    const lh = t.match(/^([A-Za-z\u0600-\u06FF][^:]{1,48}):$/);
    if (lh) {
      flushPara();
      closeLists();
      parts.push(`<div style="${S.h4}">${applyInlineStyles(lh[1])}:</div>`);
      continue;
    }

    const um = t.match(/^[-*•]\s+(.+)$/);
    if (um) {
      flushPara();
      if (inOl) { parts.push('</ol>'); inOl = false; }
      if (!inUl) { parts.push(`<ul style="${S.ul}">`); inUl = true; }
      parts.push(
        `<li style="${S.li}">` +
        `<span style="color:#ffffff;margin-right:6px;font-size:12px">›</span>` +
        `${applyInlineStyles(um[1].trim())}` +
        `</li>`
      );
      continue;
    }

    const om = t.match(/^\d+[\.)]\s+(.+)$/);
    if (om) {
      flushPara();
      if (inUl) { parts.push('</ul>'); inUl = false; }
      if (!inOl) { parts.push(`<ol style="${S.ol}">`); inOl = true; }
      parts.push(`<li style="${S.li}">${applyInlineStyles(om[1].trim())}</li>`);
      continue;
    }

    closeLists();
    pendingParaLines.push(applyInlineStyles(t));
  }

  flushPara();
  closeLists();
  return parts.join('');
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

function isLikelyRomanUrduText(text) {
  const value = String(text || '').toLowerCase();
  if (!value || containsUrdu(value)) {
    return false;
  }
  const tokens = value.match(/[a-z']+/g) || [];
  if (!tokens.length) {
    return false;
  }
  const markers = new Set([
    'aap', 'ap', 'mujhe', 'mujhy', 'kya', 'kia', 'hai', 'hain', 'ho', 'hoon',
    'dard', 'bukhar', 'khansi', 'saans', 'tabiyat', 'thakan', 'kamzori', 'dawai',
    'ilaaj', 'masla', 'pet', 'pait', 'sar', 'sir', 'behtar', 'theek', 'aur',
  ]);
  const hits = tokens.reduce((count, token) => (markers.has(token) ? count + 1 : count), 0);
  return hits >= 2;
}

export function selectFemaleVoice(voices, lang, text = '') {
  const list = Array.isArray(voices) ? voices : [];
  if (!list.length) {
    return null;
  }

  const normalizedLang = String(lang || 'en-US').toLowerCase();
  const wantsUrduFamily = normalizedLang.startsWith('ur') || isLikelyRomanUrduText(text);
  const femaleHints = ['female', 'woman', 'zira', 'aria', 'sara', 'emma', 'heera', 'nida', 'neural'];
  const southAsianHints = ['pakistan', 'pakistani', 'urdu', 'hindi', 'india', 'indian', 'asad', 'uzma'];

  const femaleVoices = list.filter((voice) =>
    femaleHints.some((hint) => String(voice.name || '').toLowerCase().includes(hint))
  );

  const isPakistaniUrduVoice = (voice) => {
    const name = String(voice.name || '').toLowerCase();
    const voiceLang = String(voice.lang || '').toLowerCase();
    return voiceLang.startsWith('ur-pk') || (voiceLang.startsWith('ur') && name.includes('pak'));
  };

  const isSouthAsianVoice = (voice) => {
    const name = String(voice.name || '').toLowerCase();
    const voiceLang = String(voice.lang || '').toLowerCase();
    return (
      voiceLang.startsWith('ur') ||
      voiceLang.startsWith('hi') ||
      voiceLang.startsWith('en-in') ||
      southAsianHints.some((hint) => name.includes(hint))
    );
  };

  if (wantsUrduFamily) {
    const femalePakistani = femaleVoices.find((voice) => isPakistaniUrduVoice(voice));
    if (femalePakistani) return femalePakistani;

    const femaleSouthAsian = femaleVoices.find((voice) => isSouthAsianVoice(voice));
    if (femaleSouthAsian) return femaleSouthAsian;

    const anyPakistani = list.find((voice) => isPakistaniUrduVoice(voice));
    if (anyPakistani) return anyPakistani;

    const anySouthAsian = list.find((voice) => isSouthAsianVoice(voice));
    if (anySouthAsian) return anySouthAsian;
  }

  const languagePrefix = normalizedLang.startsWith('ur') ? 'ur' : 'en';
  const matching = list.filter((voice) => String(voice.lang || '').toLowerCase().startsWith(languagePrefix));
  const femaleMatch = matching.find((voice) =>
    femaleHints.some((hint) => String(voice.name || '').toLowerCase().includes(hint))
  );
  return femaleMatch || femaleVoices[0] || matching[0] || list[0] || null;
}
