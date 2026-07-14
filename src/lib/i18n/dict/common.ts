import type { Locale } from "../locale";

export const commonDict: Record<Locale, { brand: string; nav: { home: string; analyze: string; live: string; about: string } }> = {
  ja: {
    brand: "Notewave",
    nav: { home: "ホーム", analyze: "曲を解析する", live: "ライブモード", about: "このサイトについて" },
  },
  en: {
    brand: "Notewave",
    nav: { home: "Home", analyze: "Analyze a song", live: "Live mode", about: "About" },
  },
};
