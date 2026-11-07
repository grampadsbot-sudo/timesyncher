const FLIGHT_OPTION_PREFIX = /^\s*Flight option:\s*/i;
const PIPELINE_DOCUMENTED_OPTION = /^Documented .+ option\b/i;

function text(value) {
  return String(value ?? '').trim();
}

export function stripFlightOptionTitlePrefix(value = '') {
  return text(String(value).replace(FLIGHT_OPTION_PREFIX, ''));
}

export function stripPipelineItineraryStub(value = '') {
  const row = String(value ?? '');
  const trimmed = row.trim();
  if (!trimmed) return '';
  if (PIPELINE_DOCUMENTED_OPTION.test(trimmed)) return '';
  return row;
}
