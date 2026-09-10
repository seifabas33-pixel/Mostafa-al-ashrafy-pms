import { useState } from 'react';
import { DEFAULT_API_KEY, api, getApiKey, setApiKey } from '../api';
import { Async, Badge, Button, Card, Empty, Field, Input, JsonView, PageHeader, StatusBadge } from '../components/ui';
import { useSession, useToast } from '../context';
import { dateTime, day, titleCase } from '../format';
import { useApi } from '../hooks';
import type { AuditEntry, Webhook } from '../types';

export function SettingsPage() {
  const { me, property, properties, error, reload } = useSession();
  const toast = useToast();
  const [key, setKey] = useState(getApiKey());
  const [reveal, setReveal] = useState(false);
  const [viewing, setViewing] = useState<AuditEntry | null>(null);

  const webhooks = useApi(() => api.get<Webhook[]>('/api/webhooks'), [me?.organization.id], { enabled: !!me });
  const events = useApi(() => api.get<string[]>('/api/webhooks/events'), [me?.organization.id], { enabled: !!me });
  const audit = useApi(() => api.get<AuditEntry[]>('/api/audit-log', { propertyId: property?.id, take: 100 }), [property?.id, me?.organization.id], { enabled: !!me });

  function saveKey() {
    setApiKey(key);
    toast.push('API key saved; reconnecting…', 'info');
    reload();
  }

  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="API key, properties, webhooks and audit trail" />

      <div className="grid grid-2">
        <Card title="API access">
          <div className="stack">
            <Field label="API key" hint="Sent as the x-api-key header on every request; stored in this browser only.">
              <div className="row">
                <Input type={reveal ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} className="mono grow" />
                <Button size="sm" variant="ghost" onClick={() => setReveal((r) => !r)}>
                  {reveal ? 'Hide' : 'Show'}
                </Button>
              </div>
            </Field>
            <div className="row">
              <Button variant="primary" onClick={saveKey} disabled={key.trim() === getApiKey()}>
                Save & reconnect
              </Button>
              <Button variant="ghost" onClick={() => setKey(DEFAULT_API_KEY)} disabled={key === DEFAULT_API_KEY}>
                Reset to dev key
              </Button>
            </div>
            {error && <div className="state state-error">Could not authenticate: {error}</div>}
            {me && (
              <div className="row">
                <Badge tone="green">Connected</Badge>
                <span>
                  <strong>{me.organization.name}</strong> · key “{me.apiKey.name}” · scopes {me.apiKey.scopes.join(', ')}
                </span>
              </div>
            )}
            <p className="muted small">
              Interactive API docs: <a href="/docs" target="_blank" rel="noreferrer">/docs</a>
            </p>
          </div>
        </Card>

        <Card padded={false} title={`Properties (${properties.length})`}>
          {properties.length === 0 ? (
            <Empty>No properties visible to this key.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Currency</th>
                    <th>Regime</th>
                    <th className="num">VAT</th>
                    <th className="num">Service</th>
                    <th>Business date</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((p) => (
                    <tr key={p.id} className={p.id === property?.id ? 'selected' : ''}>
                      <td className="strong">{p.code}</td>
                      <td>{p.name}</td>
                      <td>
                        {p.city}, {p.country} <span className="faint small">{p.timezone}</span>
                      </td>
                      <td>{p.currency}</td>
                      <td>
                        <Badge>{p.taxRegime}</Badge> <Badge tone="teal">{p.calendar}</Badge>
                      </td>
                      <td className="num">{p.vatRate}%</td>
                      <td className="num">{p.serviceRate}%</td>
                      <td>{day(p.businessDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card padded={false} title="Webhook subscriptions">
          <Async data={webhooks.data} loading={webhooks.loading} error={webhooks.error} retry={webhooks.reload}>
            {(list) =>
              list.length === 0 ? (
                <Empty>No webhooks configured.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        <th>URL</th>
                        <th>Events</th>
                        <th>Status</th>
                        <th className="num">Deliveries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((w) => (
                        <tr key={w.id}>
                          <td className="mono">{w.url}</td>
                          <td className="wrap">
                            {w.events.map((e) => (
                              <Badge key={e} className="mr">
                                {e}
                              </Badge>
                            ))}
                          </td>
                          <td>
                            <StatusBadge status={w.active ? 'ACTIVE' : 'DISABLED'} />
                          </td>
                          <td className="num">{w._count?.deliveries ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </Async>
        </Card>
        <Card title="Available events">
          <Async data={events.data} loading={events.loading} error={events.error} retry={events.reload}>
            {(list) => (
              <div className="row">
                {list.map((e) => (
                  <Badge key={e} tone="grey">
                    {e}
                  </Badge>
                ))}
              </div>
            )}
          </Async>
          <p className="muted small mt">Every delivery is signed with HMAC-SHA256 in the x-pms-signature header.</p>
        </Card>
      </div>

      <Card padded={false} title={`Audit log${property ? ` · ${property.code}` : ''}`} actions={<Button size="sm" onClick={audit.reload}>Refresh</Button>}>
        <Async data={audit.data} loading={audit.loading} error={audit.error} retry={audit.reload}>
          {(list) =>
            list.length === 0 ? (
              <Empty>No audit entries.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id}>
                        <td className="small muted">{dateTime(a.createdAt)}</td>
                        <td>{a.actor ?? '—'}</td>
                        <td>
                          <Badge tone="blue">{a.action}</Badge>
                        </td>
                        <td>
                          {titleCase(a.entityType)} <span className="mono faint">{a.entityId.slice(-6)}</span>
                        </td>
                        <td>
                          {a.data && Object.keys(a.data as object).length > 0 ? (
                            <Button size="sm" variant="ghost" onClick={() => setViewing(viewing?.id === a.id ? null : a)}>
                              {viewing?.id === a.id ? 'Hide' : 'View'}
                            </Button>
                          ) : (
                            <span className="faint">—</span>
                          )}
                          {viewing?.id === a.id && <JsonView value={a.data} />}
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
    </div>
  );
}
