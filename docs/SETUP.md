# 環境構築（セットアップ）

各自、自分の担当に関係するセクションを進めてください。全員共通の「Git」と「Firebase」は最初に目を通すこと。

---

## 0. 共通：リポジトリの取得

```bash
git clone <このリポジトリの URL>
cd shingekinoshinkenn
```

ブランチの切り方は [BRANCH_STRATEGY.md](BRANCH_STRATEGY.md) を参照。

---

## 1. iOS アプリ（タッキー / たき）

> `ios-app/` は **センサー・振動・スマホUI（SwiftUI）まで、タッキーが一括で担当**（スマホUIはみずきから移管）。

**担当範囲**
- **CoreMotion**：傾き・加速度の検知、構え／抜刀完了の判定
- **CoreHaptics**：武器ごとの振動演出
- **SwiftUI**：抜刀待機画面の UI と、上記ロジックとの結線
- **剣選択**：Web 側で行う。iOS は選択済み武器に応じた振動・ready/drawn 送信を担当する。
- ※ 正式な Firestore 連携は はる と調整する。現状はデモ優先で、iOS から REST API を直接叩くボタン送信を実装済み。

**必要なもの**
- macOS ＋ **Xcode**（最新版推奨）
- **iPhone 実機**（CoreHaptics / CoreMotion はシミュレータで振動・モーションを再現できないため、**実機必須**）
- Apple ID（実機ビルド用の無料の開発者署名で OK）

**手順**
1. `ios-app/shingekinoshinkenn.xcodeproj` を Xcode で開く。
2. `Signing & Capabilities` で Team に自分の Apple ID を設定。
3. iPhone を USB 接続し、ビルドターゲットを実機にして Run（▶）。
4. 初回は iPhone 側で「デベロッパを信頼」する必要がある（設定 → 一般 → VPN とデバイス管理）。

**タッキーの初手**：CoreHaptics で簡単な振動を 1 発鳴らせるか確認する。続けて SwiftUI で画面ラフを 1 枚作ってみる。

---

## 2. PC 側 Web / カメラ（はる・みずき）

現行の Web 本体は `web-parent/`（`index.html` / `script.js` / `style.css` / `sounds/`）に配置されている。  
これが MediaPipe + Firebase 連携を含む正式版。ルート直下の `a.html` / `b.html` / `c.html` / `d.html` / `script.js` / `styles.css` / `sounds/` は初期プロトタイプで、参考用に残してある。

**必要なもの**
- モダンブラウザ（Chrome 推奨）
- Web カメラ（ノート PC 内蔵で可）
- 簡易ローカルサーバ（カメラ／Firebase はファイル直開きだと動かないことがある）

```bash
# web-parent/ を確認する場合（推奨）
cd web-parent && python3 -m http.server 8000
#   → http://localhost:8000/index.html
# 旧プロトタイプを見る場合はルート直下で http.server を起動し /a.html など
```

- **MediaPipe**（はる）：CDN 読み込みで始めるのが速い。手首ランドマークの座標から速度を計算 → 斬撃判定。
- **武器選択**：Web 側でプレイヤーごとの剣を選択し、Firestore の `players.pX.weapon` に反映する。
- **表示側**（みずき）：HP ゲージ・スコアボード、斬撃エフェクト、バトル画面の HTML/CSS から着手。

> カメラ利用は **https か localhost** でないとブラウザがアクセスを許可しないので注意。

---

## 3. Firebase（全員 / セットアップ・iOS連携とも はる 主導）

リアルタイム連携の心臓部。[ARCHITECTURE.md](ARCHITECTURE.md) のデータモデルとセットで読む。

**手順（1 回だけ）**
1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを作成。
2. **Cloud Firestore** を有効化。最初は **テストモード**で開始（※公開前にルール見直し）。
3. アプリを登録して接続情報（config）を取得：
   - **Web（はる・みずき）**：Web アプリを追加 → `firebaseConfig` を取得。
   - **iOS（はる）**：iOS アプリを追加 → `GoogleService-Info.plist` をダウンロードし、Xcode プロジェクトに追加。Swift Package Manager で `firebase-ios-sdk` を追加。※現状の iOS プロジェクトには未導入なので、タッキーと組んで作業（実機・プロジェクトはタッキーの環境）。
4. 接続情報をメンバーに共有（後述の注意あり）。

**最初の動作確認**
- `matches/test` ドキュメントを手動で 1 件作り、3 者からそれぞれ読み書きできるか試す。
- 詳細な連携テスト手順は [ARCHITECTURE.md](ARCHITECTURE.md#連携テスト最初の合流ポイント) を参照。

---

## ⚠️ 秘密情報・個人ファイルの扱い

- `GoogleService-Info.plist` や Web の `firebaseConfig`、API キーは **基本 Git に入れない**運用が望ましい。
  - ハッカソンで時間が無ければ共有して進めても良いが、**公開リポジトリにはしない**こと。
- Xcode の個人設定（`xcuserdata/`・`*.xcuserstate`）や `.DS_Store` は `.gitignore` で除外済み。
  すでに追跡されている場合の外し方は [BRANCH_STRATEGY.md](BRANCH_STRATEGY.md) の最後を参照。

---

## 困ったとき

- ビルドできない／実機で振動しない／スマホ画面（SwiftUI） → タッキー
- カメラ・手首検出が動かない → はる
- PC 大画面の表示・演出（HP ゲージ／エフェクト） → みずき
- Firebase に繋がらない → まず接続情報（config / plist）が正しいか確認
