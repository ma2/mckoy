import { Link } from 'react-router-dom';

type BreadcrumbItem = {
  label: string;
  /** 省略すると現在地として非リンク表示になる（通常は末尾の1件のみ）。 */
  to?: string;
};

/** 講座一覧 > 講座名 > 小説一覧 のような階層ナビゲーション（issue #22）。 */
export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumb" aria-label="パンくずリスト">
      {items.map((item, i) => (
        <span key={i}>
          {item.to ? <Link to={item.to}>{item.label}</Link> : item.label}
          {i < items.length - 1 && <span className="breadcrumb__sep"> ＞ </span>}
        </span>
      ))}
    </nav>
  );
}
