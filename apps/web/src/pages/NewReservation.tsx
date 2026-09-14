import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage, prop } from '../api';
import { Async, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Textarea, clickable } from '../components/ui';
import { useProperty, useToast } from '../context';
import { addDays, day, diffDays, money } from '../format';
import { useApi } from '../hooks';
import type { AvailabilityRow, Guest, Quote, RatePlan, Reservation, Room } from '../types';

type QuoteResult = { plan: RatePlan; quote?: Quote; error?: string };

export function NewReservationPage() {
  const property = useProperty();
  const toast = useToast();
  const navigate = useNavigate();
  const bd = day(property.businessDate);
  const cur = property.currency;

  const [arrival, setArrival] = useState(bd);
  const [departure, setDeparture] = useState(addDays(bd, 1));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [promoCode, setPromoCode] = useState('');
  const [roomTypeId, setRoomTypeId] = useState('');
  const [ratePlanId, setRatePlanId] = useState('');
  const [quotes, setQuotes] = useState<QuoteResult[] | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [guestMode, setGuestMode] = useState<'search' | 'new'>('search');
  const [guestSearch, setGuestSearch] = useState('');
  const [guest, setGuest] = useState<Guest | null>(null);
  const [newGuest, setNewGuest] = useState({ firstName: '', lastName: '', email: '', phone: '', nationality: '' });
  const [roomId, setRoomId] = useState('');
  const [source, setSource] = useState('DIRECT');
  const [specialRequests, setSpecialRequests] = useState('');
  const [creating, setCreating] = useState(false);

  const nights = diffDays(arrival, departure);
  const datesValid = /^\d{4}-\d{2}-\d{2}$/.test(arrival) && /^\d{4}-\d{2}-\d{2}$/.test(departure) && nights >= 1;

  const availability = useApi(() => api.get<AvailabilityRow[]>(prop(property.id, '/availability'), { from: arrival, to: departure }), [property.id, arrival, departure], { enabled: datesValid });
  const plans = useApi(() => api.get<RatePlan[]>(prop(property.id, '/rate-plans')), [property.id]);
  const guests = useApi(() => api.get<Guest[]>('/api/guests', { search: guestSearch, take: 20 }), [guestSearch], { enabled: guestMode === 'search' && guestSearch.trim().length >= 2 });
  const freeRooms = useApi(() => api.get<Room[]>(prop(property.id, '/free-rooms'), { roomTypeId, arrival, departure }), [property.id, roomTypeId, arrival, departure], { enabled: !!roomTypeId && datesValid });

  // Quote every active rate plan for the chosen room type.
  useEffect(() => {
    if (!roomTypeId || !datesValid || !plans.data) {
      setQuotes(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    const active = plans.data.filter((p) => p.active);
    Promise.all(
      active.map(async (plan): Promise<QuoteResult> => {
        try {
          const quote = await api.post<Quote>(prop(property.id, '/quote'), { roomTypeId, ratePlanId: plan.id, arrival, departure, promoCode: promoCode || undefined });
          return { plan, quote };
        } catch (e) {
          return { plan, error: errorMessage(e) };
        }
      }),
    ).then((res) => {
      if (cancelled) return;
      setQuotes(res.sort((a, b) => (a.quote?.total ?? Infinity) - (b.quote?.total ?? Infinity)));
      setQuoting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [roomTypeId, arrival, departure, promoCode, plans.data, property.id, datesValid]);

  useEffect(() => {
    setRoomId('');
  }, [roomTypeId, arrival, departure]);

  const selectedType = useMemo(() => availability.data?.find((r) => r.roomTypeId === roomTypeId), [availability.data, roomTypeId]);
  const selectedQuote = quotes?.find((q) => q.plan.id === ratePlanId)?.quote;
  const guestReady = guestMode === 'search' ? !!guest : newGuest.firstName.trim() && newGuest.lastName.trim();
  const canCreate = datesValid && roomTypeId && ratePlanId && selectedQuote && guestReady && !creating;

  async function create() {
    if (!canCreate) return;
    setCreating(true);
    const body: Record<string, unknown> = {
      roomTypeId,
      ratePlanId,
      arrival,
      departure,
      adults,
      children,
      promoCode: promoCode || undefined,
      source,
      specialRequests,
      roomId: roomId || undefined,
    };
    if (guestMode === 'search' && guest) body.guestId = guest.id;
    else
      body.guest = {
        firstName: newGuest.firstName.trim(),
        lastName: newGuest.lastName.trim(),
        email: newGuest.email.trim() || undefined,
        phone: newGuest.phone.trim() || undefined,
        nationality: newGuest.nationality.trim() ? newGuest.nationality.trim().toUpperCase().slice(0, 2) : undefined,
      };
    const r = await toast.run(() => api.post<Reservation>(prop(property.id, '/reservations'), body), 'Reservation created');
    setCreating(false);
    if (r) navigate(`/reservations/${r.id}`);
  }

  const step = !roomTypeId ? 2 : !ratePlanId ? 3 : !guestReady ? 4 : 5;

  return (
    <div className="page">
      <PageHeader
        title="New reservation"
        subtitle={`${property.name} · ${cur}`}
        actions={
          <Button variant="ghost" onClick={() => navigate('/reservations')}>
            Cancel
          </Button>
        }
      />
      <div className="steps">
        {['Stay', 'Room type', 'Rate plan', 'Guest', 'Confirm'].map((s, i) => (
          <span key={s} className={`step ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      <div className="grid grid-2">
        <div>
          <Card title="1 · Stay">
            <div className="form-grid">
              <Field label="Arrival">
                <Input
                  type="date"
                  value={arrival}
                  onChange={(e) => {
                    setArrival(e.target.value);
                    if (e.target.value && diffDays(e.target.value, departure) < 1) setDeparture(addDays(e.target.value, 1));
                  }}
                />
              </Field>
              <Field label="Departure">
                <Input type="date" value={departure} min={addDays(arrival, 1)} onChange={(e) => setDeparture(e.target.value)} />
              </Field>
              <Field label="Adults">
                <Input type="number" min={1} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))} />
              </Field>
              <Field label="Children">
                <Input type="number" min={0} value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value)))} />
              </Field>
              <Field label="Promo code" hint="Applied to the quotes">
                <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Optional" />
              </Field>
            </div>
            <p className="muted small mt">{datesValid ? `${nights} night${nights === 1 ? '' : 's'}` : 'Departure must be after arrival.'}</p>
          </Card>

          <Card title="2 · Room type & availability">
            {!datesValid ? (
              <Empty>Pick valid dates first.</Empty>
            ) : (
              <Async data={availability.data} loading={availability.loading} error={availability.error} retry={availability.reload}>
                {(rows) => (
                  <div className="table-wrap">
                    <table className="table table-compact">
                      <thead>
                        <tr>
                          <th />
                          <th>Type</th>
                          <th className="num">Min. available</th>
                          <th>Per night</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.roomTypeId} className={`clickable ${r.roomTypeId === roomTypeId ? 'selected' : ''}`} onClick={() => setRoomTypeId(r.roomTypeId)}>
                            <td>
                              <input type="radio" name="rt" checked={r.roomTypeId === roomTypeId} onChange={() => setRoomTypeId(r.roomTypeId)} />
                            </td>
                            <td>
                              <strong>{r.code}</strong> <span className="muted">{r.name}</span>
                              {r.sellMode === 'BED' && <Badge className="ml">per bed</Badge>}
                            </td>
                            <td className="num">
                              <Badge tone={r.minAvailable <= 0 ? 'red' : r.minAvailable <= 2 ? 'amber' : 'green'}>{r.minAvailable}</Badge>
                            </td>
                            <td className="small">
                              {r.days.map((d) => (
                                <span key={d.date} className={d.available <= 0 ? 'strong' : ''} style={{ marginRight: 6, color: d.available <= 0 ? 'var(--red)' : undefined }}>
                                  {d.date.slice(5)}:{d.available}
                                </span>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Async>
            )}
          </Card>

          <Card title="3 · Rate plan & quote">
            {!roomTypeId ? (
              <Empty>Select a room type to see quotes for every rate plan.</Empty>
            ) : quoting || !quotes ? (
              <Empty>Quoting…</Empty>
            ) : (
              <div className="stack">
                {quotes.map((q) => (
                  <div key={q.plan.id} className={`offer ${q.plan.id === ratePlanId ? 'selected' : ''} ${q.quote ? '' : 'faint'}`} {...clickable(() => setRatePlanId(q.plan.id), !q.quote)}>
                    <div>
                      <div className="strong">
                        {q.plan.code} · {q.plan.name}
                      </div>
                      <div className="small muted">
                        {q.plan.mealPlan} · min LOS {q.plan.minLos}
                        {q.plan.minLeadDays ? ` · book ${q.plan.minLeadDays}+ days ahead` : ''}
                        {q.plan.derivedFrom ? ` · derived from ${q.plan.derivedFrom.code} (${q.plan.derivedPct > 0 ? '+' : ''}${q.plan.derivedPct}%)` : ''}
                      </div>
                      {q.error && <div className="small" style={{ color: 'var(--red)' }}>{q.error}</div>}
                    </div>
                    {q.quote && (
                      <div className="right">
                        <div className="offer-total">{money(q.quote.total, cur)}</div>
                        <div className="small muted">{money(q.quote.total / Math.max(1, q.quote.nights.length), cur)} / night</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div>
          <Card
            title="4 · Guest"
            actions={
              <div className="chips">
                <button type="button" className={`chip ${guestMode === 'search' ? 'chip-active' : ''}`} onClick={() => setGuestMode('search')}>
                  Existing guest
                </button>
                <button type="button" className={`chip ${guestMode === 'new' ? 'chip-active' : ''}`} onClick={() => setGuestMode('new')}>
                  New guest
                </button>
              </div>
            }
          >
            {guestMode === 'search' ? (
              <div className="stack">
                <Input placeholder="Search by name, email or phone (min 2 chars)" value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)} />
                {guest && (
                  <div className="offer selected">
                    <div>
                      <div className="strong">
                        {guest.vip ? '★ ' : ''}
                        {guest.firstName} {guest.lastName}
                      </div>
                      <div className="small muted">
                        {guest.email ?? '—'} · {guest.phone ?? '—'} · {guest.nationality ?? '—'}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setGuest(null)}>
                      Change
                    </Button>
                  </div>
                )}
                {!guest && guestSearch.trim().length >= 2 && (
                  <Async data={guests.data} loading={guests.loading} error={guests.error}>
                    {(list) =>
                      list.length === 0 ? (
                        <Empty>
                          No guests found.{' '}
                          <a
                            href="#new"
                            onClick={(e) => {
                              e.preventDefault();
                              setGuestMode('new');
                            }}
                          >
                            Create a new guest
                          </a>
                        </Empty>
                      ) : (
                        <div className="list">
                          {list.map((g) => (
                            <div key={g.id} className="list-item clickable" style={{ cursor: 'pointer' }} onClick={() => setGuest(g)}>
                              <div className="list-main">
                                <div className="list-title">
                                  {g.vip ? '★ ' : ''}
                                  {g.firstName} {g.lastName}
                                </div>
                                <div className="list-sub">
                                  {g.email ?? '—'} · {g.phone ?? '—'} · {g._count?.reservations ?? 0} stays
                                </div>
                              </div>
                              <Button size="sm">Select</Button>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </Async>
                )}
              </div>
            ) : (
              <div className="form-grid">
                <Field label="First name">
                  <Input value={newGuest.firstName} onChange={(e) => setNewGuest({ ...newGuest, firstName: e.target.value })} />
                </Field>
                <Field label="Last name">
                  <Input value={newGuest.lastName} onChange={(e) => setNewGuest({ ...newGuest, lastName: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={newGuest.email} onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={newGuest.phone} onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })} placeholder="+20…" />
                </Field>
                <Field label="Nationality" hint="ISO-2, e.g. EG, SA, GB">
                  <Input maxLength={2} value={newGuest.nationality} onChange={(e) => setNewGuest({ ...newGuest, nationality: e.target.value.toUpperCase() })} />
                </Field>
              </div>
            )}
          </Card>

          <Card title="5 · Options & confirm">
            <div className="form-grid">
              <Field label="Assign room now" hint={roomTypeId ? `${freeRooms.data?.length ?? 0} free ${selectedType?.code ?? ''} rooms` : 'Pick a room type first'}>
                <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={!roomTypeId}>
                  <option value="">Assign later</option>
                  {(freeRooms.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.number} · floor {r.floor || '—'} · {r.hkStatus.toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Source">
                <Select value={source} onChange={(e) => setSource(e.target.value)}>
                  {['DIRECT', 'WALK_IN', 'BOOKING_ENGINE', 'OTA', 'GROUP', 'API'].map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Special requests" className="mt">
              <Textarea value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} placeholder="High floor, late arrival, allergies…" />
            </Field>
            <div className="totals mt">
              <span>Stay</span>
              <span>
                {arrival} → {departure} · {nights} night{nights === 1 ? '' : 's'}
              </span>
              <span>Room type</span>
              <span>{selectedType ? `${selectedType.code} · ${selectedType.name}` : '—'}</span>
              <span>Rate plan</span>
              <span>{quotes?.find((q) => q.plan.id === ratePlanId)?.plan.code ?? '—'}</span>
              <span>Guest</span>
              <span>{guestMode === 'search' ? (guest ? `${guest.firstName} ${guest.lastName}` : '—') : `${newGuest.firstName} ${newGuest.lastName}`.trim() || '—'}</span>
              <span className="grand">Total</span>
              <span className="grand right">{selectedQuote ? money(selectedQuote.total, cur) : '—'}</span>
            </div>
            <div className="row mt" style={{ justifyContent: 'flex-end' }}>
              <Button variant="primary" busy={creating} disabled={!canCreate} onClick={create}>
                Create reservation
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
