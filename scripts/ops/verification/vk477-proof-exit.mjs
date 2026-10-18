export function bindingProofShouldFail(state) {
  if (state.boundVerdict?.overall !== 'PASS') return true;
  if (state.staticVerdict?.overall === 'PASS') return true;
  if (!state.contractOk) return true;
  if (!state.collector?.ok) return true;
  if (state.wrongRuntimeCollector?.ok) return true;
  if (state.captureCollector && !state.captureCollector.ok) return true;
  return false;
}

export function legacyBindingProofWouldFail(state) {
  const staleOk = state.wrongRuntimeCollector?.ok;
  return (
    state.boundVerdict?.overall !== 'PASS'
    || state.staticVerdict?.overall === 'PASS'
    || !state.contractOk
    || !state.collector?.ok
    || !staleOk
  );
}
