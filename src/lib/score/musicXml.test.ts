// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parseMusicXmlString, parseMxlArchive } from "./musicXml";

function scorePartwise(partsXml: string, extraPartListEntries = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
    ${extraPartListEntries}
  </part-list>
  ${partsXml}
</score-partwise>`;
}

describe("parseMusicXmlString", () => {
  it("converts a simple single-voice part to NormalizedNoteEvents (divisions/tempo -> seconds)", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <direction><sound tempo="120"/></direction>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
      </part>`);

    const events = parseMusicXmlString(xml);

    expect(events).toEqual([
      { time: 0, durationSeconds: 0.5, midiNote: 60, pitchClass: 0, confidence: 1 },
      { time: 0.5, durationSeconds: 0.5, midiNote: 62, pitchClass: 2, confidence: 1 },
    ]);
  });

  it("resolves sharps and flats via <alter>", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration></note>
          <note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
      </part>`);

    const events = parseMusicXmlString(xml);

    expect(events.map((e) => e.midiNote)).toEqual([66, 70]); // F#4, Bb4
  });

  it("places <chord/> notes at the same onset as the preceding note", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>
          <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
          <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration></note>
        </measure>
      </part>`);

    const events = parseMusicXmlString(xml);

    expect(events.map((e) => e.time)).toEqual([0, 0, 0]);
    expect(events.map((e) => e.midiNote)).toEqual([60, 64, 67]); // C major triad
  });

  it("advances the cursor for <rest/> without emitting a note event", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><rest/><duration>1</duration></note>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
      </part>`);

    const events = parseMusicXmlString(xml);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ time: 0.5, midiNote: 60 });
  });

  it("uses <backup> to rewind the cursor for a second voice sharing the measure", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
          <backup><duration>2</duration></backup>
          <note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration><voice>2</voice></note>
        </measure>
      </part>`);

    const events = parseMusicXmlString(xml);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ time: 0, midiNote: 60 }), // voice 1, C4
        expect.objectContaining({ time: 0.5, midiNote: 62 }), // voice 1, D4
        expect.objectContaining({ time: 0, durationSeconds: 1, midiNote: 55 }), // voice 2, G3
      ])
    );
  });

  it("merges multiple parts into one time-sorted stream", () => {
    const xml = scorePartwise(
      `
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
      </part>
      <part id="P2">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration></note>
        </measure>
      </part>`,
      `<score-part id="P2"><part-name>Bass</part-name></score-part>`
    );

    const events = parseMusicXmlString(xml);

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.midiNote).sort()).toEqual([48, 60]);
    expect(events.every((e) => e.time === 0)).toBe(true);
  });

  it("skips grace notes without generating an event or advancing the cursor", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
      </part>`);

    const events = parseMusicXmlString(xml);

    expect(events).toEqual([{ time: 0, durationSeconds: 0.5, midiNote: 60, pitchClass: 0, confidence: 1 }]);
  });

  it("rejects score-timewise documents", () => {
    const xml = `<?xml version="1.0"?><score-timewise version="4.0"></score-timewise>`;
    expect(() => parseMusicXmlString(xml)).toThrow(/score-partwise/);
  });

  it("throws a readable error for malformed XML", () => {
    expect(() => parseMusicXmlString("<score-partwise><part-list></score-partwise>")).toThrow();
  });
});

describe("parseMxlArchive", () => {
  const innerXml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"/></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>`;

  it("resolves the root file via META-INF/container.xml", () => {
    const containerXml = `<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>`;
    const archive = zipSync({
      "META-INF/container.xml": strToU8(containerXml),
      "score.xml": strToU8(innerXml),
    });

    const xml = parseMxlArchive(archive.buffer as ArrayBuffer);
    expect(parseMusicXmlString(xml)[0]).toMatchObject({ midiNote: 60 });
  });

  it("falls back to the first .xml entry when there's no container.xml", () => {
    const archive = zipSync({ "score.xml": strToU8(innerXml) });

    const xml = parseMxlArchive(archive.buffer as ArrayBuffer);
    expect(parseMusicXmlString(xml)[0]).toMatchObject({ midiNote: 60 });
  });
});
