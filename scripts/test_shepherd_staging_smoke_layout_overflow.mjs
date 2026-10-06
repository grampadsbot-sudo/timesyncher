#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  elementClippedByAncestorOverflow,
  sampleUnclippedHorizontalOverflow,
} from './shepherd-staging-smoke-layout-overflow.mjs';

function el(tag, { id = '', className = '', parent = null, rect, style = {} } = {}) {
  const node = {
    tagName: String(tag).toUpperCase(),
    id,
    className,
    parentElement: parent,
    _rect: rect,
    _style: {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      overflow: 'visible',
      overflowX: 'visible',
      ...style,
    },
    getBoundingClientRect() {
      return { ...this._rect };
    },
  };
  return node;
}

const vw = 390;
const gcs = (node) => node._style;
const rectObj = (node) => node.getBoundingClientRect();

function overflowSamples(...nodes) {
  const queryAll = () => nodes;
  return sampleUnclippedHorizontalOverflow(vw, gcs, queryAll, rectObj);
}

// (a) Leaflet-like tiles clipped inside overflow:hidden map pane -> pass
const mapPane = el('div', {
  className: 'leaflet-pane',
  rect: { x: 0, y: 0, width: 390, height: 200, top: 0, left: 0, right: 390, bottom: 200 },
  style: { overflow: 'hidden', overflowX: 'hidden' },
});
const tile = el('img', {
  className: 'leaflet-tile',
  parent: mapPane,
  rect: { x: 200, y: 0, width: 256, height: 256, top: 0, left: 200, right: 456, bottom: 256 },
});
const tileHolder = el('div', {
  className: 'leaflet-layer',
  parent: mapPane,
  rect: { x: 0, y: 0, width: 390, height: 200, top: 0, left: 0, right: 390, bottom: 200 },
});
tile.parentElement = tileHolder;
tileHolder.parentElement = mapPane;
const docRoot = el('html', { rect: { right: 390, left: 0, width: 390, height: 800, top: 0, bottom: 800 } });
mapPane.parentElement = docRoot;

assert.equal(elementClippedByAncestorOverflow(tile, vw, gcs, docRoot), true);
assert.equal(overflowSamples(tile, tileHolder, mapPane).length, 0);

// (b) Unclipped 500px-wide div at 390 viewport -> fail
const wide = el('div', {
  id: 'wide',
  parent: docRoot,
  rect: { x: 0, y: 0, width: 500, height: 40, top: 0, left: 0, right: 500, bottom: 40 },
});
assert.equal(elementClippedByAncestorOverflow(wide, vw, gcs, docRoot), false);
assert.equal(overflowSamples(wide).length, 1);

console.log('shepherd staging smoke layout horizontal_overflow clipping: ok');
