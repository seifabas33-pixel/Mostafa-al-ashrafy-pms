import { useEffect, useMemo, useState } from 'react';
import { api, prop } from '../api';
import { Async, Badge, Button, Card, Drawer, Empty, Field, Input, PageHeader, Select, StatusBadge, clickable } from '../components/ui';
import { useProperty, useToast } from '../context';
import { addDays, day, money, shortDate, timeOf, titleCase, weekday } from '../format';
import { useApi } from '../hooks';
import type { Activity, ProgrammeDay, ProgrammeSession, Reservation, Signup } from '../types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ActivitiesPage() {
  const property = useProperty();
  const toast = useToast();
  const cur = property.currency;
  const bd = day(property.businessDate);
  const [from, setFrom] = useState(bd);
  const [session, setSession] = useState<ProgrammeSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [signup, setSignup] = useState({ reservationId: '', pax: 1, postToFolio: true });
  const [gen, setGen] = useState({ activityId: '', from: bd, days: 7, startTime: '10:00', weekdays: [0, 1, 2, 3, 4, 5, 6] as number[], host: '' });

  useEffect(() => setFrom(bd), [bd]);

  const programme = useApi(() => api.get<ProgrammeDay[]>(prop(property.id, '/programme'), { from, days: 7 }), [property.id, from]);
  const activities = useApi(() => api.get<Activity[]>(prop(property.id, '/activities')), [property.id]);
  const inHouse = useApi(() => api.get<Reservation[]>(prop(property.id, '/reservations'), { status: 'CHECKED_IN', take: 500 }), [property.id]);
  const signups = useApi(() => api.get<Signup[]>(prop(property.id, `/sessions/${session?.sessionId}/signups`)), [property.id, session?.sessionId], { enabled: !!session });

  useEffect(() => {
    if (activities.data?.length && !gen.activityId) setGen((g) => ({ ...g, activityId: activities.data![0].id }));
  }, [activities.data, gen.activityId]);

  const times = useMemo(() => {
    const set = new Set<string>();
    for (const d of programme.data ?? []) for (const s of d.sessions) set.add(timeOf(s.startsAt));
    return [...set].sort();
  }, [programme.data]);

  async function addSignup() {
    if (!session) return;
    setBusy('signup');
    const r = await toast.run(() => api.post<Signup>(prop(property.id, `/sessions/${session.sessionId}/signups`), { reservationId: signup.reservationId || undefined, pax: signup.pax, postToFolio: signup.postToFolio }), 'Guest signed up');
    setBusy(null);
    if (r) {
      if (r.status === 'WAITLIST') toast.push('Session is full: guest was waitlisted', 'info');
      signups.reload();
      programme.reload();
      setSignup({ reservationId: '', pax: 1, postToFolio: true });
    }
  }

  async function setStatus(s: Signup, status: string) {
    setBusy(s.id);
    const r = await toast.run(() => api.patch(prop(property.id, `/signups/${s.id}`), { status }), `Marked ${titleCase(status)}`);
    setBusy(null);
    if (r !== undefined) {
      signups.reload();
      programme.reload();
    }
  }

  async function generate() {
    setBusy('gen');
    const r = await toast.run(() => api.post<unknown[]>(prop(property.id, `/activities/${gen.activityId}/sessions`), { from: gen.from, days: gen.days, startTime: gen.startTime, weekdays: gen.weekdays.length === 7 ? undefined : gen.weekdays, host: gen.host || undefined }), 'Sessions generated');
    setBusy(null);
    if (r !== undefined) {
      programme.reload();
      activities.reload();
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Activities & entertainment"
        subtitle="Weekly programme with capacity, guest sign-ups posted to the folio"
        actions={
          <>
            <Button size="sm" onClick={() => setFrom(addDays(from, -7))}>
              ← Week
            </Button>
            <Button size="sm" onClick={() => setFrom(bd)} disabled={from === bd}>
              This week
            </Button>
            <Input type="date" className="input-sm input-auto" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            <Button size="sm" onClick={() => setFrom(addDays(from, 7))}>
              Week →
            </Button>
          </>
        }
      />

      <Card title="Programme" padded={false}>
        <Async data={programme.data} loading={programme.loading} error={programme.error} retry={programme.reload}>
          {(days) =>
            times.length === 0 ? (
              <Empty>No sessions scheduled this week. Generate some below.</Empty>
            ) : (
              <div className="table-wrap">
                <div className="programme" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(150px, 1fr))` }}>
                  <div className="programme-cell programme-head programme-time">Time</div>
                  {days.map((d) => (
                    <div key={d.date} className={`programme-cell programme-head ${d.date === bd ? 'today' : ''}`} style={d.date === bd ? { background: 'var(--primary-soft)' } : undefined}>
                      {weekday(d.date)} <span className="faint">{shortDate(d.date)}</span>
                    </div>
                  ))}
                  {times.map((t) => (
                    <div key={t} style={{ display: 'contents' }}>
                      <div className="programme-cell programme-time">{t}</div>
                      {days.map((d) => (
                        <div key={d.date} className="programme-cell">
                          {d.sessions
                            .filter((s) => timeOf(s.startsAt) === t)
                            .map((s) => (
                              <div key={s.sessionId} className={`session-chip ${s.remaining <= 0 ? 'full' : ''} ${s.status === 'CANCELLED' ? 'cancelled' : ''}`} {...clickable(() => setSession(s))} title={`${s.name} · ${s.location}`}>
                                <div className="strong">{s.name}</div>
                                <div className="cap">
                                  {s.booked}/{s.capacity} booked · {s.location}
                                  {s.price > 0 ? ` · ${money(s.price, cur, { compact: true })}` : ''}
                                </div>
                              </div>
                            ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        </Async>
      </Card>

      <div className="grid grid-2">
        <Card title="Activities" padded={false}>
          <Async data={activities.data} loading={activities.loading} error={activities.error} retry={activities.reload}>
            {(list) => (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Activity</th>
                      <th>Category</th>
                      <th>Team</th>
                      <th className="num">Cap.</th>
                      <th className="num">Price</th>
                      <th className="num">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id} className="clickable" onClick={() => setGen({ ...gen, activityId: a.id })}>
                        <td className="mono">{a.code}</td>
                        <td>
                          {a.name}
                          {!a.published && (
                            <Badge className="ml" tone="grey">
                              unpublished
                            </Badge>
                          )}
                        </td>
                        <td>{titleCase(a.category)}</td>
                        <td className="muted">{a.team}</td>
                        <td className="num">{a.capacity}</td>
                        <td className="num">{a.price ? money(a.price, cur) : 'Free'}</td>
                        <td className="num">{a._count?.sessions ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Card>

        <Card title="Generate sessions">
          <div className="stack">
            <Field label="Activity">
              <Select value={gen.activityId} onChange={(e) => setGen({ ...gen, activityId: e.target.value })}>
                {(activities.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.durationMin} min)
                  </option>
                ))}
              </Select>
            </Field>
            <div className="form-grid">
              <Field label="From">
                <Input type="date" value={gen.from} onChange={(e) => setGen({ ...gen, from: e.target.value })} />
              </Field>
              <Field label="Days">
                <Input type="number" min={1} max={90} value={gen.days} onChange={(e) => setGen({ ...gen, days: Math.min(90, Math.max(1, Number(e.target.value))) })} />
              </Field>
              <Field label="Start time">
                <Input type="time" value={gen.startTime} onChange={(e) => setGen({ ...gen, startTime: e.target.value })} />
              </Field>
              <Field label="Host">
                <Input value={gen.host} onChange={(e) => setGen({ ...gen, host: e.target.value })} placeholder="Optional" />
              </Field>
            </div>
            <div>
              <div className="field-label mb">Weekdays</div>
              <div className="chips">
                {WEEKDAYS.map((w, i) => (
                  <button key={w} type="button" className={`chip ${gen.weekdays.includes(i) ? 'chip-active' : ''}`} onClick={() => setGen({ ...gen, weekdays: gen.weekdays.includes(i) ? gen.weekdays.filter((x) => x !== i) : [...gen.weekdays, i].sort() })}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="primary" busy={busy === 'gen'} disabled={!gen.activityId || !gen.weekdays.length || !/^\d{2}:\d{2}$/.test(gen.startTime)} onClick={generate}>
              Generate sessions
            </Button>
          </div>
        </Card>
      </div>

      <Drawer open={!!session} onClose={() => setSession(null)} title={session ? session.name : ''}>
        {session && (
          <div className="stack">
            <div className="row">
              <StatusBadge status={session.status} />
              <Badge>{titleCase(session.category)}</Badge>
              <span className="muted">
                {day(session.startsAt)} {timeOf(session.startsAt)}–{timeOf(session.endsAt)} · {session.location}
              </span>
            </div>
            <div className="row">
              <Badge tone={session.remaining <= 0 ? 'amber' : 'green'}>
                {session.booked}/{session.capacity} booked · {session.remaining} left
              </Badge>
              <span className="muted">Host: {session.host}</span>
              <span className="muted">{session.price ? money(session.price, cur) + ' pp' : 'Free'}</span>
            </div>

            <h3>Sign-ups</h3>
            <Async data={signups.data} loading={signups.loading} error={signups.error} retry={signups.reload}>
              {(list) =>
                list.length === 0 ? (
                  <Empty>No sign-ups yet.</Empty>
                ) : (
                  <div className="list">
                    {list.map((s) => (
                      <div className="list-item" key={s.id}>
                        <div className="list-main">
                          <div className="list-title">
                            {s.guest ? `${s.guest.firstName} ${s.guest.lastName}` : 'Guest'} · {s.pax} pax
                          </div>
                          <div className="list-sub">
                            {s.reservation ? `${s.reservation.confirmationNumber}${s.reservation.room ? ` · Room ${s.reservation.room.number}` : ''}` : 'No reservation'}
                            {s.folioLineId ? ' · posted to folio' : ''}
                          </div>
                        </div>
                        <div className="row">
                          <StatusBadge status={s.status} />
                          {(s.status === 'BOOKED' || s.status === 'WAITLIST') && (
                            <>
                              <Button size="sm" busy={busy === s.id} onClick={() => setStatus(s, 'ATTENDED')}>
                                Attended
                              </Button>
                              <Button size="sm" variant="ghost" busy={busy === s.id} onClick={() => setStatus(s, 'NO_SHOW')}>
                                No-show
                              </Button>
                              <Button size="sm" variant="danger" busy={busy === s.id} onClick={() => setStatus(s, 'CANCELLED')}>
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </Async>

            <hr style={{ border: 0, borderTop: '1px solid var(--border)' }} />
            <h3>Add a guest</h3>
            <Field label="In-house reservation">
              <Select value={signup.reservationId} onChange={(e) => setSignup({ ...signup, reservationId: e.target.value })}>
                <option value="">Choose…</option>
                {(inHouse.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.room ? `Room ${r.room.number} · ` : ''}
                    {r.guest.firstName} {r.guest.lastName} ({r.confirmationNumber})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="form-row">
              <Field label="Pax">
                <Input type="number" min={1} value={signup.pax} onChange={(e) => setSignup({ ...signup, pax: Math.max(1, Number(e.target.value)) })} />
              </Field>
              <label className="check" style={{ paddingBottom: 8 }}>
                <input type="checkbox" checked={signup.postToFolio} onChange={(e) => setSignup({ ...signup, postToFolio: e.target.checked })} /> Post {session.price ? money(session.price * signup.pax, cur) : 'nothing (free)'} to folio
              </label>
            </div>
            <Button variant="primary" busy={busy === 'signup'} disabled={!signup.reservationId} onClick={addSignup}>
              Sign up
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
