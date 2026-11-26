export const CANONICAL_VIEW_ACCESS_FACT = 'View access lets family and friends see the vacation days without signing in.';
export const CANONICAL_EDIT_ACCESS_FACT = 'Edit access lets them add notes after the account holder approves an email invite.';

export function canonicalCollaboratorAccessFacts() {
  return {
    view_access: CANONICAL_VIEW_ACCESS_FACT,
    edit_access: CANONICAL_EDIT_ACCESS_FACT,
  };
}