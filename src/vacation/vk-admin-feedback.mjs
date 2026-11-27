const LEGACY_SURVEY_LABEL = 'end of chat (legacy)';

function scoreRowsForCheckpoint(ssr, checkpointId) {
  if (!ssr?.checkpoints) return [];
  return ssr.checkpoints.filter((row) => row.checkpoint === checkpointId);
}

export function buildFeedbackArtifact({
  story,
  played,
  reactions = [],
  ssr = null,
} = {}) {
  const tripId = String(played?.tripId || '').trim();
  const checkpoints = reactions.map((reaction) => {
    const scores = scoreRowsForCheckpoint(ssr, reaction.checkpoint);
    return {
      id: reaction.checkpoint,
      label: reaction.label,
      prompt: reaction.prompt,
      reply: reaction.reply,
      constructs: reaction.constructs || [],
      ...(reaction.price_usd != null ? { price_usd: reaction.price_usd } : {}),
      ...(reaction.keepsake_status ? { keepsake_status: reaction.keepsake_status } : {}),
      ...(reaction.keepsake_note ? { keepsake_note: reaction.keepsake_note } : {}),
      scores: scores.map((row) => ({
        construct: row.construct,
        expected_score: row.expected_score,
        pmf_by_rating: row.pmf_by_rating,
      })),
    };
  });
  const legacySurvey = played?.survey && typeof played.survey === 'object'
    ? { label: played.survey.label || LEGACY_SURVEY_LABEL, ...played.survey }
    : null;
  return {
    schema: 'vk-admin-feedback/v1',
    at: new Date().toISOString(),
    customer: {
      name: String(story?.customer?.name || '').trim(),
      story_id: String(story?.story_id || '').trim(),
      email_alias: String(story?.customer?.email_alias || '').trim(),
    },
    vacation: {
      tripId,
      destination: String(story?.destination || '').trim(),
    },
    primary_rating_method: ssr ? 'ssr' : null,
    checkpoints,
    legacy_trip_survey: legacySurvey,
    ssr: ssr ? {
      method: ssr.method,
      anchor_set_version: ssr.anchor_set_version,
      summary_by_construct: ssr.summary_by_construct,
    } : null,
  };
}

export function feedbackRollupRows(artifacts) {
  const rows = [];
  for (const entry of artifacts || []) {
    const customer = entry.payload?.customer?.name || entry.customerLabel || '';
    const vacation = entry.payload?.vacation?.tripId || entry.tripId || '';
    const destination = entry.payload?.vacation?.destination || entry.destination || '';
    for (const checkpoint of entry.payload?.checkpoints || []) {
      for (const score of checkpoint.scores?.length ? checkpoint.scores : [{ construct: '', expected_score: null }]) {
        rows.push({
          customer,
          vacation,
          destination,
          checkpoint: checkpoint.label || checkpoint.id,
          question: checkpoint.prompt,
          rating: score.expected_score,
          comment: checkpoint.reply,
          construct: score.construct,
        });
      }
      if (!checkpoint.scores?.length) {
        rows.push({
          customer,
          vacation,
          destination,
          checkpoint: checkpoint.label || checkpoint.id,
          question: checkpoint.prompt,
          rating: null,
          comment: checkpoint.reply,
          construct: '',
        });
      }
    }
    const legacy = entry.payload?.legacy_trip_survey;
    if (legacy) {
      const questions = Array.isArray(legacy.questions) ? legacy.questions : [];
      const answers = Array.isArray(legacy.answers) ? legacy.answers : [];
      questions.forEach((question, index) => {
        rows.push({
          customer,
          vacation,
          destination,
          checkpoint: legacy.label || LEGACY_SURVEY_LABEL,
          question,
          rating: null,
          comment: answers[index] || '',
          construct: '',
        });
      });
    }
  }
  return rows;
}
