import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const PERSONALIZATION_STORAGE_KEY = 'pd_personalization';

export const RESPONSE_STYLE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'simple_clear', label: 'Simple & Clear' },
  { value: 'detailed_technical', label: 'Detailed & Technical' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
];

const RESPONSE_STYLE_SET = new Set(RESPONSE_STYLE_OPTIONS.map((item) => item.value));

const PersonalizationContext = createContext(null);

export function createDefaultPersonalization() {
  return {
    response_style: 'default',
    custom_instructions: '',
    nickname: '',
    occupation: '',
    about_user: '',
    allow_memory: false,
    allow_chat_reference: false,
    recent_chat_summaries: [],
  };
}

const clampText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

export function normalizePersonalization(source) {
  const next = createDefaultPersonalization();
  if (!source || typeof source !== 'object') {
    return next;
  }

  const style = String(source.response_style || '').trim().toLowerCase();
  next.response_style = RESPONSE_STYLE_SET.has(style) ? style : 'default';
  next.custom_instructions = clampText(source.custom_instructions, 4000);
  next.nickname = clampText(source.nickname, 120);
  next.occupation = clampText(source.occupation, 160);
  next.about_user = clampText(source.about_user, 2000);
  next.allow_memory = Boolean(source.allow_memory);
  next.allow_chat_reference = Boolean(source.allow_chat_reference);
  if (!next.allow_memory) {
    next.allow_chat_reference = false;
  }

  const summaries = Array.isArray(source.recent_chat_summaries) ? source.recent_chat_summaries : [];
  next.recent_chat_summaries = summaries
    .map((item) => clampText(item, 300))
    .filter(Boolean)
    .slice(0, 12);
  return next;
}

export function readStoredPersonalization() {
  if (typeof window === 'undefined') {
    return createDefaultPersonalization();
  }
  try {
    const raw = window.localStorage.getItem(PERSONALIZATION_STORAGE_KEY);
    if (!raw) {
      return createDefaultPersonalization();
    }
    return normalizePersonalization(JSON.parse(raw));
  } catch {
    return createDefaultPersonalization();
  }
}

export function serializePersonalization(value) {
  return JSON.stringify(normalizePersonalization(value));
}

export function toPersonalizationApiPayload(value) {
  const normalized = normalizePersonalization(value);
  return {
    response_style: normalized.response_style,
    custom_instructions: normalized.custom_instructions || null,
    nickname: normalized.nickname || null,
    occupation: normalized.occupation || null,
    about_user: normalized.about_user || null,
    allow_memory: Boolean(normalized.allow_memory),
    allow_chat_reference: Boolean(normalized.allow_chat_reference),
  };
}

export function PersonalizationProvider({ children }) {
  const [personalization, setPersonalization] = useState(readStoredPersonalization);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(PERSONALIZATION_STORAGE_KEY, serializePersonalization(personalization));
  }, [personalization]);

  const replacePersonalization = useCallback((next) => {
    setPersonalization(normalizePersonalization(next));
  }, []);

  const updatePersonalizationField = useCallback((key, value) => {
    setPersonalization((prev) => normalizePersonalization({ ...prev, [key]: value }));
  }, []);

  const resetPersonalization = useCallback(() => {
    setPersonalization(createDefaultPersonalization());
  }, []);

  const contextValue = useMemo(
    () => ({
      personalization,
      replacePersonalization,
      updatePersonalizationField,
      resetPersonalization,
    }),
    [personalization, replacePersonalization, resetPersonalization, updatePersonalizationField]
  );

  return <PersonalizationContext.Provider value={contextValue}>{children}</PersonalizationContext.Provider>;
}

export function usePersonalization() {
  const context = useContext(PersonalizationContext);
  if (!context) {
    throw new Error('usePersonalization must be used within PersonalizationProvider.');
  }
  return context;
}
