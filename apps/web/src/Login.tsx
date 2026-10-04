import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardList, Eye, EyeOff, LockKeyhole, Package, Route, ShieldCheck } from 'lucide-react';
import { DEMO_ACCOUNTS, loginSchema, ROLE_HOME, ROLE_LABELS, type LoginInput } from '@waypoint/shared';
import { login } from './api';
import { AUTH_KEY, SessionState, useIdentity } from './auth';
import { useState } from 'react';

export function Brand() {
  return <div className="brand"><img src="/assets/logo-mark.png" alt="" /><span><strong>WAYPOINT <b>PULSE</b></strong><small>FLEET COMMAND · SRI LANKA</small></span></div>;
}
export function Login() {
  const identity = useIdentity();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const mutation = useMutation({ mutationFn: login, onSuccess: user => {
    queryClient.clear();
    queryClient.setQueryData(AUTH_KEY, user);
    navigate(ROLE_HOME[user.role], { replace: true });
  } });
  if (identity.isPending) return <SessionState />;
  if (identity.isError) return <SessionState error={identity.error.message} retry={() => void identity.refetch()} />;
  if (identity.data) return <Navigate to={ROLE_HOME[identity.data.role]} replace />;

  return <main className="login-page">
    <a className="skip-link" href="#login-form">Skip to sign in</a>
    <div className="login-brand"><Brand /><span className="team-name">Code Crunchers</span></div>
    <div className="login-layout">
      <section className="login-story" aria-labelledby="story-title">
        <div className="story-label"><span /> ONE CONNECTED WORKSPACE</div>
        <h1 id="story-title">One order.<br />One system.<br /><span>Four perspectives.</span></h1>
        <p>From the planning office to the store floor, keep every handover connected.</p>
        <div className="perspective-list">{[
          [Package, 'Dispatcher', 'Plan with clarity'], [ClipboardList, 'Loader', 'Make every load count'],
          [Route, 'Driver', 'Keep the next stop in focus'], [ShieldCheck, 'Store Manager', 'Close the loop at receipt']
        ].map(([Icon, name, description]) => { const Symbol = Icon as typeof Package; return <div key={String(name)}><Symbol size={20} /><span><strong>{String(name)}</strong><small>{String(description)}</small></span></div>; })}</div>
        <div className="story-footer">WAYPOINT PULSE <span>TECH-TRIATHLON 2026</span></div>
      </section>
      <section className="login-panel" aria-labelledby="login-title">
        <span className="eyebrow">WELCOME TO WAYPOINT PULSE</span><h2 id="login-title">Sign in to your workspace</h2>
        <p className="muted">Use your account to continue with your assigned role.</p>
        <form id="login-form" onSubmit={form.handleSubmit(values => mutation.mutate(values))} noValidate>
          <div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="username" placeholder="you@waypoint.local" {...form.register('email')} aria-invalid={!!form.formState.errors.email} aria-describedby={form.formState.errors.email ? 'email-error' : undefined} />{form.formState.errors.email && <p id="email-error" className="field-error">{form.formState.errors.email.message}</p>}</div>
          <div className="field"><label htmlFor="password">Password</label><div className="password-input"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...form.register('password')} aria-invalid={!!form.formState.errors.password} aria-describedby={form.formState.errors.password ? 'password-error' : undefined} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{form.formState.errors.password && <p id="password-error" className="field-error">{form.formState.errors.password.message}</p>}</div>
          {mutation.isError && <div className="error-notice" role="alert">{mutation.error.message}</div>}
          <button className="btn primary login-submit" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Signing in…' : 'Sign in'}<ArrowRight size={18} /></button>
        </form>
        <div className="demo-accounts"><h3>Competition demo accounts</h3><p>Select an account, then enter the configured demo password.</p><div className="demo-grid">{DEMO_ACCOUNTS.map(account => <button type="button" key={account.role} onClick={() => { form.setValue('email', account.email, { shouldValidate: true }); mutation.reset(); document.getElementById('password')?.focus(); }}><span>{ROLE_LABELS[account.role]}</span><small>{account.email}</small></button>)}</div></div>
        <div className="sign-in-note"><LockKeyhole size={15} /> Your account determines your workspace access.</div>
      </section>
    </div><p className="login-footer">Waypoint Pulse · Team Code Crunchers</p>
  </main>;
}
