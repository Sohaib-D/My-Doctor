import React, { useEffect, useState } from 'react';

export default function TypewriterText({
  text,
  speed = 26,
  startDelay = 0,
  className = '',
  showCursor = true,
}) {
  const value = String(text || '');
  const [visibleChars, setVisibleChars] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    const step = () => {
      if (cancelled) {
        return;
      }
      setVisibleChars((current) => {
        if (current >= value.length) {
          return current;
        }
        timeoutId = window.setTimeout(step, Math.max(10, Number(speed) || 26));
        return current + 1;
      });
    };

    setVisibleChars(0);
    timeoutId = window.setTimeout(step, Math.max(0, Number(startDelay) || 0));

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [value, speed, startDelay]);

  const visibleText = value.slice(0, Math.max(0, Math.min(visibleChars, value.length)));

  return (
    <span className={className}>
      {visibleText}
      {showCursor && <span className="typewriter-cursor" aria-hidden="true">|</span>}
    </span>
  );
}

