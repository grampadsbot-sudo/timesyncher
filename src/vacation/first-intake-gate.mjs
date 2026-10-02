import { appTextBanned } from './live-app-turn.mjs';

const FIRST_INTAKE_LEAK = /\b(?:tier|route|model|jev)\b/i;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_WORD = /\b(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/g;
const INVENTED_PARTY = /\balready (?:a |your )?collaborator\b|\balready (?:has|have) access\b|\bjust you and (?:him|her|them)\b/i;

function questionCount(reply) {
  return (String(reply || '').match(/\?/g) || []).length;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shortenedName(reply, names) {
  const text = String(reply || '');
  for (const name of names) {
    const full = String(name || '').trim();
    if (full.length < 4 || text.includes(full)) continue;
    for (let length = 3; length < full.length; length += 1) {
      const prefix = full.slice(0, length).trim();
      if (prefix.length < 3) continue;
      if (new RegExp(`\\b${escapeRegExp(prefix)}\\b`).test(text)) return full;
    }
  }
  return '';
}

export function firstIntakeReplyLeak(reply) {
  return FIRST_INTAKE_LEAK.test(String(reply || ''));
}

function relativeMonthPhrase(text) {
  const match = /\bnext\s+([A-Za-z]{4,})\b/i.exec(String(text || ''));
  if (!match) return false;
  const word = match[1];
  if (word[0] !== word[0].toUpperCase()) return false;
  return !WEEKDAYS.some((day) => day.toLowerCase() === word.toLowerCase());
}

export function intakeReplyBlockReasons(reply, banned = appTextBanned, facts = {}, ids = []) {
  const reasons = [];
  const ban = banned(reply);
  if (ban && ban !== 'app reply text is empty') {
    reasons.push(ban);
    return reasons;
  }
  const text = String(reply || '').trim();
  if (!text) return reasons;
  if (firstIntakeReplyLeak(text)) reasons.push('first_intake_reply_leak');
  for (const id of ids || []) {
    if (id && text.includes(id)) reasons.push('first_intake_reply_id_echo');
  }
  if (INVENTED_PARTY.test(text)) reasons.push('first_intake_invented_party');
  const allowedDays = new Set([facts?.weekday, facts?.end_weekday].filter(Boolean));
  for (const day of String(facts?.customer_said || '').match(WEEKDAY_WORD) || []) allowedDays.add(day);
  for (const day of text.match(WEEKDAY_WORD) || []) {
    if (!allowedDays.has(day)) reasons.push(`first_intake_weekday_not_allowed:${day}`);
  }
  if (facts?.when_relative !== true && relativeMonthPhrase(text)) reasons.push('first_intake_relative_month');
  const names = [...(facts?.who || []), ...(facts?.collaborators || []), facts?.customer_name].filter(Boolean);
  if (shortenedName(text, names)) reasons.push('first_intake_shortened_name');
  const questions = questionCount(text);
  if (facts?.shape === 'gaps') {
    if (questions < 2 || questions > 3) reasons.push('first_intake_question_count_gaps');
  } else if (facts?.shape !== 'no-trip' && questions !== 1) reasons.push('first_intake_question_count');
  return reasons;
}

export function intakeReplyBlock(reply, banned = appTextBanned, facts = {}, ids = []) {
  const reasons = intakeReplyBlockReasons(reply, banned, facts, ids);
  if (!reasons.length) return '';
  const ban = reasons.find((reason) => !reason.startsWith('first_intake_'));
  if (ban) return ban;
  return 'first_intake_reply_flagged';
}
