export const PLACE_RESULT_PROVIDERS = new Set(['prior_db', 'osm', 'brave']);

export function providerRowIsError(row = {}) {
  return String(row?.status || '').trim().toLowerCase() === 'error';
}

export function providerRowIsHit(row = {}) {
  return String(row?.status || '').trim().toLowerCase() === 'ok';
}

export function providerRowRan(row = {}) {
  const status = String(row?.status || '').trim().toLowerCase();
  return status !== 'skipped';
}

function providerRowAnswered(row = {}) {
  const status = String(row?.status || '').trim().toLowerCase();
  return status === 'ok' || status === 'empty';
}

export function httpStatusFromReason(reason) {
  const match = String(reason || '').match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : null;
}

export function placeResultProviderRows(providerLog = []) {
  return (Array.isArray(providerLog) ? providerLog : [])
    .filter((row) => PLACE_RESULT_PROVIDERS.has(String(row?.provider || '').trim()));
}

export function providerErrorsFromProviderLog(providerLog = []) {
  return (Array.isArray(providerLog) ? providerLog : [])
    .filter((row) => {
      const provider = String(row?.provider || '').trim();
      return (PLACE_RESULT_PROVIDERS.has(provider) || provider === 'nominatim') && providerRowIsError(row);
    })
    .map((row) => {
      const httpStatus = Number.isFinite(Number(row?.httpStatus))
        ? Number(row.httpStatus)
        : httpStatusFromReason(row?.reason);
      return {
        provider: String(row.provider || '').trim(),
        ...(Number.isFinite(httpStatus) ? { httpStatus } : {}),
        message: String(row?.reason || row?.status || 'error').trim(),
      };
    });
}

export function httpStatusFromError(error, reason) {
  if (Number.isFinite(Number(error?.httpStatus))) return Number(error.httpStatus);
  return httpStatusFromReason(reason);
}

export function placeResultProvidersAnswered(providerLog = []) {
  return placeResultProviderRows(providerLog).filter((row) => providerRowRan(row) && providerRowAnswered(row));
}

export function everyPlaceResultProviderErrored(providerLog = []) {
  const ran = placeResultProviderRows(providerLog).filter((row) => providerRowRan(row));
  return ran.length > 0 && ran.every((row) => providerRowIsError(row));
}
