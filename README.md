# leaflet-starter

![README02](img/README02.png)

Start Leaflet easily.  
- [Leaflet v1.9.4](https://leafletjs.com)  
- [TypeScript v7.0.2](https://www.typescriptlang.org)  
- [Vite v8.3.2](https://vitejs.dev)  
- node v24.21.0
- pnpm v11.9.0

<br>

## Usage

![README03](img/README03.png)

<br>

Install package

Use Node.js v24.21.0 (`.node-version`) and pnpm v11.9.0 (`packageManager`). Install pnpm with `npm install --global pnpm@11.9.0` if needed.
```bash
pnpm install --frozen-lockfile
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

test

Install Chromium before the first test run.

```bash
pnpm exec playwright install chromium
```

```bash
pnpm test
```

Tests cover the site root and `/leaflet-starter/` with local tile fixtures. The subpath build is written to `dist-subpath/`.

`pnpm run test:visual` compares both views with local baselines. Check the map by eye, then create the baselines explicitly with `pnpm run test:visual:update`. A missing baseline fails without creating a file.

<br>

format

`pnpm run format:check` checks formatting without rewriting files.

```bash
pnpm run format
```

<br>
<br>

![README01](img/README01.gif)

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
- [Vite v8.3.2](https://vitejs.dev)  
- node v24.21.0
- pnpm v11.9.0

<br>

## 使用方法

![README03](img/README03.png)

<br>

パッケージインストール

Node.js v24.21.0（`.node-version`）とpnpm v11.9.0（`packageManager`）を使用します。pnpm未導入の場合は`npm install --global pnpm@11.9.0`で導入します。

```bash
pnpm install --frozen-lockfile
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

テスト

初回はテスト用のChromiumをインストールしてください。

```bash
pnpm exec playwright install chromium
```

```bash
pnpm test
```

ローカルのタイルfixtureを使い、サイトのルートと`/leaflet-starter/`配下を検査します。サブパス用のビルド先は`dist-subpath/`です。

`pnpm run test:visual`は両方の表示をローカルのベースラインと比較します。地図を目で確認したあと、`pnpm run test:visual:update`で明示的にベースラインを作成します。ベースラインがない場合はファイルを作成せず失敗します。

<br>

整形

`pnpm run format:check`は、ファイルを書き換えずに整形を確認します。

```bash
pnpm run format
```

<br>
<br>

![README01](img/README01.gif)

<br>

## ライセンス
MIT

Copyright (c) 2018-2026 Yasunori Kirimoto

<br>
