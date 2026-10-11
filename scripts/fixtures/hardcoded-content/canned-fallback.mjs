try {
  loadPlaces();
} catch (error) {
  return KEEPSAKE_LIST_FILL;
}
if (!results) return 'Welcome aboard';
