import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateStory } from './schema.mjs';

export const DEFAULT_ROSTER = path.join(os.homedir(), 'tsv-dispatch', 'jobs', 'customer-rosters-r2-job', 'vk-roster.json');
export const RAMP_SIZES = [1, 5, 20, 100];
export const AB_SET_SIZE = 10;
const EDGE_CASES = ['confused', 'impatient', 'changes mind', 'coupon misuse', 'quits partway'];
const PHOTO_FIXTURE = 'scripts/fixtures/harness/media/photo.png';
const VIDEO_FIXTURE = 'scripts/fixtures/harness/media/clip.mp4';
export const MEDIA_PLAN = Object.freeze({
  itinerary_item: { photos: 2, videos: 1, video_seconds: 30, include_tbd: true },
  hotel_check_in: { photos: 2, videos: 1, video_seconds: 30 },
  hotel_check_out: { photos: 2, videos: 1, video_seconds: 30 },
  long_list_only: { photos: 0, videos: 0, video_seconds: 0 },
});

const REQUIRED = ['id', 'customer_label', 'party_type', 'party_detail', 'travelers', 'destination', 'country',
  'length_days', 'budget_band', 'tech_comfort', 'planner', 'planner_device', 'test_coupon', 'payment_mode', 'is_edge_case'];
const FEMALE = ['Maria', 'Grace', 'Nina', 'Laura', 'Hannah', 'Priya', 'Elena', 'Sofia', 'Claire', 'Rosa', 'Megan', 'Tessa', 'Ivy', 'Dana', 'Leah', 'Carmen'];
const MALE = ['Daniel', 'Mateo', 'Luis', 'Owen', 'Raj', 'Ethan', 'Victor', 'Simon', 'Aaron', 'Felix', 'Noah', 'Peter', 'Hugo', 'Ben', 'Tomas', 'Kevin'];
const NEUTRAL = ['Jordan', 'Casey', 'Riley', 'Morgan', 'Avery', 'Quinn', 'Rowan', 'Sky', 'Parker', 'Reese', 'Emerson', 'Blair'];
const KIDS = ['Mia', 'Leo', 'Ava', 'Eli', 'Zoe', 'Max', 'Lily', 'Sam', 'Ruby', 'Finn', 'Nora', 'Jack', 'Iris', 'Theo'];
const OTHER_SURNAMES = ['Hayes', 'Ortiz', 'Lane', 'Patton', 'Shaw', 'Rivera', 'Wells', 'Moreno', 'Chen', 'Doyle', 'Kerr', 'Baird'];
const CHANGE_MIND_FALLBACK = { USA: 'Chicago', 'United Kingdom': 'Edinburgh', Canada: 'Toronto', Ireland: 'Dublin', Australia: 'Melbourne', 'New Zealand': 'Wellington' };
const START = Date.UTC(2027, 3, 5);
const DAY = 86400000;

function pad3(id) {
  return String(id).padStart(3, '0');
}

function pick(list, index) {
  return list[((index % list.length) + list.length) % list.length];
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'guest';
}

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function couponCodeFor(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error(`refused: roster id ${id} has no VK-TEST coupon`);
  return `VK-TEST-${pad3(n)}`;
}

export function validateRosterEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return ['roster entry must be an object'];
  for (const key of REQUIRED) if (entry[key] == null || entry[key] === '') errors.push(`roster #${entry.id ?? '?'} ${key} is required`);
  if (!Number.isInteger(entry.length_days) || entry.length_days < 1 || entry.length_days > 30) errors.push(`roster #${entry.id} length_days out of range`);
  if (!Number.isInteger(entry.travelers) || entry.travelers < 1) errors.push(`roster #${entry.id} travelers must be >= 1`);
  if (entry.payment_mode !== 'test_coupon') errors.push(`roster #${entry.id} payment_mode must be test_coupon (no real payment)`);
  try {
    if (entry.test_coupon !== couponCodeFor(entry.id)) errors.push(`roster #${entry.id} test_coupon must be ${couponCodeFor(entry.id)}`);
  } catch (error) {
    errors.push(error.message);
  }
  if (entry.is_edge_case && !EDGE_CASES.includes(entry.edge_case_type)) errors.push(`roster #${entry.id} edge_case_type is not one of ${EDGE_CASES.join(', ')}`);
  if (!entry.is_edge_case && entry.edge_case_type) errors.push(`roster #${entry.id} edge_case_type set without is_edge_case`);
  return errors;
}

export function loadRoster(file = DEFAULT_ROSTER) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const customers = Array.isArray(parsed) ? parsed : parsed?.customers;
  if (!Array.isArray(customers) || !customers.length) throw new Error('refused: roster has no customers array');
  const errors = customers.flatMap(validateRosterEntry);
  const ids = customers.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) errors.push('roster ids are not unique');
  const coupons = customers.map((entry) => entry.test_coupon);
  if (new Set(coupons).size !== coupons.length) errors.push('roster test coupons are not unique (one coupon per customer)');
  if (errors.length) throw new Error(`refused: roster invalid\n${errors.join('\n')}`);
  return customers;
}

export function kidAges(detail) {
  const text = String(detail || '');
  const twins = text.match(/twins age (\d+)/i);
  if (twins) return [Number(twins[1]), Number(twins[1])];
  const range = text.match(/(\d+) kids ages (\d+) to (\d+)/i);
  if (range) {
    const [count, low, high] = range.slice(1).map(Number);
    if (count === 1) return [low];
    return Array.from({ length: count }, (_, index) => Math.round(low + ((high - low) * index) / (count - 1)));
  }
  const listed = text.match(/(?:kids?|teens?)\s+((?:\d+(?:,\s*and\s+|,\s*|\s+and\s+)?)+)/i);
  if (!listed) return [];
  return (listed[1].match(/\d+/g) || []).map(Number);
}

function surnameOf(entry) {
  const label = String(entry.customer_label || '').trim();
  const words = label.split(/\s+/);
  if (/ (family|couple|friends group)$/i.test(label)) return words[0];
  return words.slice(1).join(' ') || words[0];
}

function ownerName(entry) {
  const label = String(entry.customer_label || '').trim();
  if (entry.party_type === 'Solo traveller' && !/ (family|couple|friends group)$/i.test(label)) return label;
  const device = String(entry.planner_device || '');
  const list = entry.planner === 'Mom' || / her /.test(` ${device} `) ? FEMALE
    : entry.planner === 'Dad' || / his /.test(` ${device} `) ? MALE
      : NEUTRAL;
  return `${pick(list, entry.id * 7)} ${surnameOf(entry)}`;
}

function rosterParty(entry) {
  const surname = surnameOf(entry);
  const ages = kidAges(entry.party_detail);
  const adults = Math.max(1, Number(entry.travelers) - ages.length);
  const friends = entry.party_type === 'Friends group';
  const collaborators = Array.from({ length: adults - 1 }, (_, index) => ({
    name: `${pick(index % 2 ? FEMALE : MALE, entry.id + index * 3)} ${friends ? pick(OTHER_SURNAMES, entry.id + index) : surname}`,
    payer: 'owner',
  }));
  const kids = ages.map((age, index) => ({ name: `${pick(KIDS, entry.id + index * 5)} ${surname}`, age }));
  const viewers = entry.id === 1 ? [{}] : [];
  const editors = entry.id === 1 ? [{ name: 'Morgan Reed' }] : [];
  return { collaborators, kids, viewers, editors };
}

function rosterDates(entry) {
  const start = START + (Number(entry.id) - 1) * 3 * DAY;
  return { start: isoDay(start), end: isoDay(start + (Number(entry.length_days) - 1) * DAY) };
}

function place(entry) {
  const region = String(entry.state_or_region || '').trim();
  const destination = String(entry.destination || '').trim();
  if (!region || region === entry.country || destination.includes(region)) return destination;
  return `${destination}, ${region}`;
}

function prettyDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function budgetWords(band) {
  if (band === 'Budget') return 'We are on a tight budget, so free and low-cost ideas please.';
  if (band === 'Splurge') return 'We are happy to splurge on a few special things.';
  return 'Our budget is mid-range.';
}

function interests(entry) {
  if (entry.destination_type === 'Theme Park') return 'theme park days with a pool break in the afternoon';
  if (entry.destination_type === 'National Park') return 'easy hikes, a scenic drive and one sunrise viewpoint';
  if (entry.destination_type === 'Beach / Resort Town') return 'beach mornings, a boat outing and casual seafood dinners';
  if (entry.destination_type === 'International (English-speaking)') return 'the classic sights, a local food tour and one day out by train';
  return 'the big sights, a museum, a good park and a few local food spots';
}

function changeTarget(entry) {
  const note = String(entry.edge_case_note || '');
  const swap = note.match(/swaps (\w[\w ]*?) for (\w[\w ]*?)(?: twice|$|\s)/i);
  if (swap) return swap[2].trim();
  const from = note.match(/from ([\w .]+?) to ([\w .]+?) halfway/i);
  if (from) return from[2].trim();
  const fallback = CHANGE_MIND_FALLBACK[entry.country] || 'Chicago';
  return fallback === entry.destination ? 'Boston' : fallback;
}

function edgeLines(entry, owner, dates) {
  const where = place(entry);
  const say = (text, expect) => ({ speaker: owner, modality: 'text', text, ...(expect ? { expect } : {}) });
  switch (entry.edge_case_type) {
    case 'confused':
      return [
        say(`Wait, do we check in to the hotel on ${prettyDate(dates.start)} or the day after? I keep mixing up the dates.`, ['hotel-check-in']),
        say(/train|rental/i.test(entry.edge_case_note || '')
          ? 'Sorry, are we taking the train or picking up a rental car? I am mixed up about which one I booked.'
          : `Which airport are we flying into for ${where} again? I wrote down two different ones.`),
        say('Can you just repeat the plan for the first day so I know I have it right?'),
      ];
    case 'impatient':
      return [
        say(`${where}. Just give me the full hour-by-hour plan for every day right now.`),
        say('Skip the questions. Why is the keepsake not ready yet?'),
        say('Fine, keep it short. Mornings busy, evenings free.'),
      ];
    case 'changes mind': {
      const other = changeTarget(entry);
      return [
        say(`Actually, can we switch the vacation to ${other} instead?`),
        say(`Hmm, no. Let's go back to ${where} like the first plan.`),
        say('Sorry for the back and forth. Keep the first day the way you had it.'),
      ];
    }
    case 'coupon misuse':
      return [
        say('Can I use a second coupon code on this same vacation to get more?'),
        say('My other promo code says expired. Can you apply it anyway?'),
      ];
    case 'quits partway':
      return [say('Sorry, the kids need me right now. I have to go.')];
    default:
      return [];
  }
}

function scriptedTurns(entry, owner, dates) {
  const where = place(entry);
  const say = (text, expect) => ({ speaker: owner, modality: 'text', text, ...(expect ? { expect } : {}) });
  const opener = say(
    `Hi, I'm planning a ${entry.length_days}-day vacation to ${where} from ${prettyDate(dates.start)} to ${prettyDate(dates.end)}. `
      + `It's ${String(entry.party_detail).replace(/^1 /, 'one ')}. ${budgetWords(entry.budget_band)}`,
    ['itinerary'],
  );
  const lowTech = entry.tech_comfort === 'Low'
    ? say('I am not great with apps, so please keep the steps simple.')
    : null;
  const interest = say(`We would love ${interests(entry)}.`, ['itinerary']);
  const hotel = say('Please add our hotel check-in on the first day and check-out on the last day.', ['hotel-check-in', 'hotel-check-out']);
  const firstDay = say('What does the first day look like?');
  const edge = edgeLines(entry, owner, dates);
  if (entry.edge_case_type === 'impatient') return [edge[0], edge[1], interest, hotel, edge[2]];
  if (entry.edge_case_type === 'quits partway') return [opener, interest, ...edge];
  if (entry.edge_case_type === 'changes mind') return [opener, interest, edge[0], edge[1], hotel, edge[2]];
  if (entry.edge_case_type === 'confused') return [opener, edge[0], interest, edge[1], hotel, edge[2]];
  if (entry.edge_case_type === 'coupon misuse') return [opener, edge[0], interest, hotel, edge[1]];
  return [opener, lowTech, interest, hotel, firstDay].filter(Boolean);
}

function couponPlan(entry) {
  const misuse = entry.edge_case_type === 'coupon misuse';
  const note = String(entry.edge_case_note || '');
  return {
    code: couponCodeFor(entry.id),
    misuse,
    misuse_kind: misuse ? (/stack/i.test(note) ? 'stack' : /expired/i.test(note) ? 'expired-promo' : 'reuse') : '',
  };
}

export function rosterToStory(entry) {
  const errors = validateRosterEntry(entry);
  if (errors.length) throw new Error(`refused: ${errors.join('; ')}`);
  const owner = ownerName(entry);
  const dates = rosterDates(entry);
  const story = {
    story_id: `vk-${pad3(entry.id)}`,
    customer: { name: owner, email_alias: `vk-${pad3(entry.id)}-${slug(surnameOf(entry))}` },
    party: rosterParty(entry),
    destination: place(entry),
    dates,
    turns: scriptedTurns(entry, owner, dates),
    steps: ['onboarding', 'coupon', 'chat', 'media', 'collaborator'],
    media: [
      { kind: 'photo', fixture: PHOTO_FIXTURE, attach_to: 'thing' },
      { kind: 'photo', fixture: PHOTO_FIXTURE, attach_to: 'thing' },
      { kind: 'video', fixture: VIDEO_FIXTURE, attach_to: 'thing' },
    ],
    coupon: couponPlan(entry),
    roster: {
      id: entry.id,
      label: entry.customer_label,
      party_type: entry.party_type,
      length_days: entry.length_days,
      budget: entry.budget_band,
      tech_comfort: entry.tech_comfort,
      planner: entry.planner,
      edge_case: entry.is_edge_case ? entry.edge_case_type : '',
      edge_case_note: entry.edge_case_note || '',
      source: 'templated',
    },
    media_plan: '11-18-spec',
    ...(entry.id === 1 ? { max_turns: 50 } : {}),
  };
  return story;
}

export function rampOrder(customers) {
  return [...customers].sort((a, b) => Number(a.id) - Number(b.id));
}

export function abArms(customers) {
  const set = rampOrder(customers).slice(0, AB_SET_SIZE);
  const firstSeen = new Map();
  set.forEach((entry, index) => { if (!firstSeen.has(entry.party_type)) firstSeen.set(entry.party_type, index); });
  const grouped = [...set].sort((a, b) => firstSeen.get(a.party_type) - firstSeen.get(b.party_type) || Number(a.id) - Number(b.id));
  const arms = new Map();
  grouped.forEach((entry, index) => arms.set(entry.id, index % 2 === 0 ? 'openrouter' : 'vk_bot_mcp'));
  return arms;
}

export function loadStoriesDir(dir) {
  const stories = new Map();
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort()) {
    const story = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const errors = validateStory(story);
    if (errors.length) throw new Error(`refused: ${name} is not a valid story\n${errors.join('\n')}`);
    stories.set(story.story_id, story);
  }
  return stories;
}

export function storyForEntry(entry, arms, dialogStories = null) {
  const templated = rosterToStory(entry);
  const written = dialogStories?.get(templated.story_id);
  const base = written
    ? { ...written, coupon: templated.coupon, roster: { ...templated.roster, source: 'stories-dir' }, media_plan: written.media_plan || templated.media_plan }
    : templated;
  return { ...base, reply_backend: arms.get(entry.id) || 'openrouter' };
}

export function waveStories(customers, size, { dialogStories = null } = {}) {
  const order = rampOrder(customers);
  const count = Number(size);
  if (!Number.isInteger(count) || count < 1 || count > order.length) throw new Error(`refused: wave size ${size} is outside 1..${order.length}`);
  const arms = abArms(customers);
  const stories = order.slice(0, count).map((entry) => storyForEntry(entry, arms, dialogStories));
  for (const story of stories) {
    const errors = validateStory(story);
    if (errors.length) throw new Error(`refused: ${story.story_id} failed the story schema\n${errors.join('\n')}`);
  }
  return stories;
}
