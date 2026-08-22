// wrangler.toml で定義したbinding/varsに対応する型。DB以外はすべて
// WebAuthnのrpID/origin設定とCookieのSecure属性切り替えに使う。

export type Bindings = {
  DB: D1Database;
  RP_ID: string;
  RP_NAME: string;
  RP_ORIGIN: string;
  SESSION_COOKIE_SECURE: string;
};
