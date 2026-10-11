#!/usr/bin/env node
import assert from 'node:assert/strict';
import { evaluateComposerControlsOnly } from './shepherd-staging-smoke-composer-send.mjs';

function mockButton({
  id = '',
  ariaLabel = '',
  title = '',
  disabled = false,
  hidden = false,
  pointerEvents = 'auto',
  rect = { width: 40, height: 40, top: 700, left: 330, right: 370, bottom: 740 },
} = {}) {
  const btn = {
    id,
    tagName: 'BUTTON',
    disabled,
    getAttribute(name) {
      if (name === 'aria-label') return ariaLabel;
      if (name === 'title') return title;
      return null;
    },
    textContent: '',
    contains(node) {
      return node === btn;
    },
    getBoundingClientRect: () => ({ ...rect }),
    _style: {
      display: hidden ? 'none' : 'block',
      visibility: 'visible',
      opacity: '1',
      pointerEvents,
    },
  };
  return btn;
}

function runFixture({ send, composer = { querySelector: () => null }, elementFromPoint, innerWidth = 390, innerHeight = 844 }) {
  const attach = mockButton({ id: 'attachButton' });
  const voice = mockButton({ id: 'voiceButton' });
  const textarea = {
    id: 'messageText',
    tagName: 'TEXTAREA',
    getBoundingClientRect: () => ({ width: 200, height: 40, top: 700, left: 80, right: 280, bottom: 740 }),
    _style: { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' },
  };
  const gridChildren = [attach, textarea, voice, send].filter(Boolean);
  const grid = { querySelectorAll: (sel) => (String(sel) === 'button' ? gridChildren.filter((c) => c.tagName === 'BUTTON') : gridChildren) };
  const form = { querySelector: (sel) => (String(sel).includes('compose-grid') ? grid : null) };
  const nodes = {
    'form#composer, form.composer#composer, #composer': composer === true ? form : composer,
    '#attachButton': attach,
    '#voiceButton': voice,
    '#messageText, textarea[name="message"], #composer textarea': textarea,
  };
  const failures = [];
  evaluateComposerControlsOnly({
    pageKind: 'chat',
    querySelector: (sel) => nodes[sel] || null,
    getComputedStyle: (el) => el._style,
    push: (_s, _r, detail) => failures.push(detail),
    applies: (rule) => rule === 'composer_controls_only',
    rectObj: () => null,
    elementFromPoint: elementFromPoint || (() => send),
    innerWidth,
    innerHeight,
  });
  return failures;
}

const goodSend = mockButton({ id: 'sendButton', ariaLabel: 'Send' });
assert.equal(runFixture({ send: goodSend, composer: true }).length, 0);

assert.ok(runFixture({ send: null, composer: true }).some((d) => /Send button/i.test(d)), 'missing send');
assert.ok(runFixture({ send: mockButton({ ariaLabel: 'Send', hidden: true }), composer: true }).some((d) => /hidden/i.test(d)), 'hidden');
assert.ok(runFixture({ send: mockButton({ ariaLabel: 'Send', rect: { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 } }), composer: true }).some((d) => /zero size/i.test(d)), 'zero size');
assert.ok(runFixture({ send: mockButton({ ariaLabel: 'Send', rect: { width: 40, height: 40, top: -50, left: 0, right: 40, bottom: -10 } }), composer: true }).some((d) => /outside the viewport/i.test(d)), 'outside viewport');
assert.ok(runFixture({ send: goodSend, composer: true, elementFromPoint: () => ({ tagName: 'DIV' }) }).some((d) => /covered/i.test(d)), 'covered');
assert.ok(runFixture({ send: mockButton({ ariaLabel: 'Send', pointerEvents: 'none' }), composer: true }).some((d) => /pointer-events/i.test(d)), 'pointer-events');
assert.ok(runFixture({ send: mockButton({ ariaLabel: 'Send', disabled: true }), composer: true }).some((d) => /disabled/i.test(d)), 'disabled');

console.log('composer send layout tests passed');
