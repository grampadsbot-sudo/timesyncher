/** Playwright runs string page.evaluate bodies at top level; bare `return` is a SyntaxError. */
export function playwrightEvaluateReturnScript(prelude, resultExpression) {
  const pre = String(prelude || '').trim();
  const expr = String(resultExpression || '').trim();
  if (!expr) throw new Error('playwrightEvaluateReturnScript: resultExpression required');
  return `(() => { ${pre} return (${expr}); })()`;
}
