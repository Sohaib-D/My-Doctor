import React from 'react';
import { MessageCircle } from 'lucide-react';
import ModePromptPanel from './ModePromptPanel';

const CHAT_SUGGESTIONS = [
  'What are common causes of fatigue and how can I improve it?',
  'I have fever and sore throat for 2 days. What should I monitor?',
  'How can I reduce stress and improve sleep quality naturally?',
];

export default function ChatModeView({ onSuggestion }) {
  return (
    <ModePromptPanel
      icon={MessageCircle}
      label="Chat"
      title="General Medical Assistant"
      rootClassName="rounded-2xl border border-violet-300/30 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 p-4"
      iconClassName="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/40 bg-violet-500/20 text-violet-100"
      activeItemClassName="border-violet-300/50 bg-violet-500/20 text-violet-100"
      suggestions={CHAT_SUGGESTIONS}
      onSuggestion={onSuggestion}
    />
  );
}
