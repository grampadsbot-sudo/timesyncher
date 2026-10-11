type Props = {
  shareToken: string;
};

export function SharedAudioButton({ shareToken }: Props) {
  const canRecord =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  return (
    <button
      type="button"
      className="ts-shared-audio-button"
      data-ts-shared-audio="1"
      aria-label="Record voice note"
      title={
        canRecord
          ? 'Record voice note'
          : 'Microphone recording is unavailable in this browser'
      }
      disabled={!canRecord || !shareToken}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <path d="M12 19v3" />
      </svg>
    </button>
  );
}
