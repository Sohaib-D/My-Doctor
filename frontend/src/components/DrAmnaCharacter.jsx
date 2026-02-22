import { useEffect, useRef, useState } from 'react';

const W = 240;
const H = 320;

const LEFT_EYE = { cx: 88, cy: 108 };
const RIGHT_EYE = { cx: 152, cy: 108 };
const EYE_RX = 19;
const EYE_RY = 20;
const MAX_EYE_X = 7.8;
const MAX_EYE_Y = 6.5;

const COLORS = {
  skin: '#f7d6bd',
  skinShade: '#e7b291',
  hair: '#3b1f18',
  hairSoft: '#5b342b',
  coat: '#dbeafe',
  coatShade: '#b9d6ff',
  coatLine: '#8cadde',
  blush: '#ff6b86',
  lip: '#dc6b72',
  eyeWhite: '#ffffff',
  iris: '#111111',
  pupil: '#000000',
  stethDark: '#2f3f4f',
  stethMetal: '#d9e2ef',
  thermometerBody: '#f3f7ff',
  thermometerMercury: '#ff4a5f',
  pocket: '#f8fbff',
  chairDark: '#4d5f7b',
  chairMid: '#6f86a9',
  chairLight: '#93a8c6',
  accent: '#7dd3fc',
  pink: '#ff79b0',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function DrAmnaCharacter({ width = 150, style = {}, className = '' }) {
  const svgRef = useRef(null);

  const lIrisRef = useRef(null);
  const lPupilRef = useRef(null);
  const lShineRef = useRef(null);

  const rIrisRef = useRef(null);
  const rPupilRef = useRef(null);
  const rShineRef = useRef(null);

  const [blink, setBlink] = useState(false);
  const [typing, setTyping] = useState(false);

  const targetRef = useRef({ x: W / 2, y: 110 });
  const lastPointerMoveRef = useRef(Date.now());

  useEffect(() => {
    const handleMove = (event) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = ((event.clientX - rect.left) / rect.width) * W;
      const y = ((event.clientY - rect.top) / rect.height) * H;
      targetRef.current = { x, y };
      lastPointerMoveRef.current = Date.now();
    };

    const handleLeave = () => {
      targetRef.current = { x: W / 2, y: 110 };
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('mouseout', handleLeave);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseout', handleLeave);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    const current = {
      lx: 0,
      ly: 0,
      rx: 0,
      ry: 0,
    };

    const updateEye = (irisRef, pupilRef, shineRef, eye, offsetX, offsetY) => {
      if (irisRef.current) {
        irisRef.current.setAttribute('cx', (eye.cx + offsetX).toFixed(2));
        irisRef.current.setAttribute('cy', (eye.cy + offsetY).toFixed(2));
      }
      if (pupilRef.current) {
        pupilRef.current.setAttribute('cx', (eye.cx + offsetX).toFixed(2));
        pupilRef.current.setAttribute('cy', (eye.cy + offsetY).toFixed(2));
      }
      if (shineRef.current) {
        shineRef.current.setAttribute('cx', (eye.cx + offsetX - 2.8).toFixed(2));
        shineRef.current.setAttribute('cy', (eye.cy + offsetY - 2.8).toFixed(2));
      }
    };

    const animate = () => {
      const idleTime = Date.now() - lastPointerMoveRef.current;
      let lookTarget = targetRef.current;

      if (idleTime > 1600) {
        const t = Date.now() / 700;
        lookTarget = {
          x: W / 2 + Math.cos(t) * 16,
          y: 108 + Math.sin(t * 0.8) * 7,
        };
      }

      const calcDesired = (eye) => {
        const dx = lookTarget.x - eye.cx;
        const dy = lookTarget.y - eye.cy;
        return {
          x: clamp(dx * 0.08, -MAX_EYE_X, MAX_EYE_X),
          y: clamp(dy * 0.08, -MAX_EYE_Y, MAX_EYE_Y),
        };
      };

      const leftDesired = calcDesired(LEFT_EYE);
      const rightDesired = calcDesired(RIGHT_EYE);

      const smoothing = 0.24;
      current.lx += (leftDesired.x - current.lx) * smoothing;
      current.ly += (leftDesired.y - current.ly) * smoothing;
      current.rx += (rightDesired.x - current.rx) * smoothing;
      current.ry += (rightDesired.y - current.ry) * smoothing;

      updateEye(lIrisRef, lPupilRef, lShineRef, LEFT_EYE, current.lx, current.ly);
      updateEye(rIrisRef, rPupilRef, rShineRef, RIGHT_EYE, current.rx, current.ry);

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      while (active) {
        await wait(2100 + Math.random() * 3300);
        if (!active) break;
        const doubleBlink = Math.random() < 0.18;
        setBlink(true);
        await wait(110);
        setBlink(false);
        if (doubleBlink) {
          await wait(160);
          setBlink(true);
          await wait(95);
          setBlink(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let timerId = null;
    const handleType = () => {
      setTyping(true);
      if (timerId) window.clearTimeout(timerId);
      timerId = window.setTimeout(() => setTyping(false), 1300);
    };

    window.addEventListener('keydown', handleType);
    window.addEventListener('input', handleType, true);
    return () => {
      window.removeEventListener('keydown', handleType);
      window.removeEventListener('input', handleType, true);
      if (timerId) window.clearTimeout(timerId);
    };
  }, []);

  const lidStyle = {
    transformBox: 'fill-box',
    transformOrigin: '50% 0%',
    transform: blink ? 'scaleY(1)' : 'scaleY(0.04)',
    transition: blink ? 'transform 95ms ease-in' : 'transform 140ms ease-out',
  };

  const height = Math.round((width * H) / W);

  return (
    <div className={className} style={{ lineHeight: 0, userSelect: 'none', ...style }}>
      <style>{ANIM_CSS}</style>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={width}
        height={height}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Dr. Amna character"
        overflow="visible"
      >
        <defs>
          <radialGradient id="skinGrad" cx="40%" cy="28%" r="70%">
            <stop offset="0%" stopColor="#ffe9d8" />
            <stop offset="100%" stopColor={COLORS.skin} />
          </radialGradient>
          <linearGradient id="coatGrad" x1="0%" y1="0%" x2="70%" y2="100%">
            <stop offset="0%" stopColor={COLORS.coat} />
            <stop offset="100%" stopColor={COLORS.coatShade} />
          </linearGradient>
          <linearGradient id="chairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={COLORS.chairLight} />
            <stop offset="100%" stopColor={COLORS.chairDark} />
          </linearGradient>
          <radialGradient id="blushGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={COLORS.blush} stopOpacity="0.7" />
            <stop offset="100%" stopColor={COLORS.blush} stopOpacity="0" />
          </radialGradient>
          <filter id="softShadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0000002a" />
          </filter>
          <clipPath id="leftEyeClip">
            <ellipse cx={LEFT_EYE.cx} cy={LEFT_EYE.cy} rx={EYE_RX} ry={EYE_RY} />
          </clipPath>
          <clipPath id="rightEyeClip">
            <ellipse cx={RIGHT_EYE.cx} cy={RIGHT_EYE.cy} rx={EYE_RX} ry={EYE_RY} />
          </clipPath>
        </defs>

        <ellipse cx="120" cy="300" rx="62" ry="12" fill="#00000025" />
        <ellipse cx="120" cy="152" rx="86" ry="96" fill="#7dd3fc26" />
        <ellipse cx="120" cy="152" rx="62" ry="72" fill="#93c5fd1f" />

        <g className="doc-float" filter="url(#softShadow)">
          <rect x="84" y="176" width="72" height="76" rx="16" fill="url(#chairGrad)" stroke="#3f506a" strokeWidth="1" />
          <rect x="78" y="242" width="84" height="20" rx="10" fill={COLORS.chairMid} stroke="#475a76" strokeWidth="1" />
          <rect x="116" y="260" width="8" height="30" rx="4" fill="#5a708f" />
          <path d="M 93 296 L 147 296" stroke="#516884" strokeWidth="4" strokeLinecap="round" />
          <path d="M 102 296 L 86 306 M 138 296 L 154 306" stroke="#516884" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="86" cy="308" r="5" fill="#2b3442" />
          <circle cx="154" cy="308" r="5" fill="#2b3442" />

          <path
            d="M 76 193 Q 90 185 120 184 Q 150 185 164 193 Q 168 202 166 246 Q 148 256 120 256 Q 92 256 74 246 Q 72 202 76 193 Z"
            fill="url(#coatGrad)"
            stroke={COLORS.coatLine}
            strokeWidth="1.1"
          />
          <path d="M 99 182 L 120 214 L 141 182 Z" fill="#9de2ea" />
          <path d="M 93 186 L 108 218 L 120 210 L 132 218 L 147 186" fill="none" stroke="#7e9fcd" strokeWidth="1" />
          <path d="M 84 200 Q 80 214 83 235" fill="none" stroke="#7ea3d8" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M 156 200 Q 160 214 157 235" fill="none" stroke="#7ea3d8" strokeWidth="1.2" strokeLinecap="round" />

          <path
            d="M 90 247 Q 104 241 120 243 Q 136 241 150 247 L 146 270 Q 135 267 120 268 Q 105 267 94 270 Z"
            fill="#d8f0f5"
            stroke="#b8dbe2"
            strokeWidth="0.8"
          />
          <rect x="100" y="268" width="16" height="24" rx="7" fill={COLORS.skin} />
          <rect x="124" y="268" width="16" height="24" rx="7" fill={COLORS.skin} />
          <ellipse cx="108" cy="294" rx="12" ry="5.4" fill="#eef2fb" stroke="#c5cfdf" strokeWidth="0.7" />
          <ellipse cx="132" cy="294" rx="12" ry="5.4" fill="#eef2fb" stroke="#c5cfdf" strokeWidth="0.7" />

          <path
            d="M 82 208 Q 92 221 101 236 L 108 248 L 96 258 Q 82 249 75 231 Q 75 218 82 208 Z"
            fill={COLORS.skin}
            stroke="#d8b597"
            strokeWidth="0.85"
          />
          <ellipse cx="80" cy="208" rx="8.2" ry="6.1" fill={COLORS.skin} stroke="#d8b597" strokeWidth="0.7" />
          <g>
            <rect x="84" y="230" width="74" height="52" rx="7" fill="#2f6fd0" stroke="#1e4fa6" strokeWidth="1" />
            <rect x="89" y="235" width="64" height="42" rx="5" fill="#d8edfb" />
            <line x1="120" y1="235" x2="120" y2="277" stroke="#9bbbe2" strokeWidth="1" />
            <line x1="94" y1="244" x2="114" y2="244" stroke="#8fb5dd" strokeWidth="1" />
            <line x1="94" y1="251" x2="114" y2="251" stroke="#8fb5dd" strokeWidth="1" />
            <line x1="94" y1="258" x2="114" y2="258" stroke="#8fb5dd" strokeWidth="1" />
            <line x1="124" y1="244" x2="147" y2="244" stroke="#8fb5dd" strokeWidth="1" />
            <line x1="124" y1="251" x2="147" y2="251" stroke="#8fb5dd" strokeWidth="1" />
            <line x1="124" y1="258" x2="147" y2="258" stroke="#8fb5dd" strokeWidth="1" />
            <line x1="124" y1="265" x2="144" y2="265" stroke="#8fb5dd" strokeWidth="1" />
          </g>
          <ellipse cx="96" cy="261" rx="11.8" ry="8.8" fill={COLORS.skin} />

          <g className={typing ? 'doc-write-arm' : ''}>
            <path
              d="M 160 208 Q 171 221 170 239 Q 168 251 157 259 L 146 257 Q 155 246 157 231 Q 159 217 152 208 Z"
              fill={COLORS.skin}
              stroke="#d8b597"
              strokeWidth="0.85"
            />
            <ellipse cx="154" cy="260" rx="11.8" ry="8.8" fill={COLORS.skin} />
            <g className={typing ? 'doc-pen' : ''}>
              <rect x="154" y="238" width="7" height="30" rx="3.5" fill="#facc15" />
              <rect x="155.3" y="239.5" width="2" height="24" rx="1" fill="#ffffff66" />
              <path d="M 154 268 L 157.5 278 L 161 268 Z" fill="#222222" />
              <circle cx="157.5" cy="278" r="1.1" fill="#111111" />
            </g>
          </g>
          <ellipse cx="160" cy="208" rx="8.2" ry="6.1" fill={COLORS.skin} stroke="#d8b597" strokeWidth="0.7" />

          <rect x="71" y="218" width="28" height="24" rx="5" fill={COLORS.pocket} stroke={COLORS.coatLine} strokeWidth="0.8" />
          <rect x="80" y="210" width="4.3" height="23" rx="2" fill={COLORS.thermometerBody} stroke="#d4deef" strokeWidth="0.8" />
          <line x1="82.15" y1="214" x2="82.15" y2="230" stroke={COLORS.thermometerMercury} strokeWidth="1.5" />
          <circle cx="82.15" cy="233.4" r="3.2" fill={COLORS.thermometerMercury} />

          <circle cx="102" cy="169" r="2.1" fill={COLORS.stethMetal} stroke={COLORS.stethDark} strokeWidth="1.2" />
          <circle cx="138" cy="169" r="2.1" fill={COLORS.stethMetal} stroke={COLORS.stethDark} strokeWidth="1.2" />
          <path d="M 102 171 Q 100 183 105 194" stroke={COLORS.stethDark} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M 138 171 Q 140 183 135 194" stroke={COLORS.stethDark} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M 105 194 Q 120 205 135 194" stroke={COLORS.stethDark} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cx="120" cy="210" r="5.4" fill={COLORS.stethMetal} stroke={COLORS.stethDark} strokeWidth="1.7" />
          <circle cx="120" cy="210" r="1.9" fill={COLORS.stethDark} />

          <rect x="109" y="154" width="22" height="24" rx="9" fill={COLORS.skinShade} opacity="0.85" />

          <ellipse cx="120" cy="102" rx="54" ry="61" fill={COLORS.hairSoft} />
          <ellipse cx="120" cy="108" rx="52" ry="60" fill="url(#skinGrad)" />
          <path d="M 68 91 Q 80 57 120 56 Q 160 57 172 91 Q 152 82 120 82 Q 88 82 68 91 Z" fill={COLORS.hair} />
          <path d="M 73 95 Q 90 82 120 84 Q 150 82 167 95 Q 152 78 120 78 Q 88 78 73 95 Z" fill={COLORS.hairSoft} />

          <circle cx="93" cy="63" r="6.3" fill={COLORS.pink} />
          <circle cx="98" cy="63" r="5.2" fill={COLORS.pink} opacity="0.85" />

          <ellipse cx="68" cy="116" rx="8.4" ry="11.5" fill={COLORS.skin} />
          <ellipse cx="172" cy="116" rx="8.4" ry="11.5" fill={COLORS.skin} />

          <path d="M 73 92 Q 88 86 103 91" stroke="#2a160f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M 137 91 Q 152 86 167 92" stroke="#2a160f" strokeWidth="2.5" fill="none" strokeLinecap="round" />

          <ellipse cx={LEFT_EYE.cx} cy={LEFT_EYE.cy} rx={EYE_RX + 2.2} ry={EYE_RY + 2.2} fill={COLORS.eyeWhite} stroke="#d7b9a0" strokeWidth="0.8" />
          <ellipse cx={RIGHT_EYE.cx} cy={RIGHT_EYE.cy} rx={EYE_RX + 2.2} ry={EYE_RY + 2.2} fill={COLORS.eyeWhite} stroke="#d7b9a0" strokeWidth="0.8" />
          <ellipse cx={LEFT_EYE.cx} cy={LEFT_EYE.cy} rx={EYE_RX} ry={EYE_RY} fill={COLORS.eyeWhite} />
          <ellipse cx={RIGHT_EYE.cx} cy={RIGHT_EYE.cy} rx={EYE_RX} ry={EYE_RY} fill={COLORS.eyeWhite} />

          <g clipPath="url(#leftEyeClip)">
            <circle ref={lIrisRef} cx={LEFT_EYE.cx} cy={LEFT_EYE.cy} r="10.5" fill={COLORS.iris} />
            <circle ref={lPupilRef} cx={LEFT_EYE.cx} cy={LEFT_EYE.cy} r="6.8" fill={COLORS.pupil} />
            <circle ref={lShineRef} cx={LEFT_EYE.cx - 2.8} cy={LEFT_EYE.cy - 2.8} r="3.2" fill="#ffffff" />
            <circle cx={LEFT_EYE.cx + 3.7} cy={LEFT_EYE.cy + 2.9} r="1.25" fill="#ffffffbb" />
          </g>

          <g clipPath="url(#rightEyeClip)">
            <circle ref={rIrisRef} cx={RIGHT_EYE.cx} cy={RIGHT_EYE.cy} r="10.5" fill={COLORS.iris} />
            <circle ref={rPupilRef} cx={RIGHT_EYE.cx} cy={RIGHT_EYE.cy} r="6.8" fill={COLORS.pupil} />
            <circle ref={rShineRef} cx={RIGHT_EYE.cx - 2.8} cy={RIGHT_EYE.cy - 2.8} r="3.2" fill="#ffffff" />
            <circle cx={RIGHT_EYE.cx + 3.7} cy={RIGHT_EYE.cy + 2.9} r="1.25" fill="#ffffffbb" />
          </g>

          <g clipPath="url(#leftEyeClip)">
            <rect
              x={LEFT_EYE.cx - EYE_RX - 2.5}
              y={LEFT_EYE.cy - EYE_RY - 2.5}
              width={(EYE_RX + 2.5) * 2}
              height={(EYE_RY + 2.5) * 2}
              rx={EYE_RX + 2.5}
              fill="url(#skinGrad)"
              style={lidStyle}
            />
          </g>
          <g clipPath="url(#rightEyeClip)">
            <rect
              x={RIGHT_EYE.cx - EYE_RX - 2.5}
              y={RIGHT_EYE.cy - EYE_RY - 2.5}
              width={(EYE_RX + 2.5) * 2}
              height={(EYE_RY + 2.5) * 2}
              rx={EYE_RX + 2.5}
              fill="url(#skinGrad)"
              style={lidStyle}
            />
          </g>

          <ellipse cx="82" cy="140" rx="18" ry="10.8" fill="url(#blushGrad)" />
          <ellipse cx="158" cy="140" rx="18" ry="10.8" fill="url(#blushGrad)" />

          <path d="M 115 132 Q 113 144 119 147 Q 124 144 122 132" fill="#e1a780" opacity="0.8" />
          <path d="M 108 153 Q 120 162 132 153" fill="none" stroke={COLORS.lip} strokeWidth="2.3" strokeLinecap="round" />
          <path d="M 110 154 Q 120 158 130 154 Q 120 162 110 154 Z" fill="#f08e9b" opacity="0.45" />
        </g>
      </svg>
    </div>
  );
}

const ANIM_CSS = `
  .doc-float {
    animation: docFloat 3.6s ease-in-out infinite;
  }

  @keyframes docFloat {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6.6px); }
  }

  .doc-write-arm {
    transform-box: fill-box;
    transform-origin: 160px 208px;
    animation: docArmWrite 0.58s ease-in-out infinite;
  }

  @keyframes docArmWrite {
    0% { transform: rotate(0deg); }
    30% { transform: rotate(1.8deg); }
    62% { transform: rotate(-0.9deg); }
    100% { transform: rotate(0deg); }
  }

  .doc-pen {
    transform-origin: 157px 262px;
    animation: docPenMove 0.58s ease-in-out infinite;
  }

  @keyframes docPenMove {
    0% { transform: translate(0px, 0px) rotate(-13deg); }
    35% { transform: translate(3px, -1px) rotate(-10deg); }
    70% { transform: translate(5px, 0px) rotate(-12deg); }
    100% { transform: translate(0px, 0px) rotate(-13deg); }
  }
`;
