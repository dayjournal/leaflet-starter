# leaflet-starter

![README02](img/README02.png)

Start Leaflet easily.  
- [Leaflet v1.9.4](https://leafletjs.com)  
- [TypeScript v6.0.3](https://www.typescriptlang.org)  
- [Vite v8.1.0](https://vitejs.dev)  
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

test (build first — Playwright runs against `vite preview` of `dist/`)
```bash
pnpm run build
pnpm test
```

The visual test compares against a local baseline that is intentionally not committed; create it once with `pnpm exec playwright test --update-snapshots`. First time only: `pnpm exec playwright install chromium`.

---

<br>
<br>

![README01](img/README01.gif)

<br>

## Repository layout & automation

- `dist/` — local build output (gitignored)
- `img/` — images used by this README
- `e2e/screenshots/map.png` — canonical map render, overwritten by the deps workflow; it shows up in a PR's Files changed only when rendering actually changed (absent = pixel-identical)
- CI (`.github/workflows/ci.yml`) builds and runs the Playwright smoke test on every PR and push to main
- GitHub Pages (`.github/workflows/pages.yml`) rebuilds the demo from source and redeploys it on every push to main — no build output is committed
- A daily workflow (`.github/workflows/deps-autoupdate.yml`) bumps leaflet/typescript/vite behind build + e2e gates and opens a PR; merging it tags and publishes a GitHub Release automatically. The package version follows the bundled Leaflet version (hence `1.9.4`); non-Leaflet updates increment a fourth segment instead (e.g. `1.9.4.1`).

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
- [TypeScript v6.0.3](https://www.typescriptlang.org)  
- [Vite v8.1.0](https://vitejs.dev)  
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

テスト（先にビルドが必要 — Playwright は `dist/` を配信する `vite preview` に対して実行されます）

```bash
pnpm run build
pnpm test
```

ビジュアルテストは、意図的にコミットしていないローカルのベースライン画像と比較します。初回は `pnpm exec playwright test --update-snapshots` で作成してください。初回のみ `pnpm exec playwright install chromium` も必要です。

<br>
<br>

![README01](img/README01.gif)

<br>

## リポジトリ構成と自動化

- `dist/` — ローカルビルド出力（gitignore 対象）
- `img/` — この README 用の画像
- `e2e/screenshots/map.png` — 地図描画の正典スクリーンショット。依存更新ワークフローが毎回上書きし、描画が実際に変わったときだけ PR の Files changed に現れます（現れない = ピクセル一致）
- CI（`.github/workflows/ci.yml`）が PR と main への push ごとにビルドと Playwright スモークテストを実行
- GitHub Pages（`.github/workflows/pages.yml`）が main への push ごとにソースからデモを再ビルドして再デプロイ — ビルド成果物はコミットしません
- 日次ワークフロー（`.github/workflows/deps-autoupdate.yml`）が leaflet/typescript/vite をビルド + e2e のゲート付きで更新し PR を作成。マージすると自動でタグ付けと GitHub Release が行われます。パッケージのバージョンは同梱の Leaflet バージョンに追従し（そのため `1.9.4`）、Leaflet 以外のみの更新では4桁目を増分します（例: `1.9.4.1`）。

<br>

## ライセンス
MIT

Copyright (c) 2018-2026 Yasunori Kirimoto

<br>
