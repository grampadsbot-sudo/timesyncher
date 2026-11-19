export function stampUnstoredExchange(doc, exchange) {
  const error = String(exchange?.body?.error || '').trim();
  if (!doc || typeof doc !== 'object' || !error) return doc;
  const turns = Array.isArray(doc.turns) ? doc.turns.map((turn) => ({ ...turn })) : [];
  let index = -1;
  for (let cursor = turns.length - 1; cursor >= 0; cursor -= 1) {
    if (turns[cursor]?.role === 'customer') {
      index = cursor;
      break;
    }
  }
  if (index < 0) return { ...doc, turns };
  const model = String(exchange.body.modelId || exchange.body.responseModel || exchange.body.model?.responseModel || '').trim();
  turns[index] = {
    ...turns[index],
    appStatus: String(exchange.body.status || 'reply_unavailable'),
    appError: error,
    customerModel: model || turns[index].customerModel || '',
  };
  return { ...doc, turns };
}

export function noteUnstoredRows(rows, played) {
  const error = String(played?.exchange?.body?.error || '').trim();
  if (!error) return rows;
  const status = String(played.exchange.body.status || 'reply_unavailable');
  const model = String(played.exchange.body.modelId || played.exchange.body.responseModel || played.exchange.body.model?.responseModel || '').trim();
  const list = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
  const n = (played.timings || []).at(-1)?.n;
  const found = list.find((row) => n != null && row.n === n) || [...list].reverse().find((row) => row.role === 'customer');
  if (!found) {
    list.push({
      n: n || list.length + 1,
      role: 'customer',
      reply_backend: played.reply_backend || '',
      stored_model: model,
      stored_backend: '',
      jev_score: null,
      wall_ms: null,
      cost_state: 'not-run',
      cost_amount: null,
      cost_unit: '',
      gap: error,
      app_status: status,
      app_error: error,
    });
    return list;
  }
  found.app_status = status;
  found.app_error = error;
  found.gap = [found.gap, error].filter(Boolean).join(',');
  if (!found.stored_model && model) found.stored_model = model;
  return list;
}

export function unstoredTurnNote(doc) {
  const turn = (doc?.turns || []).find((item) => item?.appError);
  if (!turn) return '';
  return `app status: ${turn.appStatus || 'reply_unavailable'} error: ${turn.appError} model: ${turn.customerModel || 'none'}`;
}
