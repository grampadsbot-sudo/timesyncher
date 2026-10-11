export class PlaceSearchError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.name = 'PlaceSearchError';
    this.code = code;
    if (extra && typeof extra === 'object') {
      for (const [key, value] of Object.entries(extra)) {
        if (value !== undefined) this[key] = value;
      }
    }
  }
}
