import { Link } from 'react-router-dom';

const GITHUB_URL = 'https://github.com/ma2/mckoy';

/**
 * 認証済みページ共通のフッター（issue #66）。使い方はヘッダーからここへ移し、
 * 「生徒の使い方」「講師の使い方」の2つに分けている。「Mckoyについて」には
 * ソースコード（GitHub）へのリンクとコピーライトを置く。
 */
export default function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer__inner">
        <nav className="app-footer__group" aria-label="使い方">
          <h2 className="app-footer__heading">使い方</h2>
          <Link to="/help/student">生徒の使い方</Link>
          <Link to="/help/instructor">講師の使い方</Link>
        </nav>
        <div className="app-footer__group">
          <h2 className="app-footer__heading">Mckoyについて</h2>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            GitHub（ソースコード）
          </a>
          <span className="app-footer__copyright">© {new Date().getFullYear()} Mckoy</span>
        </div>
      </div>
    </footer>
  );
}
