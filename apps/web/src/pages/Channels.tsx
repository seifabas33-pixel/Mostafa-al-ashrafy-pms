import { useState } from 'react';
import { api, prop } from '../api';
import { Async, Badge, Button, Card, Empty, PageHeader, Select, StatusBadge } from '../components/ui';
import { useProperty, useToast } from '../context';
import { dateTime, money, num, shortDate, titleCase, weekday } from '../format';
import { useApi } from '../hooks';
import type { AriPayload, ChannelConnection, GuestMessage, Reputation } from '../types';

export function ChannelsPage() {
  const property = useProperty();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [msgStatus, setMsgStatus] = useState('');

  const channels = useApi(() => api.get<ChannelConnection[]>(prop(property.id, '/channels')), [property.id]);
  const ari = useApi(() => api.get<AriPayload>(prop(property.id, '/channels/ari'), { days: 14 }), [property.id]);
  const messages = useApi(() => api.get<GuestMessage[]>(prop(property.id, '/messages'), { status: msgStatus || undefined, take: 100 }), [property.id, msgStatus]);
  const reputation = useApi(() => api.get<Reputation>(prop(property.id, '/reputation')), [property.id]);

  async function push(c: ChannelConnection) {
    setBusy(c.id);
    const r = await toast.run(() => api.post<{ log: { summary: string } }>(prop(property.id, `/channels/${c.id}/push`), { days: 90 }));
    setBusy(null);
    if (r) {
      toast.push(`${titleCase(c.channel)}: ${r.log.summary} pushed`, 'success');
      channels.reload();
    }
  }

  async function dispatch() {
    setBusy('dispatch');
    const r = await toast.run(() => api.post<GuestMessage[]>(prop(property.id, '/messages/dispatch'), {}));
    setBusy(null);
    if (r) {
      toast.push(r.length ? `${r.length} message${r.length === 1 ? '' : 's'} sent` : 'No messages due yet', r.length ? 'success' : 'info');
      messages.reload();
    }
  }

  const queued = (messages.data ?? []).filter((m) => m.status === 'QUEUED').length;

  return (
    <div className="page">
      <PageHeader title="Channels & guest layer" subtitle="Channel manager connections, ARI feed, guest messaging and reputation" />

      <Card title="Channel connections" actions={<Button size="sm" onClick={channels.reload}>Refresh</Button>}>
        <Async data={channels.data} loading={channels.loading} error={channels.error} retry={channels.reload}>
          {(list) =>
            list.length === 0 ? (
              <Empty>No channel connections configured.</Empty>
            ) : (
              <div className="grid grid-2">
                {list.map((c) => (
                  <div key={c.id} className="offer" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                    <div className="stack" style={{ gap: 4 }}>
                      <div className="row">
                        <strong>{titleCase(c.channel)}</strong>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="small muted">
                        External ID <span className="mono">{c.externalPropertyId || '—'}</span> · last sync {dateTime(c.lastSyncAt)}
                      </div>
                      {c.lastError && <div className="small" style={{ color: 'var(--red)' }}>{c.lastError}</div>}
                      {c.syncLogs.slice(0, 3).map((l) => (
                        <div key={l.id} className="small faint">
                          <StatusBadge status={l.status} /> {titleCase(l.direction)} · {l.summary} · {dateTime(l.createdAt)}
                        </div>
                      ))}
                    </div>
                    <Button variant="primary" size="sm" busy={busy === c.id} onClick={() => push(c)}>
                      Push ARI (90 d)
                    </Button>
                  </div>
                ))}
              </div>
            )
          }
        </Async>
      </Card>

      <Card padded={false} title="ARI preview · BAR · next 14 days" actions={<span className="muted small">available / rate · restrictions flagged</span>}>
        <Async data={ari.data} loading={ari.loading} error={ari.error} retry={ari.reload}>
          {(a) => (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Room type</th>
                    {a.roomTypes[0]?.days.map((d) => (
                      <th key={d.date} className="center">
                        {shortDate(d.date)}
                        <br />
                        <span className="faint">{weekday(d.date)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.roomTypes.map((rt) => (
                    <tr key={rt.roomTypeId}>
                      <td>
                        <strong>{rt.code}</strong> <span className="muted small">{rt.name}</span>
                      </td>
                      {rt.days.map((d) => {
                        const restricted = d.stopSell || d.closedToArrival || d.closedToDeparture || d.minLos > 1;
                        return (
                          <td key={d.date} className="center" style={{ background: d.stopSell ? 'var(--red-soft)' : d.available <= 0 ? 'var(--amber-soft)' : undefined }} title={restricted ? `${d.stopSell ? 'Stop sell · ' : ''}${d.closedToArrival ? 'CTA · ' : ''}${d.closedToDeparture ? 'CTD · ' : ''}min LOS ${d.minLos}` : undefined}>
                            <div className="strong">{d.available}</div>
                            <div className="small muted">{money(d.rate, d.currency, { compact: true })}</div>
                            {restricted && (
                              <Badge tone={d.stopSell ? 'red' : 'amber'}>
                                {d.stopSell ? 'STOP' : d.closedToArrival ? 'CTA' : d.closedToDeparture ? 'CTD' : `LOS ${d.minLos}`}
                              </Badge>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Card>

      <div className="grid grid-2">
        <Card
          padded={false}
          title="Guest messages"
          actions={
            <>
              <Select className="input-sm input-auto" value={msgStatus} onChange={(e) => setMsgStatus(e.target.value)}>
                <option value="">All</option>
                {['QUEUED', 'SENT', 'DELIVERED', 'FAILED'].map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="primary" busy={busy === 'dispatch'} onClick={dispatch}>
                Dispatch due{queued ? ` (${queued} queued)` : ''}
              </Button>
            </>
          }
        >
          <Async data={messages.data} loading={messages.loading} error={messages.error} retry={messages.reload}>
            {(list) =>
              list.length === 0 ? (
                <Empty>No messages.</Empty>
              ) : (
                <div className="list" style={{ padding: '0 16px' }}>
                  {list.map((m) => (
                    <div className="list-item" key={m.id} style={{ alignItems: 'flex-start' }}>
                      <div className="list-main">
                        <div className="row">
                          <StatusBadge status={m.status} />
                          <Badge tone="teal">{titleCase(m.channel)}</Badge>
                          {m.template && <span className="small muted">{titleCase(m.template)}</span>}
                          <span className="small muted">
                            {m.guest ? `${m.guest.firstName} ${m.guest.lastName}` : '—'}
                            {m.reservation ? ` · ${m.reservation.confirmationNumber}` : ''}
                          </span>
                        </div>
                        <div className="small" style={{ marginTop: 4 }}>
                          {m.body}
                        </div>
                        <div className="faint small">{m.sentAt ? `Sent ${dateTime(m.sentAt)}` : m.scheduledFor ? `Scheduled ${dateTime(m.scheduledFor)}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </Async>
        </Card>

        <Card title="Reputation">
          <Async data={reputation.data} loading={reputation.loading} error={reputation.error} retry={reputation.reload}>
            {(r) => (
              <div className="stack">
                <div className="row" style={{ gap: 20 }}>
                  <div>
                    <div className="rating-big">{num(r.averageRating, 1)}</div>
                    <div className="stars">{'★'.repeat(Math.round(r.averageRating))}{'☆'.repeat(5 - Math.round(r.averageRating))}</div>
                    <div className="small muted">
                      {r.count} review{r.count === 1 ? '' : 's'} · {r.unanswered} unanswered
                    </div>
                  </div>
                  <div className="row" style={{ alignSelf: 'flex-start' }}>
                    {r.bySource.map((s) => (
                      <Badge key={s.source}>
                        {titleCase(s.source)} {s.count}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="field-label mb">Topics</div>
                  <div className="bar-list">
                    {r.topics.map((t) => (
                      <div className="bar-row" key={t.topic}>
                        <span>{titleCase(t.topic)}</span>
                        <div className="bar-track">
                          <div className={`bar-fill ${t.avgSentiment > 0.3 ? 'green' : t.avgSentiment < 0 ? 'red' : 'amber'}`} style={{ width: `${Math.round(((t.avgSentiment + 1) / 2) * 100)}%` }} />
                        </div>
                        <span className="small muted right">
                          {t.count} mention{t.count === 1 ? '' : 's'} · {t.avgSentiment > 0 ? '+' : ''}
                          {num(t.avgSentiment, 2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="field-label mb">Recent reviews</div>
                  <div className="list">
                    {r.recent.map((v) => (
                      <div className="list-item" key={v.id}>
                        <div className="list-main">
                          <div className="list-title">
                            <span className="stars">{'★'.repeat(v.rating)}</span> {v.title ?? 'Untitled'}
                          </div>
                          <div className="list-sub">
                            {titleCase(v.source)} · {v.topics.map(titleCase).join(', ') || 'no topics'} · {dateTime(v.createdAt)}
                          </div>
                        </div>
                        <Badge tone={v.sentiment > 0.3 ? 'green' : v.sentiment < 0 ? 'red' : 'amber'}>{v.sentiment > 0.3 ? 'Positive' : v.sentiment < 0 ? 'Negative' : 'Neutral'}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Async>
        </Card>
      </div>
    </div>
  );
}
