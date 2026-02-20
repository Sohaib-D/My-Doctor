import React, { useState } from 'react';

export default function ModePromptPanel({
  icon: Icon,
  label,
  title,
  rootClassName,
  iconClassName,
  activeItemClassName,
  suggestions,
  onSuggestion,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <div className={rootClassName}>
      <div className="flex items-center gap-3">
        <div className={iconClassName}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-200/80">{label}</p>
          <p className="text-sm font-semibold text-slate-100">{title}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map((item, index) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setSelectedIndex(index);
              onSuggestion(item);
            }}
            className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
              selectedIndex === index
                ? activeItemClassName
                : 'border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

