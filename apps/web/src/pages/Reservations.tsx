import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, prop } from '../api';
import { Async, Button, Card, Chips, Empty, Input, PageHeader, Select, StatusBadge } from '../components/ui';
import { useProperty } from '../context';
import { addDays, day, diffDays, money } from '../format';
import { useApi } from '../hooks';
import type { Reservation, ReservationStatus } from '../types';

type Chip = 'arrivals' | 'departures' | 'inhouse' | 'upcoming' | 'all';
const CHIPS: { value: Chip; label: string }[] = [
  { value: 'arrivals', label: 'Arrivals today' },
  { value: 'departures', label: 'Departures today' },
  { value: 'inhouse', label: 'In-house' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
];
const STATUSES: ReservationStatus[] = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'];

export function ReservationsPage() {
  const property = useProperty();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const bd = day(property.businessDate);
  const chip = (params.get('chip') as Chip | null) ?? 'arrivals';
  const status = params.get('status') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const search = params.get('search') ?? '';
  const [searchDraft, setSearchDraft] = useState(search);

  function update(next: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  }

  const query = useMemo(() => {
    const q: Record<string, string | undefined> = { take: '500' };
    if (chip === 'arrivals') q.arrivalOn = bd;
    else if (chip === 'departures') q.departureOn = bd;
    else if (chip === 'inhouse') {
      q.inHouseOn = bd;
      q.status = 'CHECKED_IN';
    } else if (chip === 'upcoming') {
      q.from = bd;
      q.to = addDays(bd, 30);
      q.status = 'CONFIRMED';
    }
    if (status) q.status = status;
    if (from && to) {
      q.from = from;
      q.to = to;
    }
    if (search) q.search = search;
    return q;
  }, [chip, status, from, to, search, bd]);

  const list = useApi(() => api.get<Reservation[]>(prop(property.id, '/reservations'), query), [property.id, JSON.stringify(query)]);

  const rows = useMemo(() => {
    const data = list.data ?? [];
    if (chip === 'inhouse' || chip === 'upcoming' || chip === 'arrivals' || chip === 'departures') return [...data].sort((a, b) => a.arrival.localeCompare(b.arrival));
    return [...data].sort((a, b) => b.arrival.localeCompare(a.arrival));
  }, [list.data, chip]);

  return (
    <div className="page">
      <PageHeader
        title="Reservations"
        subtitle={`Business date ${bd}`}
        actions={
          <Button variant="primary" onClick={() => navigate('/reservations/new')}>
            New reservation
          </Button>
        }
      />
      <Card>
        <div className="stack">
          <Chips options={CHIPS} value={chip} onChange={(v) => update({ chip: v, status: '', from: '', to: '' })} />
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              update({ search: searchDraft });
            }}
          >
            <label className="field">
              <span className="field-label">Status</span>
              <Select value={status} onChange={(e) => update({ status: e.target.value })}>
                <option value="">Any</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </Select>
            </label>
            <label className="field">
              <span className="field-label">Arrivals from</span>
              <Input type="date" value={from} onChange={(e) => update({ from: e.target.value, chip: 'all' })} />
            </label>
            <label className="field">
              <span className="field-label">to</span>
              <Input type="date" value={to} onChange={(e) => update({ to: e.target.value, chip: 'all' })} />
            </label>
            <label className="field" style={{ flex: '2 1 200px' }}>
              <span className="field-label">Search (confirmation #, surname)</span>
              <Input placeholder="e.g. HRG-105 or Petrova" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
            </label>
            <Button type="submit">Search</Button>
            {(status || from || to || search) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchDraft('');
                  update({ status: '', from: '', to: '', search: '' });
                }}
              >
                Clear
              </Button>
            )}
          </form>
        </div>
      </Card>

      <Card padded={false} title={`${rows.length} reservation${rows.length === 1 ? '' : 's'}`}>
        <Async data={list.data} loading={list.loading} error={list.error} retry={list.reload}>
          {() => (
            <div className="table-wrap">
              {rows.length === 0 ? (
                <Empty>No reservations match these filters.</Empty>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Conf #</th>
                      <th>Guest</th>
                      <th>Status</th>
                      <th>Arrival</th>
                      <th>Departure</th>
                      <th className="num">Nights</th>
                      <th>Type</th>
                      <th>Room</th>
                      <th>Pax</th>
                      <th>Plan</th>
                      <th>Source</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="clickable" onClick={() => navigate(`/reservations/${r.id}`)}>
                        <td>
                          <Link to={`/reservations/${r.id}`} onClick={(e) => e.stopPropagation()}>
                            {r.confirmationNumber}
                          </Link>
                        </td>
                        <td>
                          {r.guest.vip ? '★ ' : ''}
                          {r.guest.firstName} {r.guest.lastName}
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td>{day(r.arrival)}</td>
                        <td>{day(r.departure)}</td>
                        <td className="num">{r.dayUse ? 'Day use' : diffDays(day(r.arrival), day(r.departure))}</td>
                        <td>{r.roomType.code}</td>
                        <td>{r.room?.number ?? <span className="faint">—</span>}</td>
                        <td>
                          {r.adults}A{r.children ? ` ${r.children}C` : ''}
                        </td>
                        <td>{r.ratePlan.code}</td>
                        <td>{r.source}</td>
                        <td className="num">{money(r.totalAmount, property.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Async>
      </Card>
    </div>
  );
}
