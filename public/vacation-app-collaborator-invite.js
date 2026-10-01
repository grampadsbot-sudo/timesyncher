window.tsBindCollaboratorInvite = function bindCollaboratorInviteForm({ sessionToken, safe, currentTrip, getMessagesEl }) {
  const form = document.getElementById('collaboratorInviteForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = document.getElementById('collaboratorInviteError');
    const button = form.querySelector('button[type="submit"]');
    const trip = currentTrip();
    if (!trip?.id) {
      errorBox.hidden = false;
      errorBox.textContent = 'No vacation is selected yet.';
      return;
    }
    button.disabled = true;
    errorBox.hidden = true;
    try {
      const data = new FormData(form);
      const res = await fetch(`/api/vacation-itinerary?app=1&session=${encodeURIComponent(sessionToken)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'open-seats',
          tripId: trip.id,
          seats: [{ name: data.get('name'), email: data.get('email') }],
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Unable to send collaborator invite.');
      form.reset();
      const messages = getMessagesEl();
      messages.insertAdjacentHTML('beforeend', `<article class="bubble"><small>TimeSyncher</small>${safe(`Invite sent to ${payload.seats?.[0]?.email || data.get('email')}.`)}</article>`);
      messages.scrollTop = messages.scrollHeight;
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = error.message || 'Unable to send collaborator invite.';
    } finally {
      button.disabled = false;
    }
  });
};
