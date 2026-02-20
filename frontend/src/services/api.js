const RAW_API_BASE = (import.meta.env.VITE_API_URL || '').trim();

function normalizeBase(base) {
  if (!base) {
    return '';
  }
  return base.replace(/\/+$/, '');
}

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

function buildBaseCandidates() {
  const list = [];
  const seen = new Set();

  const push = (value) => {
    const normalized = normalizeBase(value);
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    list.push(normalized);
  };

  if (RAW_API_BASE) {
    push(RAW_API_BASE);
    push(swapLoopbackHost(RAW_API_BASE));
    return list;
  }

  push('');
  if (typeof window !== 'undefined') {
    push(window.location.origin);
    push(swapLoopbackHost(window.location.origin));
  }
  return list;
}

const API_BASES = buildBaseCandidates();

function buildUrl(base, path) {
  if (!base) {
    return path;
  }
  return `${base}${path}`;
}

function buildHeaders(token, includeJson = true) {
  const headers = {};
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function withTimeout(signal, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeoutId),
  };
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toMessage(status, payload) {
  if (!payload) {
    return `Request failed (${status}).`;
  }
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload.detail) {
    return payload.detail;
  }
  if (payload.message) {
    return payload.message;
  }
  return `Request failed (${status}).`;
}

async function request(path, { method = 'GET', body, token, signal, allowUnauthenticated = false } = {}) {
  for (const base of API_BASES) {
    const { signal: timedSignal, clear } = withTimeout(signal);
    try {
      const response = await fetch(buildUrl(base, path), {
        method,
        headers: buildHeaders(token, body !== undefined),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timedSignal,
      });

      const payload = await readJsonSafe(response);
      if (!response.ok) {
        if (allowUnauthenticated && response.status === 401) {
          throw new Error('Session expired. Please sign in again.');
        }
        throw new Error(toMessage(response.status, payload));
      }
      return payload;
    } catch (error) {
      const isNetworkIssue =
        error instanceof TypeError || error?.name === 'AbortError' || error?.message === 'Failed to fetch';
      if (!isNetworkIssue) {
        throw error;
      }
    } finally {
      clear();
    }
  }

  const tried = API_BASES.map((base) => (base || '[same-origin]')).join(', ');
  throw new Error(`Unable to reach server. Tried ${tried}. Please check backend connectivity.`);
}

export const api = {
  loginWithFirebaseToken(firebaseIdToken) {
    return request('/login', {
      method: 'POST',
      body: { firebase_id_token: firebaseIdToken },
    });
  },
  me(token) {
    return request('/auth/me', { token, allowUnauthenticated: true });
  },
  sessions(token) {
    return request('/sessions', { token, allowUnauthenticated: true });
  },
  history(token, sessionId) {
    const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return request(`/history${query}`, { token, allowUnauthenticated: true });
  },
  chat(payload, token) {
    return request('/chat', {
      method: 'POST',
      body: payload,
      token,
      allowUnauthenticated: true,
    });
  },
  pinChat(sessionId, isPinned, token) {
    return request('/chat/pin', {
      method: 'POST',
      body: {
        session_id: sessionId,
        is_pinned: Boolean(isPinned),
      },
      token,
      allowUnauthenticated: true,
    });
  },
  archiveChat(sessionId, isArchived, token) {
    return request('/chat/archive', {
      method: 'POST',
      body: {
        session_id: sessionId,
        is_archived: Boolean(isArchived),
      },
      token,
      allowUnauthenticated: true,
    });
  },
  deleteChat(sessionId, token) {
    return request('/chat/delete', {
      method: 'POST',
      body: {
        session_id: sessionId,
      },
      token,
      allowUnauthenticated: true,
    });
  },
  getSettings(token) {
    return request('/settings', { token, allowUnauthenticated: true });
  },
  updateSettings(payload, token) {
    return request('/settings', {
      method: 'PUT',
      body: payload,
      token,
      allowUnauthenticated: true,
    });
  },
  getProfile(token) {
    return request('/profile', { token, allowUnauthenticated: true });
  },
  createProfile(payload, token) {
    return request('/profile', {
      method: 'POST',
      body: payload,
      token,
      allowUnauthenticated: true,
    });
  },
  updateProfile(payload, token) {
    return request('/profile', {
      method: 'PUT',
      body: payload,
      token,
      allowUnauthenticated: true,
    });
  },
  getPersonalization(token) {
    return request('/personalization', { token, allowUnauthenticated: true });
  },
  createPersonalization(payload, token) {
    return request('/personalization', {
      method: 'POST',
      body: payload,
      token,
      allowUnauthenticated: true,
    });
  },
  updatePersonalization(payload, token) {
    return request('/personalization', {
      method: 'PUT',
      body: payload,
      token,
      allowUnauthenticated: true,
    });
  },
  createShare(sessionId, token) {
    return request(`/sessions/${encodeURIComponent(sessionId)}/share`, {
      method: 'POST',
      token,
      allowUnauthenticated: true,
    });
  },
  sendReview(payload, token) {
    return request('/send-review', {
      method: 'POST',
      body: payload,
      token,
      allowUnauthenticated: true,
    });
  },
  getSharedConversation(shareId) {
    return request(`/share/${encodeURIComponent(shareId)}`);
  },
};
