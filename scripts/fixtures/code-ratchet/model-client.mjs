const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' });
await fetch('https://api.x.ai/v1/chat/completions', { method: 'POST' });
await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });
void response;
