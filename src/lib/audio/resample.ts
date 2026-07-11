"use client";

/**
 * Resamples an AudioBuffer to mono at an arbitrary target sample rate via
 * OfflineAudioContext (resample + downmix in one render pass). Shared by
 * songAnalyzer.ts (22050Hz, for Basic Pitch) and instrumentTagger.ts
 * (16000Hz, for YAMNet) — each model has its own required input rate.
 */
export async function resampleTo(buffer: AudioBuffer, targetSampleRate: number): Promise<Float32Array> {
  const length = Math.ceil(buffer.duration * targetSampleRate);
  const offlineCtx = new OfflineAudioContext(1, length, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}
