"use client";

export interface PcmRecorderHandle {
  stop: () => AudioBuffer;
}

/**
 * Records the mic as raw PCM via a ScriptProcessorNode and hands back a
 * ready-to-use AudioBuffer on stop — no MediaRecorder/WebM/Opus container
 * involved. This sidesteps a real Chrome bug where
 * AudioContext.decodeAudioData() throws "Unable to decode audio data" for
 * MediaRecorder-produced WebM/Opus blobs of short mic recordings.
 */
export async function startPcmRecording(): Promise<PcmRecorderHandle> {
  // Chrome/Edge enable echoCancellation/noiseSuppression/autoGainControl by
  // default, which apply a voice-call-tuned high-pass filter that can strip
  // content below ~80-100Hz — enough to lose A0 (27.5Hz) entirely before it
  // reaches this code. Disable them for analysis, where the raw signal matters.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);

  // ScriptProcessorNode is deprecated but still universally supported and
  // far simpler here than shipping a separate AudioWorklet module for a
  // one-off capture.
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  // Must reach the destination for onaudioprocess to fire in every browser,
  // but gain 0 keeps the mic from being audible while recording.
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;

  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);

  return {
    stop: () => {
      processor.disconnect();
      source.disconnect();
      silentGain.disconnect();
      stream.getTracks().forEach((track) => track.stop());

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combined = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const buffer = audioContext.createBuffer(1, totalLength, audioContext.sampleRate);
      buffer.copyToChannel(combined, 0);
      void audioContext.close();
      return buffer;
    },
  };
}
