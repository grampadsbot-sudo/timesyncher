import { appTextBanned } from './live-app-turn.mjs';
import { recoverSoftSearchReply } from './place-search-reply-facts.mjs';

export function storedReplyWhenSearchUnavailable(partial = {}, tripStateContext = partial.tripStateContext) {
  if (tripStateContext?.state?.research?.provider_unavailable !== true) return null;
  const destination = String(tripStateContext.state?.saved?.trip?.destination || '').trim();
  const recovered = recoverSoftSearchReply(
    { reply: '', model: partial.model, jev: partial.jev },
    { placeSearch: { outcome: 'search_unavailable' } },
    { backend: 'openrouter', destination },
  );
  const reply = String(recovered?.reply || '').trim();
  if (!reply || appTextBanned(reply)) return null;
  const responseModel = String(partial.responseModel || partial.model?.responseModel || partial.jev?.responseModel || '').trim();
  const quality = {
    judged: true,
    score: 4,
    disposition: 'search_unavailable_stored',
    unbackedChangeClaim: false,
    wantsRewrite: false,
    hardFlag: false,
    comment: null,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
  };
  const model = {
    ...(partial.model && typeof partial.model === 'object' ? partial.model : {}),
    called: Boolean(partial.model?.called),
    via: partial.model?.via || 'openrouter-chat',
    responseModel: responseModel || partial.model?.responseModel || null,
    modelTier: partial.model?.modelTier ?? partial.jev?.modelTier ?? null,
    quality,
  };
  return {
    reply,
    rules: partial.rules || null,
    jev: partial.jev || null,
    model,
    quality,
    log: partial.log || partial.model?.log || null,
    tripStateContext,
    reason: null,
  };
}
