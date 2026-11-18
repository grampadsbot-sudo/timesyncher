function isBackend(value) {
  return value === 'openrouter' || value === 'vk_bot_mcp';
}

function fillBlock(group) {
  let openCount = group.filter((story) => story.reply_backend === 'openrouter').length;
  let mcpCount = group.filter((story) => story.reply_backend === 'vk_bot_mcp').length;
  for (const story of group) {
    if (isBackend(story.reply_backend)) continue;
    if (openCount < 5) {
      story.reply_backend = 'openrouter';
      openCount += 1;
    } else if (mcpCount < 5) {
      story.reply_backend = 'vk_bot_mcp';
      mcpCount += 1;
    } else if (openCount <= mcpCount) {
      story.reply_backend = 'openrouter';
      openCount += 1;
    } else {
      story.reply_backend = 'vk_bot_mcp';
      mcpCount += 1;
    }
  }
}

export function assignReplyBackends(stories) {
  const next = stories.map((story) => ({ ...story }));
  for (let offset = 0; offset < next.length; offset += 10) fillBlock(next.slice(offset, offset + 10));
  return next;
}

export function classifyAppFailure(status, body) {
  const code = Number(status);
  const text = [body?.error, body?.reason, body?.code, body?.status].filter(Boolean).join(' ');
  if (code === 402 || /payment required|payment_required|provider_payment_required/i.test(text)) return 'payment-required';
  if (/credit exhausted|credits exhausted|insufficient credit|quota exceeded|billing limit/i.test(text)) return 'credit-exhausted';
  return '';
}

export function clampConcurrency(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 1) return 1;
  return 2;
}
