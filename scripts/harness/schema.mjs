import { readFileSync } from 'node:fs';

export function loadStorySchema() {
  return JSON.parse(readFileSync(new URL('../fixtures/harness/story.schema.json', import.meta.url), 'utf8'));
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesIf(schema, value) {
  if (!schema || !value || typeof value !== 'object') return false;
  for (const key of schema.required || []) {
    if (value[key] == null || value[key] === '') return false;
  }
  for (const [key, child] of Object.entries(schema.properties || {})) {
    if (child.const != null && value[key] !== child.const) return false;
  }
  return true;
}

function validateAgainst(schema, value, path = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} is not an allowed value`);
  if (schema.type && typeOf(value) !== schema.type) {
    errors.push(`${path} expected ${schema.type}`);
    return errors;
  }
  if (schema.minLength != null && String(value || '').length < schema.minLength) errors.push(`${path} is too short`);
  if (schema.pattern && !new RegExp(schema.pattern).test(String(value || ''))) errors.push(`${path} does not match the pattern`);
  if (schema.minItems != null && Array.isArray(value) && value.length < schema.minItems) errors.push(`${path} is empty`);
  if (schema.type === 'object') {
    for (const key of schema.required || []) {
      if (value[key] == null || value[key] === '') errors.push(`${path}.${key} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties?.[key]) errors.push(`${path}.${key} is not allowed`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (value[key] != null) errors.push(...validateAgainst(child, value[key], `${path}.${key}`));
    }
  }
  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => errors.push(...validateAgainst(schema.items, item, `${path}[${index}]`)));
  }
  if (schema.if && schema.then && matchesIf(schema.if, value)) errors.push(...validateAgainst(schema.then, value, path));
  return errors;
}

export function validateStory(story, schema = loadStorySchema()) {
  if (!story || typeof story !== 'object' || Array.isArray(story)) return ['story must be an object'];
  return validateAgainst(schema, story);
}

export function validateWave(stories, schema = loadStorySchema()) {
  if (!Array.isArray(stories)) return ['wave must be an array'];
  return stories.flatMap((story, index) => validateStory(story, schema).map((error) => `stories[${index}] ${error}`));
}
