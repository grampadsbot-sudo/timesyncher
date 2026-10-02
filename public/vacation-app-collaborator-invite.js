window.tsBindCollaboratorInvite = function bindCollaboratorInviteForm({ sessionToken, safe, currentTrip, getMessagesEl }) {
  const form = document.getElementById('collaboratorInviteForm');
  if (!form) return;

  const errorBox = document.getElementById('collaboratorInviteError');
  const dialog = document.getElementById('collaboratorInviteDialog');

  async function submitInvite(event) {
    if (event) event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const trip = currentTrip();
    button.disabled = true;
    errorBox.hidden = true;
    try {
      const data = new FormData(form);
      const res = await fetch(`/api/vacation-itinerary?app=1&session=${encodeURIComponent(sessionToken)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'collaborator-invite',
          tripId: trip?.id || undefined,
          seats: [{ name: data.get('name'), email: data.get('email') }],
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) throw new Error(payload.error || payload.inviteResult?.error || 'Unable to send collaborator invite.');
      form.reset();
      const messages = getMessagesEl();
      const email = payload.inviteResult?.inviteeEmail || payload.seats?.[0]?.email || data.get('email');
      messages.insertAdjacentHTML('beforeend', `<article class="bubble"><small>TimeSyncher</small>${safe(`Invite sent to ${email}.`)}</article>`);
      messages.scrollTop = messages.scrollHeight;
      if (dialog) dialog.close();
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = error.message || 'Unable to send collaborator invite.';
    } finally {
      button.disabled = false;
    }
  }

  form.addEventListener('submit', submitInvite);

  window.tsOpenCollaboratorInvite = function openCollaboratorInvite() {
    if (dialog && typeof dialog.showModal === 'function') {
      errorBox.hidden = true;
      dialog.showModal();
      return;
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    form.querySelector('input[name="name"]')?.focus();
  };
};
