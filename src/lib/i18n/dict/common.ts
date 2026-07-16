import type { Locale } from "../locale";

export const commonDict: Record<
  Locale,
  { brand: string; nav: { home: string; analyze: string; live: string; about: string }; auth: { signIn: string; signUp: string } }
> = {
  ja: {
    brand: "Notewave",
    nav: { home: "ホーム", analyze: "曲を解析する", live: "ライブモード", about: "このサイトについて" },
    auth: { signIn: "ログイン", signUp: "新規登録" },
  },
  en: {
    brand: "Notewave",
    nav: { home: "Home", analyze: "Analyze a song", live: "Live mode", about: "About" },
    auth: { signIn: "Sign in", signUp: "Sign up" },
  },
};
