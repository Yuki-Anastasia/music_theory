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

    const { events } = parseMusicXmlString(xml);

    expect(events).toEqual([
      { time: 0, durationSeconds: 0.5, midiNote: 60, pitchClass: 0, confidence: 1, partLabel: "Music" },
      { time: 0.5, durationSeconds: 0.5, midiNote: 62, pitchClass: 2, confidence: 1, partLabel: "Music" },
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

    const { events } = parseMusicXmlString(xml);

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

    const { events } = parseMusicXmlString(xml);

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

    const { events } = parseMusicXmlString(xml);

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

    const { events } = parseMusicXmlString(xml);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ time: 0, midiNote: 60 }), // voice 1, C4
        expect.objectContaining({ time: 0.5, midiNote: 62 }), // voice 1, D4
        expect.objectContaining({ time: 0, durationSeconds: 1, midiNote: 55 }), // voice 2, G3
      ])
    );
  });

  it("merges multiple parts into one time-sorted stream, tagging each note with its part name", () => {
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

    const { events, partNames } = parseMusicXmlString(xml);

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.midiNote).sort()).toEqual([48, 60]);
    expect(events.every((e) => e.time === 0)).toBe(true);
    expect(new Set(events.map((e) => e.partLabel))).toEqual(new Set(["Music", "Bass"]));
    expect(partNames).toEqual(["Music", "Bass"]);
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

    const { events } = parseMusicXmlString(xml);

    expect(events).toEqual([
      { time: 0, durationSeconds: 0.5, midiNote: 60, pitchClass: 0, confidence: 1, partLabel: "Music" },
    ]);
  });

  it("merges a tied note across a barline into a single event with combined duration", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="start"/></note>
        </measure>
        <measure number="2">
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
      </part>`);

    const { events } = parseMusicXmlString(xml);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ time: 0, durationSeconds: 1, midiNote: 60 });
    expect(events[1]).toMatchObject({ time: 1, midiNote: 62 });
  });

  it("applies <dynamics> marks to subsequent notes' confidence", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <direction><direction-type><dynamics><mf/></dynamics></direction-type></direction>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
          <direction><direction-type><dynamics><ff/></dynamics></direction-type></direction>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
      </part>`);

    const { events } = parseMusicXmlString(xml);

    expect(events[0].confidence).toBeCloseTo(0.65); // mf
    expect(events[1].confidence).toBeCloseTo(0.9); // ff
  });

  it("extracts a notated key-signature timeline from the first part", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions><key><fifths>1</fifths><mode>major</mode></key></attributes>
          <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration></note>
        </measure>
        <measure number="2">
          <attributes><key><fifths>0</fifths><mode>minor</mode></key></attributes>
          <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration></note>
        </measure>
      </part>`);

    const { notatedKeyTimeline } = parseMusicXmlString(xml);

    expect(notatedKeyTimeline).toEqual([
      { time: 0, tonic: 7, mode: "major" }, // 1 sharp -> G major
      { time: 2, tonic: 9, mode: "minor" }, // 0 sharps/flats, minor -> A minor
    ]);
  });

  it("defaults meterTimeline to 4/4 per measure when no <time> is notated", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
        </measure>
        <measure number="2">
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration></note>
        </measure>
      </part>`);

    const { meterTimeline } = parseMusicXmlString(xml);

    // divisions=1, default tempo 120bpm -> 0.5s per quarter note; duration=4 -> 2s per measure.
    expect(meterTimeline).toEqual([
      { time: 0, numerator: 4, denominator: 4 },
      { time: 2, numerator: 4, denominator: 4 },
    ]);
  });

  it("reads <attributes><time> and carries a signature change forward to later bars", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration></note>
        </measure>
        <measure number="2">
          <attributes><time><beats>6</beats><beat-type>8</beat-type></time></attributes>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>6</duration></note>
        </measure>
        <measure number="3">
          <note><pitch><step>E</step><octave>4</octave></pitch><duration>6</duration></note>
        </measure>
      </part>`);

    const { meterTimeline } = parseMusicXmlString(xml);

    // divisions=1, default tempo 120bpm -> 0.5s per quarter note; duration 3 -> 1.5s, duration 6 -> 3s.
    expect(meterTimeline).toEqual([
      { time: 0, numerator: 3, denominator: 4 },
      { time: 1.5, numerator: 6, denominator: 8 },
      { time: 4.5, numerator: 6, denominator: 8 }, // carried forward, no new <time> in measure 3
    ]);
  });

  it("takes meterTimeline from the first part only", () => {
    const xml = scorePartwise(
      `
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration></note>
        </measure>
      </part>
      <part id="P2">
        <measure number="1">
          <attributes><divisions>1</divisions><time><beats>5</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>3</octave></pitch><duration>5</duration></note>
        </measure>
      </part>`,
      `<score-part id="P2"><part-name>Bass</part-name></score-part>`
    );

    const { meterTimeline } = parseMusicXmlString(xml);

    expect(meterTimeline).toEqual([{ time: 0, numerator: 3, denominator: 4 }]);
  });

  it("extracts a notated chord-symbol timeline from <harmony>, including slash chords", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <harmony>
            <root><root-step>C</root-step></root>
            <kind text="">major</kind>
          </harmony>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>
          <harmony>
            <root><root-step>G</root-step></root>
            <kind text="7">dominant</kind>
            <bass><bass-step>B</bass-step></bass>
          </harmony>
          <note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration></note>
        </measure>
      </part>`);

    const { notatedChordTimeline } = parseMusicXmlString(xml);

    expect(notatedChordTimeline).toEqual([
      { time: 0, label: "C" },
      { time: 1, label: "G7/B" },
    ]);
  });

  it("returns null notatedTempoBpm when no <sound tempo> is present", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
      </part>`);
    expect(parseMusicXmlString(xml).notatedTempoBpm).toBeNull();
  });

  it("reads notatedTempoBpm from <sound tempo>", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <direction><sound tempo="140"/></direction>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
      </part>`);
    expect(parseMusicXmlString(xml).notatedTempoBpm).toBe(140);
  });

  it("collects <unpitched> percussion notes as bare onset times, not NormalizedNoteEvents", () => {
    const xml = scorePartwise(`
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><unpitched><display-step>F</display-step><display-octave>5</display-octave></unpitched><duration>1</duration></note>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
          <note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>1</duration></note>
        </measure>
      </part>`);

    const { events, percussionOnsets } = parseMusicXmlString(xml);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ time: 0.5, midiNote: 60 });
    expect(percussionOnsets).toEqual([0, 1]);
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
    expect(parseMusicXmlString(xml).events[0]).toMatchObject({ midiNote: 60 });
  });

  it("falls back to the first .xml entry when there's no container.xml", () => {
    const archive = zipSync({ "score.xml": strToU8(innerXml) });

    const xml = parseMxlArchive(archive.buffer as ArrayBuffer);
    expect(parseMusicXmlString(xml).events[0]).toMatchObject({ midiNote: 60 });
  });
});
