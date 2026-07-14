import type { Locale } from "../locale";
import type { NoteValueName } from "@/lib/theory/rhythmAnalysis";

interface ExpressionTabDict {
  rhythm: {
    label: string;
    heading: string;
    description: string;
    tempo: {
      title: string;
      theory: string;
      theoryNotated: string;
      value: (bpm: number) => string;
      noteLow: string;
      noteOk: string;
      noteNotated: string;
    };
    complexity: { title: string; theory: string; value: (bits: string, max: string) => string; note: string };
    noteValues: { heading: string; countLabel: (n: number) => string; names: Record<NoteValueName, string> };
  };
  meter: {
    label: string;
    heading: string;
    description: string;
    meterCard: { title: string; theory: string; note: string };
    syncopation: {
      title: string;
      theory: string;
      value: (score: string) => string;
      noteBase: string;
      noteWithPercussion: (n: number) => string;
    };
    alignment: {
      title: string;
      theoryNotated: string;
      theoryDetected: string;
      value: (pct: string) => string;
      note: string;
    };
  };
  dynamics: {
    label: string;
    heading: string;
    description: string;
    title: string;
    theory: string;
    value: (avg: string, range: string) => string;
    crescendo: string;
    diminuendo: string;
    stable: string;
  };
  mood: { label: string; heading: string; description: string };
  arc: {
    label: string;
    heading: string;
    description: string;
    consonanceRow: string;
    dynamicsRow: string;
    moodRow: string;
  };
}

export const expressionTabDict: Record<Locale, ExpressionTabDict> = {
  ja: {
    rhythm: {
      label: "EXPRESSION — RHYTHM",
      heading: "リズムの推定",
      description: "オンセット密度の自己相関からテンポを、音価分布のシャノンエントロピーからリズムの複雑さを推定します。",
      tempo: {
        title: "テンポ",
        theory: "オンセット密度の自己相関によるビート周期推定",
        theoryNotated: "楽譜に記譜されたテンポ記号の値をそのまま採用",
        value: (bpm) => `約 ${bpm} BPM`,
        noteLow: "確信度低(規則的な拍を検出できず)",
        noteOk: "規則的な拍を検出",
        noteNotated: "記譜値のため確信度は最も高い",
      },
      complexity: {
        title: "リズムの複雑さ",
        theory: "音価分布のシャノンエントロピー",
        value: (bits, max) => `${bits} bit (最大 ${max} bit)`,
        note: "値が大きいほど音価のバリエーションが豊富",
      },
      noteValues: {
        heading: "音価の内訳(テンポから逆算した推定)",
        countLabel: (n) => `${n}音`,
        names: {
          whole: "全音符",
          dottedHalf: "付点2分音符",
          half: "2分音符",
          dottedQuarter: "付点4分音符",
          quarter: "4分音符",
          quarterTriplet: "4分3連符",
          dottedEighth: "付点8分音符",
          eighth: "8分音符",
          eighthTriplet: "8分3連符",
          dottedSixteenth: "付点16分音符",
          sixteenth: "16分音符",
          sixteenthTriplet: "16分3連符",
          thirtySecond: "32分音符",
        },
      },
    },
    meter: {
      label: "EXPRESSION — METER",
      heading: "拍子・シンコペーションの推定",
      description: "記譜された拍子から拍節の強弱グリッドを作り、強拍を避けて弱拍・裏拍に音を置く度合いを簡易的に推定しています(Longuet-Higgins & Lee, 1984のシンコペーション概念を単純化したもので、GTTMのような完全な拍節理論ではありません)。楽譜からのインポートでのみ利用できます。",
      meterCard: {
        title: "拍子",
        theory: "記譜された拍子記号(<attributes><time> / MasterBar)",
        note: "拍子が変わる箇所ごとに区切って表示",
      },
      syncopation: {
        title: "シンコペーション指数",
        theory: "Longuet-Higgins & Lee (1984) のシンコペーション概念を単純化",
        value: (score) => `${score}(0〜1)`,
        noteBase: "値が大きいほど、強拍を避けて弱拍・裏拍に音を置く傾向",
        noteWithPercussion: (n) => `値が大きいほど、強拍を避けて弱拍・裏拍に音を置く傾向。ドラムパートのオンセット(${n}個)も拍節解析に含めています。`,
      },
      alignment: {
        title: "和声変化と拍節の整合",
        theoryNotated: "記譜されたコードネーム基準",
        theoryDetected: "検出された和音基準(Tonnetz軌跡、1秒窓の粗い推定)",
        value: (pct) => `${pct}%`,
        note: "和音が変わる瞬間のうち、強拍/準強拍で起きている割合",
      },
    },
    dynamics: {
      label: "EXPRESSION — DYNAMICS",
      heading: "強弱の推定",
      description: "音符振幅(Basic Pitchのamplitude)の区間平均から、曲全体の強弱とその傾向を推定します。",
      title: "強弱(ダイナミクス)",
      theory: "音符振幅の区間平均",
      value: (avg, range) => `平均 ${avg} / レンジ ${range}`,
      crescendo: "だんだん強くなる傾向",
      diminuendo: "だんだん弱くなる傾向",
      stable: "おおむね一定",
    },
    mood: {
      label: "EXPRESSION — MOOD",
      heading: "感情・印象の推定(Russellの感情円環モデル)",
      description: "キー(長調/短調)・協和度・テンポ・強弱・リズムの複雑さから合成した仮説的な推定です。検証済みの感情認識モデルではありません。",
    },
    arc: {
      label: "EXPRESSION — ARC",
      heading: "曲の推移",
      description: "固定の等分割ではなく、メロディーのピッチクラス分布の変化(novelty検出)から区間の切れ目を検出しています。明確な変化点が無い曲は1区間のままになります。各区間で協和度・強弱・感情推定を再計算し、上の4つの測定値が曲の中でどう動いていくかを見るためのものです。",
      consonanceRow: "協和度(平均Γ)",
      dynamicsRow: "強弱(平均音量)",
      moodRow: "感情推定",
    },
  },
  en: {
    rhythm: {
      label: "EXPRESSION — RHYTHM",
      heading: "Rhythm Estimates",
      description: "Tempo is estimated from the autocorrelation of onset density, and rhythmic complexity from the Shannon entropy of the note-duration distribution.",
      tempo: {
        title: "Tempo",
        theory: "Beat-period estimate via autocorrelation of onset density",
        theoryNotated: "Taken directly from the tempo marking notated in the score",
        value: (bpm) => `~${bpm} BPM`,
        noteLow: "Low confidence (no regular beat detected)",
        noteOk: "Regular beat detected",
        noteNotated: "Highest possible confidence — this is the notated value",
      },
      complexity: {
        title: "Rhythmic Complexity",
        theory: "Shannon entropy of the note-duration distribution",
        value: (bits, max) => `${bits} bit (max ${max} bit)`,
        note: "Higher means a richer variety of note durations",
      },
      noteValues: {
        heading: "Note-Value Breakdown (estimated from tempo)",
        countLabel: (n) => `${n} notes`,
        names: {
          whole: "Whole note",
          dottedHalf: "Dotted half note",
          half: "Half note",
          dottedQuarter: "Dotted quarter note",
          quarter: "Quarter note",
          quarterTriplet: "Quarter-note triplet",
          dottedEighth: "Dotted eighth note",
          eighth: "Eighth note",
          eighthTriplet: "Eighth-note triplet",
          dottedSixteenth: "Dotted sixteenth note",
          sixteenth: "Sixteenth note",
          sixteenthTriplet: "Sixteenth-note triplet",
          thirtySecond: "Thirty-second note",
        },
      },
    },
    meter: {
      label: "EXPRESSION — METER",
      heading: "Meter & Syncopation Estimates",
      description: "Builds a metric strong/weak-beat grid from the notated meter and estimates, in a simplified way, how much the song avoids strong beats in favor of weak/off-beats (a simplification of Longuet-Higgins & Lee's 1984 syncopation concept, not a full metrical theory like GTTM). Available for score imports only.",
      meterCard: {
        title: "Meter",
        theory: "Notated time signature (<attributes><time> / MasterBar)",
        note: "Shown split at each point the meter changes",
      },
      syncopation: {
        title: "Syncopation Index",
        theory: "A simplification of Longuet-Higgins & Lee's (1984) syncopation concept",
        value: (score) => `${score} (0–1)`,
        noteBase: "Higher means a stronger tendency to avoid strong beats in favor of weak/off-beats",
        noteWithPercussion: (n) => `Higher means a stronger tendency to avoid strong beats in favor of weak/off-beats. Percussion-part onsets (${n}) are also included in the metric analysis.`,
      },
      alignment: {
        title: "Harmonic Rhythm / Meter Alignment",
        theoryNotated: "Based on notated chord symbols",
        theoryDetected: "Based on detected chords (Tonnetz trajectory, coarse 1s-window estimate)",
        value: (pct) => `${pct}%`,
        note: "Fraction of chord changes that land on a strong/secondary-strong beat",
      },
    },
    dynamics: {
      label: "EXPRESSION — DYNAMICS",
      heading: "Dynamics Estimates",
      description: "The song's overall dynamics and trend, estimated from windowed averages of note amplitude (Basic Pitch's amplitude).",
      title: "Dynamics",
      theory: "Windowed average of note amplitude",
      value: (avg, range) => `Avg ${avg} / Range ${range}`,
      crescendo: "Gradually getting louder",
      diminuendo: "Gradually getting softer",
      stable: "Roughly constant",
    },
    mood: {
      label: "EXPRESSION — MOOD",
      heading: "Mood Estimate (Russell's Circumplex Model)",
      description: "A hypothesis-generating estimate combining key (major/minor), consonance, tempo, dynamics, and rhythmic complexity. Not a validated emotion-recognition model.",
    },
    arc: {
      label: "EXPRESSION — ARC",
      heading: "Song Arc",
      description: "Rather than a fixed equal split, section boundaries are detected from changes in the melody's pitch-class distribution (novelty detection). A song with no clear change point stays as a single section. Consonance, dynamics, and mood are recomputed per section to show how the four measures above move through the song.",
      consonanceRow: "Consonance (avg Γ)",
      dynamicsRow: "Dynamics (avg loudness)",
      moodRow: "Mood estimate",
    },
  },
};
