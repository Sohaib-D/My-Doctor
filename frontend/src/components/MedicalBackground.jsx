import React from 'react';
import { Activity, Cross, Dna, HeartPulse, Stethoscope } from 'lucide-react';

const floatingIcons = [
  { id: 'heart', Icon: HeartPulse, top: '12%', left: '6%', size: 66, delay: '0s' },
  { id: 'dna', Icon: Dna, top: '14%', right: '9%', size: 72, delay: '1.1s' },
  { id: 'cross', Icon: Cross, top: '63%', left: '8%', size: 58, delay: '0.6s' },
  { id: 'activity', Icon: Activity, top: '70%', right: '7%', size: 70, delay: '1.8s' },
  { id: 'stetho', Icon: Stethoscope, top: '40%', right: '43%', size: 56, delay: '2.2s' },
];

function LungsGlyph() {
  return (
    <div className="medical-lungs">
      <span className="lung left" />
      <span className="lung right" />
      <span className="trachea" />
    </div>
  );
}

function XrayPanel() {
  return (
    <div className="medical-xray-panel">
      <div className="xray-ring" />
      <div className="xray-line-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}

function XrayBars() {
  return (
    <div className="medical-xray-bars">
      {Array.from({ length: 7 }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function ThermometerGlyph() {
  return (
    <div className="medical-thermometer">
      <span className="tube" />
      <span className="mercury" />
      <span className="bulb" />
    </div>
  );
}

function CapsuleGlyph() {
  return (
    <div className="medical-capsule">
      <span className="cap left" />
      <span className="cap right" />
      <span className="seam" />
    </div>
  );
}

export default function MedicalBackground({ opacity = 0.3 }) {
  const normalizedOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(opacity, 1)) : 0.3;

  return (
    <div
      className="medical-background pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ '--medical-opacity': normalizedOpacity }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(34,197,94,0.18),transparent_40%),radial-gradient(circle_at_85%_20%,rgba(14,165,233,0.14),transparent_42%),radial-gradient(circle_at_50%_78%,rgba(59,130,246,0.16),transparent_45%)]" />
      <div className="absolute inset-0 medical-grid-overlay" />
      <div className="absolute inset-0 medical-vignette" />

      {floatingIcons.map(({ id, Icon, size, delay, ...style }) => (
        <div
          key={id}
          className="medical-node medical-float absolute text-cyan-200"
          style={{ ...style, animationDelay: delay }}
          aria-hidden="true"
        >
          <Icon size={size} strokeWidth={1.4} />
        </div>
      ))}

      <div
        className="medical-node medical-float absolute left-[35%] top-[22%]"
        style={{ animationDelay: '0.9s' }}
      >
        <LungsGlyph />
      </div>

      <div
        className="medical-node medical-float absolute left-[52%] top-[64%]"
        style={{ animationDelay: '1.4s' }}
      >
        <XrayBars />
      </div>

      <div
        className="medical-node medical-float absolute left-[16%] top-[43%]"
        style={{ animationDelay: '1.7s' }}
      >
        <ThermometerGlyph />
      </div>

      <div
        className="medical-node medical-float absolute right-[19%] top-[53%]"
        style={{ animationDelay: '2.4s' }}
      >
        <CapsuleGlyph />
      </div>

      <div
        className="medical-node medical-float absolute right-[28%] top-[24%] mobile-hide"
        style={{ animationDelay: '1.2s' }}
      >
        <XrayPanel />
      </div>
    </div>
  );
}
