import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../context';
import { day } from '../format';
import { Button, ErrorBox, Loading } from './ui';

const NAV: { to: string; label: string; icon: string; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: '◧', end: true },
  { to: '/rack', label: 'Room rack', icon: '▦' },
  { to: '/reservations', label: 'Reservations', icon: '☰' },
  { to: '/housekeeping', label: 'Housekeeping', icon: '✦' },
  { to: '/pos', label: 'POS', icon: '⌘' },
  { to: '/inventory', label: 'Inventory', icon: '▤' },
  { to: '/activities', label: 'Activities', icon: '◔' },
  { to: '/compliance', label: 'Compliance', icon: '✓' },
  { to: '/channels', label: 'Channels & guests', icon: '⇄' },
  { to: '/reports', label: 'Reports', icon: '▥' },
  { to: '/pricing', label: 'Pricing', icon: '◈' },
  { to: '/book', label: 'Booking engine', icon: '◉' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export function Layout() {
  const { property, properties, setPropertyId, loading, error, reload } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Settings and public pages must stay reachable when the key is wrong or the API is down.
  const standalone = ['/settings', '/pricing'].some((p) => location.pathname.startsWith(p));

  return (
    <div className={`shell ${open ? 'shell-nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <div className="brand-text">
            <div className="brand-name">Ashrafy PMS</div>
            <div className="brand-sub">Cloud hotel operations</div>
          </div>
          <button type="button" className="icon-btn nav-toggle" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? '×' : '☰'}
          </button>
        </div>
        <div className="sidebar-property">
          <select className="input property-switcher" value={property?.id ?? ''} onChange={(e) => setPropertyId(e.target.value)} aria-label="Active property" disabled={!properties.length}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
            {!properties.length && <option value="">No properties</option>}
          </select>
        </div>
        <div className="sidebar-nav">
          <nav className="nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="nav-icon" aria-hidden>
                  {n.icon}
                </span>
                {n.label}
              </NavLink>
            ))}
          </nav>
          {property && (
            <div className="sidebar-foot">
              <div>
                <span className="muted">Business date</span>
                <strong>{day(property.businessDate)}</strong>
              </div>
              <div>
                <span className="muted">Currency</span>
                <strong>{property.currency}</strong>
              </div>
            </div>
          )}
        </div>
      </aside>
      <main className="main">
        {standalone ? (
          <Outlet />
        ) : loading && !property ? (
          <Loading label="Connecting to the API…" />
        ) : error && !property ? (
          <div className="page">
            <ErrorBox error={new Error(`Could not load /api/me: ${error}`)} retry={reload} />
            <p className="muted">
              Check that the API is running on port 4000 and that the API key in <NavLink to="/settings">Settings</NavLink> is correct.
            </p>
            <Button onClick={reload}>Retry</Button>
          </div>
        ) : property ? (
          <Outlet />
        ) : (
          <div className="page">
            <ErrorBox error={new Error('This API key has no properties.')} retry={reload} />
          </div>
        )}
      </main>
    </div>
  );
}
