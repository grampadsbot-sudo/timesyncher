export const ANCHOR_SET_VERSION = 'ssr-anchors-v1.0.0';

export const SSR_CONSTRUCTS = ['intent-to-pay', 'satisfaction', 'recommend'];

export const ANCHOR_SETS = {
  [ANCHOR_SET_VERSION]: {
    'intent-to-pay': [
      [
        'Hard no; I refuse to spend any money on this worthless, frustrating vacation app.',
        'Probably not; it feels overpriced and underwhelming for the cost.',
        'Unsure; I am undecided and on the fence about paying for it.',
        'Likely yes; the price feels fair and useful for my vacation.',
        'Definitely yes; I would gladly pay right now, worth every penny for my vacation.',
      ],
      [
        'Zero chance I would buy this; total waste of money and awful value.',
        'Unlikely I would buy this; too weak to justify the price.',
        'Maybe I would consider paying, though I have mixed feelings.',
        'Inclined to buy this; it gives solid value and saves effort.',
        'Eager to buy this immediately; tremendous value and an easy yes.',
      ],
      [
        'I reject paying anything for this; terrible deal and completely unhelpful.',
        'I doubt I would pay for this; skeptical it is worth the price.',
        'Neutral on paying; I could go either way right now.',
        'Leaning toward paying; it seems worthwhile and helpful.',
        'Happily pay without hesitation; amazing deal and love it.',
      ],
      [
        'Paying for this is out of the question; completely unconvinced and walking away.',
        'Probably skip paying; not compelling enough to spend money yet.',
        'Wait and see; neither willing nor unwilling to pay today.',
        'Probably subscribe; convinced it helps plan a smooth vacation.',
        'Ready to pay today; completely convinced and excited to purchase.',
      ],
      [
        'Never paying a dime for this; poor value and deeply disappointing.',
        'Hesitant to spend money on this; expected much more value.',
        'Indifferent on the price; some appeal and some hesitation.',
        'Good deal; I would happily spend money on this for my vacation.',
        'Incredible deal; I would enthusiastically pay for this right away.',
      ],
      [
        'Extremely unwilling to pay; strong rejection and zero interest.',
        'Somewhat unwilling to pay; mildly unconvinced by the offer.',
        'Neither likely nor unlikely to pay; completely undecided.',
        'Somewhat likely to pay; pleased with the value offered.',
        'Extremely likely to pay; thrilled with the value and ready to buy.',
      ],
    ],
    satisfaction: [
      [
        'Completely dissatisfied, frustrated, and annoyed; this vacation experience was awful.',
        'Mostly disappointed and underwhelmed; several parts felt weak and clunky.',
        'Neutral and indifferent; the experience was average and just okay.',
        'Satisfied and happy; the AI vacation experience worked smoothly and felt helpful.',
        'Thrilled, delighted, and completely satisfied; an extraordinary, joyful vacation experience.',
      ],
      [
        'Terrible experience from start to finish; wasted my time and left me irritated.',
        'Below average experience with annoying rough edges and gaps.',
        'Mixed feelings; some decent moments and some plain ones.',
        'Very good experience; clear, easy, and genuinely useful.',
        'Outstanding, joyful experience that exceeded every expectation.',
      ],
      [
        'Hated using this; deeply frustrating, clunky, and disappointing.',
        'Disliked parts of it; felt somewhat incomplete and underwhelming.',
        'Felt fine and ordinary; neither great nor bad overall.',
        'Liked it a lot; smooth, thoughtful, and well organized.',
        'Loved every bit of it; effortless, impressive, and wonderful.',
      ],
      [
        'Very poor quality; left me unhappy, annoyed, and let down.',
        'Subpar quality; left me somewhat unsatisfied and skeptical.',
        'Acceptable quality; met basic expectations and nothing more.',
        'Strong quality; left me pleased and confident in the result.',
        'Exceptional quality; left me amazed and genuinely delighted.',
      ],
      [
        'Deeply frustrating and unhelpful; completely failed what I needed.',
        'Mildly frustrating and underwhelming; missed important details.',
        'Adequate overall; nothing stood out either positively or negatively.',
        'Quite helpful and enjoyable; handled my vacation needs well.',
        'Remarkably helpful and a pleasure to use; thrilled with the result.',
      ],
      [
        'Extremely dissatisfied; one of the worst experiences I have tried.',
        'Somewhat dissatisfied; expected a noticeably better vacation plan.',
        'Moderately satisfied; just okay and unremarkable overall.',
        'Quite satisfied; genuinely happy with how the vacation turned out.',
        'Extremely satisfied; could not be happier with everything created.',
      ],
    ],
    recommend: [
      [
        'Hard no; awful experience and I would warn people to steer clear and avoid it completely.',
        'Unlikely to mention it; too rough and underwhelming to feel confident suggesting.',
        'Unsure and neutral; maybe I would bring it up if asked, maybe not.',
        'Likely to suggest it; smooth, helpful, and worth sharing for a vacation.',
        'Enthusiastically recommend it to everyone in a heartbeat; my top pick to rave about.',
      ],
      [
        'Never; terrible and frustrating, I would advise people not to bother at all.',
        'Doubtful I would bring it up; hesitant because of noticeable rough edges.',
        'On the fence; mixed feelings and uncertain whether others would want it.',
        'Happy to share it; a solid, genuinely useful AI vacation tool.',
        'Strongly endorse and proudly share it; excited to tell everyone to use it.',
      ],
      [
        'Zero chance of sharing; deeply disappointing and I would discourage anyone from trying it.',
        'Probably skip suggesting it; not polished enough to endorse right now.',
        'Could go either way depending on the person; neither for nor against.',
        'Probably recommend it; pleased enough to point others toward it.',
        'Wholeheartedly recommend it; thrilled to rave about this vacation planner.',
      ],
      [
        'Strongly against sharing; complete letdown and best avoided.',
        'Leaning against suggesting it; underwhelming compared to expectations.',
        'Indifferent about passing it along; just okay overall.',
        'Leaning toward suggesting it; genuinely helpful and easy to enjoy.',
        'Easy yes; cannot wait to tell people to try this amazing vacation planner.',
      ],
      [
        'Active warning to stay away; poor experience not worth anyone\'s time.',
        'Mild hesitation to suggest it; needs improvement before endorsing.',
        'Neutral stance; would not push it or warn against it.',
        'Positive endorsement; glad to point fellow vacationers here.',
        'Rave endorsement; enthusiastically recommending it to all vacation planners.',
      ],
      [
        'Extremely unlikely to recommend; strongly negative and against sharing.',
        'Somewhat unlikely to recommend; mildly hesitant and unconvinced.',
        'Neither likely nor unlikely to recommend; undecided overall.',
        'Somewhat likely to recommend; satisfied enough to share gladly.',
        'Extremely likely to recommend; delighted and eager to tell everyone.',
      ],
    ],
  },
};

export function listAnchorVersions() {
  return Object.keys(ANCHOR_SETS);
}

export function getAnchorSet(construct, version = ANCHOR_SET_VERSION) {
  const bundle = ANCHOR_SETS[version];
  if (!bundle) throw new Error(`refused: unknown anchor set version ${version}`);
  const sets = bundle[construct];
  if (!Array.isArray(sets) || sets.length === 0) {
    throw new Error(`refused: unknown SSR construct ${construct}`);
  }
  for (const set of sets) {
    if (!Array.isArray(set) || set.length !== 5) {
      throw new Error(`refused: anchor set for ${construct} must have 5 Likert levels`);
    }
  }
  return {
    construct,
    version,
    set_count: sets.length,
    sets: sets.map((set) => [...set]),
  };
}
