import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  approveMcpChange,
  createVacationMcpToken,
  declineMcpChange,
  fetchMcpChanges,
  fetchMcpTokens,
  revokeVacationMcpToken,
  type McpChangeSet,
  type McpTokenRecord,
} from '../api/mcpAdmin';
import {
  changeSetKindLabel,
  changeSetStatusLabel,
  extractApprovalPreviewView,
  formatMediaBytes,
  formatMediaMatchLabel,
  previewSummaryBullets,
  sortChangeSetsForReview,
} from '../lib/mcpPanelModel.mjs';

export type McpPanelMode = 'approvals' | 'tokens';

type Props = {
  shareToken: string;
  initialMode: McpPanelMode;
  onClose: () => void;
  onApproved: () => void;
};

export function McpApprovalPanel({ shareToken, initialMode, onClose, onApproved }: Props) {
  const titleId = useId();
  const [mode, setMode] = useState<McpPanelMode>(initialMode);
  const [changes, setChanges] = useState<McpChangeSet[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [tokens, setTokens] = useState<McpTokenRecord[]>([]);
  const [mcpEndpoint, setMcpEndpoint] = useState<string>('');
  const [label, setLabel] = useState<string>('Family AI');
  const [role, setRole] = useState<'collaborator' | 'owner'>('collaborator');
  const [createdToken, setCreatedToken] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  const refreshData = useCallback(async () => {
    setError('');
    try {
      const [changeList, tokenInfo] = await Promise.all([
        fetchMcpChanges(shareToken),
        fetchMcpTokens(shareToken),
      ]);
      const sorted = sortChangeSetsForReview(changeList);
      setChanges(sorted);
      setSelectedId((prev) => (prev && sorted.some((item) => item.id === prev) ? prev : sorted[0]?.id || ''));
      setTokens(tokenInfo.tokens);
      setMcpEndpoint(tokenInfo.mcpEndpoint);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load AI settings for this vacation.');
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMcpChanges(shareToken), fetchMcpTokens(shareToken)])
      .then(([changeList, tokenInfo]) => {
        if (cancelled) return;
        const sorted = sortChangeSetsForReview(changeList);
        setChanges(sorted);
        setSelectedId((prev) => (prev && sorted.some((item) => item.id === prev) ? prev : sorted[0]?.id || ''));
        setTokens(tokenInfo.tokens);
        setMcpEndpoint(tokenInfo.mcpEndpoint);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load AI settings for this vacation.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const selected = useMemo(
    () => changes.find((item) => item.id === selectedId) || changes[0] || null,
    [changes, selectedId],
  );

  async function handleApprove(changeSetId: string) {
    setBusyId(changeSetId);
    setError('');
    setNotice('');
    try {
      await approveMcpChange(shareToken, changeSetId);
      setNotice('Approved and applied to this vacation.');
      await refreshData();
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve this change set.');
    } finally {
      setBusyId('');
    }
  }

  async function handleDecline(changeSetId: string) {
    setBusyId(changeSetId);
    setError('');
    setNotice('');
    try {
      await declineMcpChange(shareToken, changeSetId);
      setNotice('Change set declined. Live vacation data was not changed.');
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to decline this change set.');
    } finally {
      setBusyId('');
    }
  }

  async function handleCreateToken(event: React.FormEvent) {
    event.preventDefault();
    setBusyId('create-token');
    setError('');
    setNotice('');
    setCreatedToken('');
    try {
      const created = await createVacationMcpToken(shareToken, {
        label: label.trim() || 'Family AI',
        role,
      });
      setCreatedToken(created.token);
      setMcpEndpoint(created.mcpEndpoint);
      setNotice('AI access token created for this vacation. Copy it now; it is only shown once.');
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create AI access token.');
    } finally {
      setBusyId('');
    }
  }

  async function handleRevokeToken(tokenId: string) {
    setBusyId(tokenId);
    setError('');
    setNotice('');
    try {
      await revokeVacationMcpToken(shareToken, tokenId);
      setNotice('AI access token revoked.');
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke AI access token.');
    } finally {
      setBusyId('');
    }
  }

  const previewBullets = selected ? previewSummaryBullets(selected) : [];
  const previewView = useMemo(() => extractApprovalPreviewView(selected), [selected]);
  const missingItems = selected?.preview?.missing || [];
  const conflictItems = selected?.preview?.conflicts || [];
  const mediaItems = previewView.media;

  return (
    <div
      className="tsv-detail-backdrop"
      data-ts-mcp-backdrop="1"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="tsv-detail-sheet tsv-mcp-sheet"
        data-ts-mcp-panel="1"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tsv-detail-head">
          <p className="tsv-detail-category">Vacation AI</p>
          <div className="tsv-detail-title-row">
            <h2 id={titleId} className="tsv-detail-name">
              AI Imports &amp; Access
            </h2>
            <button
              type="button"
              className="tsv-detail-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="tsv-mcp-tabs" role="tablist" aria-label="Vacation AI views">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'approvals'}
              className={`tsv-header-btn${mode === 'approvals' ? ' is-active' : ''}`}
              onClick={() => setMode('approvals')}
            >
              Pending approvals ({changes.filter((c) => c.status === 'pending_approval').length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'tokens'}
              className={`tsv-header-btn${mode === 'tokens' ? ' is-active' : ''}`}
              onClick={() => setMode('tokens')}
            >
              AI access tokens ({tokens.filter((t) => t.status === 'active').length})
            </button>
          </div>
        </header>

        <div className="tsv-detail-body tsv-mcp-body">
          {error ? (
            <p className="tsv-mcp-alert tsv-mcp-alert-error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="tsv-mcp-alert tsv-mcp-alert-ok" role="status">
              {notice}
            </p>
          ) : null}

          {loading ? (
            <p className="tsv-muted">Loading vacation AI activity…</p>
          ) : mode === 'approvals' ? (
            <section className="tsv-mcp-section" aria-label="Pending vacation approvals">
              {changes.length === 0 ? (
                <p className="tsv-muted">
                  No pending AI imports or edits for this vacation yet. Nothing goes live until approved here.
                </p>
              ) : (
                <div className="tsv-mcp-split">
                  <ul className="tsv-mcp-list">
                    {changes.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`tsv-mcp-list-item${selected?.id === item.id ? ' is-selected' : ''}`}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <span className="tsv-mcp-item-title">{changeSetKindLabel(item.kind)}</span>
                          <span className="tsv-mcp-item-meta">{changeSetStatusLabel(item.status)}</span>
                          <span className="tsv-mcp-item-summary">{item.summary}</span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  {selected ? (
                    <div className="tsv-mcp-preview" data-ts-mcp-preview="1">
                      <h3 className="tsv-mcp-subheading">{changeSetKindLabel(selected.kind)}</h3>
                      <p className="tsv-mcp-status-line">
                        Status: <strong>{changeSetStatusLabel(selected.status)}</strong>
                      </p>
                      {previewView.previewHash ? (
                        <p className="tsv-mcp-status-line" data-ts-mcp-preview-hash={previewView.previewHash}>
                          Preview hash: <code>{previewView.previewHash}</code>
                        </p>
                      ) : null}
                      <p className="tsv-mcp-summary">{selected.preview?.summary_text || selected.summary}</p>

                      {previewBullets.length > 0 ? (
                        <div className="tsv-mcp-block">
                          <h4>What will change</h4>
                          <ul>
                            {previewBullets.map((line, index) => (
                              <li key={`${index}-${line}`}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {previewView.days.length > 0 ? (
                        <div className="tsv-mcp-block" data-ts-mcp-preview-days="1">
                          <h4>Itinerary by day</h4>
                          <ul>
                            {previewView.days.map((day, idx) => (
                              <li key={`${day.date || idx}`}>
                                <strong>
                                  Day {day.day_number ?? idx + 1}
                                  {day.date ? ` (${day.date})` : ''}
                                  {day.title ? ` — ${day.title}` : ''}
                                </strong>
                                {Array.isArray(day.items) && day.items.length > 0 ? (
                                  <ul>
                                    {day.items.map((item, itemIdx) => (
                                      <li key={`${item.ref || item.id || itemIdx}`}>
                                        {item.category ? `${item.category}: ` : ''}
                                        {item.title}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {previewView.unscheduledThings.length > 0 ? (
                        <div className="tsv-mcp-block" data-ts-mcp-preview-unscheduled="1">
                          <h4>Unscheduled long-list items ({previewView.unscheduledThings.length})</h4>
                          <ul>
                            {previewView.unscheduledThings.map((item, idx) => (
                              <li key={`${item.ref || item.id || idx}`}>
                                {item.category ? `${item.category}: ` : ''}
                                {item.title} — Unscheduled
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {mediaItems.length > 0 ? (
                        <div className="tsv-mcp-block" data-ts-mcp-preview-media="1">
                          <h4>
                            Media attachments ({mediaItems.length} · {formatMediaBytes(previewView.totalBytes)})
                          </h4>
                          <ul>
                            {mediaItems.map((media) => (
                              <li key={media.media_id}>
                                {media.filename} ({formatMediaBytes(media.bytes || 0)}) —{' '}
                                {formatMediaMatchLabel(media)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {missingItems.length > 0 ? (
                        <div className="tsv-mcp-block">
                          <h4>Missing details</h4>
                          <ul>
                            {missingItems.map((item, index) => (
                              <li key={`${index}-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {conflictItems.length > 0 ? (
                        <div className="tsv-mcp-block tsv-mcp-block-warn">
                          <h4>Conflicts to review</h4>
                          <ul>
                            {conflictItems.map((item, index) => (
                              <li key={`${index}-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {selected.status === 'pending_approval' ? (
                        <div className="tsv-mcp-actions">
                          <button
                            type="button"
                            className="tsv-header-btn tsv-mcp-btn-approve"
                            disabled={busyId === selected.id}
                            onClick={() => void handleApprove(selected.id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="tsv-header-btn tsv-mcp-btn-decline"
                            disabled={busyId === selected.id}
                            onClick={() => void handleDecline(selected.id)}
                          >
                            Decline
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          ) : (
            <section className="tsv-mcp-section" aria-label="AI access tokens for this vacation">
              <p className="tsv-muted">
                Create an AI token scoped to this vacation only. Any AI using this token can read this vacation, stage draft imports, or propose edits for your approval.
              </p>
              {mcpEndpoint ? (
                <p className="tsv-mcp-endpoint">
                  MCP endpoint: <code>{mcpEndpoint}</code>
                </p>
              ) : null}

              <form className="tsv-mcp-form" onSubmit={(event) => void handleCreateToken(event)}>
                <label className="tsv-mcp-field">
                  <span>Token label</span>
                  <input
                    type="text"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Family AI"
                    maxLength={120}
                  />
                </label>
                <label className="tsv-mcp-field">
                  <span>Role</span>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value === 'owner' ? 'owner' : 'collaborator')}
                  >
                    <option value="collaborator">Collaborator</option>
                    <option value="owner">Owner</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="tsv-header-btn tsv-mcp-btn-approve"
                  disabled={busyId === 'create-token'}
                >
                  Create AI token
                </button>
              </form>

              {createdToken ? (
                <div className="tsv-mcp-token-reveal" role="status">
                  <p>Copy this AI token now. It is stored hashed and will not be shown again:</p>
                  <code>{createdToken}</code>
                </div>
              ) : null}

              <ul className="tsv-mcp-token-list">
                {tokens.map((item) => (
                  <li key={item.id} className="tsv-mcp-token-row">
                    <div>
                      <strong>{item.label}</strong> ({item.role}) · <code>{item.tokenPrefix}…</code>
                      <div className="tsv-mcp-item-meta">
                        {item.status === 'active' ? 'Active' : 'Revoked'}
                      </div>
                    </div>
                    {item.status === 'active' ? (
                      <button
                        type="button"
                        className="tsv-header-btn tsv-mcp-btn-decline"
                        disabled={busyId === item.id}
                        onClick={() => void handleRevokeToken(item.id)}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
