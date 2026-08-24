// フロントエンドのエントリポイント。ルーティングは App.tsx に集約している。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// 本番・ステージングは同じビルド成果物を別Workerにデプロイする構成（仕様書 §3
// 「デプロイ環境」）のため、ビルド時ではなくホスト名から実行時に判定する。
// タブを見分けやすくするため、ステージング環境ではタイトルを変える（issue #48）。
if (location.hostname.includes('staging')) {
  document.title = 'Mckoy-staging';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
