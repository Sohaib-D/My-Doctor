import React from 'react';
import { Pill } from 'lucide-react';
import ModePromptPanel from './ModePromptPanel';

const DRUG_SUGGESTIONS = [
  'Explain common side effects of metformin in simple language.',
  'Can ibuprofen and blood pressure medicines be taken together safely?',
  'What precautions should I know before taking antihistamines?',
];

export default function DrugInfoModeView({ onSuggestion }) {
  return (
    <ModePromptPanel
      icon={Pill}
      label="Drug Info"
      title="Medication Safety and Interactions"
      rootClassName="rounded-2xl border border-rose-300/30 bg-gradient-to-br from-rose-500/12 via-pink-500/10 to-orange-500/10 p-4"
      iconClassName="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-300/40 bg-gradient-to-br from-pink-500/35 to-orange-500/30 text-rose-50"
      activeItemClassName="border-rose-300/50 bg-rose-500/20 text-rose-100"
      suggestions={DRUG_SUGGESTIONS}
      onSuggestion={onSuggestion}
    />
  );
}
