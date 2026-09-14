import { useEffect, useState } from 'react';
import { api, prop } from '../api';
import { Async, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, StatusBadge } from '../components/ui';
import { useProperty, useToast } from '../context';
import { dateTime, day, money, num, titleCase } from '../format';
import { useApi } from '../hooks';
import type { Ingredient, PurchaseOrder, StockMovement, StockWarehouse, Supplier, Warehouse } from '../types';

interface PoLine {
  ingredientId: string;
  quantity: string;
  unitCost: string;
}

export function InventoryPage() {
  const property = useProperty();
  const toast = useToast();
  const cur = property.currency;
  const [tab, setTab] = useState<'stock' | 'po' | 'movements'>('stock');
  const [busy, setBusy] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [showNewPo, setShowNewPo] = useState(false);
  const [po, setPo] = useState<{ supplierId: string; warehouseId: string; expectedAt: string; notes: string; lines: PoLine[] }>({ supplierId: '', warehouseId: '', expectedAt: '', notes: '', lines: [{ ingredientId: '', quantity: '', unitCost: '' }] });
  const [adjust, setAdjust] = useState({ warehouseId: '', ingredientId: '', quantity: '', reason: 'ADJUSTMENT', note: '' });

  const stock = useApi(() => api.get<StockWarehouse[]>(prop(property.id, '/stock')), [property.id]);
  const pos = useApi(() => api.get<PurchaseOrder[]>(prop(property.id, '/purchase-orders')), [property.id]);
  const movements = useApi(() => api.get<StockMovement[]>(prop(property.id, '/stock/movements'), { take: 100 }), [property.id], { enabled: tab === 'movements' });
  const ingredients = useApi(() => api.get<Ingredient[]>(prop(property.id, '/ingredients')), [property.id]);
  const warehouses = useApi(() => api.get<Warehouse[]>(prop(property.id, '/warehouses')), [property.id]);
  const suppliers = useApi(() => api.get<Supplier[]>(prop(property.id, '/suppliers')), [property.id]);

  useEffect(() => {
    if (suppliers.data?.length && !po.supplierId) setPo((p) => ({ ...p, supplierId: suppliers.data![0].id }));
    if (warehouses.data?.length && !po.warehouseId) setPo((p) => ({ ...p, warehouseId: warehouses.data![0].id }));
    if (warehouses.data?.length && !adjust.warehouseId) setAdjust((a) => ({ ...a, warehouseId: warehouses.data![0].id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers.data, warehouses.data]);

  const belowPar = (stock.data ?? []).reduce((s, w) => s + w.items.filter((i) => i.belowPar).length, 0);
  const totalValue = (stock.data ?? []).reduce((s, w) => s + w.value, 0);

  async function approve(p: PurchaseOrder) {
    setBusy(p.id);
    const r = await toast.run(() => api.post(prop(property.id, `/purchase-orders/${p.id}/approve`), {}), `${p.number} approved`);
    setBusy(null);
    if (r !== undefined) pos.reload();
  }

  function openReceive(p: PurchaseOrder) {
    setReceiving(p);
    const init: Record<string, string> = {};
    for (const l of p.lines) init[l.id] = String(Math.max(0, l.quantity - l.receivedQty));
    setReceipts(init);
  }

  async function receive() {
    if (!receiving) return;
    const list = receiving.lines.map((l) => ({ lineId: l.id, quantity: Number(receipts[l.id] ?? 0) })).filter((x) => x.quantity > 0);
    if (!list.length) return toast.push('Enter at least one received quantity', 'error');
    setBusy('receive');
    const r = await toast.run(() => api.post(prop(property.id, `/purchase-orders/${receiving.id}/receive`), { receipts: list }), `${receiving.number} received into ${receiving.warehouse.name}`);
    setBusy(null);
    if (r !== undefined) {
      setReceiving(null);
      pos.reload();
      stock.reload();
    }
  }

  async function createPo() {
    const lines = po.lines.filter((l) => l.ingredientId && Number(l.quantity) > 0).map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) || 0 }));
    if (!lines.length) return toast.push('Add at least one line', 'error');
    setBusy('newpo');
    const r = await toast.run(() => api.post(prop(property.id, '/purchase-orders'), { supplierId: po.supplierId, warehouseId: po.warehouseId, expectedAt: po.expectedAt || undefined, notes: po.notes || undefined, lines }), 'Purchase order created');
    setBusy(null);
    if (r !== undefined) {
      setShowNewPo(false);
      setPo((p) => ({ ...p, expectedAt: '', notes: '', lines: [{ ingredientId: '', quantity: '', unitCost: '' }] }));
      pos.reload();
      setTab('po');
    }
  }

  async function doAdjust() {
    setBusy('adjust');
    const r = await toast.run(() => api.post(prop(property.id, '/stock/adjust'), { warehouseId: adjust.warehouseId, ingredientId: adjust.ingredientId, quantity: Number(adjust.quantity), reason: adjust.reason, note: adjust.note || undefined }), 'Stock adjusted');
    setBusy(null);
    if (r !== undefined) {
      setAdjust((a) => ({ ...a, quantity: '', note: '' }));
      stock.reload();
      movements.reload();
    }
  }

  function setLine(i: number, patch: Partial<PoLine>) {
    setPo((p) => ({
      ...p,
      lines: p.lines.map((l, idx) => {
        if (idx !== i) return l;
        const next = { ...l, ...patch };
        if (patch.ingredientId && !l.unitCost) next.unitCost = String(ingredients.data?.find((x) => x.id === patch.ingredientId)?.costPerUnit ?? '');
        return next;
      }),
    }));
  }

  const poTotal = po.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  return (
    <div className="page">
      <PageHeader
        title="Inventory"
        subtitle={
          <>
            Stock value <strong>{money(totalValue, cur)}</strong> · <Badge tone={belowPar ? 'amber' : 'green'}>{belowPar} below par</Badge>
          </>
        }
        actions={
          <>
            <Button size="sm" onClick={() => { stock.reload(); pos.reload(); movements.reload(); }}>
              Refresh
            </Button>
            <Button variant="primary" onClick={() => setShowNewPo(true)}>
              New purchase order
            </Button>
          </>
        }
      />

      <div className="tabs">
        {(['stock', 'po', 'movements'] as const).map((t) => (
          <button key={t} type="button" className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'stock' ? 'Stock by warehouse' : t === 'po' ? `Purchase orders (${pos.data?.length ?? 0})` : 'Movements'}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <>
          <Async data={stock.data} loading={stock.loading} error={stock.error} retry={stock.reload}>
            {(whs) => (
              <div className="grid grid-2">
                {whs.map((w) => (
                  <Card key={w.warehouseId} padded={false} title={`${w.name} (${w.code})`} actions={<span className="muted small">{money(w.value, cur)} · {w.items.filter((i) => i.belowPar).length} below par</span>}>
                    <div className="table-wrap">
                      <table className="table table-compact">
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Item</th>
                            <th className="num">On hand</th>
                            <th className="num">Par</th>
                            <th className="num">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {w.items.map((i) => (
                            <tr key={i.ingredientId} className={i.belowPar ? 'below-par' : ''}>
                              <td className="mono">{i.sku}</td>
                              <td>
                                {i.name}
                                {i.belowPar && (
                                  <Badge tone="amber" className="ml">
                                    below par
                                  </Badge>
                                )}
                              </td>
                              <td className="num strong">
                                {num(i.quantity, 2)} {i.unit}
                              </td>
                              <td className="num muted">{num(i.parLevel, 0)}</td>
                              <td className="num">{money(i.value, cur)}</td>
                            </tr>
                          ))}
                          {w.items.length === 0 && (
                            <tr>
                              <td colSpan={5}>
                                <Empty>No stock in this warehouse.</Empty>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Async>
          <Card title="Quick stock adjustment" className="mt">
            <div className="form-row">
              <Field label="Warehouse">
                <Select value={adjust.warehouseId} onChange={(e) => setAdjust({ ...adjust, warehouseId: e.target.value })}>
                  {(warehouses.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ingredient">
                <Select value={adjust.ingredientId} onChange={(e) => setAdjust({ ...adjust, ingredientId: e.target.value })}>
                  <option value="">Choose…</option>
                  {(ingredients.data ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity (+/−)">
                <Input type="number" step="0.01" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })} />
              </Field>
              <Field label="Reason">
                <Select value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}>
                  {['ADJUSTMENT', 'WASTAGE', 'STOCK_COUNT'].map((r) => (
                    <option key={r} value={r}>
                      {titleCase(r)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note">
                <Input value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
              </Field>
              <Button busy={busy === 'adjust'} disabled={!adjust.ingredientId || !adjust.quantity} onClick={doAdjust}>
                Apply
              </Button>
            </div>
          </Card>
        </>
      )}

      {tab === 'po' && (
        <Card padded={false}>
          <Async data={pos.data} loading={pos.loading} error={pos.error} retry={pos.reload}>
            {(list) =>
              list.length === 0 ? (
                <Empty>No purchase orders.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>PO</th>
                        <th>Status</th>
                        <th>Supplier</th>
                        <th>Warehouse</th>
                        <th>Lines</th>
                        <th>Expected</th>
                        <th>Requested by</th>
                        <th className="num">Total</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((p) => (
                        <tr key={p.id}>
                          <td className="strong">{p.number}</td>
                          <td>
                            <StatusBadge status={p.status} />
                          </td>
                          <td>{p.supplier?.name}</td>
                          <td>{p.warehouse?.name}</td>
                          <td className="wrap small">{p.lines.map((l) => `${l.ingredient?.name} ${num(l.receivedQty, 0)}/${num(l.quantity, 0)} ${l.ingredient?.unit}`).join(', ')}</td>
                          <td>{p.expectedAt ? day(p.expectedAt) : '—'}</td>
                          <td>{p.requestedBy ?? '—'}</td>
                          <td className="num strong">{money(p.total, cur)}</td>
                          <td>
                            <div className="row" style={{ justifyContent: 'flex-end' }}>
                              {p.status === 'PENDING_APPROVAL' && (
                                <Button size="sm" variant="primary" busy={busy === p.id} onClick={() => approve(p)}>
                                  Approve
                                </Button>
                              )}
                              {(p.status === 'APPROVED' || p.status === 'PARTIALLY_RECEIVED') && (
                                <Button size="sm" variant="success" onClick={() => openReceive(p)}>
                                  Receive
                                </Button>
                              )}
                            </div>
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
      )}

      {tab === 'movements' && (
        <Card padded={false}>
          <Async data={movements.data} loading={movements.loading} error={movements.error} retry={movements.reload}>
            {(list) =>
              list.length === 0 ? (
                <Empty>No stock movements.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Warehouse</th>
                        <th>Ingredient</th>
                        <th className="num">Qty</th>
                        <th>Reason</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((m) => (
                        <tr key={m.id}>
                          <td className="small muted">{dateTime(m.createdAt)}</td>
                          <td>{m.warehouse?.name}</td>
                          <td>{m.ingredient?.name}</td>
                          <td className="num" style={{ color: m.quantity < 0 ? 'var(--red)' : 'var(--green)' }}>
                            {m.quantity > 0 ? '+' : ''}
                            {num(m.quantity, 2)} {m.ingredient?.unit}
                          </td>
                          <td>
                            <Badge>{titleCase(m.reason)}</Badge>
                          </td>
                          <td className="wrap small muted">{m.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </Async>
        </Card>
      )}

      <Modal
        open={!!receiving}
        onClose={() => setReceiving(null)}
        title={receiving ? `Receive ${receiving.number} into ${receiving.warehouse.name}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReceiving(null)}>
              Cancel
            </Button>
            <Button variant="success" busy={busy === 'receive'} onClick={receive}>
              Confirm receipt
            </Button>
          </>
        }
      >
        {receiving && (
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th className="num">Ordered</th>
                <th className="num">Already received</th>
                <th className="num">Receive now</th>
              </tr>
            </thead>
            <tbody>
              {receiving.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.ingredient?.name}</td>
                  <td className="num">
                    {num(l.quantity, 2)} {l.ingredient?.unit}
                  </td>
                  <td className="num">{num(l.receivedQty, 2)}</td>
                  <td className="num">
                    <Input type="number" min={0} step="0.01" className="input-sm" style={{ width: 90 }} value={receipts[l.id] ?? ''} onChange={(e) => setReceipts({ ...receipts, [l.id]: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <Modal
        open={showNewPo}
        onClose={() => setShowNewPo(false)}
        title="New purchase order"
        footer={
          <>
            <span className="muted grow">Total {money(poTotal, cur)}</span>
            <Button variant="ghost" onClick={() => setShowNewPo(false)}>
              Cancel
            </Button>
            <Button variant="primary" busy={busy === 'newpo'} onClick={createPo}>
              Create PO
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Supplier">
              <Select value={po.supplierId} onChange={(e) => setPo({ ...po, supplierId: e.target.value })}>
                {(suppliers.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deliver to">
              <Select value={po.warehouseId} onChange={(e) => setPo({ ...po, warehouseId: e.target.value })}>
                {(warehouses.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expected on">
              <Input type="date" value={po.expectedAt} onChange={(e) => setPo({ ...po, expectedAt: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <Input value={po.notes} onChange={(e) => setPo({ ...po, notes: e.target.value })} />
          </Field>
          <div className="field-label">Lines</div>
          {po.lines.map((l, i) => (
            <div className="form-row" key={i}>
              <Select className="grow" value={l.ingredientId} onChange={(e) => setLine(i, { ingredientId: e.target.value })}>
                <option value="">Ingredient…</option>
                {(ingredients.data ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.unit}) · par {x.parLevel}
                  </option>
                ))}
              </Select>
              <Input type="number" min={0} step="0.01" placeholder="Qty" style={{ width: 90 }} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <Input type="number" min={0} step="0.01" placeholder="Unit cost" style={{ width: 110 }} value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
              <Button size="sm" variant="ghost" onClick={() => setPo({ ...po, lines: po.lines.filter((_, idx) => idx !== i) })} disabled={po.lines.length === 1} aria-label="Remove line">
                ×
              </Button>
            </div>
          ))}
          <Button size="sm" onClick={() => setPo({ ...po, lines: [...po.lines, { ingredientId: '', quantity: '', unitCost: '' }] })}>
            + Add line
          </Button>
        </div>
      </Modal>
    </div>
  );
}
