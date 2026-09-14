import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, prop } from '../api';
import { FolioPanel } from '../components/FolioPanel';
import { ReservationActions } from '../components/ReservationActions';
import { Async, Badge, Card, KeyValue, PageHeader, StatusBadge } from '../components/ui';
import { useProperty } from '../context';
import { dateTime, day, diffDays, money } from '../format';
import { useApi } from '../hooks';
import type { Reservation } from '../types';

export function ReservationDetailPage() {
  const { id = '' } = useParams();
  const property = useProperty();
  const cur = property.currency;
  const res = useApi(() => api.get<Reservation>(prop(property.id, `/reservations/${id}`)), [property.id, id]);
  const [folioId, setFolioId] = useState<string>('');

  useEffect(() => {
    const folios = res.data?.folios ?? [];
    if (folios.length && !folios.some((f) => f.id === folioId)) setFolioId(folios.find((f) => f.status === 'OPEN')?.id ?? folios[0].id);
  }, [res.data, folioId]);

  return (
    <div className="page">
      <Async data={res.data} loading={res.loading} error={res.error} retry={res.reload}>
        {(r) => {
          const nights = r.dayUse ? 0 : diffDays(day(r.arrival), day(r.departure));
          return (
            <>
              <PageHeader
                title={`${r.confirmationNumber} · ${r.guest.firstName} ${r.guest.lastName}`}
                subtitle={
                  <span className="row">
                    <StatusBadge status={r.status} />
                    {r.guest.vip && <Badge tone="amber">VIP</Badge>}
                    <Badge>{r.source}</Badge>
                    {r.channel && <Badge tone="teal">{r.channel}</Badge>}
                    <Link to="/reservations">← All reservations</Link>
                  </span>
                }
              />
              <div className="grid grid-3">
                <Card title="Stay" className="span-2">
                  <KeyValue
                    items={[
                      ['Arrival', `${day(r.arrival)} · from ${property.checkInTime}`],
                      ['Departure', `${day(r.departure)} · by ${property.checkOutTime}`],
                      ['Nights', r.dayUse ? 'Day use' : String(nights)],
                      ['Room type', `${r.roomType.code} · ${r.roomType.name}`],
                      ['Room', r.room ? `${r.room.number} (floor ${r.room.floor || '—'}, ${r.room.hkStatus.toLowerCase()})` : 'Unassigned'],
                      ['Rate plan', `${r.ratePlan.code} · ${r.ratePlan.name}`],
                      ['Occupancy', `${r.adults} adult${r.adults === 1 ? '' : 's'}${r.children ? `, ${r.children} child${r.children === 1 ? '' : 'ren'}` : ''}${r.roomType.sellMode === 'BED' ? ` · ${r.bedsRequested} bed(s)` : ''}`],
                      ['Total', money(r.totalAmount, cur)],
                      ['Promo code', r.promoCode ?? '—'],
                      ['External ref', r.externalRef ?? '—'],
                      ['Checked in', dateTime(r.checkedInAt)],
                      ['Checked out', dateTime(r.checkedOutAt)],
                      ['Created', dateTime(r.createdAt)],
                    ]}
                  />
                  {r.specialRequests && (
                    <p className="mt">
                      <span className="field-label">Special requests</span>
                      <br />
                      {r.specialRequests}
                    </p>
                  )}
                  {r.nights && r.nights.length > 0 && (
                    <div className="table-wrap mt">
                      <table className="table table-compact">
                        <thead>
                          <tr>
                            <th>Night</th>
                            <th className="num">Rate</th>
                            <th>Posted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.nights.map((n) => (
                            <tr key={n.id}>
                              <td>{day(n.date)}</td>
                              <td className="num">{money(n.rate, cur)}</td>
                              <td>{n.posted ? <Badge tone="green">Posted</Badge> : <Badge>Pending</Badge>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
                <div>
                  <Card title="Guest">
                    <KeyValue
                      items={[
                        ['Name', `${r.guest.firstName} ${r.guest.lastName}`],
                        ['Email', r.guest.email ?? '—'],
                        ['Phone', r.guest.phone ?? '—'],
                        ['Nationality', r.guest.nationality ?? '—'],
                        ['Document', r.guest.documentNumber ? `${r.guest.documentType ?? ''} ${r.guest.documentNumber}` : '—'],
                      ]}
                    />
                  </Card>
                  <Card title="Front-desk actions">
                    <ReservationActions reservation={r} onChanged={res.reload} />
                  </Card>
                </div>
              </div>

              <Card
                title="Folio"
                actions={
                  (r.folios?.length ?? 0) > 1 && (
                    <div className="chips">
                      {r.folios!.map((f) => (
                        <button key={f.id} type="button" className={`chip ${f.id === folioId ? 'chip-active' : ''}`} onClick={() => setFolioId(f.id)}>
                          {f.number} · {f.kind.toLowerCase()} · {f.status.toLowerCase()} · {money(f.balance, cur)}
                        </button>
                      ))}
                    </div>
                  )
                }
              >
                {folioId ? <FolioPanel key={folioId} folioId={folioId} onChanged={res.reload} /> : <p className="muted">No folio on this reservation.</p>}
              </Card>
            </>
          );
        }}
      </Async>
    </div>
  );
}
