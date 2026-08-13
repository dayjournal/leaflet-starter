# leaflet-starter

![README02](img/README02.png)

Start Leaflet easily.  
- [Leaflet v1.9.4](https://leafletjs.com)  
- [TypeScript v7.0.2](https://www.typescriptlang.org)  
- [Vite v8.2.1](https://vitejs.dev)  
- node v24.4.1
- pnpm v11.9.0

<br>

## Usage

![README03](img/README03.png)

<br>

Install package (pnpm is pinned via the `packageManager` field — run `corepack enable` once if you don't have pnpm)
```bash
pnpm install
```

<br>

build
```bash
pnpm run build
```

<br>

dev
```bash
pnpm run dev
```

<br>

test (builds first — Playwright runs against `vite preview` of `dist/`)
```bash
pnpm test
```

The visual test is a separate command because it compares against a local baseline that is intentionally not committed — create it once, then compare:
```bash
pnpm run test:visual:update
pnpm run test:visual
```

First time only: `pnpm exec playwright install chromium`.

---

<br>
<br>

![README01](img/README01.gif)

<br>

## Repository layout & automation

- `dist/` — local build output (gitignored)
- `img/` — images used by this README
- `e2e/screenshots/before.png` / `after.png` — pre- and post-update map renders, refreshed by the deps workflow and embedded side by side in the update PR body; `after.png` shows an image diff under Files changed only when rendering actually changed
- CI (`.github/workflows/ci.yml`) builds and runs the Playwright smoke test on every PR and push to main
- GitHub Pages (`.github/workflows/pages.yml`) rebuilds the demo from source and redeploys it after CI succeeds on main — a commit that fails CI is never published, and no build output is committed
- A daily workflow (`.github/workflows/deps-autoupdate.yml`) bumps leaflet/typescript/vite behind build + e2e gates and opens a PR; when every check passes, auto-merge is armed and GitHub merges the PR once CI passes on it (which tags and publishes a GitHub Release), and Slack is notified of the result either way — on any failure nothing is merged. The package version follows the bundled Leaflet version (hence `1.9.4`); non-Leaflet updates increment a fourth segment instead (e.g. `1.9.4.1`).

<br>

## License
MIT

Copyright (c) 2018-2026 Yasunori Kirimoto

<br>

---

<br>

### Japanese

<br>

# Leaflet スターター

![README02](img/README02.png)

Leafletを手軽に始める
- [Leaflet v1.9.4](https://leafletjs.com)  
- [TypeScript v7.0.2](https://www.typescriptlang.org)  
- [Vite v8.2.1](https://vitejs.dev)  
- node v24.4.1
- pnpm v11.9.0

<br>

## 使用方法

![README03](img/README03.png)

<br>

パッケージインストール（pnpm のバージョンは `packageManager` フィールドで固定されています。pnpm が未導入なら `corepack enable` を一度実行してください）

```bash
pnpm install
```

<br>

ビルド

```bash
pnpm run build
```

<br>

開発

```bash
pnpm run dev
```

<br>

テスト（ビルドも実行されます — Playwright は `dist/` を配信する `vite preview` に対して実行されます）

```bash
pnpm test
```

ビジュアルテストは、意図的にコミットしていないローカルのベースライン画像と比較するため別コマンドです。初回に作成してから比較してください。

```bash
pnpm run test:visual:update
pnpm run test:visual
```

初回のみ `pnpm exec playwright install chromium` も必要です。

<br>
<br>

![README01](img/README01.gif)

<br>

## リポジトリ構成と自動化

- `dist/` — ローカルビルド出力（gitignore 対象）
- `img/` — この README 用の画像
- `e2e/screenshots/before.png` / `after.png` — 更新前後の地図レンダリング。依存更新ワークフローが毎回更新し、PR 本文に並べて埋め込みます。描画が実際に変わったときだけ `after.png` の画像差分が Files changed に現れます
- CI（`.github/workflows/ci.yml`）が PR と main への push ごとにビルドと Playwright スモークテストを実行
- GitHub Pages（`.github/workflows/pages.yml`）が main の CI 成功後にソースからデモを再ビルドして再デプロイ — CI に失敗したコミットは公開されず、ビルド成果物もコミットしません
- 日次ワークフロー（`.github/workflows/deps-autoupdate.yml`）が leaflet/typescript/vite をビルド + e2e のゲート付きで更新し PR を作成。すべてのチェックに合格すると自動マージが予約され、PR 上の CI 合格をもって GitHub がマージします（タグ付けと GitHub Release も自動）。結果は成功・失敗を問わず Slack に通知され、エラー時はマージされません。パッケージのバージョンは同梱の Leaflet バージョンに追従し（そのため `1.9.4`）、Leaflet 以外のみの更新では4桁目を増分します（例: `1.9.4.1`）。

<br>

## ライセンス
MIT

Copyright (c) 2018-2026 Yasunori Kirimoto

<br>
