export class OpenClawBlobStore {
  constructor({ prefix = 'timesyncher-openclaw-control' } = {}) {
    this.prefix = prefix.replace(/^\/+|\/+$/g, '');
  }

  key(key) {
    return `${this.prefix}/${key}`.replace(/\/+/g, '/');
  }

  async blob() {
    return await import('@vercel/blob');
  }

  async putJson(key, value) {
    const { put } = await this.blob();
    const body = JSON.stringify(value, null, 2) + '\n';
    return await put(this.key(key), body, {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
      allowOverwrite: true,
    });
  }

  async getJson(key) {
    const { get } = await this.blob();
    const result = await get(this.key(key), { access: 'private', useCache: false });
    if (result?.statusCode === 200 && result.stream) {
      const text = await new Response(result.stream).text();
      return JSON.parse(text);
    }
    return null;
  }
}
