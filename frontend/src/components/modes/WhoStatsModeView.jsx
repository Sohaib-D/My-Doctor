import React from 'react';
import { Globe2 } from 'lucide-react';
import ModePromptPanel from './ModePromptPanel';

const WHO_SUGGESTIONS = [
  'Give a brief global overview of diabetes burden and prevention priorities.',
  'How do respiratory infections impact low-income countries differently?',
  'What are key WHO-aligned strategies for reducing cardiovascular deaths?',
];

export default function WhoStatsModeView({ onSuggestion }) {
  return (
    <ModePromptPanel
      icon={Globe2}
      label="WHO Stats"
      title="Global Health and Population Insights"
      rootClassName="rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-blue-500/12 via-emerald-500/10 to-cyan-500/10 p-4"
      iconClassName="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/40 bg-gradient-to-br from-blue-500/25 to-emerald-500/25 text-emerald-50"
      activeItemClassName="border-emerald-300/50 bg-emerald-500/20 text-emerald-100"
      suggestions={WHO_SUGGESTIONS}
      onSuggestion={onSuggestion}
    />
  );
}
