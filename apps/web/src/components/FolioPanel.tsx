import { useState } from 'react';
import { api, prop } from '../api';
import { useProperty, useToast } from '../context';
import { day, money, titleCase } from '../format';
import { useApi } from '../hooks';
import type { FolioDetail } from '../types';
import { Async, Button, Empty, Field, Input, Select, StatusBadge } from './ui';

const CATEGORIES = ['ROOM', 'FNB', 'ACTIVITY', 'SPA', 'MISC'];
const METHODS = ['CASH', 'CARD', 'BNPL', 'TRANSFER', 'OTA_VIRTUAL_CARD', 'CITY_LEDGER'];

/** Folio lines + totals with posting, settlement, close and split actions. */
export function FolioPanel({ folioId, onChanged }: { folioId: string; onChanged?: () => void }) {
  const property = useProperty();
  const toast = useToast();
  const cur = property.currency;
  const folio = useApi(() => api.get<FolioDetail>(prop(property.id, `/folios/${folioId}`)), [property.id, folioId]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [charge, setCharge] = useState({ category: 'MISC', description: '', unitAmount: '', quantity: '1' });
  const [payment, setPayment] = useState({ amount: '', method: 'CARD' });
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    const r = await toast.run(fn, success);
    setBusy(null);
    if (r !== undefined) {
      folio.reload();
      onChanged?.();
    }
    return r;
  }

  return (
    <Async data={folio.data} loading={folio.loading} error={folio.error} retry={folio.reload}>
      {(f) => {
        const t = f.totals;
        const open = f.status === 'OPEN';
        const toggle = (id: string) =>
          setSelected((s) => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          });
        return (
          <div className="stack">
            <div className="row row-between">
              <div className="row">
                <strong>Folio {f.number}</strong>
                <StatusBadge status={f.status} />
                <span className="muted small">{f.kind}</span>
              </div>
              <div className="row">
                {open && selected.size > 0 && (
                  <Button
                    size="sm"
                    busy={busy === 'split'}
                    onClick={async () => {
                      const r = await act('split', () => api.post(prop(property.id, `/folios/${f.id}/split`), { lineIds: [...selected] }), `${selected.size} line${selected.size === 1 ? '' : 's'} moved to a new folio`);
                      if (r !== undefined) setSelected(new Set());
                    }}
                  >
                    Split {selected.size} line{selected.size === 1 ? '' : 's'} to new folio
                  </Button>
                )}
                {open && (
                  <Button
                    size="sm"
                    variant={Math.abs(t.balance) < 0.005 ? 'primary' : 'default'}
                    busy={busy === 'close'}
                    onClick={() => {
                      if (Math.abs(t.balance) >= 0.005 && !window.confirm(`Balance is ${money(t.balance, cur)}. Closing will likely be refused until it is settled. Try anyway?`)) return;
                      void act('close', () => api.post(prop(property.id, `/folios/${f.id}/close`), {}), 'Folio closed and fiscal invoice queued');
                    }}
                  >
                    Close folio
                  </Button>
                )}
              </div>
            </div>

            <div className="table-wrap">
              {t.lines.length === 0 ? (
                <Empty>No lines posted yet.</Empty>
              ) : (
                <table className="table table-compact">
                  <thead>
                    <tr>
                      {open && <th />}
                      <th>Date</th>
                      <th>Kind</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th className="num">Qty</th>
                      <th className="num">Net</th>
                      <th className="num">Service</th>
                      <th className="num">VAT</th>
                      <th className="num">Gross</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.lines.map((l) => (
                      <tr key={l.id} className={selected.has(l.id) ? 'selected' : ''}>
                        {open && (
                          <td>
                            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label="Select line" />
                          </td>
                        )}
                        <td>{day(l.businessDate)}</td>
                        <td>
                          <StatusBadge status={l.kind === 'PAYMENT' ? 'PAID' : 'OPEN'} label={l.kind === 'PAYMENT' ? 'Payment' : 'Charge'} />
                        </td>
                        <td>{titleCase(l.category)}</td>
                        <td className="wrap">{l.description}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{money(l.amount, cur)}</td>
                        <td className="num">{money(l.serviceAmount, cur)}</td>
                        <td className="num">{money(l.taxAmount, cur)}</td>
                        <td className="num strong">{money(l.amount + l.serviceAmount + l.taxAmount, cur)}</td>
                        <td className="small muted">
                          {l.source}
                          {l.postedBy ? ` · ${l.postedBy}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="grid grid-3">
              <div className="totals" style={{ alignSelf: 'start' }}>
                <span>Net charges</span>
                <span className="right">{money(t.net, cur)}</span>
                <span>Service ({property.serviceRate}%)</span>
                <span className="right">{money(t.service, cur)}</span>
                <span>VAT ({property.vatRate}%)</span>
                <span className="right">{money(t.tax, cur)}</span>
                <span>Gross</span>
                <span className="right">{money(t.gross, cur)}</span>
                <span>Paid</span>
                <span className="right">{money(t.paid, cur)}</span>
                <span className="grand">Balance</span>
                <span className="grand right" style={{ color: Math.abs(t.balance) < 0.005 ? 'var(--green)' : 'var(--amber)' }}>
                  {money(t.balance, cur)}
                </span>
              </div>

              {open && (
                <form
                  className="stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await act('charge', () => api.post(prop(property.id, `/folios/${f.id}/charges`), { category: charge.category, description: charge.description, unitAmount: Number(charge.unitAmount), quantity: Number(charge.quantity) || 1 }), 'Charge posted');
                    if (r !== undefined) setCharge({ category: 'MISC', description: '', unitAmount: '', quantity: '1' });
                  }}
                >
                  <h3>Post charge</h3>
                  <Field label="Category">
                    <Select value={charge.category} onChange={(e) => setCharge({ ...charge, category: e.target.value })}>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {titleCase(c)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Description">
                    <Input required value={charge.description} onChange={(e) => setCharge({ ...charge, description: e.target.value })} placeholder="Minibar, laundry…" />
                  </Field>
                  <div className="form-row">
                    <Field label={`Unit amount (${cur})`}>
                      <Input required type="number" step="0.01" value={charge.unitAmount} onChange={(e) => setCharge({ ...charge, unitAmount: e.target.value })} />
                    </Field>
                    <Field label="Qty">
                      <Input type="number" min={0.01} step="0.01" value={charge.quantity} onChange={(e) => setCharge({ ...charge, quantity: e.target.value })} />
                    </Field>
                  </div>
                  <Button type="submit" busy={busy === 'charge'} disabled={!charge.description || !charge.unitAmount}>
                    Post charge
                  </Button>
                </form>
              )}

              {open && (
                <form
                  className="stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await act('payment', () => api.post(prop(property.id, `/folios/${f.id}/payments`), { amount: Number(payment.amount), method: payment.method }), 'Payment posted');
                    if (r !== undefined) setPayment({ amount: '', method: payment.method });
                  }}
                >
                  <h3>Post payment</h3>
                  <Field label={`Amount (${cur})`}>
                    <div className="row">
                      <Input required type="number" step="0.01" min={0.01} value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
                      {t.balance > 0.005 && (
                        <Button size="sm" variant="ghost" onClick={() => setPayment({ ...payment, amount: String(t.balance) })}>
                          Balance
                        </Button>
                      )}
                    </div>
                  </Field>
                  <Field label="Method">
                    <Select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                      {METHODS.map((m) => (
                        <option key={m} value={m}>
                          {titleCase(m)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" variant="success" busy={busy === 'payment'} disabled={!payment.amount}>
                    Post payment
                  </Button>
                </form>
              )}
            </div>
          </div>
        );
      }}
    </Async>
  );
}
