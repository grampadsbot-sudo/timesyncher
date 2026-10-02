export async function jevPrecallWithRetry(run, attempts = 2) {
  let jev = null;
  for (let i = 0; i < attempts && !jev?.jevRan; i += 1) jev = await run();
  return jev;
}

export async function jevQualityRewriteJudged(run) {
  let quality = await run();
  if (!quality?.judged) quality = await run();
  return quality;
}

export async function liveAppModelReplyWithRetry({ firstCall, retryCall, apply }) {
  let model = await firstCall();
  let reply = apply(model);
  for (let i = 0; i < 2 && !String(reply || '').trim(); i += 1) {
    model = await retryCall();
    reply = apply(model);
  }
  return { model, reply };
}

export function acceptRewriteModelText(called, { splitRewriteChange, cleanCandidate }) {
  const modelText = called?.called && called.text ? String(called.text).trim() : '';
  const split = splitRewriteChange(modelText);
  const rewritten = split.reply ? cleanCandidate(split.reply) : '';
  return { modelText, rewritten, change: split.change, called };
}

export async function rewriteModelAttemptTwice(askRewrite, reason, acceptText) {
  let attempt = await askRewrite(reason);
  let rewriteMs = attempt.ms;
  let parsed = acceptText(attempt.called);
  if (!parsed.modelText) {
    const again = await askRewrite(reason);
    rewriteMs += again.ms;
    const second = acceptText(again.called);
    if (second.modelText) {
      attempt = again;
      parsed = second;
    }
  }
  return { attempt, rewriteMs, parsed };
}
