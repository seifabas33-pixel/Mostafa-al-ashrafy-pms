import { useState } from 'react';
import { ApiError, api, prop } from '../api';
import { useProperty, useToast } from '../context';
import { day } from '../format';
import { useApi } from '../hooks';
import type { Reservation, Room } from '../types';
import { Button, Select } from './ui';

/**
 * Front-desk actions for one reservation: assign room, check-in, check-out (with
 * forced settlement fallback), cancel and no-show. Calls `onChanged` after success.
 */
export function ReservationActions({ reservation: r, onChanged, compact }: { reservation: Reservation; onChanged: () => void; compact?: boolean }) {
  const property = useProperty();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string>(r.roomId ?? '');
  const bd = day(property.businessDate);
  const arrival = day(r.arrival);
  const departure = day(r.departure);
  const canAssign = r.status === 'CONFIRMED' || r.status === 'CHECKED_IN';
  const free = useApi(
    () => api.get<Room[]>(prop(property.id, '/free-rooms'), { roomTypeId: r.roomTypeId, arrival, departure: r.dayUse ? day(new Date(Date.parse(arrival) + 86_400_000)) : departure, excludeReservationId: r.id }),
    [property.id, r.id, r.roomTypeId, arrival, departure],
    { enabled: canAssign },
  );

  async function act(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    const res = await toast.run(fn, success);
    setBusy(null);
    if (res !== undefined) onChanged();
  }

  async function checkOut() {
    setBusy('out');
    try {
      await api.post(prop(property.id, `/reservations/${r.id}/check-out`), {});
      toast.push(`${r.guest.firstName} ${r.guest.lastName} checked out`, 'success');
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /balance/i.test(e.message)) {
        if (window.confirm(`${e.message}.\n\nForce check-out anyway? The folio will be closed with its open balance transferred to the city ledger.`)) {
          const ok = await toast.run(() => api.post(prop(property.id, `/reservations/${r.id}/check-out`), { force: true }), 'Checked out (forced)');
          if (ok !== undefined) onChanged();
        }
      } else toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    const reason = window.prompt(`Cancel ${r.confirmationNumber}? Enter a reason (optional):`);
    if (reason === null) return;
    await act('cancel', () => api.post(prop(property.id, `/reservations/${r.id}/cancel`), { reason: reason || undefined }), 'Reservation cancelled');
  }

  async function noShow() {
    if (!window.confirm(`Mark ${r.confirmationNumber} as a no-show?`)) return;
    await act('noshow', () => api.post(prop(property.id, `/reservations/${r.id}/no-show`), {}), 'Marked as no-show');
  }

  const rooms = free.data ?? [];
  const currentInList = rooms.some((x) => x.id === r.roomId);

  return (
    <div className="stack">
      {canAssign && (
        <div className="form-row">
          <label className="field grow">
            <span className="field-label">Room ({r.roomType.code})</span>
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={free.loading}>
              <option value="">— Unassigned —</option>
              {r.room && !currentInList && (
                <option value={r.room.id}>
                  {r.room.number} (current)
                </option>
              )}
              {rooms.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.number} · floor {x.floor || '—'} · {x.hkStatus.toLowerCase()}
                  {x.id === r.roomId ? ' (current)' : ''}
                </option>
              ))}
            </Select>
          </label>
          <Button size={compact ? 'sm' : 'md'} busy={busy === 'assign'} disabled={roomId === (r.roomId ?? '')} onClick={() => act('assign', () => api.post(prop(property.id, `/reservations/${r.id}/assign-room`), { roomId: roomId || null }), roomId ? 'Room assigned' : 'Room unassigned')}>
            Assign
          </Button>
        </div>
      )}
      <div className="row">
        {r.status === 'CONFIRMED' && (
          <Button variant="success" size={compact ? 'sm' : 'md'} busy={busy === 'in'} disabled={arrival > bd} title={arrival > bd ? `Arrival ${arrival} is after business date ${bd}` : undefined} onClick={() => act('in', () => api.post(prop(property.id, `/reservations/${r.id}/check-in`), roomId ? { roomId } : {}), 'Checked in')}>
            Check in
          </Button>
        )}
        {r.status === 'CHECKED_IN' && (
          <Button variant="primary" size={compact ? 'sm' : 'md'} busy={busy === 'out'} onClick={checkOut}>
            Check out
          </Button>
        )}
        {r.status === 'CONFIRMED' && arrival <= bd && (
          <Button size={compact ? 'sm' : 'md'} busy={busy === 'noshow'} onClick={noShow}>
            No-show
          </Button>
        )}
        {(r.status === 'CONFIRMED' || r.status === 'CHECKED_IN') && (
          <Button variant="danger" size={compact ? 'sm' : 'md'} busy={busy === 'cancel'} onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
