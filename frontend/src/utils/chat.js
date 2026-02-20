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

function formatInlineRichText(value) {
  let text = escapeHtml(value);
  // **bold** → warm teal highlight
  text = text.replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="color:#5eead4;font-weight:700">$1</strong>'
  );
  // __bold__ alternative
  text = text.replace(
    /__(.+?)__/g,
    '<strong style="color:#5eead4;font-weight:700">$1</strong>'
  );
  // `code`
  text = text.replace(
    /`([^`]+?)`/g,
    '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:4px;font-family:monospace;font-size:0.9em">$1</code>'
  );
  return text;
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
  let text = raw.replace(/\r\n/g, '\n');

  // 1. Ensure every ## heading starts on its own line
  //    "text. ## Heading" → "text.\n\n## Heading"
  text = text.replace(/([^\n])\s*(#{1,4}\s+)/g, '$1\n\n$2');

  // 2. Split bullets that follow a period, colon, or Devanagari danda
  //    "Heading: - item" → "Heading:\n- item"
  //    "sentence. - item" → "sentence.\n- item"
  text = text.replace(/([.:\u0964])\s+-\s+/g, '$1\n- ');

  // 3. Split comma-separated bullets: ", - item" → "\n- item"
  //    This is the key fix — Groq sometimes writes "item1, - item2, - item3"
  text = text.replace(/,\s+-\s+/g, '\n- ');

  // 4. Consecutive inline bullets not yet separated: "word. - next" → "word.\n- next"
  text = text.replace(/([a-zA-Z\u0600-\u06FF\u0900-\u097F]\.)\s+-\s+/g, '$1\n- ');

  // 5. Remove trailing colon from heading lines (cleaner look)
  //    "## 🔬 Section:\n- item" → "## 🔬 Section\n- item"
  text = text.replace(/(^#{1,4}\s+[^\n]+):\n/gm, '$1\n');

  // 6. Collapse 3+ newlines → 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
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
  if (!rawText) {
    return '';
  }

  // Normalize flat markdown → proper newline-separated markdown
  const raw = preprocessMarkdown(rawText);

  const lines = raw.split('\n');
  const parts = [];
  let paragraphLines = [];
  let inUnorderedList = false;
  let inOrderedList = false;

  // ── Style constants ──────────────────────────────────────────────────────
  // NOTE: text-transform is intentionally REMOVED from all heading styles.
  // Uppercasing was making bullet content that merged into headings unreadable.
  const STYLES = {
    // Headings: warm teal accent instead of bright sky-blue, subtle background
    h1: 'display:block;font-weight:700;font-size:13.5px;letter-spacing:0.03em;color:#5eead4;margin:14px 0 4px 0;padding:5px 11px;background:rgba(94,234,212,0.07);border-left:3px solid #5eead4;border-radius:0 6px 6px 0;line-height:1.4',
    h2: 'display:block;font-weight:700;font-size:13px;letter-spacing:0.03em;color:#5eead4;margin:12px 0 4px 0;padding:4px 11px;background:rgba(94,234,212,0.07);border-left:3px solid #5eead4;border-radius:0 6px 6px 0;line-height:1.4',
    h3: 'display:block;font-weight:700;font-size:12.5px;letter-spacing:0.02em;color:#6ee7b7;margin:10px 0 3px 0;padding:3px 9px;background:rgba(110,231,183,0.06);border-left:3px solid #6ee7b7;border-radius:0 5px 5px 0;line-height:1.4',
    h4: 'display:block;font-weight:600;font-size:12px;color:#a7f3d0;margin:8px 0 3px 0;padding:2px 8px;border-left:2px solid #a7f3d0;border-radius:0 4px 4px 0',
    ul: 'margin:4px 0 8px 0;padding-left:0;list-style:none',
    ol: 'margin:4px 0 8px 0;padding-left:20px',
    // Tighter line gaps — was 9px, now 4px
    li: 'margin-bottom:4px;color:#cbd5e1;line-height:1.65;padding:2px 4px 2px 4px;border-radius:3px',
    p:  'margin:4px 0;color:#cbd5e1;line-height:1.65',
    spacer: 'height:4px',
    hr: 'border:none;border-top:1px solid rgba(255,255,255,0.10);margin:10px 0',
  };

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    parts.push(`<p style="${STYLES.p}">${paragraphLines.join('<br/>')}</p>`);
    paragraphLines = [];
  };

  const closeLists = () => {
    if (inUnorderedList) { parts.push('</ul>'); inUnorderedList = false; }
    if (inOrderedList)   { parts.push('</ol>'); inOrderedList = false; }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    // ── Blank line ──────────────────────────────────────────────────────
    if (!trimmed) {
      flushParagraph();
      closeLists();
      parts.push(`<div style="${STYLES.spacer}"></div>`);
      return;
    }

    // ── Horizontal rule ─────────────────────────────────────────────────
    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      closeLists();
      parts.push(`<hr style="${STYLES.hr}" />`);
      return;
    }

    // ── Markdown headings: # / ## / ### / #### ─────────────────────────
    const markdownHeading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (markdownHeading) {
      flushParagraph();
      closeLists();
      const level = markdownHeading[1].length;
      const headingText = formatInlineRichText(markdownHeading[2].trim());
      const style = level === 1 ? STYLES.h1 : level === 2 ? STYLES.h2 : level === 3 ? STYLES.h3 : STYLES.h4;
      parts.push(`<span style="${style}">${headingText}</span>`);
      return;
    }

    // ── Simple "Label:" heading pattern ────────────────────────────────
    const simpleLabelHeading = trimmed.match(/^([A-Za-z\u0600-\u06FF][^:]{1,48}):$/);
    if (simpleLabelHeading) {
      flushParagraph();
      closeLists();
      parts.push(`<span style="${STYLES.h4}">${formatInlineRichText(simpleLabelHeading[1])}:</span>`);
      return;
    }

    // ── Unordered list item: -, *, • ───────────────────────────────────
    const unorderedMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (inOrderedList) { parts.push('</ol>'); inOrderedList = false; }
      if (!inUnorderedList) {
        parts.push(`<ul style="${STYLES.ul}">`);
        inUnorderedList = true;
      }
      parts.push(
        `<li style="${STYLES.li}"><span style="color:#38bdf8;margin-right:6px">›</span>${formatInlineRichText(unorderedMatch[1].trim())}</li>`
      );
      return;
    }

    // ── Ordered list item: 1. / 1) ─────────────────────────────────────
    const orderedMatch = trimmed.match(/^\d+[\.)]\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (inUnorderedList) { parts.push('</ul>'); inUnorderedList = false; }
      if (!inOrderedList) {
        parts.push(`<ol style="${STYLES.ol}">`);
        inOrderedList = true;
      }
      parts.push(`<li style="${STYLES.li}">${formatInlineRichText(orderedMatch[1].trim())}</li>`);
      return;
    }

    // ── Plain paragraph line ────────────────────────────────────────────
    closeLists();
    paragraphLines.push(formatInlineRichText(trimmed));
  });

  flushParagraph();
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

export function selectFemaleVoice(voices, lang) {
  const languagePrefix = lang.toLowerCase().startsWith('ur') ? 'ur' : 'en';
  const matching = voices.filter((voice) => voice.lang?.toLowerCase().startsWith(languagePrefix));
  const femaleHints = ['female', 'woman', 'zira', 'aria', 'sara', 'emma', 'heera', 'nida'];
  const female = matching.find((voice) =>
    femaleHints.some((hint) => voice.name.toLowerCase().includes(hint))
  );
  return female || matching[0] || voices[0] || null;
}