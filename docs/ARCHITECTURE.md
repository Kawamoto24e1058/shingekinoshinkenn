# アーキテクチャ ＆ 連携仕様

3 つのコンポーネントを **Firebase (Firestore)** のリアルタイム DB で繋ぐ。
各担当は **「Firestore のどのフィールドを読み書きするか」だけ** を合意すれば、中身は独立して開発できる。

プロジェクト全体の発表向け説明は [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) を参照。

---

## 全体構成

```
   ┌─────────────────────────┐         ┌─────────────────────────┐
   │  iPhone（タッキー）      │         │  Web ブラウザ（はる）    │
   │  ios-app/                │         │  web-parent/             │
   │                          │         │                          │
   │  CoreMotion で抜刀検知   │         │  MediaPipe で骨格追跡    │
   │  CoreHaptics で振動演出  │         │  構え完了を判定・送信    │
   │  drawn を送信            │         │  武器選択・score を送信  │
   └───────────┬──────────────┘         └────────────┬─────────────┘
               │ 抜刀完了 (drawn)                    │ 構え完了 (ready)・斬撃スコア
               ▼                                     ▼
        ┌──────────────────────────────────────────────────┐
        │              Firebase / Firestore                 │
        │        （リアルタイムの共有ステート）             │
        └──────────────────────────────────────────────────┘
               ▲                                     ▲
               │ 画面ラフ（SwiftUI）                 │ 状態を購読して描画
   ┌───────────┴──────────────┐         ┌────────────┴─────────────┐
   │  iPhone UI（タッキー）   │         │  PC 大画面（みずき）     │
   │  SwiftUI 画面            │         │  web-parent/             │
   │  スタート/選択/待機      │         │  HP ゲージ・スコア・演出 │
   └──────────────────────────┘         └──────────────────────────┘
```

- **書き込む人**：Web（武器選択・構え完了 ready・斬撃スコア・試合進行）／iPhone（抜刀完了 drawn）
- **読む人**：PC 大画面（全状態を購読して描画）／必要なら iPhone UI も購読
- 全員が同じ `matchId` を見ることで、1 つの試合状態を共有する。

---

## Firestore データモデル（たたき台）

> まずはシンプルに「1 試合 ＝ 1 ドキュメント」で始める。足りなければ拡張する。

### コレクション `matches`

```
matches/{matchId}
{
  status:    "selecting" | "drawing" | "playing" | "finished",  // 試合フェーズ
  startedAt: <timestamp>,
  winner:    "p1" | "p2" | null,

  players: {
    p1: {
      name:    "はる",
      hp:      100,
      score:   0,
      weapon:  "katana" | "taiken" | "sabers",               // 選択中の武器（Web が書く）
      drawn:   false,                                       // 抜刀が完了したか（iPhone が書く）
      drawnAt: <ISO8601 string>,                            // 抜刀完了時刻（iPhone が書く）
      ready:   false,                                       // 構え完了か（Web が書く）
      readyAt: <ISO8601 string>                             // 構え完了時刻（Web が書く）
    },
    p2: {
      name:    "タッキー",
      hp:      100,
      score:   0,
      weapon:  "katana" | "taiken" | "sabers",
      drawn:   false,
      drawnAt: <ISO8601 string>,
      ready:   false,
      readyAt: <ISO8601 string>
    }
  }
}
```

> 武器選択は **Web 側**で行い、プレイヤーごとに `players.pX.weapon` へ書く。試合単位の `weapon` は持たない。
> **構え完了（`ready`）は Web が MediaPipe で判定して書く**。iPhone はその結果を読むだけ。
> iOS は抜刀完了（CoreHaptics による振動演出＋`drawn` / `drawnAt` の送信）に集中する。

### （任意）斬撃イベントのログ `matches/{matchId}/events`

演出のトリガや判定の見直しに使いたければ、斬撃を 1 件ずつ残す。

```
matches/{matchId}/events/{eventId}
{
  player:    "p1" | "p2",
  type:      "draw" | "slash",
  power:     <number>,      // 振りの速度など
  createdAt: <timestamp>
}
```

---

## 誰がどのフィールドを触るか（責任分界）

| フィールド | 書く人 | 読む人 | 意味 |
|------------|--------|--------|------|
| `players.pX.weapon` | Web（はる・みずき） | iOS / 大画面 | 選択中の武器 |
| `players.pX.drawn` / `drawnAt` | iOS（タッキー） | Web / 大画面 | 抜刀完了（振動付き）／その時刻 |
| `players.pX.ready` / `readyAt` | Web（はる）     | iOS / 大画面 | 構え完了（MediaPipe 判定）／その時刻 |
| `players.pX.score` | PC カメラ（はる） | 大画面（みずき） | 斬撃の累計 |
| `players.pX.hp` | バトルロジック（はる） | 大画面（みずき） | 残り HP |
| `status` | 進行役（はる） | 全員 | 試合フェーズ |
| `winner` | バトルロジック（はる） | 大画面（みずき） | 勝者 |

> **原則：1 つのフィールドを書くのは 1 担当だけ。** 読むのは誰でも OK。
> 現状はデモ優先で、iOS から Firestore REST API を直接叩く暫定実装がある。正式な責任分界では、Firestore 連携は はる と調整する。
> こうしておくと「誰の更新で壊れたか」が一目で分かり、コンフリクトも論理的な競合も起きにくい。

---

## 試合フェーズ（status）の遷移

```
selecting ──(Webで武器選択完了)──▶ drawing ──(両者 drawn かつ ready)──▶ playing ──(HP 0 / 時間切れ)──▶ finished
```

- `selecting`：Web 側でプレイヤーの武器を選ぶ
- `drawing`：iOS の抜刀完了（`drawn`）と Web の構え完了判定（`ready`）を両方待つ
- `playing`：斬撃の判定中。スコア／HP が動く
- `finished`：勝敗確定。`winner` を表示

---

## 連携テスト（最初の合流ポイント）

繋ぎ込みは **小さく 1 往復** から。いきなり全機能を繋がない。

1. **Web**：武器選択で `matches/test/players/p1/weapon` を更新できる。
2. **タッキー**：iOS のボタン送信で `matches/test/players/p1/drawn` を更新できる。
3. **はる**：MediaPipe で構え姿勢を検知し `matches/test/players/p1/ready` を更新できる。
4. **みずき**：大画面（Web）でそのフィールドを購読し、準備状態と武器選択がバトル画面に反映される。
5. **はる**：PC カメラの斬撃検知で `players/p1/score` を `+1` できる。
5. 3 者が同じ `matchId = "test"` を見て、値が連動することを確認する。

ここまで通れば、あとは各自が中身を作り込むだけ。

---

## 決めておくべきこと（着手前に 5 分で合意）

- [ ] Firebase プロジェクト名・`matchId` の決め方（固定 `"test"` で始める？）
- [x] 武器はプレイヤー共通か、各自で選ぶか → **各自選択**で確定（`players.pX.weapon` を Web が書く）
- [ ] HP の初期値・斬撃 1 回のダメージ量
- [ ] 抜刀の「速さ」をスコアに反映するか、有無だけで良いか
- [ ] Firestore セキュリティルール（ハッカソン中は **テストモード**で可。公開前に要見直し）
