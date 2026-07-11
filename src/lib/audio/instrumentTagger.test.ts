import { describe, it, expect } from "vitest";
import { parseClassMapCsv, bucketizeScores } from "./instrumentTagger";

describe("parseClassMapCsv", () => {
  it("extracts display names in index order, dropping the header row", () => {
    const csv = ["index,mid,display_name", "0,/m/09x0r,Speech", "1,/m/0lyf6,Singing", "2,/m/018vs,Guitar"].join(
      "\n"
    );
    expect(parseClassMapCsv(csv)).toEqual(["Speech", "Singing", "Guitar"]);
  });

  it("handles a trailing newline", () => {
    const csv = "index,mid,display_name\n0,/m/09x0r,Speech\n";
    expect(parseClassMapCsv(csv)).toEqual(["Speech"]);
  });
});

describe("bucketizeScores", () => {
  const classNames = ["Speech", "Singing", "Guitar", "Piano"];

  it("returns an empty array for no frames", () => {
    expect(bucketizeScores([], 0.48, classNames)).toEqual([]);
  });

  it("averages frames within a bucket and keeps the top-K classes", () => {
    // 2 frames at 0.5s hop -> 1 bucket at bucketSec=1 (framesPerBucket = round(1/0.5) = 2).
    // Values chosen as binary-exact fractions (halves/quarters) to avoid float rounding.
    const frameScores = [
      [0.0, 1.0, 0.5, 0.0],
      [0.0, 0.5, 0.0, 0.0],
    ];
    const windows = bucketizeScores(frameScores, 0.5, classNames, 1, 2);
    expect(windows).toHaveLength(1);
    expect(windows[0].time).toBe(0);
    expect(windows[0].tags).toEqual([
      { label: "Singing", score: 0.75 },
      { label: "Guitar", score: 0.25 },
    ]);
  });

  it("starts later buckets at the correct time offset", () => {
    const frameScores = [
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ];
    const windows = bucketizeScores(frameScores, 0.5, classNames, 1, 1);
    expect(windows.map((w) => w.time)).toEqual([0, 1]);
    expect(windows[0].tags[0].label).toBe("Speech");
    expect(windows[1].tags[0].label).toBe("Singing");
  });
});
