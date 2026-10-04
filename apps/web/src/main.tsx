import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { ROLE_HOME, ROLES } from '@waypoint/shared';
import { LandingRedirect, ProtectedRole, useIdentity } from './auth';
import { Login } from './Login';
import { Shell } from './Shell';
import { NAVIGATION, ROLE_SLUG } from './navigation';
import './styles.css';
import { ensureOfflineShell } from './offline/shell';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
void ensureOfflineShell();
function Forbidden() {
  const identity = useIdentity();
  return <main className="session-state"><h1>This workspace belongs to another role</h1><p>Your account can access its assigned workspace.</p><Link className="btn primary" to={identity.data ? ROLE_HOME[identity.data.role] : '/login'}>Return to your workspace</Link></main>;
}
function App() {
  return <Routes><Route path="/" element={<LandingRedirect />} /><Route path="/login" element={<Login />} /><Route path="/forbidden" element={<Forbidden />} />{ROLES.map(role => <Route key={role} element={<ProtectedRole role={role} />}><Route path={`/${ROLE_SLUG[role]}`} element={<Navigate to={ROLE_HOME[role]} replace />} />{NAVIGATION[role].map(page => <Route key={page.slug} path={`/${ROLE_SLUG[role]}/${page.slug}`} element={<Shell role={role} />} />)}</Route>)}<Route path="*" element={<main className="session-state"><h1>Page not found</h1><p>This workspace page does not exist.</p><Link className="btn primary" to="/">Go to your workspace</Link></main>} /></Routes>;
}
const root = import.meta.hot?.data.root ?? ReactDOM.createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></React.StrictMode>);
