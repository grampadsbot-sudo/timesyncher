function keepsake(vac, artifacts) {
  const pdf = artifacts?.keepsakePdf
    ? `<a class="admin-action" data-keepsake-pdf href="/api/admin/customers/x/artifacts/keepsake-pdf" download>Keepsake PDF</a>` : '';
  return `<div class="admin-keepsake-actions">${pdf}<a class="admin-action" data-keepsake-generate>Generate</a></div>`;
}

function dialog(vac, artifacts) {
  const pdf = `<a class="admin-action" data-dialog-pdf href="/api/admin/customers/x/artifacts/dialog-pdf" download>Dialog PDF</a>`;
  return `<div class="admin-dialog-head">${pdf}</div>`;
}