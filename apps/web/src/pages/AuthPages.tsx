import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  Building,
  ArrowLeft,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button, Input } from '@marche/ui';
import { ApiError } from '../lib/api';

function AuthBrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] shrink-0 relative overflow-hidden border-r border-border bg-[#eef2ec] items-center justify-center">
      <img
        src="/images/auth-hero.png"
        alt="Marché — search services, browse popular categories, and connect with top-rated event professionals"
        className="w-full h-full object-contain"
      />
    </div>
  );
}

export const AuthSignInPage: React.FC = () => {
  const { navigate, goBack, loginWithCredentials, requestPasswordReset } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotSent, setForgotSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await loginWithCredentials(email, password);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrorMessage('Enter your email address first, then click "Forgot password?"');
      return;
    }
    setErrorMessage(null);
    try {
      await requestPasswordReset(email);
      setForgotSent(true);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#eef2ec] flex font-sans">
      <AuthBrandPanel />
      <div className="flex-1 flex flex-col p-3 sm:p-4 overflow-y-auto">
        {/* Top Bar Navigation */}
        <div className="shrink-0 max-w-7xl w-full mx-auto flex items-center justify-between">
          <button
            onClick={goBack}
            aria-label="Back"
            className="flex items-center justify-center w-8 h-8 rounded-full text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Main Card */}
        <div className="flex-1 flex items-center justify-center py-6">
          <div className="w-full max-w-md bg-white border border-border rounded-2xl p-5 sm:p-6 shadow-marche-card space-y-4">
            <div className="text-center space-y-1">
              <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg mx-auto shadow-xs mb-1">
                M
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
                Welcome back
              </h1>
              <p className="text-[11px] text-ink-muted">
                Sign in to access your event dashboard and contracts
              </p>
            </div>

            <form onSubmit={handleSignIn} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-1.5 sm:py-2 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-ink">Password</label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl pl-9 pr-9 py-1.5 sm:py-2 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {forgotSent && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-[11px] flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>
                    If an account exists for that email, reset instructions have been sent.
                  </span>
                </div>
              )}

              {errorMessage && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-900 rounded-xl text-[11px]">
                  {errorMessage}
                </div>
              )}

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-[11px] text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Remember me on this device</span>
                </label>
              </div>

              <Button
                type="submit"
                size="md"
                className="w-full"
                icon={ArrowRight}
                iconPosition="right"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>

            {/* Quick Social Auth Dividers */}
            <div className="relative my-2.5 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <span className="relative bg-white px-2.5 text-[10px] uppercase font-mono text-ink-muted">
                Or continue with
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setErrorMessage('Social sign-in is not available yet.')}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-bg border border-border hover:bg-zinc-100 rounded-xl text-xs font-semibold text-ink transition-all cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Google</span>
              </button>

              <button
                type="button"
                onClick={() => setErrorMessage('Social sign-in is not available yet.')}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-bg border border-border hover:bg-zinc-100 rounded-xl text-xs font-semibold text-ink transition-all cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 fill-current text-black" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.85c.66-.8 1.11-1.92.99-3.04-.96.04-2.12.64-2.81 1.45-.62.72-1.16 1.87-1.01 2.98 1.07.08 2.17-.59 2.83-1.39z" />
                </svg>
                <span>Apple</span>
              </button>
            </div>

            <div className="pt-2.5 border-t border-border text-center text-xs text-ink-muted">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/auth/signup')}
                className="text-primary font-bold hover:underline cursor-pointer ml-1"
              >
                Sign up
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-center text-[10px] text-ink-muted py-1">
          &copy; {new Date().getFullYear()} Marché Event Talent Marketplace Inc. All rights
          reserved.
        </div>
      </div>
    </div>
  );
};

export const AuthSignUpPage: React.FC = () => {
  const { navigate, goBack, acceptLegalTerms, registerAccount } = useApp();
  const [role, setRole] = useState<'client' | 'vendor'>('client');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) return;
    setErrorMessage(null);
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await registerAccount({ email, password, name: fullName, role });
      acceptLegalTerms({ role, context: 'signup', name: fullName, email, companyOrTitle: company });
      setRegistered(true);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (registered) {
    return (
      <div className="min-h-screen bg-[#eef2ec] flex items-center justify-center font-sans p-4">
        <div className="w-full max-w-md bg-white border border-border rounded-2xl p-6 shadow-marche-card text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-xl font-extrabold text-ink tracking-tight">Check your email</h1>
          <p className="text-xs text-ink-muted leading-relaxed">
            We sent a verification link to <span className="font-semibold text-ink">{email}</span>.
            Verify your address, then sign in to continue.
          </p>
          <Button size="md" className="w-full" onClick={() => navigate('/auth/signin')}>
            Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef2ec] flex font-sans">
      <AuthBrandPanel />
      <div className="flex-1 flex flex-col p-3 sm:p-4 overflow-y-auto">
        {/* Top Bar Navigation */}
        <div className="shrink-0 max-w-7xl w-full mx-auto flex items-center justify-between">
          <button
            onClick={goBack}
            aria-label="Back"
            className="flex items-center justify-center w-8 h-8 rounded-full text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Main Card */}
        <div className="flex-1 flex items-center justify-center py-6">
          <div className="w-full max-w-lg bg-white border border-border rounded-2xl p-5 sm:p-6 shadow-marche-card space-y-3.5">
            <div className="text-center space-y-1">
              <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg mx-auto shadow-xs mb-1">
                M
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
                Create your account
              </h1>
              <p className="text-[11px] text-ink-muted">
                Join the trusted marketplace connecting event creators and elite talent
              </p>
            </div>

            <form onSubmit={handleSignUp} className="space-y-3">
              {/* Role Choice */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase font-bold text-ink-muted">
                  Account Type
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRole('client')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      role === 'client'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-bg hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <ShieldCheck
                        className={`w-3.5 h-3.5 ${role === 'client' ? 'text-primary' : 'text-zinc-400'}`}
                      />
                      <span className="text-xs font-bold text-ink">Client</span>
                    </div>
                    <span className="block text-[10px] text-ink-muted">
                      Post event briefs & hire talent.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('vendor')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      role === 'vendor'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-bg hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <UserCheck
                        className={`w-3.5 h-3.5 ${role === 'vendor' ? 'text-primary' : 'text-zinc-400'}`}
                      />
                      <span className="text-xs font-bold text-ink">Service Provider</span>
                    </div>
                    <span className="block text-[10px] text-ink-muted">
                      Offer professional event services.
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="e.g. Priya Menon"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    Company / Studio
                  </label>
                  <div className="relative">
                    <Building className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="e.g. Lumina Events"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl pl-9 pr-9 py-1.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="flex items-start gap-2 text-[11px] text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                    required
                  />
                  <span className="leading-snug">
                    I agree to Marché's{' '}
                    <a href="#terms" className="text-primary underline">
                      Terms
                    </a>{' '}
                    and{' '}
                    <a href="#privacy" className="text-primary underline">
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>
              </div>

              {errorMessage && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-900 rounded-xl text-[11px]">
                  {errorMessage}
                </div>
              )}

              <Button
                type="submit"
                size="md"
                className="w-full"
                icon={ArrowRight}
                iconPosition="right"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating account…' : 'Create Account & Get Started'}
              </Button>
            </form>

            <div className="pt-2 border-t border-border text-center text-xs text-ink-muted">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/auth/signin')}
                className="text-primary font-bold hover:underline cursor-pointer ml-1"
              >
                Sign in
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-center text-[10px] text-ink-muted py-1">
          &copy; {new Date().getFullYear()} Marché Event Talent Marketplace Inc. All rights
          reserved.
        </div>
      </div>
    </div>
  );
};

type VerifyStatus = 'verifying' | 'success' | 'error';

function tokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

export const AuthVerifyEmailPage: React.FC = () => {
  const { navigate, verifyEmailToken } = useApp();
  const [status, setStatus] = useState<VerifyStatus>(() =>
    tokenFromUrl() ? 'verifying' : 'error',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    tokenFromUrl() ? null : 'This verification link is missing its token.',
  );

  useEffect(() => {
    const token = tokenFromUrl();
    if (!token) return; // already reflected in the initial state above
    verifyEmailToken(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setErrorMessage(
          err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
        );
      });
    // Runs once on mount — the token comes from the URL, not from state that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#eef2ec] flex items-center justify-center font-sans p-4">
      <div className="w-full max-w-md bg-white border border-border rounded-2xl p-6 shadow-marche-card text-center space-y-3">
        {status === 'verifying' && (
          <>
            <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
            <h1 className="text-xl font-extrabold text-ink tracking-tight">
              Verifying your email…
            </h1>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
            <h1 className="text-xl font-extrabold text-ink tracking-tight">Email verified</h1>
            <p className="text-xs text-ink-muted leading-relaxed">
              Your address is confirmed. Sign in to continue.
            </p>
            <Button size="md" className="w-full" onClick={() => navigate('/auth/signin')}>
              Go to Sign In
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-10 h-10 text-danger mx-auto" />
            <h1 className="text-xl font-extrabold text-ink tracking-tight">Verification failed</h1>
            <p className="text-xs text-ink-muted leading-relaxed">
              {errorMessage ?? 'This link is invalid or has expired.'}
            </p>
            <Button size="md" className="w-full" onClick={() => navigate('/auth/signin')}>
              Go to Sign In
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export const AuthResetPasswordPage: React.FC = () => {
  const { navigate, submitPasswordReset } = useApp();
  const token = tokenFromUrl();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen bg-[#eef2ec] flex items-center justify-center font-sans p-4">
        <div className="w-full max-w-md bg-white border border-border rounded-2xl p-6 shadow-marche-card text-center space-y-3">
          <XCircle className="w-10 h-10 text-danger mx-auto" />
          <h1 className="text-xl font-extrabold text-ink tracking-tight">Invalid link</h1>
          <p className="text-xs text-ink-muted leading-relaxed">
            This password reset link is missing its token. Request a new one from the sign-in page.
          </p>
          <Button size="md" className="w-full" onClick={() => navigate('/auth/signin')}>
            Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#eef2ec] flex items-center justify-center font-sans p-4">
        <div className="w-full max-w-md bg-white border border-border rounded-2xl p-6 shadow-marche-card text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-xl font-extrabold text-ink tracking-tight">Password updated</h1>
          <p className="text-xs text-ink-muted leading-relaxed">
            Sign in with your new password. You've been signed out everywhere else for security.
          </p>
          <Button size="md" className="w-full" onClick={() => navigate('/auth/signin')}>
            Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitPasswordReset(token, newPassword);
      setDone(true);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#eef2ec] flex items-center justify-center font-sans p-4">
      <div className="w-full max-w-md bg-white border border-border rounded-2xl p-5 sm:p-6 shadow-marche-card space-y-4">
        <div className="text-center space-y-1">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg mx-auto shadow-xs mb-1">
            M
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
            Set a new password
          </h1>
          <p className="text-[11px] text-ink-muted">Choose a new password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">New Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl pl-9 pr-9 py-1.5 sm:py-2 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Confirm Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <Input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-1.5 sm:py-2 text-xs text-ink focus:outline-none focus:border-primary focus:bg-surface transition-all"
                required
              />
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-900 rounded-xl text-[11px]">
              {errorMessage}
            </div>
          )}

          <Button type="submit" size="md" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Updating password…' : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  );
};
