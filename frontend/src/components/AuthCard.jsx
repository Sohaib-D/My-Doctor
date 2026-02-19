import React, { useMemo, useState } from 'react';
import { ExternalLink, Loader2, Stethoscope } from 'lucide-react';

import MedicalBackground from './MedicalBackground';
import { getPasswordStrength } from '../utils/chat';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function PasswordStrengthIndicator({ password }) {
  const strength = useMemo(() => getPasswordStrength(password), [password]);
  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full ${strength.color} transition-all`}
          style={{ width: `${Math.max((strength.score / 4) * 100, password ? 15 : 0)}%` }}
        />
      </div>
      <p className="text-xs text-slate-400">
        Password strength: <span className="font-medium text-slate-200">{strength.label}</span>
      </p>
    </div>
  );
}

export default function AuthCard({
  mode,
  busy,
  error,
  info,
  showResendVerification,
  resendBusy,
  onModeChange,
  onEmailLogin,
  onEmailSignup,
  onGoogleLogin,
  onResendVerification,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const isRegister = mode === 'register';
  const trimmedEmail = email.trim();

  const emailStateClass =
    isRegister && trimmedEmail
      ? EMAIL_PATTERN.test(trimmedEmail)
        ? 'border-emerald-400/55 ring-emerald-400/40 focus:ring-emerald-400/50'
        : 'border-red-500/70 ring-red-500/35 focus:ring-red-400/45'
      : 'border-white/10 ring-emerald-400/30 focus:ring-emerald-400/40';

  const passwordStateClass =
    isRegister && password
      ? PASSWORD_PATTERN.test(password)
        ? 'border-emerald-400/55 ring-emerald-400/40 focus:ring-emerald-400/50'
        : 'border-red-500/70 ring-red-500/35 focus:ring-red-400/45'
      : 'border-white/10 ring-emerald-400/30 focus:ring-emerald-400/40';

  const confirmPasswordStateClass =
    isRegister && confirmPassword
      ? confirmPassword === password
        ? 'border-emerald-400/55 ring-emerald-400/40 focus:ring-emerald-400/50'
        : 'border-red-500/70 ring-red-500/35 focus:ring-red-400/45'
      : 'border-white/10 ring-emerald-400/30 focus:ring-emerald-400/40';

  const onSubmit = async (event) => {
    event.preventDefault();
    if (isRegister) {
      await onEmailSignup({ email, password, confirmPassword, fullName });
      return;
    }
    await onEmailLogin({ email, password });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <MedicalBackground />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-7 shadow-chat backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300">
            <Stethoscope size={18} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Personal Doctor AI</p>
            <h1 className="text-xl font-semibold text-white">
              {isRegister ? 'Create your account' : 'Sign in to continue'}
            </h1>
          </div>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_email">
              Email
            </label>
            <input
              id="auth_email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={`w-full rounded-xl border bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 ${emailStateClass}`}
              placeholder="you@example.com"
              required
            />
          </div>

          {isRegister && (
            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_name">
                Full name
              </label>
              <input
                id="auth_name"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400/30 placeholder:text-slate-500 focus:ring-2"
                placeholder="Your full name"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_password">
              Password
            </label>
            <input
              id="auth_password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`w-full rounded-xl border bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 ${passwordStateClass}`}
              placeholder="Minimum 8 chars with Aa1"
              required
            />
          </div>

          {isRegister && (
            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_confirm_password">
                Confirm password
              </label>
              <input
                id="auth_confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={`w-full rounded-xl border bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 ${confirmPasswordStateClass}`}
                placeholder="Re-enter your password"
                required
              />
            </div>
          )}

          {isRegister && <PasswordStrengthIndicator password={password} />}

          {error && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
          {info && (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              {info}
            </p>
          )}
          {showResendVerification && (
            <button
              type="button"
              onClick={onResendVerification}
              disabled={busy || resendBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60"
            >
              {(busy || resendBusy) && <Loader2 size={16} className="animate-spin" />}
              Resend verification
            </button>
          )}

          <button
            type="submit"
            disabled={busy || resendBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10 disabled:opacity-60"
        >
          <ExternalLink size={15} />
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => onModeChange(isRegister ? 'login' : 'register')}
          className="mt-5 text-sm text-slate-300 underline decoration-slate-500 underline-offset-4 hover:text-white"
        >
          {isRegister ? 'Already registered? Sign in' : 'Need an account? Create one'}
        </button>
      </div>
    </div>
  );
}
