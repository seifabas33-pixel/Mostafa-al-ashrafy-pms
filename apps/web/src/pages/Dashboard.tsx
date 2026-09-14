import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, prop } from '../api';
import { ForecastChart } from '../components/ForecastChart';
import { Async, Badge, Button, Card, Empty, Input, StatusBadge } from '../components/ui';
import { useProperty, useSession, useToast } from '../context';
import { money, num, pct, titleCase } from '../format';
import { useApi, useLocalStorage } from '../hooks';
import type { Alert, Dashboard } from '../types';

const REFRESH_MS = 30_000;

export function DashboardPage() {
  const property = useProperty();
  const { reload: reloadSession } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [floorRate, setFloorRate] = useLocalStorage<number>(`pms.floorRate.${property.id}`, Math.round(property.currency === 'SAR' ? 300 : 1000));
  const [floorDraft, setFloorDraft] = useState(String(floorRate));
  const [acting, setActing] = useState<string | null>(null);

  const dash = useApi(() => api.get<Dashboard>(prop(property.id, '/dashboard')), [property.id], { refreshMs: REFRESH_MS });
  const alerts = useApi(() => api.get<Alert[]>(prop(property.id, '/alerts'), { floorRate, lowAvailability: 2 }), [property.id, floorRate], { refreshMs: REFRESH_MS });

  const cur = property.currency;

  async function quickAction(id: string, action: 'check-in' | 'check-out', label: string) {
    setActing(id);
    const r = await toast.run(() => api.post(prop(property.id, `/reservations/${id}/${action}`), {}), label);
    setActing(null);
    if (r !== undefined) {
      dash.reload();
      alerts.reload();
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{property.name}</h1>
          <div className="page-subtitle">
            <Async data={dash.data} loading={dash.loading} error={dash.error}>
              {(d) => (
                <>
                  Business date <strong>{d.businessDate.gregorian}</strong> · Hijri <strong>{d.businessDate.hijri}</strong> · {property.city}, {property.country} · {d.property.taxRegime}
                </>
              )}
            </Async>
          </div>
        </div>
        <div className="page-actions">
          <span className="faint small">{dash.refreshing ? 'Refreshing…' : 'Auto-refresh every 30 s'}</span>
          <Button
            size="sm"
            onClick={() => {
              dash.reload();
              alerts.reload();
              reloadSession();
            }}
          >
            Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={() => navigate('/reservations/new')}>
            New reservation
          </Button>
        </div>
      </div>

      <Async data={dash.data} loading={dash.loading} error={dash.error} retry={dash.reload}>
        {(d) => (
          <>
            <div className="grid grid-5 mb">
              <Kpi label="Occupancy" value={pct(d.kpis.occupancyPct)} sub={`${d.rooms.occupied} of ${d.rooms.sellable} sellable rooms`} />
              <Kpi label="ADR" value={money(d.kpis.adr, cur, { compact: true })} sub="Average daily rate" />
              <Kpi label="RevPAR" value={money(d.kpis.revpar, cur, { compact: true })} sub="Revenue per available room" />
              <Kpi label="Room revenue" value={money(d.kpis.roomRevenue, cur, { compact: true })} sub={`Posted ${money(d.kpis.postedRevenue, cur, { compact: true })} · F&B ${money(d.kpis.fnbRevenue, cur, { compact: true })}`} />
              <Kpi label="In-house guests" value={num(d.kpis.inHouseGuests)} sub={`${d.arrivals.length} arrivals · ${d.departures.length} departures today`} />
            </div>

            <div className="grid grid-3 mb">
              <Card title="Room status">
                <RoomStatus rooms={d.rooms} />
                <div className="legend" style={{ marginTop: 12 }}>
                  {Object.entries(d.housekeeping).map(([k, v]) => (
                    <span key={k}>
                      <StatusBadge status={k} /> {v} HK task{v === 1 ? '' : 's'}
                    </span>
                  ))}
                  {!Object.keys(d.housekeeping).length && <span className="faint">No open housekeeping tasks</span>}
                </div>
                {Object.keys(d.attention).length > 0 && (
                  <div className="row mt">
                    {Object.entries(d.attention).map(([k, v]) => (
                      <Badge key={k} tone="amber">
                        {v} {titleCase(k.replace(/([A-Z])/g, '_$1'))}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Occupancy by room type" className="span-2">
                <div className="bar-list">
                  {d.byRoomType.map((t) => (
                    <div className="bar-row" key={t.roomTypeId}>
                      <div>
                        <div className="strong">{t.code}</div>
                        <div className="faint small">{t.name}</div>
                      </div>
                      <div className="bar-track">
                        <div className={`bar-fill ${t.occupancyPct >= 85 ? 'green' : t.occupancyPct < 30 ? 'amber' : ''}`} style={{ width: `${Math.min(100, t.occupancyPct)}%` }} />
                      </div>
                      <div className="right small">
                        <strong>{pct(t.occupancyPct, 0)}</strong> · {t.occupied}/{t.total - t.ooo}
                        {t.ooo > 0 && <span className="faint"> · {t.ooo} OOO</span>}
                        {t.dirty > 0 && <span className="faint"> · {t.dirty} dirty</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card title="14-day forecast" actions={<Link to="/rack">Open room rack →</Link>}>
              <ForecastChart data={d.forecast} businessDate={d.businessDate.gregorian} />
            </Card>

            <div className="grid grid-3">
              <Card title={`Arrivals (${d.arrivals.length})`} actions={<Link to="/reservations?chip=arrivals">All</Link>}>
                {d.arrivals.length === 0 && <Empty>No arrivals today.</Empty>}
                <div className="list">
                  {d.arrivals.map((a) => (
                    <div className="list-item" key={a.id}>
                      <div className="list-main">
                        <div className="list-title">
                          <Link to={`/reservations/${a.id}`}>{a.guest}</Link> {a.vip && <Badge tone="amber">VIP</Badge>}
                        </div>
                        <div className="list-sub">
                          {a.confirmationNumber} · {a.roomType} · {a.room ? `Room ${a.room}` : 'Unassigned'} · {a.adults}A{a.children ? ` ${a.children}C` : ''}
                        </div>
                      </div>
                      {a.status === 'CONFIRMED' ? (
                        <Button size="sm" variant="success" busy={acting === a.id} onClick={() => quickAction(a.id, 'check-in', `${a.guest} checked in`)}>
                          Check in
                        </Button>
                      ) : (
                        <StatusBadge status={a.status} />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
              <Card title={`Departures (${d.departures.length})`} actions={<Link to="/reservations?chip=departures">All</Link>}>
                {d.departures.length === 0 && <Empty>No departures today.</Empty>}
                <div className="list">
                  {d.departures.map((a) => (
                    <div className="list-item" key={a.id}>
                      <div className="list-main">
                        <div className="list-title">
                          <Link to={`/reservations/${a.id}`}>{a.guest}</Link>
                        </div>
                        <div className="list-sub">
                          {a.confirmationNumber} · {a.roomType} · {a.room ? `Room ${a.room}` : '—'} ·{' '}
                          <span className={a.balance > 0.005 ? 'strong' : ''} style={a.balance > 0.005 ? { color: 'var(--amber)' } : undefined}>
                            Balance {money(a.balance, cur)}
                          </span>
                        </div>
                      </div>
                      {a.status === 'CHECKED_IN' ? (
                        <Button size="sm" variant={a.balance > 0.005 ? 'default' : 'primary'} busy={acting === a.id} onClick={() => quickAction(a.id, 'check-out', `${a.guest} checked out`)} title={a.balance > 0.005 ? 'Open balance: settle the folio first' : undefined}>
                          Check out
                        </Button>
                      ) : (
                        <StatusBadge status={a.status} />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
              <Card
                title="Alerts"
                actions={
                  <form
                    className="row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = Number(floorDraft);
                      if (!Number.isNaN(v) && v >= 0) setFloorRate(v);
                    }}
                  >
                    <span className="small muted nowrap">Floor rate</span>
                    <Input type="number" min={0} className="input-sm" style={{ width: 90 }} value={floorDraft} onChange={(e) => setFloorDraft(e.target.value)} onBlur={() => setFloorRate(Number(floorDraft) || 0)} />
                  </form>
                }
              >
                <Async data={alerts.data} loading={alerts.loading} error={alerts.error} retry={alerts.reload}>
                  {(list) => (
                    <>
                      {list.length === 0 && <Empty>All clear.</Empty>}
                      {list.map((a, i) => (
                        <AlertRow key={i} alert={a} />
                      ))}
                    </>
                  )}
                </Async>
              </Card>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function RoomStatus({ rooms }: { rooms: Dashboard['rooms'] }) {
  const total = Math.max(1, rooms.total);
  const seg = (n: number, color: string, label: string) => (n > 0 ? <span key={label} style={{ width: `${(n / total) * 100}%`, background: color }} title={`${label}: ${n}`} /> : null);
  return (
    <>
      <div className="row row-between mb">
        <div>
          <div className="kpi-value">{rooms.occupied}</div>
          <div className="faint small">occupied of {rooms.total} rooms</div>
        </div>
        <div className="right small muted">
          {rooms.sellable} sellable · {rooms.outOfOrder} out of order
        </div>
      </div>
      <div className="segmented">
        {seg(rooms.occupied, 'var(--green)', 'Occupied')}
        {seg(rooms.vacantClean, 'var(--teal)', 'Vacant clean')}
        {seg(rooms.vacantDirty, 'var(--amber)', 'Vacant dirty')}
        {seg(rooms.outOfOrder, 'var(--red)', 'Out of order')}
      </div>
      <div className="legend">
        <span>
          <span className="dot dot-green" />
          Occupied {rooms.occupied}
        </span>
        <span>
          <span className="dot dot-teal" />
          Vacant clean {rooms.vacantClean}
        </span>
        <span>
          <span className="dot dot-amber" />
          Vacant dirty {rooms.vacantDirty}
        </span>
        <span>
          <span className="dot dot-red" />
          OOO {rooms.outOfOrder}
        </span>
      </div>
    </>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const tone = alert.severity === 'CRITICAL' ? 'red' : alert.severity === 'WARNING' ? 'amber' : 'blue';
  const link = alert.entity?.type === 'Reservation' ? `/reservations/${alert.entity.id}` : alert.entity?.type === 'Ingredient' ? '/inventory' : alert.entity?.type === 'PurchaseOrder' ? '/inventory' : alert.entity?.type === 'ComplianceSubmission' ? '/compliance' : null;
  return (
    <div className="alert-item">
      <span className={`dot dot-${tone}`} style={{ marginTop: 6 }} />
      <div className="list-main">
        <div>{link ? <Link to={link}>{alert.message}</Link> : alert.message}</div>
        <div className="faint small">{titleCase(alert.code)}</div>
      </div>
      <Badge tone={tone}>{titleCase(alert.severity)}</Badge>
    </div>
  );
}
