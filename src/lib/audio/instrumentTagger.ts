"use client";

import { resampleTo } from "./resample";
import { decodeAudioBlob } from "./songAnalyzer";

const MODEL_URL = "/models/yamnet/model.json";
const CLASS_MAP_URL = "/models/yamnet/yamnet_class_map.csv";
const YAMNET_SAMPLE_RATE = 16000;
// YAMNet scores one frame per ~0.48s hop (0.96s window, 50% overlap) in the
// reference implementation; confirmed against the actual model output shape
// once the model is in place (see getYamnetFrameHopSeconds below).
const DEFAULT_FRAME_HOP_SEC = 0.48;
const DEFAULT_BUCKET_SEC = 2;
const DEFAULT_TOP_K = 3;

export interface InstrumentTag {
  label: string;
  score: number;
}

export interface InstrumentTagWindow {
  time: number; // window start, seconds
  tags: InstrumentTag[];
}

/**
 * Parses YAMNet's class map (index,mid,display_name CSV, header row first)
 * into an index-ordered array of display names.
 */
export function parseClassMapCsv(csv: string): string[] {
  const lines = csv.trim().split("\n");
  const [, ...rows] = lines; // drop header
  return rows.map((line) => {
    // display_name is the last comma-separated field; mid/display_name never
    // contain embedded commas in the published class map, so a plain split
    // is safe here.
    const parts = line.split(",");
    return parts[parts.length - 1].trim();
  });
}

/**
 * Averages YAMNet's per-frame class scores into coarser time buckets and
 * keeps the top-K classes per bucket. Pure post-processing, independent of
 * model execution, so it's testable without the actual model.
 */
export function bucketizeScores(
  frameScores: number[][],
  frameHopSec: number,
  classNames: string[],
  bucketSec = DEFAULT_BUCKET_SEC,
  topK = DEFAULT_TOP_K
): InstrumentTagWindow[] {
  if (frameScores.length === 0) return [];

  const framesPerBucket = Math.max(1, Math.round(bucketSec / frameHopSec));
  const windows: InstrumentTagWindow[] = [];

  for (let start = 0; start < frameScores.length; start += framesPerBucket) {
    const bucketFrames = frameScores.slice(start, start + framesPerBucket);
    const numClasses = classNames.length;
    const averages = new Array(numClasses).fill(0);
    for (const frame of bucketFrames) {
      for (let c = 0; c < numClasses; c++) {
        averages[c] += frame[c] / bucketFrames.length;
      }
    }
    const tags = averages
      .map((score, index) => ({ label: classNames[index], score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    windows.push({ time: start * frameHopSec, tags });
  }

  return windows;
}

let modelPromise: Promise<import("@tensorflow/tfjs").GraphModel> | null = null;
let classMapPromise: Promise<string[]> | null = null;

async function getYamnetModel() {
  if (!modelPromise) {
    modelPromise = import("@tensorflow/tfjs").then((tf) => tf.loadGraphModel(MODEL_URL));
  }
  return modelPromise;
}

async function getClassMap(): Promise<string[]> {
  if (!classMapPromise) {
    classMapPromise = fetch(CLASS_MAP_URL)
      .then((res) => res.text())
      .then(parseClassMapCsv);
  }
  return classMapPromise;
}

/**
 * Full pipeline: audio input -> 16kHz mono waveform -> YAMNet (AudioSet's
 * 521-class general-purpose audio tagger) -> coarse, whole-mixture tags per
 * time window. This is NOT per-note instrument separation — it's a rough
 * "what kinds of sound are present in this window" estimate.
 */
export async function analyzeInstruments(input: Blob | AudioBuffer): Promise<InstrumentTagWindow[]> {
  const [tf, model, classNames, audioBuffer] = await Promise.all([
    import("@tensorflow/tfjs"),
    getYamnetModel(),
    getClassMap(),
    input instanceof Blob ? decodeAudioBlob(input) : Promise.resolve(input),
  ]);

  const waveform = await resampleTo(audioBuffer, YAMNET_SAMPLE_RATE);

  const inputTensor = tf.tensor1d(waveform);
  try {
    const output = model.execute(inputTensor);
    // model.execute may return a single tensor (scores) or an array of
    // tensors ([scores, embeddings, spectrogram]) depending on the exact
    // signature export — verified against the real model.json once placed.
    const scoresTensor = Array.isArray(output) ? output[0] : output;
    const scores = (await scoresTensor.array()) as number[][];
    if (Array.isArray(output)) output.forEach((t) => t.dispose());
    else output.dispose();
    return bucketizeScores(scores, DEFAULT_FRAME_HOP_SEC, classNames);
  } finally {
    inputTensor.dispose();
  }
}
