import { useCallback, useRef, useState } from 'react';

type Props = {
  shareToken: string;
};

type ToastTone = '' | 'ok' | 'error';

export function SharedAudioButton({ shareToken }: Props) {
  const canRecord =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof window.MediaRecorder !== 'undefined';

  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = '') => {
    setToast({ message, tone });
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setToast(null), tone === 'error' ? 6500 : 4200);
  }, []);

  const preferredType = useCallback(() => {
    const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return options.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
  }, []);

  const blobToDataUrl = useCallback((blob: Blob) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Could not read audio note.'));
      reader.readAsDataURL(blob);
    });
  }, []);

  const submitRecording = useCallback(
    async (blob: Blob) => {
      setBusy(true);
      showToast('Sending voice note...');
      try {
        const maxBytes = 4 * 1024 * 1024;
        if (blob.size > maxBytes) {
          throw new Error('Audio note is too large. Please keep recordings under about 45 seconds.');
        }
        const audioDataUrl = await blobToDataUrl(blob);
        const durationSeconds = startedAtRef.current
          ? Math.round((Date.now() - startedAtRef.current) / 1000)
          : null;
        const response = await fetch(`/api/shared/${encodeURIComponent(shareToken)}/audio-note`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ audioDataUrl, durationSeconds }),
        });
        const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!response.ok || result.ok === false) {
          throw new Error(result.error || 'Could not send voice note.');
        }
        showToast('Voice note queued for this itinerary.', 'ok');
      } catch (error: unknown) {
        showToast(error instanceof Error ? error.message : 'Could not send voice note.', 'error');
      } finally {
        setBusy(false);
        setRecording(false);
        startedAtRef.current = 0;
      }
    },
    [blobToDataUrl, shareToken, showToast],
  );

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const toggle = useCallback(async () => {
    if (!canRecord || !shareToken || busy) return;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      return;
    }
    try {
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = preferredType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener(
        'stop',
        () => {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          stopTracks();
          recorderRef.current = null;
          void submitRecording(blob);
        },
        { once: true },
      );
      startedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
      showToast('Recording...');
    } catch (error: unknown) {
      stopTracks();
      setRecording(false);
      showToast(error instanceof Error ? error.message : 'Microphone access was blocked.', 'error');
    }
  }, [busy, canRecord, preferredType, shareToken, showToast, stopTracks, submitRecording]);

  return (
    <>
      <button
        type="button"
        className={`ts-shared-audio-button${recording ? ' is-recording' : ''}`}
        data-ts-shared-audio="1"
        aria-label="Record voice note"
        title={
          canRecord
            ? 'Record voice note'
            : 'Microphone recording is unavailable in this browser'
        }
        disabled={!canRecord || !shareToken || busy}
        onClick={() => void toggle()}
      >
        {recording ? (
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="1.8" fill="currentColor" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <path d="M12 19v3" />
          </svg>
        )}
      </button>
      {toast ? (
        <div
          className={`ts-shared-audio-toast${toast.tone ? ` ${toast.tone}` : ''}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
