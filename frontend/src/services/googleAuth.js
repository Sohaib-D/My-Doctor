import { toApiUrl } from './api';

const POPUP_TIMEOUT_MS = 120000;

function swapLoopbackHost(base) {
  if (!base) {
    return '';
  }
  if (base.includes('://localhost:')) {
    return base.replace('://localhost:', '://127.0.0.1:');
  }
  if (base.includes('://127.0.0.1:')) {
    return base.replace('://127.0.0.1:', '://localhost:');
  }
  return '';
}

function buildAllowedOrigins() {
  const rawApiBase = (import.meta.env.VITE_API_URL || '').trim();
  const origins = new Set();

  const addOrigin = (value) => {
    if (!value) {
      return;
    }
    try {
      origins.add(new URL(value).origin);
    } catch {
      // ignore invalid URL
    }
  };

  if (typeof window !== 'undefined' && window.location?.origin) {
    addOrigin(window.location.origin);
    addOrigin(swapLoopbackHost(window.location.origin));
  }

  if (rawApiBase) {
    addOrigin(rawApiBase);
    addOrigin(swapLoopbackHost(rawApiBase));
  }

  return origins;
}

function randomState() {
  const segment = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}_${segment}`;
}

function popupFeatures() {
  const width = 520;
  const height = 700;
  const left = Math.max(Math.floor((window.screen.width - width) / 2), 0);
  const top = Math.max(Math.floor((window.screen.height - height) / 2), 0);
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

export function requestGoogleIdToken({ timeoutMs = POPUP_TIMEOUT_MS } = {}) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google sign-in is only available in the browser.'));
  }

  const state = randomState();
  const startUrl = toApiUrl(`/auth/google/start?state=${encodeURIComponent(state)}`);
  const allowedOrigins = buildAllowedOrigins();

  return new Promise((resolve, reject) => {
    let settled = false;
    const popup = window.open(startUrl, 'pd_google_auth', popupFeatures());

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups and try again.'));
      return;
    }

    const finish = (fn) => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timeoutTimer);
      window.clearInterval(closedTimer);
      try {
        popup.close();
      } catch {
        // ignore
      }
      fn();
    };

    const onMessage = (event) => {
      if (!allowedOrigins.has(event.origin)) {
        return;
      }

      const data = event.data;
      if (!data || data.type !== 'pd_google_oauth') {
        return;
      }

      if (data.state && data.state !== state) {
        return;
      }

      if (data.error) {
        const details = data.error_description ? ` (${data.error_description})` : '';
        finish(() => reject(new Error(`Google login failed: ${data.error}${details}`)));
        return;
      }

      const token = String(data.id_token || '').trim();
      if (!token) {
        finish(() => reject(new Error('Google login did not return an ID token.')));
        return;
      }

      finish(() => resolve(token));
    };

    const closedTimer = window.setInterval(() => {
      if (popup.closed) {
        finish(() => reject(new Error('Google sign-in was cancelled.')));
      }
    }, 500);

    const timeoutTimer = window.setTimeout(() => {
      finish(() => reject(new Error('Google sign-in timed out. Please try again.')));
    }, Math.max(timeoutMs, 5000));

    window.addEventListener('message', onMessage);
  });
}
