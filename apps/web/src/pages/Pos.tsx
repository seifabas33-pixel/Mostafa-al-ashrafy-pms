import { useEffect, useMemo, useState } from 'react';
import { api, prop } from '../api';
import { Async, Badge, Button, Card, Empty, Field, Input, PageHeader, Select, StatusBadge } from '../components/ui';
import { useProperty, useToast } from '../context';
import { dateTime, money, pct, titleCase } from '../format';
import { useApi } from '../hooks';
import type { CostingRow, MenuItem, Outlet, PosOrder, Room } from '../types';

interface CartLine {
  item: MenuItem;
  quantity: number;
}

export function PosPage() {
  const property = useProperty();
  const toast = useToast();
  const cur = property.currency;
  const [outletId, setOutletId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [covers, setCovers] = useState(1);
  const [roomId, setRoomId] = useState('');
  const [kitchenNotes, setKitchenNotes] = useState('');
  const [allergyNotes, setAllergyNotes] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // An order created but not yet settled, so a retry reuses it instead of creating another.
  const [pending, setPending] = useState<PosOrder | null>(null);
  const [tab, setTab] = useState<'orders' | 'costing'>('orders');

  const outlets = useApi(() => api.get<Outlet[]>(prop(property.id, '/outlets')), [property.id]);
  const rooms = useApi(() => api.get<Room[]>(prop(property.id, '/rooms'), { status: 'OCCUPIED' }), [property.id]);
  const orders = useApi(() => api.get<PosOrder[]>(prop(property.id, '/pos/orders'), { take: 50 }), [property.id]);
  const costing = useApi(() => api.get<CostingRow[]>(prop(property.id, `/outlets/${outletId}/costing`)), [property.id, outletId], { enabled: !!outletId });

  useEffect(() => {
    if (outlets.data?.length && !outlets.data.some((o) => o.id === outletId)) setOutletId(outlets.data.find((o) => o.active)?.id ?? outlets.data[0].id);
  }, [outlets.data, outletId]);

  // Editing the order after a failed settle must not re-settle the stale one.
  useEffect(() => {
    setPending(null);
  }, [cart, covers, kitchenNotes, allergyNotes, outletId]);

  const outlet = outlets.data?.find((o) => o.id === outletId);
  const categories = useMemo(() => [...new Set((outlet?.menuItems ?? []).map((m) => m.category))], [outlet]);
  const items = (outlet?.menuItems ?? []).filter((m) => m.active && (!category || m.category === category));

  const subtotal = cart.reduce((s, l) => s + l.item.price * l.quantity, 0);
  const service = (subtotal * property.serviceRate) / 100;
  const tax = ((subtotal + service) * property.vatRate) / 100;

  function add(item: MenuItem) {
    setCart((c) => {
      const i = c.findIndex((l) => l.item.id === item.id);
      if (i >= 0) return c.map((l, idx) => (idx === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { item, quantity: 1 }];
    });
  }
  function setQty(id: string, q: number) {
    setCart((c) => c.map((l) => (l.item.id === id ? { ...l, quantity: q } : l)).filter((l) => l.quantity > 0));
  }

  /**
   * Settling is two requests: create the order, then post or pay it. If the second fails
   * (say the room has no checked-in guest) the created order is already OPEN, so a retry
   * must reuse it rather than creating another. Otherwise each attempt leaves an orphan.
   */
  async function pendingOrder(): Promise<PosOrder> {
    if (pending) return pending;
    const created = await api.post<PosOrder>(prop(property.id, '/pos/orders'), {
      outletId,
      roomId: roomId || undefined,
      covers,
      kitchenNotes,
      allergyNotes,
      lines: cart.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity })),
    });
    setPending(created);
    return created;
  }

  function reset() {
    setCart([]);
    setKitchenNotes('');
    setAllergyNotes('');
    setCovers(1);
    setPending(null);
    orders.reload();
    rooms.reload();
  }

  async function postToRoom() {
    if (!roomId) return toast.push('Choose an occupied room first', 'error');
    setBusy('room');
    const r = await toast.run(async () => {
      const o = await pendingOrder();
      return api.post<PosOrder>(prop(property.id, `/pos/orders/${o.id}/post-to-room`), { roomId });
    }, 'Posted to the guest folio');
    setBusy(null);
    if (r) reset();
  }

  async function pay(method: 'CASH' | 'CARD' | 'BNPL') {
    setBusy(method);
    const r = await toast.run(async () => {
      const o = await pendingOrder();
      return api.post<PosOrder>(prop(property.id, `/pos/orders/${o.id}/pay`), { method });
    }, `Paid by ${method.toLowerCase()}`);
    setBusy(null);
    if (r) reset();
  }

  async function voidOrder(o: PosOrder) {
    if (!window.confirm(`Void order ${o.number}?`)) return;
    setBusy(o.id);
    const r = await toast.run(() => api.post(prop(property.id, `/pos/orders/${o.id}/void`), {}), 'Order voided');
    setBusy(null);
    if (r !== undefined) orders.reload();
  }

  return (
    <div className="page">
      <PageHeader
        title="Point of sale"
        subtitle="Outlet orders posted to room or settled at the till; recipes deduct stock automatically"
        actions={
          <Async data={outlets.data} loading={outlets.loading} error={outlets.error}>
            {(list) => (
              <Select className="input-auto" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                {list.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {titleCase(o.type)}
                  </option>
                ))}
              </Select>
            )}
          </Async>
        }
      />

      <div className="pos-layout">
        <Card
          title={outlet ? `${outlet.name} menu` : 'Menu'}
          actions={
            <div className="chips">
              <button type="button" className={`chip ${!category ? 'chip-active' : ''}`} onClick={() => setCategory('')}>
                All
              </button>
              {categories.map((c) => (
                <button key={c} type="button" className={`chip ${category === c ? 'chip-active' : ''}`} onClick={() => setCategory(c)}>
                  {titleCase(c)}
                </button>
              ))}
            </div>
          }
        >
          {outlets.loading && !outlets.data ? (
            <Empty>Loading outlets…</Empty>
          ) : items.length === 0 ? (
            <Empty>No menu items in this outlet.</Empty>
          ) : (
            <div className="menu-grid">
              {items.map((m) => (
                <button key={m.id} type="button" className="menu-item" onClick={() => add(m)}>
                  <span className="strong">{m.name}</span>
                  <span className="faint small">{titleCase(m.category)}</span>
                  <span className="price">{money(m.price, cur)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Cart (${cart.reduce((s, l) => s + l.quantity, 0)})`}>
          {cart.length === 0 && <Empty>Tap menu items to add them.</Empty>}
          {cart.map((l) => (
            <div className="cart-line" key={l.item.id}>
              <div>
                <div>{l.item.name}</div>
                <div className="faint small">{money(l.item.price, cur)} each</div>
              </div>
              <div className="qty">
                <button type="button" onClick={() => setQty(l.item.id, l.quantity - 1)} aria-label="Decrease">
                  −
                </button>
                <span style={{ minWidth: 22, textAlign: 'center' }}>{l.quantity}</span>
                <button type="button" onClick={() => setQty(l.item.id, l.quantity + 1)} aria-label="Increase">
                  +
                </button>
              </div>
              <div className="right strong">{money(l.item.price * l.quantity, cur)}</div>
            </div>
          ))}
          <div className="totals">
            <span>Subtotal</span>
            <span className="right">{money(subtotal, cur)}</span>
            <span>Service {property.serviceRate}%</span>
            <span className="right">{money(service, cur)}</span>
            <span>VAT {property.vatRate}%</span>
            <span className="right">{money(tax, cur)}</span>
            <span className="grand">Total</span>
            <span className="grand right">{money(subtotal + service + tax, cur)}</span>
          </div>
          <div className="form-grid mt">
            <Field label="Covers">
              <Input type="number" min={1} value={covers} onChange={(e) => setCovers(Math.max(1, Number(e.target.value)))} />
            </Field>
            <Field label="Room (in-house)">
              <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">— none —</option>
                {(rooms.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} · {r.currentGuest?.name ?? 'occupied'}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Kitchen notes" className="mt">
            <Input value={kitchenNotes} onChange={(e) => setKitchenNotes(e.target.value)} placeholder="No onion, well done…" />
          </Field>
          <Field label="Allergy notes" className="mt">
            <Input value={allergyNotes} onChange={(e) => setAllergyNotes(e.target.value)} placeholder="Nut allergy…" />
          </Field>
          <div className="stack mt">
            <Button variant="primary" disabled={!cart.length || !roomId} busy={busy === 'room'} onClick={postToRoom}>
              Post to room {roomId ? (rooms.data ?? []).find((r) => r.id === roomId)?.number : ''}
            </Button>
            <div className="row">
              {(['CASH', 'CARD', 'BNPL'] as const).map((m) => (
                <Button key={m} className="grow" disabled={!cart.length} busy={busy === m} onClick={() => pay(m)}>
                  {titleCase(m)}
                </Button>
              ))}
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setCart([])}>
                Clear cart
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="tabs">
        <button type="button" className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
          Recent orders
        </button>
        <button type="button" className={`tab ${tab === 'costing' ? 'active' : ''}`} onClick={() => setTab('costing')}>
          Menu costing
        </button>
      </div>

      {tab === 'orders' ? (
        <Card padded={false} title="Recent orders" actions={<Button size="sm" onClick={orders.reload}>Refresh</Button>}>
          <Async data={orders.data} loading={orders.loading} error={orders.error} retry={orders.reload}>
            {(list) =>
              list.length === 0 ? (
                <Empty>No orders yet.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Outlet</th>
                        <th>Status</th>
                        <th>Room</th>
                        <th>Items</th>
                        <th className="num">Covers</th>
                        <th className="num">Total</th>
                        <th>Payment</th>
                        <th>Time</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((o) => (
                        <tr key={o.id}>
                          <td className="strong">{o.number}</td>
                          <td>{o.outlet?.name ?? '—'}</td>
                          <td>
                            <StatusBadge status={o.status} />
                          </td>
                          <td>{o.room?.number ?? <span className="faint">—</span>}</td>
                          <td className="wrap small">{o.lines.map((l) => `${l.quantity}× ${l.menuItem?.name ?? ''}`).join(', ')}</td>
                          <td className="num">{o.covers}</td>
                          <td className="num strong">{money(o.total, cur)}</td>
                          <td>{o.paymentMethod ? <Badge>{titleCase(o.paymentMethod)}</Badge> : '—'}</td>
                          <td className="small muted">{dateTime(o.closedAt ?? o.createdAt)}</td>
                          <td>
                            {o.status === 'OPEN' && (
                              <Button size="sm" variant="danger" busy={busy === o.id} onClick={() => voidOrder(o)}>
                                Void
                              </Button>
                            )}
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
      ) : (
        <Card padded={false} title={`Costing · ${outlet?.name ?? ''}`}>
          <Async data={costing.data} loading={costing.loading} error={costing.error} retry={costing.reload}>
            {(rows) =>
              rows.length === 0 ? (
                <Empty>No recipes defined for this outlet.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Menu item</th>
                        <th className="num">Price</th>
                        <th className="num">Recipe cost</th>
                        <th className="num">Margin</th>
                        <th className="num">Food cost %</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.menuItemId}>
                          <td>{r.name}</td>
                          <td className="num">{money(r.price, cur)}</td>
                          <td className="num">{money(r.cost, cur)}</td>
                          <td className="num">{money(r.margin, cur)}</td>
                          <td className="num strong">{pct(r.foodCostPct)}</td>
                          <td>
                            <Badge tone={r.foodCostPct > 35 ? 'red' : r.foodCostPct > 28 ? 'amber' : 'green'}>{r.foodCostPct > 35 ? 'High' : r.foodCostPct > 28 ? 'Watch' : 'Healthy'}</Badge>
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
    </div>
  );
}
