import { useState } from 'react';
import { api } from '../api';
import { Async, Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';
import { money, num, pct, titleCase } from '../format';
import { useApi } from '../hooks';
import type { PricingEstimate, PricingPlan } from '../types';

export function PricingPage() {
  const [roomCount, setRoomCount] = useState(40);
  const [occupancy, setOccupancy] = useState(60);
  const [months, setMonths] = useState(12);
  const [input, setInput] = useState({ roomCount: 40, averageOccupancyPct: 60, months: 12 });

  const plans = useApi(() => api.get<PricingPlan[]>('/api/public/pricing/plans'), []);
  const estimate = useApi(() => api.get<PricingEstimate>('/api/public/pricing/estimate', input), [input.roomCount, input.averageOccupancyPct, input.months]);

  return (
    <div className="page">
      <PageHeader title="Pricing" subtitle="Public, transparent plans (USD) with a real uptime SLA and monthly cancellation, no quote required" />

      <Async data={plans.data} loading={plans.loading} error={plans.error} retry={plans.reload}>
        {(list) => (
          <div className="grid grid-4 mb">
            {list.map((p) => (
              <Card key={p.id} className={`plan-card ${estimate.data?.recommended === p.code ? 'recommended' : ''}`} title={p.name} actions={estimate.data?.recommended === p.code ? <Badge tone="blue">Recommended</Badge> : undefined}>
                <div className="plan-price">
                  {money(p.unitPrice, p.currency)} <small>{p.model === 'OCCUPANCY' ? '/ occupied room-night' : '/ room / month'}</small>
                </div>
                <div className="small muted">
                  Min. {money(p.minimumMonthly, p.currency, { compact: true })}/month · setup {money(p.setupFee, p.currency, { compact: true })}
                </div>
                <div className="small">
                  <Badge tone="green">{p.uptimeSla}% uptime SLA</Badge> <Badge>{p.cancellationDays}-day cancellation</Badge> <Badge tone="teal">{titleCase(p.supportLevel)} support</Badge>
                </div>
                <div className="plan-modules">
                  {p.includedModules.map((m) => (
                    <Badge key={m} tone="grey">
                      {m}
                    </Badge>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Async>

      <Card
        title="Calculator"
        actions={
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              setInput({ roomCount: Math.max(1, roomCount), averageOccupancyPct: Math.min(100, Math.max(0, occupancy)), months: Math.min(36, Math.max(1, months)) });
            }}
          >
            <Field label="Rooms">
              <Input type="number" min={1} className="input-sm" style={{ width: 80 }} value={roomCount} onChange={(e) => setRoomCount(Number(e.target.value))} />
            </Field>
            <Field label="Avg occupancy %">
              <Input type="number" min={0} max={100} className="input-sm" style={{ width: 80 }} value={occupancy} onChange={(e) => setOccupancy(Number(e.target.value))} />
            </Field>
            <Field label="Months">
              <Input type="number" min={1} max={36} className="input-sm" style={{ width: 70 }} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
            </Field>
            <Button size="sm" type="submit" variant="primary">
              Estimate
            </Button>
          </form>
        }
        padded={false}
      >
        <Async data={estimate.data} loading={estimate.loading} error={estimate.error} retry={estimate.reload}>
          {(e) => (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Basis</th>
                      <th className="num">Monthly</th>
                      <th className="num">Per room / month</th>
                      <th className="num">Setup</th>
                      <th className="num">Total for {e.input.months} months</th>
                      <th>SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.estimates.map((x) => (
                      <tr key={x.planCode} className={x.planCode === e.recommended ? 'selected' : ''}>
                        <td>
                          <strong>{x.planName}</strong> {x.planCode === e.recommended && <Badge tone="blue">Recommended</Badge>}
                        </td>
                        <td className="wrap small muted">{x.basis}</td>
                        <td className="num">
                          {money(x.monthly, x.currency)}
                          {x.monthly <= x.minimumMonthly && <div className="faint small">minimum applies</div>}
                        </td>
                        <td className="num">{money(x.perRoomPerMonth, x.currency)}</td>
                        <td className="num">{money(x.setupFee, x.currency, { compact: true })}</td>
                        <td className="num strong">{money(x.total, x.currency)}</td>
                        <td>{pct(x.uptimeSla, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-2" style={{ padding: 16 }}>
                <div>
                  <h3 className="mb">Industry benchmarks (USD)</h3>
                  <table className="table table-compact">
                    <tbody>
                      <tr>
                        <td>Per room per month</td>
                        <td className="num">
                          {money(e.benchmarks.perRoomPerMonthUsd[0], 'USD', { compact: true })} – {money(e.benchmarks.perRoomPerMonthUsd[1], 'USD', { compact: true })}
                        </td>
                      </tr>
                      <tr>
                        <td>Setup fee</td>
                        <td className="num">
                          {money(e.benchmarks.setupUsd[0], 'USD', { compact: true })} – {money(e.benchmarks.setupUsd[1], 'USD', { compact: true })}
                        </td>
                      </tr>
                      <tr>
                        <td>Small hotel, all-in monthly</td>
                        <td className="num">
                          {money(e.benchmarks.smallHotelAllInUsd[0], 'USD', { compact: true })} – {money(e.benchmarks.smallHotelAllInUsd[1], 'USD', { compact: true })}
                        </td>
                      </tr>
                      <tr>
                        <td>Mid-size hotel, all-in monthly</td>
                        <td className="num">
                          {money(e.benchmarks.midSizeAllInUsd[0], 'USD', { compact: true })} – {money(e.benchmarks.midSizeAllInUsd[1], 'USD', { compact: true })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="mb">Competitors · starting monthly price</h3>
                  <div className="bar-list">
                    {Object.entries(e.benchmarks.competitorsStartingUsd)
                      .sort((a, b) => a[1] - b[1])
                      .map(([name, price]) => {
                        const max = Math.max(...Object.values(e.benchmarks.competitorsStartingUsd));
                        return (
                          <div className="bar-row" key={name}>
                            <span>{name}</span>
                            <div className="bar-track">
                              <div className="bar-fill" style={{ width: `${(price / max) * 100}%`, background: 'var(--grey)' }} />
                            </div>
                            <span className="right small">{money(price, 'USD', { compact: true })}</span>
                          </div>
                        );
                      })}
                    {e.estimates[0] && (
                      <div className="bar-row">
                        <span className="strong">Ashrafy ({e.estimates.find((x) => x.planCode === e.recommended)?.planName ?? e.estimates[0].planName})</span>
                        <div className="bar-track">
                          <div className="bar-fill green" style={{ width: `${Math.min(100, ((e.estimates.find((x) => x.planCode === e.recommended)?.monthly ?? e.estimates[0].monthly) / Math.max(...Object.values(e.benchmarks.competitorsStartingUsd))) * 100)}%` }} />
                        </div>
                        <span className="right small strong">{money(e.estimates.find((x) => x.planCode === e.recommended)?.monthly ?? e.estimates[0].monthly, 'USD', { compact: true })}</span>
                      </div>
                    )}
                  </div>
                  <p className="faint small mt">{num(e.input.roomCount)} rooms at {pct(e.input.averageOccupancyPct ?? 0, 0)} occupancy.</p>
                </div>
              </div>
            </>
          )}
        </Async>
      </Card>
    </div>
  );
}
