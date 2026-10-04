import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ChevronRight, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@waypoint/shared';
import { ApiFailure, apiRequest } from './api';
import { AUTH_KEY, useIdentity } from './auth';
import { Brand } from './Login';
import { NAVIGATION, ROLE_SLUG } from './navigation';
import { StoreWorkspace } from './store/StoreWorkspace';
import { DispatcherWorkspace } from './dispatcher/DispatcherWorkspace';
import { LoaderWorkspace } from './loader/LoaderWorkspace';

export function Shell({ role }: { role: Role }) {
  const identity = useIdentity();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1000px)').matches);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const pages = NAVIGATION[role];
  const page = pages.find(item => location.pathname.endsWith(`/${item.slug}`)) || pages[0];
  const workspace = useQuery({ queryKey: ['workspace', role], queryFn: () => apiRequest(`/workspaces/${ROLE_SLUG[role]}`), retry: false });
  const logout = useMutation({ mutationFn: () => apiRequest('/auth/logout', { method: 'POST' }), onSuccess: () => {
    queryClient.clear(); queryClient.setQueryData(AUTH_KEY, null); navigate('/login', { replace: true });
  } });
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1000px)');
    const update = () => { setCompact(media.matches); setMenuOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (workspace.error instanceof ApiFailure && workspace.error.status === 401) void queryClient.invalidateQueries({ queryKey: AUTH_KEY });
  }, [workspace.error, queryClient]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); }
      if (event.key !== 'Tab') return;
      const elements = [...(sidebar.current?.querySelectorAll<HTMLElement>('a, button') || [])];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  const closeMenu = () => { setMenuOpen(false); menuButton.current?.focus(); };
  const initials = ROLE_LABELS[role].split(' ').map(word => word[0]).join('');
  const Icon = page.icon;
  const workspacePath = (slug: string) => `/${ROLE_SLUG[role]}/${slug}${role === 'DISPATCHER' || role === 'LOADER' ? location.search : ''}`;
  const dispatcherDescriptions: Record<string, string> = { pulse: 'One operational picture of persisted demand, trips and issues across your depots.', orders: 'Review confirmed demand, receiving conditions and the recorded order lifecycle.', planning: 'Generate a depot plan, inspect recorded decisions, validate independently and confirm release.', routes: 'Review persisted vehicle assignments, stop sequence and arrival records.', exceptions: 'Keep operational issues visible from loading through Store receipt.', capacity: 'Reference capacity context with an honest view of unavailable predictions.' };

  return <div className={`app-shell role-${ROLE_SLUG[role]}`}>
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={closeMenu} />}
    <aside ref={sidebar} id="workspace-sidebar" className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Workspace menu" inert={compact && !menuOpen} aria-hidden={compact && !menuOpen ? true : undefined}>
      <div className="sidebar-brand"><Brand /><button type="button" className="icon-button sidebar-close" onClick={closeMenu} aria-label="Close navigation"><X size={20} /></button></div>
      <div className="role-block"><span>YOUR WORKSPACE</span><strong>{ROLE_LABELS[role]}<ShieldCheck size={16} /></strong></div>
      <nav className="primary-nav" aria-label={`${ROLE_LABELS[role]} navigation`}>{pages.map(item => <NavLink key={item.slug} to={workspacePath(item.slug)} onClick={() => { closeMenu(); }}><item.icon size={20} /><span>{item.label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="session-card"><ShieldCheck size={20} /><span><strong>Secure session</strong><small>Access is assigned to your account</small></span></div><button className="signout-button" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={18} />{logout.isPending ? 'Signing out…' : 'Sign out'}</button><span className="sidebar-note">Team Code Crunchers<br />{role === 'STORE_MANAGER' ? 'Store workspace' : role === 'DISPATCHER' ? 'Dispatcher workspace' : role === 'LOADER' ? 'Loader workspace' : 'Milestone 1 · Foundation'}</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button ref={menuButton} className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="workspace-sidebar"><Menu size={21} /></button><span className="breadcrumb">{ROLE_LABELS[role]} <ChevronRight size={13} /><strong>{page.title}</strong></span><span className="mobile-title">{page.title}</span></div><div className="topbar-right"><span className="foundation-badge">{role === 'STORE_MANAGER' ? 'Store workspace' : role === 'DISPATCHER' ? 'Dispatcher workspace' : role === 'LOADER' ? 'Loader workspace' : 'Foundation'}</span><div className="profile"><span className="avatar">{initials}</span><span><strong>{identity.data?.displayName}</strong><small>{ROLE_LABELS[role]}</small></span></div></div></header>
      <main id="workspace-content" className={`view-root ${role === 'DRIVER' ? 'driver-view' : ''}`} tabIndex={-1}>
        <div className="page-head"><div><span className="eyebrow">{ROLE_LABELS[role]}</span><h1>{page.title}</h1><p>{role === 'DISPATCHER' ? dispatcherDescriptions[page.slug] : page.description}</p></div><span className="workspace-state"><ShieldCheck size={15} /> Role access protected</span></div>
        {logout.isError && <div className="error-notice" role="alert">{logout.error.message} <button onClick={() => logout.mutate()}>Retry sign out</button></div>}
        {workspace.isPending ? <section className="empty-panel" role="status"><div className="loading-dot" /><h2>Connecting your workspace…</h2></section> : workspace.isError ? <section className="empty-panel"><h2>Workspace unavailable</h2><p role="alert">{workspace.error.message}</p><button className="btn primary" onClick={() => void workspace.refetch()}>Try again</button></section> : role === 'STORE_MANAGER' ? <StoreWorkspace page={page.slug} /> : role === 'DISPATCHER' ? <DispatcherWorkspace page={page.slug} /> : role === 'LOADER' ? <LoaderWorkspace page={page.slug} /> : <>
          <div className="foundation-context"><ShieldCheck size={20} /><span><strong>Your {ROLE_LABELS[role].toLowerCase()} workspace is ready</strong><small>Sign-in and role navigation are connected. Operational services are awaiting later milestones.</small></span></div>
          <section className="empty-panel"><div className="empty-icon"><Icon size={32} strokeWidth={1.6} /></div><span className="eyebrow">{page.label}</span><h2>{page.emptyTitle}</h2><p>{page.emptyDescription}</p><span className="empty-state-badge">Awaiting operational data</span></section>
          {page.slug === pages[0].slug && <section className="workspace-links" aria-labelledby="workspace-links-title"><div className="section-heading"><h2 id="workspace-links-title">Your workspace</h2><p>Keep every handover in view.</p></div><div className="workspace-link-grid">{pages.slice(1).map(item => <NavLink key={item.slug} to={workspacePath(item.slug)}><item.icon size={23} /><span><strong>{item.label}</strong><small>Explore this workspace</small></span><ArrowUpRight size={17} /></NavLink>)}</div></section>}
        </>}
        <footer className="workspace-footer"><span>Waypoint Pulse</span><span>One system. Four perspectives.</span></footer>
      </main>
    </div>
    <nav className="mobile-bottom-nav" style={{ '--nav-count': Math.min(pages.length, 4) } as CSSProperties} aria-label="Quick navigation">{pages.slice(0, 4).map(item => <NavLink key={item.slug} to={workspacePath(item.slug)}><item.icon size={20} /><span>{item.label}</span></NavLink>)}</nav>
  </div>;
}
