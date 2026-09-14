import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { errorMessage } from '../api';
import { titleCase } from '../format';

/* ---------- Layout primitives ---------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, actions, className = '', padded = true }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`card ${padded ? '' : 'card-flush'} ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <h2>{title}</h2>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status">
      <span className="spinner" /> {label}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <span>{errorMessage(error)}</span>
      {retry && (
        <Button size="sm" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Empty({ children = 'Nothing here yet.' }: { children?: ReactNode }) {
  return <div className="state state-empty">{children}</div>;
}

/** Renders loading / error / content for a useApi result. */
export function Async<T>({ data, loading, error, retry, children }: { data: T | null; loading: boolean; error: Error | null; retry?: () => void; children: (data: T) => ReactNode }) {
  if (data === null && loading) return <Loading />;
  if (data === null && error) return <ErrorBox error={error} retry={retry} />;
  if (data === null) return null;
  return <>{children(data)}</>;
}

/* ---------- Controls ---------- */

type Variant = 'default' | 'primary' | 'danger' | 'ghost' | 'success';

export function Button({ variant = 'default', size = 'md', busy, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean }) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || busy} className={`btn btn-${variant} btn-${size} ${className}`}>
      {busy && <span className="spinner spinner-sm" />}
      {children}
    </button>
  );
}

export function Field({ label, children, hint, className = '' }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input ${props.className ?? ''}`} />;
}

/* ---------- Badges ---------- */

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: 'blue',
  CHECKED_IN: 'green',
  CHECKED_OUT: 'grey',
  CANCELLED: 'grey',
  NO_SHOW: 'grey',
  DEPARTING: 'amber',
  VACANT: 'grey',
  OCCUPIED: 'green',
  OUT_OF_ORDER: 'red',
  OUT_OF_SERVICE: 'red',
  CLEAN: 'green',
  DIRTY: 'amber',
  INSPECTED: 'teal',
  IN_PROGRESS: 'blue',
  PENDING: 'amber',
  DONE: 'green',
  OPEN: 'blue',
  CLOSED: 'grey',
  PAID: 'green',
  POSTED_TO_ROOM: 'teal',
  VOID: 'grey',
  PENDING_APPROVAL: 'amber',
  APPROVED: 'blue',
  PARTIALLY_RECEIVED: 'teal',
  RECEIVED: 'green',
  ACCEPTED: 'green',
  SUBMITTED: 'blue',
  REJECTED: 'red',
  QUEUED: 'amber',
  SENT: 'blue',
  DELIVERED: 'green',
  FAILED: 'red',
  ACTIVE: 'green',
  ERROR: 'red',
  DISABLED: 'grey',
  OK: 'green',
  BOOKED: 'blue',
  WAITLIST: 'amber',
  ATTENDED: 'green',
  SCHEDULED: 'blue',
  COMPLETED: 'grey',
  INFO: 'blue',
  WARNING: 'amber',
  CRITICAL: 'red',
  RUSH: 'red',
  HIGH: 'amber',
  NORMAL: 'grey',
  LOW: 'grey',
};

export function Badge({ tone, children, className = '' }: { tone?: string; children: ReactNode; className?: string }) {
  return <span className={`badge badge-${tone ?? 'grey'} ${className}`}>{children}</span>;
}

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <Badge>—</Badge>;
  return <Badge tone={STATUS_TONE[status] ?? 'grey'}>{label ?? titleCase(status)}</Badge>;
}

export function statusTone(status: string): string {
  return STATUS_TONE[status] ?? 'grey';
}

/* ---------- Overlays ---------- */

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={onClose}>
      <aside className={`drawer ${wide ? 'drawer-wide' : ''}`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay overlay-center" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------- Misc ---------- */

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o.value} className={`chip ${value === o.value ? 'chip-active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function JsonView({ value }: { value: unknown }) {
  let text = '';
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    text = JSON.stringify(parsed, null, 2);
  } catch {
    text = String(value);
  }
  return <pre className="json">{text}</pre>;
}

/**
 * Props that make a non-button element operable by keyboard as well as mouse.
 *
 * Several surfaces (the rack bars, room cards, session chips, rate-plan offers) are laid
 * out as divs for styling reasons. Without a tab stop and Enter/Space handling a
 * keyboard-only user cannot reach them at all, which on a front desk is most of the app.
 */
export function clickable(onActivate: () => void, disabled = false) {
  return {
    role: 'button' as const,
    tabIndex: disabled ? -1 : 0,
    'aria-disabled': disabled || undefined,
    onClick: () => {
      if (!disabled) onActivate();
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
