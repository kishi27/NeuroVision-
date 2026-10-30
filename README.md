# Gabor Touch Standard — Phase 1

NeuroVisionをベースにした、ブラウザだけで動作するGaborパッチのペア探しです。
基準コミット: `12a27c89593680109a61e1c2f726ca6cec878c16`。

## 遊び方

1. 「トレーニングを開始」を押します。
2. 3列×4行の12パネルから、同じ模様を2枚ずつタップします。
3. 一致した2枚はその位置で操作不可になります。不一致は400ms後に選択解除されます。
4. 6ペア完成で次のラウンドへ進み、12ラウンド終了でCOMPLETEになります。
5. 「もう一度」でラウンド1から新しいセッションを開始できます。

Standardのみです。記録・履歴・音声・バックエンド通信はありません。

## 起動

プロジェクトルートから、既存の検証用Python環境を使います。

```powershell
.\.validation\venv\Scripts\python.exe -m http.server 8080 --bind 127.0.0.1 --directory frontend
```

`http://127.0.0.1:8080/` をブラウザで開きます。
Pythonはローカルで静的ファイルを配信するためだけに使用します。
別の静的HTTPサーバーでも利用でき、FastAPI・SQLite・ビルド・npm installは不要です。
ES Modulesを使用するため、HTMLを直接ダブルクリックする方式ではなくHTTPで開いてください。

同じWi-Fi上のAndroidから試す場合は、PC側で以下のように起動します。

```powershell
.\.validation\venv\Scripts\python.exe -m http.server 8080 --bind 0.0.0.0 --directory frontend
```

Android Chromeから `http://<PCのLAN内IPv4アドレス>:8080/` を開きます。
PCのファイアウォール設定によって接続許可が必要になる場合があります。
Cloudflare公開・PWA化はPhase 1では行いません。

## 仮Standardパラメータ

`frontend/js/session.js` の `TEMPORARY_STANDARD_PARAMETERS` に集約しています。
**正式仕様ではありません。Androidアプリとの比較後に人間が調整するための仮設定です。**

| パラメータ | 仮設定 |
|---|---|
| orientation / theta | 0°、30°、60°、90°、120°、150°（描画時はrad） |
| wavelength / lambda | 0.25（空間周波数は1/lambda） |
| phase / psi | 0 rad |
| contrast | 0.75 |
| sizeInDegrees | 2 |
| sigma | 0.38 |
| gamma | 1 |
| pixelsPerDegree | 192（描画用の相対スケール） |

物理的な画面キャリブレーションは行っていないため、視角の実測値ではありません。
共通値は `common`、種類ごとの上書きは `patches` に記載できます。
元の `gabor.js` の数式は維持しています。6種類をCanvasへ各1回描き、
同一ペアの2枚に同じ生成済み画像をコピーします。

## 構成

- `frontend/index.html`: 最小ヘッダーとトレーニング表示領域。
- `frontend/js/main.js`: 開始カードを直接初期化。
- `frontend/js/session.js`: ペア判定、12ラウンド、描画画像の共用、COMPLETE・再開始。
- `frontend/js/gabor.js`: 既存のCanvasによるGabor生成（変更なし）。
- `frontend/css/style.css`: 元のUIスタイルと、Gabor Touch用の配置・選択状態。
- `frontend/js/session.test.js`: ゲーム状態の自動テスト。

旧Calibration・Dashboard・Settings・Reminders・Staircase・API・backendファイルは
保管していますが、Gabor Touchからは読み込みません。Chart.jsのCDN読み込みも外しました。
Google FontsのInter / Outfitの通信は残しています。
旧起動用 `.bat` はバックエンドを起動するため、上記の静的サーバー起動方法を使用してください。
旧検証資料と今回のブラウザ検証は `output/playwright/` にあり、アプリの依存関係ではありません。

## テスト

Node.jsの標準テスト機能を使い、新しいライブラリは不要です。

```powershell
node --test frontend/js/session.test.js
```

ブラウザでは開始から12ラウンド・COMPLETE・再開始まで、360 / 390 / 412pxと
デスクトップを確認します。Android実機での模様の見比べは人間が行ってください。

## ライセンス

NeuroVision由来のMITライセンスです。既存の `LICENSE` を変更せず保持しています。
著作権表示: Copyright (c) 2026 NeuroVision Project。
