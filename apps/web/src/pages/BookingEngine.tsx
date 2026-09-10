import { useState } from 'react';
import { api } from '../api';
import { Async, Badge, Button, Card, Empty, Field, Input, KeyValue, PageHeader, Textarea } from '../components/ui';
import { useProperty, useToast } from '../context';
import { addDays, day, diffDays, money } from '../format';
import { useApi } from '../hooks';
import type { BookingAvailability, BookingEngineInfo, BookingOffer } from '../types';

interface Confirmation {
  confirmationNumber: string;
  arrival: string;
  departure: string;
  roomType: string;
  ratePlan: string;
  total: number;
  currency: string;
}

export function BookingEnginePage() {
  const property = useProperty();
  const toast = useToast();
  const bd = day(property.businessDate);
  const [arrival, setArrival] = useState(addDays(bd, 7));
  const [departure, setDeparture] = useState(addDays(bd, 10));
  const [promo, setPromo] = useState('');
  const [search, setSearch] = useState<{ arrival: string; departure: string; promoCode: string } | null>(null);
  const [pick, setPick] = useState<{ roomTypeId: string; roomTypeName: string; offer: BookingOffer } | null>(null);
  const [guest, setGuest] = useState({ firstName: '', lastName: '', email: '', phone: '', nationality: '', adults: 2, children: 0, specialRequests: '' });
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<Confirmation | null>(null);

  const info = useApi(() => api.get<BookingEngineInfo>(`/api/public/booking-engine/${property.id}`), [property.id]);
  const avail = useApi(() => api.get<BookingAvailability>(`/api/public/booking-engine/${property.id}/availability`, { arrival: search!.arrival, departure: search!.departure, promoCode: search!.promoCode || undefined }), [property.id, search?.arrival, search?.departure, search?.promoCode], { enabled: !!search });

  const nights = search ? diffDays(search.arrival, search.departure) : diffDays(arrival, departure);

  async function book() {
    if (!pick || !search) return;
    setBooking(true);
    const r = await toast.run(
      () =>
        api.post<Confirmation>(`/api/public/booking-engine/${property.id}/book`, {
          roomTypeId: pick.roomTypeId,
          ratePlanId: pick.offer.ratePlanId,
          arrival: search.arrival,
          departure: search.departure,
          adults: guest.adults,
          children: guest.children,
          promoCode: search.promoCode || undefined,
          specialRequests: guest.specialRequests,
          guest: { firstName: guest.firstName.trim(), lastName: guest.lastName.trim(), email: guest.email.trim(), phone: guest.phone.trim() || undefined, nationality: guest.nationality.trim() ? guest.nationality.trim().toUpperCase().slice(0, 2) : undefined },
        }),
      'Booking confirmed',
    );
    setBooking(false);
    if (r) setDone(r);
  }

  const canBook = pick && guest.firstName.trim() && guest.lastName.trim() && /.+@.+\..+/.test(guest.email) && !booking;

  return (
    <div className="page">
      <PageHeader title="Booking engine demo" subtitle={`Public widget flow for ${property.name}: no API key, same availability and rates as the front desk`} />

      {done ? (
        <Card title="Booking confirmed">
          <div className="stack">
            <div className="kpi-value" style={{ color: 'var(--green)' }}>
              {done.confirmationNumber}
            </div>
            <KeyValue
              items={[
                ['Arrival', day(done.arrival)],
                ['Departure', day(done.departure)],
                ['Room', done.roomType],
                ['Rate plan', done.ratePlan],
                ['Total', money(done.total, done.currency)],
              ]}
            />
            <p className="muted small">The reservation is now visible on the rack and in Reservations with source BOOKING_ENGINE, and the pre-arrival guest message has been queued.</p>
            <div className="row">
              <Button
                variant="primary"
                onClick={() => {
                  setDone(null);
                  setPick(null);
                  setSearch(null);
                }}
              >
                Make another booking
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-2">
          <div>
            <Card title="1 · Search">
              <Async data={info.data} loading={info.loading} error={info.error} retry={info.reload}>
                {(i) => (
                  <p className="muted small">
                    {i.name}, {i.city} · check-in from {i.checkInTime}, check-out by {i.checkOutTime} · {i.roomTypes.length} room types · {i.ratePlans.length} public rate plans
                  </p>
                )}
              </Async>
              <form
                className="form-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (diffDays(arrival, departure) < 1) return toast.push('Departure must be after arrival', 'error');
                  setPick(null);
                  setSearch({ arrival, departure, promoCode: promo.trim().toUpperCase() });
                }}
              >
                <Field label="Arrival">
                  <Input
                    type="date"
                    value={arrival}
                    min={bd}
                    onChange={(e) => {
                      setArrival(e.target.value);
                      if (e.target.value && diffDays(e.target.value, departure) < 1) setDeparture(addDays(e.target.value, 1));
                    }}
                  />
                </Field>
                <Field label="Departure">
                  <Input type="date" value={departure} min={addDays(arrival, 1)} onChange={(e) => setDeparture(e.target.value)} />
                </Field>
                <Field label="Promo code">
                  <Input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Optional" />
                </Field>
                <Button type="submit" variant="primary">
                  Check availability
                </Button>
              </form>
            </Card>

            <Card title={`2 · Offers${search ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}`}>
              {!search ? (
                <Empty>Search for dates to see available rooms and rates.</Empty>
              ) : (
                <Async data={avail.data} loading={avail.loading} error={avail.error} retry={avail.reload}>
                  {(a) =>
                    a.roomTypes.length === 0 ? (
                      <Empty>Nothing available for these dates.</Empty>
                    ) : (
                      <div className="stack">
                        {a.roomTypes.map((rt) => (
                          <div key={rt.roomTypeId}>
                            <div className="row row-between mb">
                              <strong>{rt.name}</strong>
                              <Badge tone={rt.available <= 2 ? 'amber' : 'green'}>{rt.available} left</Badge>
                            </div>
                            <div className="stack" style={{ gap: 6 }}>
                              {rt.offers.map((o) => (
                                <div key={o.ratePlanId} className={`offer ${pick?.offer.ratePlanId === o.ratePlanId && pick.roomTypeId === rt.roomTypeId ? 'selected' : ''}`} onClick={() => setPick({ roomTypeId: rt.roomTypeId, roomTypeName: rt.name, offer: o })}>
                                  <div>
                                    <div className="strong">{o.name}</div>
                                    <div className="small muted">
                                      {o.mealPlan} · {o.nights.map((n) => money(n.rate, a.currency, { compact: true })).join(' + ')}
                                      {o.total !== o.subtotal && <span style={{ color: 'var(--green)' }}> · promo applied</span>}
                                    </div>
                                  </div>
                                  <div className="right">
                                    <div className="offer-total">{money(o.total, a.currency)}</div>
                                    <div className="small muted">{money(o.total / Math.max(1, o.nights.length), a.currency)} / night</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </Async>
              )}
            </Card>
          </div>

          <Card title="3 · Guest details & book">
            {!pick ? (
              <Empty>Pick an offer to continue.</Empty>
            ) : (
              <div className="stack">
                <div className="offer selected" style={{ cursor: 'default' }}>
                  <div>
                    <div className="strong">{pick.roomTypeName}</div>
                    <div className="small muted">
                      {pick.offer.name} · {search?.arrival} → {search?.departure}
                    </div>
                  </div>
                  <div className="offer-total">{money(pick.offer.total, property.currency)}</div>
                </div>
                <div className="form-grid">
                  <Field label="First name">
                    <Input value={guest.firstName} onChange={(e) => setGuest({ ...guest, firstName: e.target.value })} />
                  </Field>
                  <Field label="Last name">
                    <Input value={guest.lastName} onChange={(e) => setGuest({ ...guest, lastName: e.target.value })} />
                  </Field>
                  <Field label="Email (required)">
                    <Input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
                  </Field>
                  <Field label="Phone / WhatsApp">
                    <Input value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
                  </Field>
                  <Field label="Nationality (ISO-2)">
                    <Input maxLength={2} value={guest.nationality} onChange={(e) => setGuest({ ...guest, nationality: e.target.value.toUpperCase() })} />
                  </Field>
                  <Field label="Adults">
                    <Input type="number" min={1} value={guest.adults} onChange={(e) => setGuest({ ...guest, adults: Math.max(1, Number(e.target.value)) })} />
                  </Field>
                  <Field label="Children">
                    <Input type="number" min={0} value={guest.children} onChange={(e) => setGuest({ ...guest, children: Math.max(0, Number(e.target.value)) })} />
                  </Field>
                </div>
                <Field label="Special requests">
                  <Textarea value={guest.specialRequests} onChange={(e) => setGuest({ ...guest, specialRequests: e.target.value })} />
                </Field>
                <Button variant="primary" busy={booking} disabled={!canBook} onClick={book}>
                  Book now · {money(pick.offer.total, property.currency)}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
