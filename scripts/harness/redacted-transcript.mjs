import fs from 'node:fs';
import path from 'node:path';
import { redactText } from './redact.mjs';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function label(value, secrets) {
  const text = redactText(String(value || '').trim(), secrets);
  if (!text || text.includes('[redacted]') || /https?:\/\//i.test(text) || /\/shared\//i.test(text)) return '';
  return text;
}

export function redactedLiveTranscript(transcript, secrets = []) {
  const turns = Array.isArray(transcript?.turns) ? transcript.turns : [];
  return {
    turns: turns.map((turn) => ({
      n: finite(turn?.turnIndex),
      producer: label(turn?.replyProducer, secrets),
      model: label(turn?.modelId || turn?.model?.responseModel, secrets),
      judged: turn?.quality?.judged === true,
      timings: {
        latencyMs: finite(turn?.latencyMs),
        sessionE2eMs: finite(turn?.sessionE2eMs),
        genLatencyMs: finite(turn?.genLatencyMs),
        jevLatencyMs: finite(turn?.jevLatencyMs),
        judgeMs: finite(turn?.quality?.judgeMs),
      },
    })),
  };
}

export function writeRedactedLiveTranscript(outDir, transcript, secrets = []) {
  const file = path.join(outDir, 'live-transcript-redacted.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(redactedLiveTranscript(transcript, secrets), null, 2)}\n`);
  return file;
}

export function transcriptForScorecard(dialogTranscript, storedTranscript) {
  return dialogTranscript || storedTranscript || null;
}
