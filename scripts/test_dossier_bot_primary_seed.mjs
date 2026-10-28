import { vkSearchResultToDossier, loadVkSearchCensusResult } from '../src/vacation/dossier-vk-search.mjs';
import { mergeBotPrimaryPresentedFields } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';

const place = { id: 603, placeId: 603, title: 'Hotel Belleclaire Central Park', name: 'Hotel Belleclaire Central Park', category: 'hotel' };
const census = loadVkSearchCensusResult(place);
if (!census) throw new Error('missing census 603');
const bot = vkSearchResultToDossier(census, place);
const pages = [
  ...(bot.pages || []),
  {
    url: 'https://example.com/belleclaire-extra',
    text: 'Hotel Belleclaire Central Park offers Upper West Side rooms near Lincoln Center with complimentary wine hour, fitness center access, and an easy subway ride into Midtown Manhattan for theater nights.',
    fetchedAt: new Date().toISOString(),
    via: 'vk-search',
  },
];
const merged = mergeBotPrimaryPresentedFields({ pages, attempts: bot.attempts || [] }, { ...bot, pages }, place);
const counts = computeDossierFieldCounts(merged, place);
if (counts.summary?.status !== 'ok') throw new Error(`summary ${counts.summary?.status}`);
if (counts.description?.status !== 'ok') throw new Error(`description ${counts.description?.status}`);
if (!merged.fields?.itineraryNote?.value && !merged.itineraryNote) throw new Error('missing itineraryNote');
console.log(JSON.stringify({
  ok: true,
  presented: dossierPresented(merged, place),
  summaryWords: String(merged.fields.summary.value).split(/\s+/).length,
  descriptionWords: String(merged.fields.description.value).split(/\s+/).length,
  fillPath: 'bot-primary',
  xaiCalled: 0,
}));
