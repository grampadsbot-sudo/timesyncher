#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  auditListRowPicPopup,
  auditListRowPicPopupMediaStrip,
  isVisibleElement,
} from '../src/vacation/list-row-pic-popup-audit.mjs';

const patch = await readFile(new URL('../public/ts-timeline-icon-patch.js', import.meta.url), 'utf8');
assert.match(patch, /function isPicMediaNode/);
assert.match(patch, /data-ts-pic-thumb-wrap/);
assert.match(patch, /data-ts-pic-popup/);
assert.match(patch, /print-media-qr/);

const rowStub = {
  getBoundingClientRect: () => ({ top: 0 }),
  querySelectorAll(sel) {
    if (sel === '[data-ts-pic-popup]') return [];
    if (sel === 'img') return [];
    if (sel === '[data-ts-pic-thumb-wrap]') {
      return [
        {
          parentElement: this,
          querySelectorAll(inner) {
            if (inner === '[data-ts-logo-chip]') return [];
            if (inner === 'img') {
              return [{ getAttribute: () => '/ts-thing-media/abc123.jpg', classList: { contains: () => false } }];
            }
            return [];
          },
        },
      ];
    }
    return [];
  },
  querySelector(sel) {
    if (sel === 'img.print-media-qr, .print-media-qr') return { tagName: 'IMG' };
    return null;
  },
};

assert.equal(auditListRowPicPopupMediaStrip(rowStub).ok, true);
assert.equal(auditListRowPicPopupMediaStrip(null).ok, false);

const chipRow = {
  getBoundingClientRect: () => ({ top: 0 }),
  querySelectorAll(sel) {
    if (sel === '[data-ts-pic-popup]') return [];
    if (sel === 'img') return [];
    if (sel === '[data-ts-logo-chip]') return [{}];
    if (sel === '[data-ts-pic-thumb-wrap]') {
      return [
        {
          parentElement: this,
          querySelectorAll() {
            return [];
          },
        },
      ];
    }
    return [];
  },
  querySelector(sel) {
    if (sel === 'img.print-media-qr, .print-media-qr') return { tagName: 'IMG' };
    return null;
  },
};

assert.equal(auditListRowPicPopupMediaStrip(chipRow).ok, false);
assert.equal(auditListRowPicPopupMediaStrip(chipRow).reason, 'pic-logo-chip-leftover');
assert.equal(isVisibleElement(null), false);
assert.equal(auditListRowPicPopup(null).ok, false);

console.log('ui #877 pic-popup media strip bundle checks passed');
