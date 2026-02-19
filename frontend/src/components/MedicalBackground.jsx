import React from 'react';
import { Activity, Cross, Dna, HeartPulse, Pill, Stethoscope } from 'lucide-react';

const floatingIcons = [
  {
    id: 'heart',
    Icon: HeartPulse,
    top: '12%',
    left: '6%',
    size: 66,
    delay: '0s',
    duration: '12.8s',
    opacityFactor: 1.0,
  },
  {
    id: 'dna',
    Icon: Dna,
    top: '14%',
    right: '9%',
    size: 72,
    delay: '1.1s',
    duration: '14.2s',
    opacityFactor: 0.86,
  },
  {
    id: 'cross',
    Icon: Cross,
    top: '63%',
    left: '8%',
    size: 58,
    delay: '0.6s',
    duration: '12.6s',
    opacityFactor: 0.74,
  },
  {
    id: 'activity',
    Icon: Activity,
    top: '70%',
    right: '7%',
    size: 70,
    delay: '1.8s',
    duration: '13.8s',
    opacityFactor: 0.9,
  },
  {
    id: 'stetho',
    Icon: Stethoscope,
    top: '40%',
    right: '43%',
    size: 56,
    delay: '2.2s',
    duration: '14.6s',
    opacityFactor: 0.78,
  },
  {
    id: 'pill',
    Icon: Pill,
    top: '21%',
    left: '47%',
    size: 54,
    delay: '1.4s',
    duration: '13.2s',
    opacityFactor: 0.84,
  },
  {
    id: 'cross-mini',
    Icon: Cross,
    top: '78%',
    left: '36%',
    size: 40,
    delay: '2.6s',
    duration: '12.4s',
    opacityFactor: 0.66,
  },
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

function SyringeGlyph() {
  return (
    <div className="medical-syringe">
      <span className="needle" />
      <span className="barrel" />
      <span className="plunger" />
    </div>
  );
}

function VialGlyph() {
  return (
    <div className="medical-vial">
      <span className="cap" />
      <span className="glass" />
      <span className="liquid" />
    </div>
  );
}

function EcgGlyph() {
  return (
    <div className="medical-ecg">
      <span className="line" />
    </div>
  );
}

export default function MedicalBackground({ opacity = 0.3 }) {
  const normalizedOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(opacity, 1)) : 0.3;
  const nodeOpacity = (factor = 1) => Math.max(0, Math.min(normalizedOpacity * factor, normalizedOpacity));

  return (
    <div
      className="medical-background pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ '--medical-opacity': normalizedOpacity }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(34,197,94,0.18),transparent_40%),radial-gradient(circle_at_85%_20%,rgba(14,165,233,0.14),transparent_42%),radial-gradient(circle_at_50%_78%,rgba(59,130,246,0.16),transparent_45%)]" />
      <div className="absolute inset-0 medical-grid-overlay" />
      <div className="absolute inset-0 medical-vignette" />

      {floatingIcons.map(({ id, Icon, size, delay, duration, opacityFactor = 1, ...style }) => (
        <div
          key={id}
          className="medical-node medical-float absolute text-cyan-200"
          style={{
            ...style,
            animationDelay: delay,
            animationDuration: duration,
            opacity: nodeOpacity(opacityFactor),
          }}
          aria-hidden="true"
        >
          <Icon size={size} strokeWidth={1.4} />
        </div>
      ))}

      <div
        className="medical-node medical-float absolute left-[35%] top-[22%]"
        style={{ animationDelay: '0.9s', animationDuration: '13.4s', opacity: nodeOpacity(0.88) }}
      >
        <LungsGlyph />
      </div>

      <div
        className="medical-node medical-float absolute left-[52%] top-[64%]"
        style={{ animationDelay: '1.4s', animationDuration: '13.8s', opacity: nodeOpacity(0.8) }}
      >
        <XrayBars />
      </div>

      <div
        className="medical-node medical-float absolute left-[16%] top-[43%]"
        style={{ animationDelay: '1.7s', animationDuration: '13.1s', opacity: nodeOpacity(0.76) }}
      >
        <ThermometerGlyph />
      </div>

      <div
        className="medical-node medical-float absolute right-[19%] top-[53%]"
        style={{ animationDelay: '2.4s', animationDuration: '14.4s', opacity: nodeOpacity(0.72) }}
      >
        <CapsuleGlyph />
      </div>

      <div
        className="medical-node medical-float absolute right-[28%] top-[24%] mobile-hide"
        style={{ animationDelay: '1.2s', animationDuration: '14.8s', opacity: nodeOpacity(0.68) }}
      >
        <XrayPanel />
      </div>

      <div
        className="medical-node medical-float absolute left-[62%] top-[34%] mobile-hide"
        style={{ animationDelay: '0.4s', animationDuration: '13.4s', opacity: nodeOpacity(0.7) }}
      >
        <SyringeGlyph />
      </div>

      <div
        className="medical-node medical-float absolute right-[12%] top-[74%]"
        style={{ animationDelay: '1.6s', animationDuration: '13.9s', opacity: nodeOpacity(0.74) }}
      >
        <VialGlyph />
      </div>

      <div
        className="medical-node medical-float absolute left-[25%] top-[30%] mobile-hide"
        style={{ animationDelay: '2.1s', animationDuration: '13.2s', opacity: nodeOpacity(0.64) }}
      >
        <EcgGlyph />
      </div>
    </div>
  );
}
