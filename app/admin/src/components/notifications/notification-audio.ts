/**
 * One shared AudioContext for the whole panel. Browsers block audio until the
 * document has had a user gesture, so the provider calls `unlockNotificationAudio`
 * from the first pointer/key event and every later chime reuses the same context
 * instead of constructing a new one per notification.
 */

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (context) return context;

  const ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!ctor) return null;

  try {
    context = new ctor();
  } catch {
    return null;
  }

  return context;
}

export function unlockNotificationAudio() {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume().catch(() => {});
}

/** Short two-note chime. Failures are silent: sound is never load-bearing. */
export function playChime() {
  const audio = getContext();
  if (!audio) return;

  try {
    if (audio.state === "suspended") void audio.resume().catch(() => {});

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
    gain.connect(audio.destination);

    [880, 1174].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(audio.currentTime + index * 0.12);
      oscillator.stop(audio.currentTime + index * 0.12 + 0.12);
    });
  } catch {
    // Audio unavailable or blocked; the notification itself still shows.
  }
}
