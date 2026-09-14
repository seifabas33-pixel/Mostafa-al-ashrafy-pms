import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, prop } from '../api';
import { Async, Badge, Button, Card, Empty, JsonView, Modal, PageHeader, Select, StatusBadge } from '../components/ui';
import { useProperty, useToast } from '../context';
import { dateTime, titleCase } from '../format';
import { useApi } from '../hooks';
import type { ComplianceOverview, ComplianceSubmission } from '../types';

const REGIME_LABEL: Record<string, string> = {
  EG_ETA: 'Egypt · ETA e-invoicing + Ministry of Interior guest reporting',
  SA_ZATCA: 'Saudi Arabia · ZATCA e-invoicing + Shomoos guest registration + NTMP',
};
const TYPE_LABEL: Record<string, string> = {
  ETA_EINVOICE: 'ETA e-invoice',
  ETA_ERECEIPT: 'ETA e-receipt',
  MOI_GUEST_REPORT: 'MOI guest report',
  ZATCA_INVOICE: 'ZATCA invoice',
  ZATCA_CREDIT_NOTE: 'ZATCA credit note',
  SHOMOOS_GUEST: 'Shomoos guest',
  NTMP_REPORT: 'NTMP report',
};

export function CompliancePage() {
  const property = useProperty();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ComplianceSubmission | null>(null);

  const data = useApi(() => api.get<ComplianceOverview>(prop(property.id, '/compliance'), { status: status || undefined, take: 200 }), [property.id, status]);

  async function processPending() {
    setBusy('process');
    const r = await toast.run(() => api.post<ComplianceSubmission[]>(prop(property.id, '/compliance/process'), {}));
    setBusy(null);
    if (r) {
      const ok = r.filter((x) => x.status === 'ACCEPTED').length;
      toast.push(r.length === 0 ? 'Nothing pending' : `${r.length} processed · ${ok} accepted · ${r.length - ok} rejected`, r.length - ok > 0 ? 'error' : 'success');
      data.reload();
    }
  }

  async function retry(s: ComplianceSubmission) {
    setBusy(s.id);
    const r = await toast.run(() => api.post<ComplianceSubmission>(prop(property.id, `/compliance/${s.id}/retry`), {}));
    setBusy(null);
    if (r) {
      toast.push(r.status === 'ACCEPTED' ? `Accepted · ${r.externalRef ?? ''}` : `Still rejected: ${r.lastError || 'authority refused'}`, r.status === 'ACCEPTED' ? 'success' : 'error');
      data.reload();
    }
  }

  const pending = (data.data?.submissions ?? []).filter((s) => s.status === 'PENDING').length;

  return (
    <div className="page">
      <PageHeader
        title="Compliance"
        subtitle={REGIME_LABEL[property.taxRegime] ?? property.taxRegime}
        actions={
          <>
            <Select className="input-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {['PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED'].map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={data.reload}>
              Refresh
            </Button>
            <Button variant="primary" busy={busy === 'process'} onClick={processPending}>
              Process pending{pending ? ` (${pending})` : ''}
            </Button>
          </>
        }
      />

      <Async data={data.data} loading={data.loading} error={data.error} retry={data.reload}>
        {(d) => (
          <>
            <Card title="Required submissions for this regime">
              <div className="grid grid-2">
                {Object.entries(d.required).map(([event, types]) => (
                  <div key={event}>
                    <div className="field-label">{event === 'onCheckIn' ? 'On check-in' : event === 'onFolioClose' ? 'On folio close' : titleCase(event)}</div>
                    <div className="row mt" style={{ marginTop: 4 }}>
                      {types.length === 0 && <span className="faint">None</span>}
                      {types.map((t) => (
                        <Badge key={t} tone="blue">
                          {TYPE_LABEL[t] ?? t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="muted small mt">All adapters run in sandbox mode: submissions are built from live folio and guest data and echoed back by a simulated authority.</p>
            </Card>

            <Card padded={false} title={`Submissions (${d.submissions.length})`}>
              {d.submissions.length === 0 ? (
                <Empty>No submissions{status ? ` with status ${titleCase(status)}` : ''}.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Entity</th>
                        <th>External ref</th>
                        <th className="num">Attempts</th>
                        <th>Submitted</th>
                        <th>Last error</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {d.submissions.map((s) => (
                        <tr key={s.id}>
                          <td>{TYPE_LABEL[s.type] ?? s.type}</td>
                          <td>
                            <StatusBadge status={s.status} />
                          </td>
                          <td>
                            {s.entityType === 'RESERVATION' ? (
                              <Link to={`/reservations/${s.entityId}`}>Reservation</Link>
                            ) : (
                              <span>{titleCase(s.entityType)}</span>
                            )}{' '}
                            <span className="mono faint">{s.entityId.slice(-6)}</span>
                          </td>
                          <td className="mono">{s.externalRef ?? '—'}</td>
                          <td className="num">{s.attempts}</td>
                          <td className="small muted">{dateTime(s.submittedAt)}</td>
                          <td className="wrap small" style={{ color: s.lastError ? 'var(--red)' : undefined }}>
                            {s.lastError || '—'}
                          </td>
                          <td>
                            <div className="row" style={{ justifyContent: 'flex-end' }}>
                              <Button size="sm" onClick={() => setViewing(s)}>
                                Payload
                              </Button>
                              {(s.status === 'REJECTED' || s.status === 'PENDING') && (
                                <Button size="sm" variant="primary" busy={busy === s.id} onClick={() => retry(s)}>
                                  {s.status === 'PENDING' ? 'Submit' : 'Retry'}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </Async>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `${TYPE_LABEL[viewing.type] ?? viewing.type} · ${viewing.externalRef ?? viewing.id}` : ''}>
        {viewing && (
          <div className="stack">
            <div>
              <div className="field-label">Payload</div>
              <JsonView value={viewing.payload} />
            </div>
            <div>
              <div className="field-label">Authority response</div>
              <JsonView value={viewing.response ?? {}} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
