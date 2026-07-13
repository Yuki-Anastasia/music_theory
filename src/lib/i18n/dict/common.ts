import type { Locale } from "../locale";

export const commonDict: Record<Locale, { brand: string; nav: { home: string; analyze: string; live: string } }> = {
  ja: {
    brand: "音楽の数学",
    nav: { home: "ホーム", analyze: "曲を解析する", live: "ライブモード" },
  },
  en: {
    brand: "Music Math",
    nav: { home: "Home", analyze: "Analyze a song", live: "Live mode" },
  },
};
