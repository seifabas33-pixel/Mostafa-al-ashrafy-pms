import { useMemo, useState } from 'react';
import { api, prop } from '../api';
import { Async, Badge, Button, Card, Drawer, Empty, Field, Input, PageHeader, Select, StatusBadge } from '../components/ui';
import { useProperty, useToast } from '../context';
import { day, titleCase } from '../format';
import { useApi } from '../hooks';
import type { HkBoardRoom, HkTask } from '../types';

const TASK_TYPES = ['CLEAN', 'INSPECT', 'TURNDOWN', 'MAINTENANCE', 'DEEP_CLEAN'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'RUSH'];

export function HousekeepingPage() {
  const property = useProperty();
  const toast = useToast();
  const bd = day(property.businessDate);
  const [date, setDate] = useState(bd);
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [hkFilter, setHkFilter] = useState('');
  const [selected, setSelected] = useState<HkBoardRoom | null>(null);
  const [newTask, setNewTask] = useState({ type: 'CLEAN', priority: 'NORMAL', assignedTo: '', notes: '' });
  const [busy, setBusy] = useState<string | null>(null);

  const board = useApi(() => api.get<HkBoardRoom[]>(prop(property.id, '/housekeeping/board')), [property.id], { refreshMs: 60_000 });
  const tasks = useApi(() => api.get<HkTask[]>(prop(property.id, '/housekeeping/tasks'), { date, status: statusFilter || undefined }), [property.id, date, statusFilter]);

  const floors = useMemo(() => {
    const map = new Map<string, HkBoardRoom[]>();
    for (const r of board.data ?? []) {
      if (hkFilter && r.hkStatus !== hkFilter) continue;
      const key = r.floor || '—';
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [board.data, hkFilter]);

  const assignees = useMemo(() => [...new Set((tasks.data ?? []).map((t) => t.assignedTo).filter((x): x is string => !!x))].sort(), [tasks.data]);
  const visibleTasks = useMemo(() => (tasks.data ?? []).filter((t) => !assigneeFilter || t.assignedTo === assigneeFilter), [tasks.data, assigneeFilter]);

  function reloadAll() {
    board.reload();
    tasks.reload();
  }

  async function patchTask(t: HkTask, body: Record<string, unknown>, msg: string) {
    setBusy(t.id);
    const r = await toast.run(() => api.patch(prop(property.id, `/housekeeping/tasks/${t.id}`), body), msg);
    setBusy(null);
    if (r !== undefined) reloadAll();
  }

  async function assign(t: HkTask) {
    const who = window.prompt('Assign to (name):', t.assignedTo ?? '');
    if (who === null) return;
    await patchTask(t, { assignedTo: who.trim() || null }, who.trim() ? `Assigned to ${who.trim()}` : 'Unassigned');
  }

  async function setRoomHk(room: HkBoardRoom, hkStatus: string) {
    setBusy(room.roomId);
    const r = await toast.run(() => api.patch(prop(property.id, `/rooms/${room.roomId}`), { hkStatus }), `Room ${room.number} marked ${hkStatus.toLowerCase().replace('_', ' ')}`);
    setBusy(null);
    if (r !== undefined) {
      setSelected(null);
      reloadAll();
    }
  }

  async function createTask() {
    if (!selected) return;
    setBusy('new');
    const r = await toast.run(() => api.post(prop(property.id, '/housekeeping/tasks'), { roomId: selected.roomId, type: newTask.type, priority: newTask.priority, assignedTo: newTask.assignedTo || undefined, notes: newTask.notes, dueDate: date }), `Task created for room ${selected.number}`);
    setBusy(null);
    if (r !== undefined) {
      setSelected(null);
      setNewTask({ type: 'CLEAN', priority: 'NORMAL', assignedTo: '', notes: '' });
      reloadAll();
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of board.data ?? []) c[r.hkStatus] = (c[r.hkStatus] ?? 0) + 1;
    return c;
  }, [board.data]);

  return (
    <div className="page">
      <PageHeader
        title="Housekeeping"
        subtitle={`Room status board · business date ${bd}`}
        actions={
          <Button size="sm" onClick={reloadAll}>
            Refresh
          </Button>
        }
      />

      <Card
        title="Board by floor"
        actions={
          <div className="chips">
            {['', 'DIRTY', 'CLEAN', 'INSPECTED', 'IN_PROGRESS'].map((s) => (
              <button key={s} type="button" className={`chip ${hkFilter === s ? 'chip-active' : ''}`} onClick={() => setHkFilter(s)}>
                {s ? titleCase(s) : 'All'} {s ? `(${counts[s] ?? 0})` : `(${board.data?.length ?? 0})`}
              </button>
            ))}
          </div>
        }
      >
        <div className="legend mb">
          <span>
            <span className="dot dot-green" />
            Clean
          </span>
          <span>
            <span className="dot dot-amber" />
            Dirty
          </span>
          <span>
            <span className="dot dot-teal" />
            Inspected
          </span>
          <span>
            <span className="dot dot-blue" />
            In progress
          </span>
          <span>
            <span className="dot dot-red" />
            Out of order (hatched)
          </span>
        </div>
        <Async data={board.data} loading={board.loading} error={board.error} retry={board.reload}>
          {() =>
            floors.length === 0 ? (
              <Empty>No rooms match.</Empty>
            ) : (
              floors.map(([floor, rooms]) => (
                <div className="floor-group" key={floor}>
                  <div className="floor-title">Floor {floor}</div>
                  <div className="room-grid">
                    {rooms.map((r) => (
                      <div key={r.roomId} className={`room-card hk-${r.hkStatus} st-${r.status}`} onClick={() => setSelected(r)} role="button">
                        <div className="room-card-top">
                          <span className="room-number">{r.number}</span>
                          <StatusBadge status={r.status} label={r.status === 'OUT_OF_ORDER' ? 'OOO' : r.status === 'OCCUPIED' ? 'Occ' : r.status === 'VACANT' ? 'Vac' : 'OOS'} />
                        </div>
                        <div className="room-card-guest">{r.guest ?? <span className="faint">{r.roomType}</span>}</div>
                        <div className="room-card-flags">
                          <StatusBadge status={r.hkStatus} />
                          {r.departsToday && <Badge tone="amber">Dep</Badge>}
                          {r.arrivalToday && <Badge tone="blue">Arr</Badge>}
                          {r.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED').length > 0 && <Badge tone="grey">{r.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED').length} task</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )
          }
        </Async>
      </Card>

      <Card
        title="Tasks"
        actions={
          <div className="row">
            <Input type="date" className="input-sm input-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <Select className="input-sm input-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Any status</option>
              {['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'].map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
            <Select className="input-sm input-auto" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="">Any assignee</option>
              {assignees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </div>
        }
        padded={false}
      >
        <Async data={tasks.data} loading={tasks.loading} error={tasks.error} retry={tasks.reload}>
          {() =>
            visibleTasks.length === 0 ? (
              <Empty>No tasks for {date}.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Type</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Assigned to</th>
                      <th>Notes</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <strong>{t.room?.number ?? '—'}</strong> <span className="faint">{t.room?.roomType?.code}</span>
                        </td>
                        <td>{titleCase(t.type)}</td>
                        <td>
                          <StatusBadge status={t.priority} />
                        </td>
                        <td>
                          <StatusBadge status={t.status} />
                        </td>
                        <td>{t.assignedTo ?? <span className="faint">Unassigned</span>}</td>
                        <td className="wrap small muted">{t.notes}</td>
                        <td>
                          <div className="row" style={{ justifyContent: 'flex-end' }}>
                            {(t.status === 'PENDING' || t.status === 'IN_PROGRESS') && (
                              <Button size="sm" busy={busy === t.id} onClick={() => assign(t)}>
                                Assign
                              </Button>
                            )}
                            {t.status === 'PENDING' && (
                              <Button size="sm" busy={busy === t.id} onClick={() => patchTask(t, { status: 'IN_PROGRESS' }, `Started room ${t.room?.number ?? ''}`)}>
                                Start
                              </Button>
                            )}
                            {(t.status === 'PENDING' || t.status === 'IN_PROGRESS') && (
                              <Button size="sm" variant="success" busy={busy === t.id} onClick={() => patchTask(t, { status: 'DONE' }, `Room ${t.room?.number ?? ''} done`)}>
                                Done
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

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected ? `Room ${selected.number} · ${selected.roomType}` : ''}>
        {selected && (
          <div className="stack">
            <div className="row">
              <StatusBadge status={selected.status} />
              <StatusBadge status={selected.hkStatus} />
              {selected.guest && <span className="muted">{selected.guest}</span>}
              {selected.departsToday && <Badge tone="amber">Departs today</Badge>}
              {selected.arrivalToday && <Badge tone="blue">Arrival today</Badge>}
            </div>
            <div>
              <div className="field-label mb">Set housekeeping status</div>
              <div className="row">
                {['DIRTY', 'IN_PROGRESS', 'CLEAN', 'INSPECTED'].map((s) => (
                  <Button key={s} size="sm" disabled={selected.hkStatus === s} busy={busy === selected.roomId} onClick={() => setRoomHk(selected, s)}>
                    {titleCase(s)}
                  </Button>
                ))}
              </div>
            </div>
            {selected.tasks.length > 0 && (
              <div>
                <div className="field-label mb">Open tasks</div>
                {selected.tasks.map((t) => (
                  <div key={t.id} className="row small" style={{ padding: '4px 0' }}>
                    <StatusBadge status={t.status} /> {titleCase(t.type)} · {titleCase(t.priority)} · {t.assignedTo ?? 'unassigned'}
                  </div>
                ))}
              </div>
            )}
            <hr style={{ border: 0, borderTop: '1px solid var(--border)' }} />
            <h3>New task</h3>
            <div className="form-grid">
              <Field label="Type">
                <Select value={newTask.type} onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}>
                  {TASK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {titleCase(t)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>
                  {PRIORITIES.map((t) => (
                    <option key={t} value={t}>
                      {titleCase(t)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Assign to">
              <Input list="hk-assignees" value={newTask.assignedTo} onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })} placeholder="Optional" />
              <datalist id="hk-assignees">
                {assignees.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </Field>
            <Field label="Notes">
              <Input value={newTask.notes} onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })} />
            </Field>
            <Button variant="primary" busy={busy === 'new'} onClick={createTask}>
              Create task for {date}
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
