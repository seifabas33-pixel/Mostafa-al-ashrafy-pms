import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, prop } from '../api';
import { ReservationActions } from '../components/ReservationActions';
import { Badge, Button, Drawer, ErrorBox, Input, KeyValue, Loading, StatusBadge } from '../components/ui';
import { useProperty, useToast } from '../context';
import { addDays, day, diffDays, money, shortDate, weekday } from '../format';
import { useApi } from '../hooks';
import type { Reservation, Room, RoomType } from '../types';

const DAYS = 14;
const CELL = 76;
const LABEL = 168;

interface Bar {
  r: Reservation;
  left: number;
  width: number;
  tone: string;
}

export function RackPage() {
  const property = useProperty();
  const toast = useToast();
  const bd = day(property.businessDate);
  const [start, setStart] = useState(bd);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [menuRoom, setMenuRoom] = useState<string | null>(null);
  const end = addDays(start, DAYS);
  const dates = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(start, i)), [start]);

  useEffect(() => setStart(bd), [bd]);

  const rooms = useApi(() => api.get<Room[]>(prop(property.id, '/rooms')), [property.id]);
  const types = useApi(() => api.get<RoomType[]>(prop(property.id, '/room-types')), [property.id]);
  const resv = useApi(() => api.get<Reservation[]>(prop(property.id, '/reservations'), { from: start, to: end, take: 1000 }), [property.id, start, end]);

  useEffect(() => {
    const close = () => setMenuRoom(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  function reloadAll() {
    rooms.reload();
    resv.reload();
  }

  function toBar(r: Reservation): Bar | null {
    const a = diffDays(start, day(r.arrival));
    const d = r.dayUse ? a + 1 : diffDays(start, day(r.departure));
    const x1 = Math.max(0, a + 0.5);
    const x2 = Math.min(DAYS, d + 0.5);
    if (x2 - x1 <= 0) return null;
    const tone = r.status === 'CHECKED_IN' ? (day(r.departure) === bd ? 'amber' : 'green') : r.status === 'CONFIRMED' ? 'blue' : 'grey';
    return { r, left: x1 * CELL + 2, width: (x2 - x1) * CELL - 4, tone };
  }

  const groups = useMemo(() => {
    if (!rooms.data || !types.data) return [];
    const active = (resv.data ?? []).filter((r) => r.status !== 'CANCELLED' && r.status !== 'NO_SHOW');
    return [...types.data]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => {
        const typeRooms = rooms.data!.filter((x) => x.roomTypeId === t.id).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
        const rows = typeRooms.map((room) => ({
          room,
          bars: active
            .filter((r) => r.roomId === room.id)
            .map(toBar)
            .filter((b): b is Bar => !!b),
        }));
        const unassigned = active
          .filter((r) => !r.roomId && r.roomTypeId === t.id)
          .map(toBar)
          .filter((b): b is Bar => !!b);
        return { type: t, rows, unassigned };
      })
      .filter((g) => g.rows.length || g.unassigned.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms.data, types.data, resv.data, start, bd]);

  async function setRoomStatus(room: Room, status: 'VACANT' | 'OUT_OF_ORDER') {
    const ok = await toast.run(() => api.patch(prop(property.id, `/rooms/${room.id}`), { status }), status === 'OUT_OF_ORDER' ? `Room ${room.number} set out of order` : `Room ${room.number} back in order`);
    if (ok !== undefined) reloadAll();
  }
  async function setHk(room: Room, hkStatus: 'CLEAN' | 'DIRTY' | 'INSPECTED') {
    const ok = await toast.run(() => api.patch(prop(property.id, `/rooms/${room.id}`), { hkStatus }), `Room ${room.number} marked ${hkStatus.toLowerCase()}`);
    if (ok !== undefined) reloadAll();
  }

  const loading = rooms.loading || types.loading || resv.loading;
  const error = rooms.error ?? types.error ?? resv.error;
  const gridCols = `${LABEL}px repeat(${DAYS}, ${CELL}px)`;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Room rack</h1>
          <div className="page-subtitle">
            {DAYS} nights from {start} · click a bar for details · row menu (⋯) toggles out-of-order
          </div>
        </div>
        <div className="page-actions">
          <Button size="sm" onClick={() => setStart(addDays(start, -7))}>
            ← Week
          </Button>
          <Button size="sm" onClick={() => setStart(bd)} disabled={start === bd}>
            Today
          </Button>
          <Input type="date" className="input-sm input-auto" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          <Button size="sm" onClick={() => setStart(addDays(start, 7))}>
            Week →
          </Button>
          <Button size="sm" onClick={reloadAll}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="legend mb">
        <span>
          <span className="dot dot-blue" />
          Confirmed
        </span>
        <span>
          <span className="dot dot-green" />
          In-house
        </span>
        <span>
          <span className="dot dot-amber" />
          Departing today
        </span>
        <span>
          <span className="dot dot-grey" />
          Checked out
        </span>
        <span>
          <span className="dot dot-red" />
          Out of order (hatched)
        </span>
      </div>

      {loading && !groups.length ? (
        <Loading />
      ) : error && !groups.length ? (
        <ErrorBox error={error} retry={reloadAll} />
      ) : (
        ((gs: Group[]) => (
          <div className="rack-wrap">
            <div className="rack" style={{ gridTemplateColumns: gridCols }}>
              <div className="rack-cell rack-corner">Room</div>
              {dates.map((d) => {
                const wd = weekday(d);
                return (
                  <div key={d} className={`rack-cell rack-day ${d === bd ? 'today' : ''} ${wd === 'Fri' || wd === 'Sat' ? 'weekend' : ''}`}>
                    {shortDate(d)}
                    <span className="faint">{wd}</span>
                  </div>
                );
              })}
              {gs.map((g) => (
                <RackGroup key={g.type.id} group={g} dates={dates} bd={bd} menuRoom={menuRoom} setMenuRoom={setMenuRoom} onSelect={setSelected} onStatus={setRoomStatus} onHk={setHk} />
              ))}
              {!gs.length && <div className="rack-group">No rooms configured for this property.</div>}
            </div>
          </div>
        ))(groups)
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.confirmationNumber} · ${selected.guest.firstName} ${selected.guest.lastName}` : ''}>
        {selected && (
          <div className="stack">
            <div className="row">
              <StatusBadge status={selected.status} />
              {selected.guest.vip && <Badge tone="amber">VIP</Badge>}
              <Badge>{selected.source}</Badge>
              <Link to={`/reservations/${selected.id}`} style={{ marginLeft: 'auto' }}>
                Open full record →
              </Link>
            </div>
            <KeyValue
              items={[
                ['Arrival', day(selected.arrival)],
                ['Departure', day(selected.departure)],
                ['Nights', String(Math.max(1, diffDays(day(selected.arrival), day(selected.departure))))],
                ['Room type', `${selected.roomType.code} · ${selected.roomType.name}`],
                ['Room', selected.room?.number ?? 'Unassigned'],
                ['Rate plan', selected.ratePlan.code],
                ['Guests', `${selected.adults} adult${selected.adults === 1 ? '' : 's'}${selected.children ? `, ${selected.children} child${selected.children === 1 ? '' : 'ren'}` : ''}`],
                ['Total', money(selected.totalAmount, property.currency)],
                ['Phone', selected.guest.phone ?? '—'],
                ['Email', selected.guest.email ?? '—'],
              ]}
            />
            {selected.specialRequests && (
              <div>
                <div className="field-label">Special requests</div>
                <div>{selected.specialRequests}</div>
              </div>
            )}
            <hr style={{ border: 0, borderTop: '1px solid var(--border)' }} />
            <ReservationActions
              reservation={selected}
              onChanged={() => {
                setSelected(null);
                reloadAll();
              }}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}

interface Group {
  type: RoomType;
  rows: { room: Room; bars: Bar[] }[];
  unassigned: Bar[];
}

function RackGroup({ group, dates, bd, menuRoom, setMenuRoom, onSelect, onStatus, onHk }: { group: Group; dates: string[]; bd: string; menuRoom: string | null; setMenuRoom: (id: string | null) => void; onSelect: (r: Reservation) => void; onStatus: (room: Room, s: 'VACANT' | 'OUT_OF_ORDER') => void; onHk: (room: Room, s: 'CLEAN' | 'DIRTY' | 'INSPECTED') => void }) {
  const trackCols = `repeat(${dates.length}, ${CELL}px)`;
  return (
    <>
      <div className="rack-group">
        {group.type.code} · {group.type.name} · {group.rows.length} rooms
      </div>
      {group.rows.map(({ room, bars }) => {
        const ooo = room.status === 'OUT_OF_ORDER' || room.status === 'OUT_OF_SERVICE';
        return (
          <div key={room.id} style={{ display: 'contents' }}>
            <div className="rack-cell rack-room" title={room.notes || undefined}>
              <span className="room-number">{room.number}</span>
              <span className={`dot dot-${room.hkStatus === 'CLEAN' ? 'green' : room.hkStatus === 'DIRTY' ? 'amber' : room.hkStatus === 'INSPECTED' ? 'teal' : 'blue'}`} title={`Housekeeping: ${room.hkStatus}`} style={{ margin: 0 }} />
              {ooo && <Badge tone="red">OOO</Badge>}
              <span style={{ position: 'relative', marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <button type="button" className="rack-menu" aria-label={`Room ${room.number} menu`} onClick={() => setMenuRoom(menuRoom === room.id ? null : room.id)}>
                  ⋯
                </button>
                {menuRoom === room.id && (
                  <div className="card" style={{ position: 'absolute', right: 0, top: 22, zIndex: 5, minWidth: 180, padding: 4, margin: 0 }}>
                    <div className="stack" style={{ gap: 2 }}>
                      {ooo ? (
                        <Button size="sm" variant="ghost" onClick={() => onStatus(room, 'VACANT')}>
                          Back in order
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={room.status === 'OCCUPIED'} title={room.status === 'OCCUPIED' ? 'Room is occupied' : undefined} onClick={() => onStatus(room, 'OUT_OF_ORDER')}>
                          Set out of order
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => onHk(room, 'CLEAN')}>
                        Mark clean
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onHk(room, 'DIRTY')}>
                        Mark dirty
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onHk(room, 'INSPECTED')}>
                        Mark inspected
                      </Button>
                    </div>
                  </div>
                )}
              </span>
            </div>
            <div className={`rack-track ${ooo ? 'ooo' : ''}`} style={{ gridTemplateColumns: trackCols }}>
              {dates.map((d) => (
                <div key={d} className={`rack-cell ${d === bd ? 'today' : ''}`} />
              ))}
              {bars.map((b) => (
                <BarEl key={b.r.id} bar={b} onSelect={onSelect} />
              ))}
            </div>
          </div>
        );
      })}
      {group.unassigned.map((b) => (
        <div key={b.r.id} style={{ display: 'contents' }}>
          <div className="rack-cell rack-room">
            <span className="faint small">Unassigned</span>
          </div>
          <div className="rack-track" style={{ gridTemplateColumns: trackCols }}>
            {dates.map((d) => (
              <div key={d} className={`rack-cell ${d === bd ? 'today' : ''}`} />
            ))}
            <BarEl bar={b} onSelect={onSelect} unassigned />
          </div>
        </div>
      ))}
    </>
  );
}

function BarEl({ bar, onSelect, unassigned }: { bar: Bar; onSelect: (r: Reservation) => void; unassigned?: boolean }) {
  const r = bar.r;
  const label = `${r.guest.firstName} ${r.guest.lastName}`;
  return (
    <div className={`rack-bar ${bar.tone} ${unassigned ? 'unassigned' : ''}`} style={{ left: bar.left, width: bar.width }} title={`${r.confirmationNumber} · ${label} · ${day(r.arrival)} → ${day(r.departure)} · ${r.status}`} onClick={() => onSelect(r)} role="button">
      {r.guest.vip ? '★ ' : ''}
      {label}
    </div>
  );
}
