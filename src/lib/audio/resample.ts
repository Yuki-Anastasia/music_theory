"use client";

/**
 * Resamples an AudioBuffer to mono at an arbitrary target sample rate via
 * OfflineAudioContext (resample + downmix in one render pass). Used by
 * songAnalyzer.ts to match Basic Pitch's required 22050Hz input rate.
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
