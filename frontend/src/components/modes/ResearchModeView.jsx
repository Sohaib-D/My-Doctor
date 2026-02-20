import React from 'react';
import { Microscope } from 'lucide-react';
import ModePromptPanel from './ModePromptPanel';

const RESEARCH_SUGGESTIONS = [
  'Summarize current evidence for intermittent fasting and metabolic health.',
  'What does research say about vitamin D deficiency and fatigue?',
  'Compare evidence strength for aerobic vs resistance exercise in hypertension.',
];

export default function ResearchModeView({ onSuggestion }) {
  return (
    <ModePromptPanel
      icon={Microscope}
      label="Research"
      title="Evidence-Focused Responses"
      rootClassName="rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500/12 via-cyan-500/10 to-blue-500/10 p-4"
      iconClassName="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-300/40 bg-sky-500/20 text-sky-50"
      activeItemClassName="border-sky-300/50 bg-sky-500/20 text-sky-100"
      suggestions={RESEARCH_SUGGESTIONS}
      onSuggestion={onSuggestion}
    />
  );
}
