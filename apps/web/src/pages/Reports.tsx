import { useState } from 'react';
import { api, prop } from '../api';
import { Async, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader } from '../components/ui';
import { useProperty, useSession, useToast } from '../context';
import { addDays, dateTime, day, money, num, pct } from '../format';
import { useApi } from '../hooks';
import type { NightAuditRun, PortfolioReport } from '../types';

export function ReportsPage() {
  const property = useProperty();
  const { reload: reloadSession } = useSession();
  const toast = useToast();
  const bd = day(property.businessDate);
  const [from, setFrom] = useState(addDays(bd, -13));
  const [to, setTo] = useState(bd);
  const [range, setRange] = useState({ from: addDays(bd, -13), to: bd });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);

  const portfolio = useApi(() => api.get<PortfolioReport>('/api/reports/portfolio', { from: range.from, to: range.to }), [range.from, range.to]);
  const audits = useApi(() => api.get<NightAuditRun[]>(prop(property.id, '/night-audit')), [property.id]);

  async function runAudit() {
    setRunning(true);
    const r = await toast.run(() => api.post<NightAuditRun>(prop(property.id, '/night-audit'), {}));
    setRunning(false);
    setConfirm(false);
    if (r) {
      toast.push(`Night audit for ${day(r.businessDate)} completed: ${r.roomChargesPosted} room charges, ${r.noShows} no-shows, ${money(r.totalRevenue, property.currency)} revenue`, 'success');
      audits.reload();
      portfolio.reload();
      reloadSession();
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        subtitle="Portfolio KPIs across properties with Gregorian and Hijri dates; night-audit history"
        actions={
          <Button variant="primary" onClick={() => setConfirm(true)}>
            Run night audit for {bd}
          </Button>
        }
      />

      <Card
        title="Portfolio report"
        actions={
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (from && to && from <= to) setRange({ from, to });
            }}
          >
            <Input type="date" className="input-sm input-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="muted">→</span>
            <Input type="date" className="input-sm input-auto" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button size="sm" type="submit">
              Apply
            </Button>
          </form>
        }
        padded={false}
      >
        <Async data={portfolio.data} loading={portfolio.loading} error={portfolio.error} retry={portfolio.reload}>
          {(r) => (
            <>
              <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <Badge tone="blue">
                  {r.period.from.gregorian} → {r.period.to.gregorian}
                </Badge>
                <Badge tone="teal">
                  Hijri {r.period.from.hijri} → {r.period.to.hijri}
                </Badge>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Country</th>
                      <th className="num">Days</th>
                      <th className="num">Occupancy</th>
                      <th className="num">ADR</th>
                      <th className="num">RevPAR</th>
                      <th className="num">Room revenue</th>
                      <th className="num">F&B revenue</th>
                      <th className="num">Total revenue</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {r.properties.map((p) => (
                      <PropertyRows key={p.propertyId} p={p} expanded={expanded === p.propertyId} toggle={() => setExpanded(expanded === p.propertyId ? null : p.propertyId)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Async>
      </Card>

      <Card padded={false} title={`Night audit history · ${property.code}`}>
        <Async data={audits.data} loading={audits.loading} error={audits.error} retry={audits.reload}>
          {(list) =>
            list.length === 0 ? (
              <Empty>No night audits have run yet.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Business date</th>
                      <th>Hijri</th>
                      <th>Ran at</th>
                      <th>By</th>
                      <th className="num">Occ.</th>
                      <th className="num">ADR</th>
                      <th className="num">RevPAR</th>
                      <th className="num">Rooms</th>
                      <th className="num">Charges</th>
                      <th className="num">Room rev.</th>
                      <th className="num">F&B</th>
                      <th className="num">Other</th>
                      <th className="num">Total</th>
                      <th className="num">Arr / Dep / NS</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id}>
                        <td className="strong">{day(a.businessDate)}</td>
                        <td className="muted">{a.calendar?.hijri ?? '—'}</td>
                        <td className="small muted">{dateTime(a.ranAt)}</td>
                        <td className="small">{a.ranBy ?? 'scheduler'}</td>
                        <td className="num">{pct(a.occupancyPct)}</td>
                        <td className="num">{money(a.adr, property.currency, { compact: true })}</td>
                        <td className="num">{money(a.revpar, property.currency, { compact: true })}</td>
                        <td className="num">
                          {a.roomsOccupied}/{a.roomsAvailable}
                          {a.roomsOoo ? <span className="faint"> +{a.roomsOoo} OOO</span> : ''}
                        </td>
                        <td className="num">{a.roomChargesPosted}</td>
                        <td className="num">{money(a.roomRevenue, property.currency, { compact: true })}</td>
                        <td className="num">{money(a.fnbRevenue, property.currency, { compact: true })}</td>
                        <td className="num">{money(a.otherRevenue, property.currency, { compact: true })}</td>
                        <td className="num strong">{money(a.totalRevenue, property.currency, { compact: true })}</td>
                        <td className="num">
                          {a.arrivals} / {a.departures} / {a.noShows}
                        </td>
                        <td>
                          <Badge tone={a.status === 'COMPLETED' ? 'green' : 'amber'}>{a.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </Async>
      </Card>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Run night audit"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" busy={running} onClick={runAudit}>
              Run audit for {bd}
            </Button>
          </>
        }
      >
        <p>
          This posts tonight's room charges to every in-house folio, marks un-arrived reservations as <strong>no-show</strong>, records the day's KPIs and rolls the business date of <strong>{property.name}</strong> from {bd} to {addDays(bd, 1)}.
        </p>
        <p className="muted small">The audit cannot be undone. Make sure all arrivals are checked in and departures checked out first.</p>
      </Modal>
    </div>
  );
}

function PropertyRows({ p, expanded, toggle }: { p: PortfolioReport['properties'][number]; expanded: boolean; toggle: () => void }) {
  return (
    <>
      <tr className="clickable" onClick={toggle}>
        <td>
          <strong>{p.code}</strong> <span className="muted">{p.name}</span>
        </td>
        <td>{p.country}</td>
        <td className="num">{p.days}</td>
        <td className="num strong">{pct(p.occupancyPct)}</td>
        <td className="num">{money(p.adr, p.currency, { compact: true })}</td>
        <td className="num">{money(p.revpar, p.currency, { compact: true })}</td>
        <td className="num">{money(p.roomRevenue, p.currency, { compact: true })}</td>
        <td className="num">{money(p.fnbRevenue, p.currency, { compact: true })}</td>
        <td className="num strong">{money(p.totalRevenue, p.currency, { compact: true })}</td>
        <td className="right">
          <Button size="sm" variant="ghost">
            {expanded ? 'Hide days' : 'Daily'}
          </Button>
        </td>
      </tr>
      {expanded &&
        p.daily.map((d) => (
          <tr key={d.gregorian} style={{ background: 'var(--surface-2)' }}>
            <td className="small" style={{ paddingLeft: 28 }}>
              {d.gregorian} <span className="faint">· {d.hijri}</span>
            </td>
            <td />
            <td />
            <td className="num small">{pct(d.occupancyPct)}</td>
            <td className="num small">{money(d.adr, p.currency, { compact: true })}</td>
            <td className="num small">{money(d.revpar, p.currency, { compact: true })}</td>
            <td />
            <td />
            <td className="num small">{money(d.totalRevenue, p.currency, { compact: true })}</td>
            <td />
          </tr>
        ))}
      {expanded && p.daily.length === 0 && (
        <tr>
          <td colSpan={10} className="muted small">
            No daily figures ({num(p.days)} days without a completed night audit).
          </td>
        </tr>
      )}
    </>
  );
}
