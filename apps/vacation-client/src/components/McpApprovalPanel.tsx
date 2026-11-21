import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  approveMcpChange,
  createVacationMcpToken,
  declineMcpChange,
  fetchMcpChanges,
  fetchMcpTokens,
  requestMcpChanges,
  revokeVacationMcpToken,
  type McpChangeSet,
  type McpTokenRecord,
} from '../api/mcpAdmin';
import {
  changeSetKindLabel,
  changeSetStatusLabel,
  extractApprovalPreviewView,
  formatPreviewClock,
  formatPreviewDayDate,
  previewCategoryIcon,
  previewSummaryChips,
  sortChangeSetsForReview,
} from '../lib/mcpPanelModel.mjs';
import { PreviewMediaThumbs } from './PreviewMediaThumbs';

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
  const [requestBoxOpen, setRequestBoxOpen] = useState<boolean>(false);
  const [requestNote, setRequestNote] = useState<string>('');

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
      if (event.key === 'Escape' && !(window as { __tsPicFsActive?: boolean }).__tsPicFsActive) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const selected = useMemo(
    () => changes.find((item) => item.id === selectedId) || changes[0] || null,
    [changes, selectedId],
  );

  async function handleApprove(changeSetId: string, previewHash?: string) {
    setBusyId(changeSetId);
    setError('');
    setNotice('');
    try {
      await approveMcpChange(shareToken, changeSetId, previewHash);
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
      setRequestBoxOpen(false);
      setRequestNote('');
      setNotice('Change set declined. Live vacation data was not changed.');
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to decline this change set.');
    } finally {
      setBusyId('');
    }
  }

  async function handleRequestChanges(changeSetId: string, previewHash?: string) {
    const trimmed = requestNote.trim();
    if (!trimmed) {
      setError('Please enter a short note describing what to change.');
      return;
    }
    setBusyId(changeSetId);
    setError('');
    setNotice('');
    try {
      await requestMcpChanges(shareToken, changeSetId, trimmed, previewHash);
      setRequestNote('');
      setRequestBoxOpen(false);
      setNotice('Change request saved for your AI.');
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save change request.');
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

  const summaryChips = selected ? previewSummaryChips(selected) : [];
  const previewView = useMemo(() => extractApprovalPreviewView(selected), [selected]);
  const missingItems = selected?.preview?.missing || [];
  const conflictItems = selected?.preview?.conflicts || [];
  const skippedMedia = previewView.skippedMedia;
  const skippedMediaNote = previewView.skippedMediaNote;

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
                <div className={`tsv-mcp-split${changes.length <= 1 ? ' is-single' : ''}`}>
                  {changes.length > 1 ? (
                    <ul className="tsv-mcp-list">
                      {changes.map((item, idx) => {
                        const vacationTitle = String(
                          item.preview?.will_create?.vacation?.title || '',
                        ).trim();
                        const baseLabel = item.kind === 'targeted_edit' ? `Edit ${idx + 1}` : `Import ${idx + 1}`;
                        const selectorLabel = vacationTitle ? `${vacationTitle} · ${baseLabel}` : baseLabel;
                        const ver = Math.max(1, Number(item.preview?.preview_version || item.previewVersion || 1));
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`tsv-mcp-list-item${selected?.id === item.id ? ' is-selected' : ''}`}
                              onClick={() => setSelectedId(item.id)}
                            >
                              <span className="tsv-mcp-item-title">{selectorLabel}</span>
                              <span className="tsv-mcp-item-meta">
                                {changeSetStatusLabel(item.status)}
                                {ver > 1 ? ` · v${ver}` : ''}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}

                  {selected ? (
                    <div
                      className="tsv-mcp-preview"
                      data-ts-mcp-preview="1"
                      data-ts-mcp-preview-version={String(previewView.previewVersion)}
                      data-ts-mcp-preview-hash={previewView.previewHash || undefined}
                    >
                      <div className="tsv-mcp-preview-head">
                        <h3 className="tsv-mcp-subheading">{changeSetKindLabel(selected.kind)}</h3>
                        <span className="tsv-mcp-status-pill">
                          {changeSetStatusLabel(selected.status)}
                          {previewView.previewVersion > 1 ? ` · v${previewView.previewVersion}` : ''}
                        </span>
                      </div>
                      <p className="tsv-mcp-summary">{selected.preview?.summary_text || selected.summary}</p>

                      {summaryChips.length > 0 ? (
                        <div className="tsv-mcp-chips">
                          {summaryChips.map((chip, index) => (
                            <span key={`${index}-${chip}`} className="tsv-mcp-chip">
                              {chip}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {previewView.lastChanges.length > 0 ? (
                        <div className="tsv-mcp-block" data-ts-preview-changes="1">
                          <h4>Updated in this preview</h4>
                          <div className="tsv-mcp-notes">
                            {previewView.lastChanges.map((entry, index) =>
                              entry.media ? (
                                <div
                                  key={`${index}-${entry.text}`}
                                  className="tsv-mcp-note tsv-mcp-change-row"
                                  data-ts-preview-change-row="1"
                                >
                                  <PreviewMediaThumbs
                                    items={[entry.media]}
                                    ownerLabel={entry.text}
                                    scope="change"
                                  />
                                  <span className="tsv-mcp-change-text">{entry.text}</span>
                                </div>
                              ) : (
                                <p
                                  key={`${index}-${entry.text}`}
                                  className="tsv-mcp-note"
                                  data-ts-preview-change-row="1"
                                >
                                  {entry.text}
                                </p>
                              ),
                            )}
                          </div>
                        </div>
                      ) : null}

                      {previewView.days.length > 0 ? (
                        <div className="tsv-mcp-block" data-ts-mcp-preview-days="1">
                          <h4>Itinerary by day</h4>
                          <div className="tsv-mcp-days">
                            {previewView.days.map((day, idx) => {
                              const dayNum = day.day_number ?? idx + 1;
                              const friendlyDate = formatPreviewDayDate(day.date);
                              const dayLabel = `Day ${dayNum}${friendlyDate ? ` · ${friendlyDate}` : ''}`;
                              const dayMedia = Array.isArray(day.day_media) ? day.day_media : [];
                              return (
                                <section
                                  key={`${day.date || idx}`}
                                  className="tsv-mcp-day-card"
                                  data-ts-preview-day={day.date || String(dayNum)}
                                >
                                  <div className="tsv-mcp-day-head" data-ts-preview-day-header="1">
                                    {dayLabel}
                                    {day.title ? ` — ${day.title}` : ''}
                                  </div>
                                  {Array.isArray(day.items) && day.items.length > 0 ? (
                                    <div className="tsv-mcp-thing-list">
                                      {day.items.map((item, itemIdx) => {
                                        const timeLabel = item.start_time ? formatPreviewClock(item.start_time) : '';
                                        return (
                                          <div
                                            key={`${item.ref || item.id || itemIdx}`}
                                            className="tsv-mcp-thing-row"
                                            data-ts-preview-thing={item.ref || item.id || item.title || String(itemIdx)}
                                          >
                                            <div className="tsv-mcp-thing-main">
                                              <span
                                                className="tsv-mcp-thing-icon"
                                                data-ts-preview-type-icon="1"
                                                aria-hidden="true"
                                              >
                                                {previewCategoryIcon(item.category)}
                                              </span>
                                              <span className="tsv-mcp-thing-label">
                                                <span className="tsv-mcp-thing-name">{item.title}</span>
                                                {timeLabel ? (
                                                  <span className="tsv-mcp-thing-time"> · {timeLabel}</span>
                                                ) : null}
                                              </span>
                                            </div>
                                            {Array.isArray(item.media) && item.media.length > 0 ? (
                                              <PreviewMediaThumbs
                                                items={item.media}
                                                ownerLabel={item.title || dayLabel}
                                                scope="thing"
                                              />
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                  {dayMedia.length > 0 ? (
                                    <div className="tsv-mcp-day-media">
                                      <p className="tsv-mcp-day-media-label">
                                        Day {dayNum} photos &amp; videos
                                      </p>
                                      <PreviewMediaThumbs
                                        items={dayMedia}
                                        ownerLabel={dayLabel}
                                        scope="day"
                                      />
                                    </div>
                                  ) : null}
                                </section>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {previewView.unscheduledThings.length > 0 ? (
                        <div className="tsv-mcp-block" data-ts-mcp-preview-unscheduled="1">
                          <h4>Saved for later</h4>
                          <div className="tsv-mcp-thing-list">
                            {previewView.unscheduledThings.map((item, idx) => (
                              <div
                                key={`${item.ref || item.id || idx}`}
                                className="tsv-mcp-thing-row"
                                data-ts-preview-thing={item.ref || item.id || item.title || String(idx)}
                              >
                                <div className="tsv-mcp-thing-main">
                                  <span
                                    className="tsv-mcp-thing-icon"
                                    data-ts-preview-type-icon="1"
                                    aria-hidden="true"
                                  >
                                    {previewCategoryIcon(item.category)}
                                  </span>
                                  <span className="tsv-mcp-thing-label">
                                    <span className="tsv-mcp-thing-name">{item.title}</span>
                                  </span>
                                </div>
                                {Array.isArray(item.media) && item.media.length > 0 ? (
                                  <PreviewMediaThumbs
                                    items={item.media}
                                    ownerLabel={item.title || 'Saved item'}
                                    scope="thing"
                                  />
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {skippedMedia.length > 0 ? (
                        <div className="tsv-mcp-block" data-ts-mcp-preview-wont-import="1">
                          <h4>Won&apos;t be imported</h4>
                          {skippedMediaNote ? (
                            <p className="tsv-mcp-note" data-ts-wont-import-note="1">
                              {skippedMediaNote}
                            </p>
                          ) : null}
                          <PreviewMediaThumbs
                            items={skippedMedia}
                            ownerLabel="Won't be imported"
                            scope="skipped"
                          />
                        </div>
                      ) : null}

                      {missingItems.length > 0 ? (
                        <div className="tsv-mcp-block" data-ts-mcp-preview-notes="1">
                          <h4>Good to know</h4>
                          <div className="tsv-mcp-notes">
                            {missingItems.map((item, index) => (
                              <p key={`${index}-${item}`} className="tsv-mcp-note">
                                {item}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {conflictItems.length > 0 ? (
                        <div className="tsv-mcp-block tsv-mcp-block-warn">
                          <h4>Conflicts to review</h4>
                          <div className="tsv-mcp-notes">
                            {conflictItems.map((item, index) => (
                              <p key={`${index}-${item}`} className="tsv-mcp-note">
                                {item}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {previewView.changeRequests.length > 0 ? (
                        <div className="tsv-mcp-block" data-ts-requested-changes="1">
                          <h4>Requested changes</h4>
                          <div className="tsv-mcp-notes">
                            {previewView.changeRequests.map((entry, index) => (
                              <p key={`${entry.id || index}`} className="tsv-mcp-note">
                                {entry.note}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {selected.status === 'pending_approval' ? (
                        <>
                          <div className="tsv-mcp-actions">
                            <button
                              type="button"
                              className="tsv-header-btn tsv-mcp-btn-approve"
                              disabled={busyId === selected.id}
                              onClick={() => void handleApprove(selected.id, previewView.previewHash)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="tsv-header-btn tsv-mcp-btn-secondary"
                              data-ts-request-changes-btn="1"
                              disabled={busyId === selected.id}
                              onClick={() => setRequestBoxOpen((prev) => !prev)}
                            >
                              Request changes
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
                          {requestBoxOpen ? (
                            <div className="tsv-mcp-change-box" data-ts-request-changes-box="1">
                              <label className="tsv-mcp-change-label">What should your AI change?</label>
                              <textarea
                                className="tsv-mcp-change-input"
                                data-ts-request-changes-input="1"
                                rows={3}
                                maxLength={1000}
                                value={requestNote}
                                onChange={(event) => setRequestNote(event.target.value)}
                                placeholder="Move a stop, drop a photo, or adjust a time…"
                              />
                              <div className="tsv-mcp-actions">
                                <button
                                  type="button"
                                  className="tsv-header-btn tsv-mcp-btn-approve"
                                  data-ts-request-changes-submit="1"
                                  disabled={busyId === selected.id}
                                  onClick={() => void handleRequestChanges(selected.id, previewView.previewHash)}
                                >
                                  Send note
                                </button>
                                <button
                                  type="button"
                                  className="tsv-header-btn"
                                  data-ts-request-changes-cancel="1"
                                  disabled={busyId === selected.id}
                                  onClick={() => setRequestBoxOpen(false)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </>
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
                        {item.expiresAt ? ` · Expires ${item.expiresAt.slice(0, 10)}` : ''}
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
