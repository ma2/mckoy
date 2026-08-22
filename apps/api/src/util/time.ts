/**
 * D1のCURRENT_TIMESTAMPは "YYYY-MM-DD HH:MM:SS" 形式（UTC、オフセット/ミリ秒なし）を返す。
 * タイムスタンプはTEXTとして辞書順比較されるため、JS側で生成する値も必ずこの形式に
 * 合わせること（形式が食い違うと比較結果がおかしくなる）。
 */
export function sqliteTimestamp(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace('T', ' ');
}
