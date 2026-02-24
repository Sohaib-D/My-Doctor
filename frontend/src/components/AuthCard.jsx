import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Stethoscope } from 'lucide-react';

import MedicalBackground from './MedicalBackground';
import { toApiUrl } from '../services/api';
import { getPasswordStrength } from '../utils/chat';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const adminPanelUrl = toApiUrl('/admin/login');

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
  initialEmail,
  showResendVerification,
  resendBusy,
  onModeChange,
  onEmailLogin,
  onEmailSignup,
  onRequestPasswordReset,
  onResetPassword,
  onGoogleLogin,
  onResendVerification,
  onContinueAsGuest,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [otp, setOtp] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotOtpRequested, setForgotOtpRequested] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const isRegister = mode === 'register';
  const trimmedEmail = email.trim();

  useEffect(() => {
    setEmail(initialEmail || '');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setOtp('');
    setShowForgotPassword(false);
    setForgotOtpRequested(false);
    setResetOtp('');
    setNewPassword('');
    setConfirmNewPassword('');
  }, [mode, initialEmail]);

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
    if (showForgotPassword) {
      return;
    }
    if (isRegister) {
      await onEmailSignup({ email, password, confirmPassword, fullName, otp });
      return;
    }
    await onEmailLogin({ email, password });
  };

  const handleForgotOtpRequest = async () => {
    const ok = await onRequestPasswordReset?.({ email });
    if (ok) {
      setForgotOtpRequested(true);
      setResetOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    const ok = await onResetPassword?.({
      email,
      otp: resetOtp,
      newPassword,
      confirmPassword: confirmNewPassword,
    });
    if (ok) {
      setShowForgotPassword(false);
      setForgotOtpRequested(false);
      setResetOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <MedicalBackground opacity={0.25} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-7 shadow-chat backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="pd-stethoscope-emerald rounded-lg bg-emerald-500/20 p-2 text-emerald-300">
            <Stethoscope size={18} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Personal Doctor AI</p>
            <h1 className="text-xl font-semibold text-white">
              {isRegister ? 'Create your account' : showForgotPassword ? 'Reset your password' : 'Sign in to continue'}
            </h1>
          </div>
        </div>

        <form className="space-y-4" onSubmit={onSubmit} autoComplete="on">
          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_email">
              Email
            </label>
            <input
              id="auth_email"
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={`w-full rounded-xl border bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 ${emailStateClass}`}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          {isRegister && !showForgotPassword && (
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
                autoComplete="name"
              />
            </div>
          )}

          {!showForgotPassword && (
            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_password">
                Password
              </label>
              <input
                id="auth_password"
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`w-full rounded-xl border bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 ${passwordStateClass}`}
                placeholder="Minimum 8 chars with Aa1"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
              />
            </div>
          )}

          {isRegister && !showForgotPassword && (
            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_confirm_password">
                Confirm password
              </label>
              <input
                id="auth_confirm_password"
                type="password"
                name="confirm_password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={`w-full rounded-xl border bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 ${confirmPasswordStateClass}`}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                required
              />
            </div>
          )}

          {isRegister && !showForgotPassword && <PasswordStrengthIndicator password={password} />}

          {error && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
          {info && (
            <p className="whitespace-pre-line rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              {info}
            </p>
          )}

          {isRegister && !showForgotPassword && (
            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_otp">
                OTP
              </label>
              <input
                id="auth_otp"
                type="text"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400/30 placeholder:text-slate-500 focus:ring-2"
                placeholder="Enter OTP"
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            </div>
          )}

          {showResendVerification && isRegister && !showForgotPassword && (
            <button
              type="button"
              onClick={onResendVerification}
              disabled={busy || resendBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60"
            >
              {(busy || resendBusy) && <Loader2 size={16} className="animate-spin" />}
              Resend OTP
            </button>
          )}

          {!showForgotPassword && (
            <button
              type="submit"
              disabled={busy || resendBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {isRegister ? 'Create account' : 'Sign in'}
            </button>
          )}
        </form>

        {!isRegister && !showForgotPassword && (
          <button
            type="button"
            onClick={() => {
              setShowForgotPassword(true);
              setForgotOtpRequested(false);
              setResetOtp('');
              setNewPassword('');
              setConfirmNewPassword('');
            }}
            className="mt-3 text-left text-sm text-cyan-200 underline decoration-cyan-500/60 underline-offset-4 hover:text-cyan-100"
          >
            Forgot password?
          </button>
        )}

        {!isRegister && showForgotPassword && (
          <form className="mt-4 space-y-3" onSubmit={handleResetPassword} autoComplete="on">
            <p className="text-sm text-slate-300">
              Request reset OTP, then set a new password.
            </p>
            <button
              type="button"
              onClick={handleForgotOtpRequest}
              disabled={busy || resendBusy || !EMAIL_PATTERN.test(trimmedEmail)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60"
            >
              {(busy || resendBusy) && <Loader2 size={16} className="animate-spin" />}
              {forgotOtpRequested ? 'Resend reset OTP' : 'Send reset OTP'}
            </button>

            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_reset_otp">
                Reset OTP
              </label>
              <input
                id="auth_reset_otp"
                type="text"
                value={resetOtp}
                onChange={(event) => setResetOtp(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400/30 placeholder:text-slate-500 focus:ring-2"
                placeholder="Enter reset OTP"
                autoComplete="one-time-code"
                inputMode="numeric"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_new_password">
                New password
              </label>
              <input
                id="auth_new_password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400/30 placeholder:text-slate-500 focus:ring-2"
                placeholder="Minimum 8 chars with Aa1"
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="auth_confirm_new_password">
                Confirm new password
              </label>
              <input
                id="auth_confirm_new_password"
                type="password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400/30 placeholder:text-slate-500 focus:ring-2"
                placeholder="Re-enter new password"
                autoComplete="new-password"
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={busy || resendBusy || !forgotOtpRequested}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
              >
                Reset password
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotOtpRequested(false);
                  setResetOtp('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                }}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                Back
              </button>
            </div>
          </form>
        )}

        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={busy || showForgotPassword}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10 disabled:opacity-60"
        >
          <ExternalLink size={15} />
          Continue with Google
        </button>

        <a
          href={adminPanelUrl}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20"
        >
          <ExternalLink size={15} />
          Open Admin Panel
        </a>

        {isRegister ? (
          <button
            type="button"
            onClick={() => onModeChange('login')}
            className="mt-5 text-sm text-slate-300 underline decoration-slate-500 underline-offset-4 hover:text-white"
          >
            Already registered? Sign in
          </button>
        ) : (
          <div className="mt-5 flex w-full items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onModeChange('register')}
              className="text-left text-sm text-slate-300 underline decoration-slate-500 underline-offset-4 hover:text-white"
            >
              Need an account? Create one
            </button>
            <button
              type="button"
              onClick={onContinueAsGuest}
              className="text-right text-sm text-slate-300 underline decoration-slate-500 underline-offset-4 hover:text-white"
            >
              Continue as Guest
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
