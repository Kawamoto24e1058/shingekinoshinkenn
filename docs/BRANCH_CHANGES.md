# ブランチ別変更まとめ

2026-05-31 時点でローカルに見えているブランチと、`main` に取り込まれた主な変更内容の整理。

現状、`git branch --no-merged main` の結果は空で、未マージのローカルブランチはない。下記は `main` にマージ済み、または `main` の履歴に含まれている変更を、作業単位ごとにまとめたもの。

---

## Web / フロントエンド系

### `画面完成`（commit `43f9563`）

大画面表示の初期版を追加した変更。

- `a.html` を追加
- `script.js` / `styles.css` を追加
- スコアボード、斬撃演出、テスト操作ボタンの土台を実装
- `sounds/` 配下に斬撃・大剣・ライトセーバー系の音源を追加

### `dが最新版です`（commit `bf30079`）

Web フロントエンドの最新版画面を追加した変更。

- `b.html` / `c.html` / `d.html` を追加
- `d.html` を最新版候補として追加
- ガイド画面、武器表示、バトル画面、リザルト画面の構成を拡張
- `script.js` を更新

### `今できている分です`（commit `e84dd27`）

Web フロントエンドの調整変更。

- `c.html` / `d.html` の画面調整
- `script.js` のテスト操作・音再生まわりを調整

### 現在の Web 側の扱い

- 現行の Web 本体は `web-parent/`（`index.html` / `script.js` / `style.css` / `sounds/`）に集約済み（MediaPipe + Firebase 連携の正式版）
- ルート直下の `a.html` / `b.html` / `c.html` / `d.html` / `script.js` / `styles.css` / `sounds/` は初期プロトタイプで、参考用に残置
- 剣選択は Web 側が担当し、Firestore の `players.pX.weapon` に反映する
- iOS 側は剣選択を担当せず、`ready` / `drawn` の物理イベント送信に集中する

---

## iOS / ハプティクス・モーション系

### `feature/ios-haptics-demo`（merge commit `22e91da`）

CoreHaptics の振動デモを追加した変更。

- `HapticManager.swift` を追加・拡張
- `ContentView.swift` に振動デモ UI を追加
- 複数サンプルボタンでハプティクスを確認できる状態を作成

### `ios: 武器別ハム + 加速度連動 + 振り検出を実装`（commit `2c272b4`）

スマホ剣としての体験を強化した変更。

- `WeaponType.swift` を追加
- `MotionManager.swift` を追加
- 武器別の常時ハム、加速度連動、振り検出を実装
- `ContentView.swift` に武器ピッカー、加速度ゲージ、構える／おさめる操作を追加
- `ios-app/TAKI.md` に振動デモ構成を記録

### `ios: ライトセーバの振り音を無編集でスピーカー再生`（commit `6ac00a5`）

ライトセーバーの振り音を CoreHaptics の AudioCustom と同期させた変更。

- `ライトセーバ.mp3` を Xcode project のリソースに追加
- `HapticManager.swift` で音源登録と再生処理を追加
- `WeaponType.swift` に音源参照を追加

### `ios: 振り検出をエッジ検出+ヒステリシス化し1振り1音に`（commit `6613721`）

振り検出の多重発火を抑えるための改善。

- 加速度のしきい値超えだけでなく、エッジ検出とヒステリシスを導入
- 1 回の振りで 1 回だけ音・振動が鳴るように調整

### `ios: 振り検出/モーション/ゲージの軽微な修正`（commit `babbee7`）

モーション検知と UI 表示の微調整。

- `MotionManager.swift` の処理調整
- `HapticManager.swift` の振り検出まわりを修正
- `ContentView.swift` の加速度ゲージ表示を調整
- `ios-app/TAKI.md` に進捗を追記

---

## Firebase / 連携系

### `ios: FirestoreConfig の plist ローダーと .gitignore 除外を追加`（commit `9625fae`）

Firestore REST API 連携の設定読み込みを追加した変更。

- `FirestoreConfig.swift` を追加
- `FirestoreConfig.example.plist` を追加
- `FirestoreConfig.plist` を `.gitignore` に追加
- Firebase の projectId / apiKey / matchId / playerId をローカル設定から読む構成を追加

### `ios: Firestore に実データ（ready/drawn + 武器）を送るボタンを追加`（commit `62e30a3`）

iOS から Firestore へ簡易イベント送信できるようにした変更。

- `FirestoreEventSender.swift` を追加
- `ContentView.swift` に送信ボタンを追加
- `ready` / `drawn` の送信テストを実装
- `shingekinoshinkennTests.swift` に URL / body 生成などのテストを追加

注意：この時点では iOS 側から `weapon` も送る暫定実装が含まれていた。現在の仕様では、剣選択は Web 側に寄せるため、iOS からの `weapon` 送信は削除または無視する。

### `docs: Firestore に送る実データ仕様をドキュメントに反映`（commit `86b6e7c`）

Firestore に送るフィールドをドキュメントに反映した変更。

- `docs/ARCHITECTURE.md` に ready / drawn / weapon / timestamp の仕様を追記
- `ios-app/TAKI.md` に Firestore REST 直叩き版の使い方を追記

現在の整理では、`players.pX.weapon` は Web 側が書く責任に変更済み。

---

## ドキュメント・運用系

### `claude/zealous-pascal-4fac76`（commit `5cb7f09`）

セットアップ手順を役割移管に合わせて更新した変更。

- `docs/SETUP.md` を更新
- iOS 側の担当範囲、SwiftUI 担当移管、Firebase 連携の注意を整理

### `claude/dreamy-lewin-d76df3`（commit `0fa3710`）

サウンド再生仕様と追加アイデアを追記した変更。

- `ios-app/TAKI.md` にサウンド仕様を追記
- `SoundManager` 追加案、音源ファイル規約、切り分けチェックリストを整理
- 空間オーディオ、Apple Watch ガードなどの余力アイデアを追加
- `HapticManager.swift` にデバッグログを追加

### `claude/unruffled-sutherland-988c03` / `claude/loving-elgamal-d73b98`

秘密情報を Git 管理から除外するための変更。

- `.gitignore` に Firebase 設定、環境変数、秘密鍵、Xcode 個人設定などの除外ルールを追加
- `GoogleService-Info.plist` や `FirestoreConfig.plist` を公開リポジトリに入れない方針を明確化

### `claude/vigorous-booth-57f04d`（commit `c350547`）

現状コードとドキュメントのズレを修正した変更。

- `README.md` の `TAKI.md` リンクを修正
- Xcode project のパスを実体に合わせて修正
- `ios-app/TAKI.md` の現状説明を更新
- `ライトセーバ.mp3` を Git 管理対象に追加

---

## 現在の整理方針

- Web 側は、武器選択、MediaPipe ポーズ検出、スコア加算、バトル画面表示を担当する
- iOS 側は、CoreMotion による物理入力、CoreHaptics による振動、ready / drawn イベント送信を担当する
- Firestore は、両者の状態をつなぐリアルタイム共有ステートとして使う
- ブランチ運用は、`main` への直接 push ではなく、ブランチ作成 → Pull Request → レビュー → マージを基本とする
- Web 本体は `web-parent/` に集約済み。ルート直下の旧プロトタイプ（`a.html` 他）は参考用に残置
