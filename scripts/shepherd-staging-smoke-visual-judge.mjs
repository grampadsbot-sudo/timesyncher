import { readFileSync } from 'node:fs';
import { OPENROUTER_CHAT_COMPLETIONS_URL } from './vacation-app-reply-rules.mjs';
import {
  VISUAL_JUDGE_MODEL,
  VISUAL_RUBRIC_VERSION,
  buildVisualJudgePrompt,
  loadScreenSpecForLabel,
} from './shepherd-staging-smoke-visual-rubric.mjs';
import {
  reconcileVisualJudgeComposerSend,
  sendBboxHasInkInComposerPng,
  sendDomStructurallyConfirmsVisibleSend,
} from './shepherd-staging-smoke-composer-send-dom.mjs';

export { VISUAL_JUDGE_MODEL };

export function parseVisualJudgeResponseText(text) {
  let body = String(text || '').trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) body = fence[1].trim();
  const parsed = JSON.parse(body);
  if (typeof parsed.pass !== 'boolean') {
    throw new Error('visual_judge_json: pass must be boolean');
  }
  if (!Array.isArray(parsed.failures)) {
    throw new Error('visual_judge_json: failures must be array');
  }
  for (const row of parsed.failures) {
    if (!row || typeof row.rubricItem !== 'string' || typeof row.reason !== 'string') {
      throw new Error('visual_judge_json: invalid failure row');
    }
  }
  if (parsed.pass && parsed.failures.length > 0) {
    throw new Error('visual_judge_json: pass true with failures');
  }
  return parsed;
}

async function judgeScreenshotWithOpenRouter({
  shotMeta,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 90000,
}) {
  const key = String(apiKey || '').trim();
  if (!key) {
    return {
      pass: false,
      failures: [{ rubricItem: 'harness', reason: 'OPENROUTER_API_KEY missing' }],
      error: 'missing_key',
      model: VISUAL_JUDGE_MODEL,
      rubricVersion: VISUAL_RUBRIC_VERSION,
    };
  }
  const judgePath = shotMeta?.composerPath || shotMeta?.path;
  if (!judgePath) {
    return {
      pass: false,
      failures: [{ rubricItem: 'harness', reason: 'missing screenshot path' }],
      error: 'missing_screenshot',
      model: VISUAL_JUDGE_MODEL,
      rubricVersion: VISUAL_RUBRIC_VERSION,
    };
  }
  let pngB64;
  try {
    pngB64 = readFileSync(judgePath).toString('base64');
  } catch (err) {
    return {
      pass: false,
      failures: [{ rubricItem: 'harness', reason: `screenshot read failed: ${String(err?.message || err)}` }],
      error: 'screenshot_read',
      model: VISUAL_JUDGE_MODEL,
      rubricVersion: VISUAL_RUBRIC_VERSION,
    };
  }
  const screenSpecText = shotMeta.specText || loadScreenSpecForLabel(shotMeta.screenLabel);
  const prompt = buildVisualJudgePrompt({
    screenLabel: shotMeta.screenLabel,
    pageKind: shotMeta.pageKind,
    stateId: shotMeta.stateId,
    tabLabel: shotMeta.tabLabel || '',
    viewport: shotMeta.viewport,
    screenSpecText,
    specSource: shotMeta.specSource || 'canonical_fallback_0926_pt',
    layoutDomFacts: shotMeta.layoutDomFacts || '',
    sendButtonDomContext: shotMeta.sendButtonDomContext || '',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vacation-staging.timesyncher.com',
        'X-Title': 'Shepherd Visual Judge',
      },
      body: JSON.stringify({
        model: VISUAL_JUDGE_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${pngB64}` } },
          ],
        }],
      }),
      signal: controller.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      return {
        pass: false,
        failures: [{ rubricItem: 'harness', reason: `OpenRouter HTTP ${res.status}: ${raw.slice(0, 200)}` }],
        error: 'http_error',
        model: VISUAL_JUDGE_MODEL,
        rubricVersion: VISUAL_RUBRIC_VERSION,
        latencyMs: Date.now() - started,
      };
    }
    let outer;
    try {
      outer = JSON.parse(raw);
    } catch (err) {
      return {
        pass: false,
        failures: [{ rubricItem: 'harness', reason: `OpenRouter body not JSON: ${String(err?.message || err)}` }],
        error: 'openrouter_json',
        model: VISUAL_JUDGE_MODEL,
        rubricVersion: VISUAL_RUBRIC_VERSION,
        latencyMs: Date.now() - started,
      };
    }
    const content = outer?.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : JSON.stringify(content || '');
    try {
      const parsed = parseVisualJudgeResponseText(text);
      let composerPngBuffer = null;
      if (shotMeta.composerPath) {
        try {
          composerPngBuffer = readFileSync(shotMeta.composerPath);
        } catch {
          composerPngBuffer = null;
        }
      }
      const verdict = reconcileVisualJudgeComposerSend(parsed, shotMeta.sendDom, { composerPngBuffer });
      const sendCropInk = composerPngBuffer && shotMeta.sendDom
        ? sendBboxHasInkInComposerPng(composerPngBuffer, shotMeta.sendDom)
        : null;
      return {
        ...verdict,
        sendDom: shotMeta.sendDom || null,
        sendDomStructural: sendDomStructurallyConfirmsVisibleSend(shotMeta.sendDom),
        sendCropInk,
        error: null,
        model: outer?.model || VISUAL_JUDGE_MODEL,
        rubricVersion: VISUAL_RUBRIC_VERSION,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return {
        pass: false,
        failures: [{ rubricItem: 'harness', reason: `Unparseable model JSON: ${String(err?.message || err)}` }],
        error: 'verdict_parse',
        model: outer?.model || VISUAL_JUDGE_MODEL,
        rubricVersion: VISUAL_RUBRIC_VERSION,
        latencyMs: Date.now() - started,
        rawExcerpt: text.slice(0, 400),
      };
    }
  } catch (err) {
    return {
      pass: false,
      failures: [{ rubricItem: 'harness', reason: String(err?.message || err) }],
      error: 'fetch_error',
      model: VISUAL_JUDGE_MODEL,
      rubricVersion: VISUAL_RUBRIC_VERSION,
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function judgeScreenshotsParallel(shots, { apiKey, concurrency = 3, fetchImpl = fetch, setStage }) {
  const results = new Array(shots.length);
  let next = 0;
  async function worker() {
    while (next < shots.length) {
      const idx = next;
      next += 1;
      const shot = shots[idx];
      setStage?.(`visual judge ${shot.id}`);
      results[idx] = {
        shot,
        verdict: await judgeScreenshotWithOpenRouter({ shotMeta: shot, apiKey, fetchImpl }),
      };
    }
  }
  const n = Math.max(1, Math.min(concurrency, shots.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
