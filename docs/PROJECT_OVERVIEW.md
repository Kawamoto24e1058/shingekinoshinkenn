# プロジェクト概要 / SHINGEKI NO SHINKEN

`SHINGEKI NO SHINKEN` は、Web ブラウザ、iOS Native、Firebase Firestore を組み合わせたハイブリッド・アミューズメントバトルシステムである。

Web ブラウザをメイン筐体、iPhone をスマートデバイス剣、Firestore をリアルタイムなマッチステート同期基盤として扱い、カメラによるポーズ認識、スマホによる物理モーション検知、クラウド経由の状態同期を 1 つの対戦体験に統合する。

```
Web ブラウザ（Mac / 大画面）
  - MediaPipe による全身骨格キャプチャ
  - 幾何学ポーズ判定
  - Web 側での武器選択
  - Canvas / CSS によるバトル演出
  - Firestore onSnapshot による状態購読

          <====> Firebase Firestore <====>

iOS Native（スマホ剣）
  - CoreMotion による加速度・ジャイロ検知
  - 抜刀 / スイング検知
  - CoreHaptics による振動演出
  - Firestore への ready / drawn イベント送信
```

---

## アーキテクチャ概要

本システムは次の 3 つのモジュールで構成する。

| モジュール | 役割 | 主な技術 |
|------------|------|----------|
| Web クライアント | カメラ入力、武器選択、バトル画面、スコア・HP 表示、演出統括 | HTML / CSS / JavaScript, MediaPipe Pose, Canvas |
| iOS アプリ | スマホを剣に見立てた物理入力、振動フィードバック、抜刀イベント送信 | Swift, SwiftUI, CoreMotion, CoreHaptics |
| Firebase Firestore | Web と iOS 間のマッチステート同期、スコア更新、リアルタイム購読 | Firestore, onSnapshot, increment |

既存ゲームエンジンのラッパーには依存せず、Web と iOS の得意領域を分けて実装している。Web は「見る・選ぶ・判定する」メイン筐体、iOS は「握る・振る」物理コントローラーとして設計する。

---

## Web クライアント

Web クライアントは、リアルタイム・多人数バトルパネルとして動作する。カメラ画像からプレイヤー 2 人の骨格を検出し、武器選択、状態遷移、バトル UI、演出を統括する。

### 主な機能

- MediaPipe Pose による全身 33 点ランドマークの取得
- 関節角度や関節間距離を使ったルールベースのポーズ分類
- Web 側での武器選択と `players.pX.weapon` の Firestore 反映
- Firestore の `onSnapshot` による ready / drawn / score / hp / status の購読
- Canvas / CSS による斬撃演出、HP ゲージ、スコアボード表示
- 状態遷移の多重発火を防ぐ非同期ステートガード

### 技術的な工夫

学習済みモデルを追加でロードするのではなく、MediaPipe が返す座標から関節角度や相対位置を計算する。肩・肘・手首のベクトル内積から肘角度を求め、手首の高さや両手首の距離を組み合わせて、脱力状態と構え状態を軽量に分類する。

また、ミラー反転したビデオと Canvas オーバーレイの重なり問題に対して、CSS 3D レイヤーを使い Canvas を前面へ固定する。重い `shadowBlur` を避け、線幅と色で視認性を確保することで、描画フリーズを抑える。

---

## iOS アプリ

iOS アプリは、スマホ剣デバイスコントローラーとして動作する。手元の iPhone を物理コントローラー化し、加速度・ジャイロ入力とハプティクスを使って抜刀や斬撃の手応えを再現する。

### 主な機能

- `CMMotionManager` による加速度の高頻度サンプリング
- 加速度マグニチュードによるスイング検知
- CoreHaptics による武器別の常時ハム、加速度連動、斬撃スパイク
- Firestore REST API による `ready` / `drawn` イベント送信
- 将来的な CoreMotion 自動検知からの Firestore 自動送信

### 責任範囲

剣の選択は Web 側で行う。iOS は選択済みの武器に応じた振動・物理入力・抜刀状態の送信に集中する。

現状の簡易テストでは iOS 側ボタン送信が残っているが、最終仕様では `players.pX.weapon` は Web 側が書き、iOS は `players.pX.ready` / `players.pX.drawn` を送る。

---

## Firestore

Firestore は、Web と iOS を疎結合に同期するサーバレス・リアルタイムゲームサーバーとして使う。

### 主な用途

- `matches/{matchId}` のマッチステート同期
- Web 側の武器選択結果の共有
- iOS 側の抜刀完了・構え完了イベントの共有
- Web 側のスコア加算とバトル UI 反映
- `onSnapshot` によるリアルタイム状態購読
- `increment(1)` によるスコアのアトミック加算

---

## データシーケンス

1. **Selecting（武器選択）**  
   Web カメラ / Web UI がポーズや選択 UI から武器を決定し、`players.pX.weapon` を Firestore に送る。選択完了後、状態を `drawing` へ進める。

2. **Drawing（抜刀）**  
   iOS アプリが加速度を検知し、抜刀・構え完了イベントとして `players.pX.ready = true` または `players.pX.drawn = true` を Firestore に送る。Web は `onSnapshot` で両者の状態を監視し、条件がそろったら `playing` へ進める。

3. **Playing（バトル）**  
   Web カメラがスイングを検知し、`players.pX.score` を `increment(1)` で更新する。大画面 UI は score / hp / status の変化を即時に反映する。

---

## 技術スタック

| 領域 | 技術 |
|------|------|
| Web | HTML5, CSS3, JavaScript ES Modules |
| AI / Computer Vision | MediaPipe Pose, MediaPipe Camera Utils |
| Rendering | HTML5 Canvas 2D, CSS 3D Layering |
| iOS | Swift, SwiftUI, CoreMotion, CoreHaptics |
| Backend | Firebase Firestore, onSnapshot, increment |

---

## 開発実績

- Firebase との連携テストに成功し、Web / iOS 間のデータ送受信を確認
- バトル画面でプレイヤーの準備状態と武器選択が反映されることを確認
- iOS 側で CoreHaptics の武器別振動とスイング反応を実装
- Web 側で大画面 UI、スコア演出、斬撃エフェクト、音再生の土台を実装
- Firestore のリアルタイム購読と状態遷移ガードにより、多重発火を抑える構成を採用

---

## 今後の整理ポイント

- Web 本体は `web-parent/` に集約済み。残るルート直下の旧プロトタイプ（`a.html` 他）を整理・削除するか判断する
- iOS の暫定 `weapon` 送信を削除し、Web 側選択へ完全に一本化する
- `selecting` / `drawing` / `playing` / `finished` の status 名をコードとドキュメントで統一する
- 発表スライド向けに、Web・iOS・Firestore の役割分担を 1 枚に整理する
