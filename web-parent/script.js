// ── Firebase Web SDK (v10) のインポート ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ── Firebase 初期化設定 (momotake-2f30b) ──
const firebaseConfig = {
  apiKey: "AIzaSyCkW3UAnb8jRF8VJggYD69Apyb8GZYY7LY",
  authDomain: "momotake-2f30b.firebaseapp.com",
  projectId: "momotake-2f30b",
  storageBucket: "momotake-2f30b.firebasestorage.app",
  messagingSenderId: "321614595316",
  appId: "1:321614595316:web:5bd921f114eb8f4c58caa1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── HTML要素の取得 ──
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas'); // output_canvas に統一
const ctx = canvasElement.getContext('2d');
const setupOverlay = document.getElementById('setup-overlay');
const startBtn = document.getElementById('start-btn');
const setupStatus = document.getElementById('setup-status');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// スコア & タイマー UI
const p1ScoreEl = document.getElementById('p1-score');
const p2ScoreEl = document.getElementById('p2-score');
const timerEl = document.getElementById('game-timer');
const phaseTitleEl = document.getElementById('game-phase-title');

// 武器登録デバッグUI
const p1RegStatusEl = document.getElementById('p1-reg-status');
const p2RegStatusEl = document.getElementById('p2-reg-status');

// 演出フラッシュ用要素
const p1Card = document.getElementById('p1-card');
const p2Card = document.getElementById('p2-card');
const p1Flash = document.getElementById('p1-flash');
const p2Flash = document.getElementById('p2-flash');

// ── ゲーム状態管理 ──
// "selecting" (武器選択中) ➔ "drawing" (抜刀待ち) ➔ "playing" (試合中) ➔ "finished" (試合終了)
let gameStatus = "selecting";
let timeRemaining = 90;
let timerInterval = null;
let detector = null;
let isDetecting = false;

// 斬撃スコア
let p1Score = 0;
let p2Score = 0;

// クールダウン制御 (ミリ秒)
const COOLDOWN_MS = 300;

// プレイヤー毎のスイング物理状態 (前回のY座標)
const playersState = {
  player1: {
    prevLeftWristY: null,
    prevRightWristY: null,
    lastSwingTime: 0
  },
  player2: {
    prevLeftWristY: null,
    prevRightWristY: null,
    lastSwingTime: 0
  }
};

// ── 武器選択フェーズ（selecting）の状態管理 ──
const selectionState = {
  player1: {
    locked: false,
    selectedWeapon: null,   // "sword" | "greatsword" | "lightsaber"
    detectingWeapon: null,
    poseStartTime: 0,
    progress: 0
  },
  player2: {
    locked: false,
    selectedWeapon: null,
    detectingWeapon: null,
    poseStartTime: 0,
    progress: 0
  }
};

// 骨格接続ペア定義 (MediaPipe Pose 33 Keypoints 接続用)
const SKELETON_CONNECTIONS = [
  [11, 12],   // 肩-肩
  [11, 13], [13, 15],   // 左肩 - 左肘 - 左手首 (11, 13, 15)
  [12, 14], [14, 16],   // 右肩 - 右肘 - 右手首 (12, 14, 16)
  [11, 23], [12, 24],   // 左肩-左腰, 右肩-右腰 (23, 24)
  [23, 24],             // 左腰-右腰
  [23, 25], [25, 27],   // 左腰 - 左膝 - 左足首 (25: 膝, 27: 足首)
  [24, 26], [26, 28]    // 右腰 - 右膝 - 右足首 (26: 膝, 28: 足首)
];

// ポーズ認識用の基本距離しきい値 (ピクセル単位)
const CLOSE_DISTANCE_THRESHOLD = 45;

// ── 2点間の直線距離を計算するヘルパー ──
function getDistance(kp1, kp2) {
  if (!kp1 || !kp2 || kp1.score < 0.3 || kp2.score < 0.3) {
    return Infinity;
  }
  return Math.hypot(kp1.x - kp2.x, kp1.y - kp2.y);
}

// ── ベクトルの内積から関節のなす角度（度数法）を計算する高精度ヘルパー ──
// 点2が頂点 (例: shoulder(p1) -> elbow(p2) -> wrist(p3) の角度)
function getAngle(p1, p2, p3) {
  if (!p1 || !p2 || !p3 || p1.score < 0.3 || p2.score < 0.3 || p3.score < 0.3) {
    return 180; // 信頼度が低い場合は真っ直ぐとみなす
  }
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  
  const dotProduct = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  
  if (mag1 === 0 || mag2 === 0) return 180;
  
  // 誤差防止のための clamp
  const cosTheta = Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2)));
  return Math.acos(cosTheta) * (180 / Math.PI);
}

// ── フェーズに応じたUIテキストの更新 ──
function updatePhaseUI() {
  if (gameStatus === "selecting") {
    phaseTitleEl.textContent = "フェーズ：武器選択中（1.5秒キープ）";
    statusText.textContent = "カメラの前で大剣/刀/ライトセーバーの構えを取ってください！";
  } else if (gameStatus === "drawing") {
    phaseTitleEl.textContent = "フェーズ：抜刀待機中（スマホ検知待ち）";
    statusText.textContent = "スマホ（iOSアプリ）を持って一気に抜刀アクションを実行してください！";
  } else if (gameStatus === "playing") {
    phaseTitleEl.textContent = "フェーズ：試合中（斬撃バトル中！）";
    statusText.textContent = "手を上から下に振り下ろして、斬撃を叩き込め！";
  } else if (gameStatus === "finished") {
    phaseTitleEl.textContent = "対戦終了！";
    statusText.textContent = "試合終了！お疲れ様でした！";
  }
}

// ── タイマー開始 ──
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (timeRemaining > 0) {
      timeRemaining--;
      timerEl.textContent = timeRemaining;
    } else {
      clearInterval(timerInterval);
      gameStatus = "finished";
      updatePhaseUI();
      updateFirestoreGameStatus("finished");
      isDetecting = false;
    }
  }, 1000);
}

// Firestore の対戦ステータス更新
async function updateFirestoreGameStatus(status) {
  try {
    const battleDocRef = doc(db, "shinken_rooms", "battle");
    await setDoc(battleDocRef, {
      status: status,
      match_status: status
    }, { merge: true });
    console.log(`[Firestore] ステータスを "${status}" に更新しました。`);
  } catch (error) {
    console.error("Firestore ステータス更新エラー:", error);
  }
}

// ── 試合開始（playingへ移行） ──
async function startMatch() {
  gameStatus = "playing";
  timeRemaining = 90;
  timerEl.textContent = timeRemaining;
  p1Score = 0;
  p2Score = 0;
  p1ScoreEl.textContent = 0;
  p2ScoreEl.textContent = 0;

  updatePhaseUI();

  // Firestore をリセット＆試合中ステータスへ一括更新
  try {
    const battleDocRef = doc(db, "shinken_rooms", "battle");
    await setDoc(battleDocRef, {
      status: "playing",
      match_status: "playing",
      player1_score: 0,
      player2_score: 0,
      player1_weapon: selectionState.player1.selectedWeapon,
      player2_weapon: selectionState.player2.selectedWeapon,
      p1_vibrate: false, // 振動検知リセット
      p2_vibrate: false
    }, { merge: true });
    console.log("[Firestore] 試合開始パラメータ送信完了");
  } catch (error) {
    console.error("Firestore 初期化送信エラー:", error);
  }

  startTimer();
}

// ── 斬撃（スイング）検知処理 ──
async function handleSwing(playerKey) {
  const now = Date.now();
  const state = playersState[playerKey];

  if (now - state.lastSwingTime < COOLDOWN_MS) {
    return;
  }

  state.lastSwingTime = now;

  // ローカル表示上のスコア加算 (Firestoreからの受信を待たず即時レンダリングで操作性向上)
  if (playerKey === 'player1') {
    p1Score++;
    animateScore(p1ScoreEl, p1Card, p1Flash, 'flash-cyan');
  } else {
    p2Score++;
    animateScore(p2ScoreEl, p2Card, p2Flash, 'flash-magenta');
  }

  // 即座に Firestore へスコアインクリメントを送信 (merge: true)
  try {
    const battleDocRef = doc(db, "shinken_rooms", "battle");
    await setDoc(battleDocRef, {
      [`${playerKey === 'player1' ? 'player1_score' : 'player2_score'}`]: increment(1)
    }, { merge: true });
  } catch (error) {
    console.error("Firestore 送信エラー:", error);
  }
}

// スイング時のポップアップ＆画面発光演出
function animateScore(scoreEl, cardEl, flashEl, flashClass) {
  scoreEl.textContent = cardEl.classList.contains('p1') ? p1Score : p2Score;
  scoreEl.classList.remove('pop-animation');
  void scoreEl.offsetWidth; // リフロートリガー
  scoreEl.classList.add('pop-animation');

  cardEl.classList.add('active');
  setTimeout(() => cardEl.classList.remove('active'), 200);

  flashEl.classList.remove(flashClass);
  void flashEl.offsetWidth;
  flashEl.classList.add(flashClass);
}

// ── 【最新の統合ゲームシーケンス仕様：武器選択ポーズ判定（MediaPipe 33点仕様）】 ──
function handleWeaponSelection(pose, playerKey, regStatusEl, cardEl) {
  const sel = selectionState[playerKey];
  if (sel.locked) return; // すでに武器確定していればスキップ

  // MediaPipe Pose 33点 インデックス割り当て
  const leftShoulder = pose.keypoints[11];
  const rightShoulder = pose.keypoints[12];
  const leftElbow = pose.keypoints[13];
  const rightElbow = pose.keypoints[14];
  const leftWrist = pose.keypoints[15]; // 手首
  const rightWrist = pose.keypoints[16]; // 手首
  const leftHip = pose.keypoints[23];
  const rightHip = pose.keypoints[24];

  let currentPoseDetecting = null;
  let debugTargetKp = null;
  let debugWristKp = null;
  let debugWristKp2 = null; // ライトセーバー両手用

  // 胸(肩の中央)、腰の中央のY座標を算出
  const chest = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2
  };
  const hipCenterY = (leftHip.y + rightHip.y) / 2;
  const hipCenterX = (leftHip.x + rightHip.x) / 2;

  // ── 1. 【ライトセーバー (Lightsaber)】★最優先チェック ──
  // - 条件: 右手首と左手首の「X座標」と「Y座標」の差分がどちらも 0.08 以内（極めて近い）
  // - かつ、その合わさった両手が「胸（両肩の中央）〜お腹（左右の腰の中央）」の高さにあること
  const diffX = Math.abs(leftWrist.x - rightWrist.x) / 400; // 横幅400px基準の正規化差分
  const diffY = Math.abs(leftWrist.y - rightWrist.y) / 300; // 高さ300px基準の正規化差分
  
  const isNearWrist = (diffX <= 0.08) && (diffY <= 0.08) && (rightWrist.score > 0.4) && (leftWrist.score > 0.4);
  const handsY = (leftWrist.y + rightWrist.y) / 2;
  const isHandsInChestToBelly = (handsY >= chest.y) && (handsY <= hipCenterY);

  if (isNearWrist && isHandsInChestToBelly) {
    currentPoseDetecting = "lightsaber";
    debugWristKp = rightWrist;
    debugWristKp2 = leftWrist;
    debugTargetKp = chest;
  }

  // ── 2. 【大剣 (Greatsword)】 ──
  // - ※ライトセーバー成立時は完全にスキップ（シャットアウト）
  // - 条件1: 右手首なら右肩、左手首なら左肩の近く (距離 45px 以下)
  // - 条件2: 手首のY座標が、同じ側の肩のY座標よりも完全に上（頭・耳の横あたりに手が上がっている：shoulder.y - 15 以下）
  // - 条件3: 肩・肘・手首のなす角度が 100度以下 (肘が鋭角に曲がっている)
  // - 誤爆防止: もう片方の手首は胸や肩の近くにないこと
  if (!currentPoseDetecting) {
    const distRightWristRightShoulder = getDistance(rightWrist, rightShoulder);
    const distLeftWristLeftShoulder = getDistance(leftWrist, leftShoulder);

    // 肩-肘-手首の角度
    const rightArmAngle = getAngle(rightShoulder, rightElbow, rightWrist);
    const leftArmAngle = getAngle(leftShoulder, leftElbow, leftWrist);

    // 右手首 ➔ 右肩 (右手首のYが右肩のYより15px以上小さく、かつ角度が100度以下)
    const isRightGreatsword = (distRightWristRightShoulder < CLOSE_DISTANCE_THRESHOLD) && 
                              (rightWrist.score > 0.4) && (rightShoulder.score > 0.4) && 
                              (rightWrist.y < rightShoulder.y - 15) && (rightArmAngle <= 100);
    
    // もう片方（左手）が胸や左肩の近くにないこと
    const leftWristNearChestOrShoulder = (getDistance(leftWrist, chest) < 60) || (getDistance(leftWrist, leftShoulder) < 60);

    // 左手首 ➔ 左肩
    const isLeftGreatsword = (distLeftWristLeftShoulder < CLOSE_DISTANCE_THRESHOLD) && 
                             (leftWrist.score > 0.4) && (leftShoulder.score > 0.4) && 
                             (leftWrist.y < leftShoulder.y - 15) && (leftArmAngle <= 100);
    
    // もう片方（右手）が胸や右肩の近くにないこと
    const rightWristNearChestOrShoulder = (getDistance(rightWrist, chest) < 60) || (getDistance(rightWrist, rightShoulder) < 60);

    if (isRightGreatsword && !leftWristNearChestOrShoulder) {
      currentPoseDetecting = "greatsword";
      debugWristKp = rightWrist;
      debugTargetKp = rightShoulder;
    }
    else if (isLeftGreatsword && !rightWristNearChestOrShoulder) {
      currentPoseDetecting = "greatsword";
      debugWristKp = leftWrist;
      debugTargetKp = leftShoulder;
    }
  }

  // ── 3. 【刀 (Sword)】 ──
  // - ※ライトセーバー、大剣が成立していない場合のみチェック
  // - 条件1: 手首が、左右の腰（HIP）の中央より少し上の「お腹」の近く（距離 45px 以下）にあること
  //   お腹の基準点：belly.y = hipCenterY - (hipCenterY - chest.y) * 0.25
  // - 条件2: 肩・肘・手首のなす角度が 130度以下 (だらん伸び状態160度以上を完全無視)
  if (!currentPoseDetecting) {
    const belly = {
      x: hipCenterX,
      y: hipCenterY - (hipCenterY - chest.y) * 0.25
    };

    const distRightWristBelly = getDistance(rightWrist, belly);
    const distLeftWristBelly = getDistance(leftWrist, belly);

    const rightArmAngle = getAngle(rightShoulder, rightElbow, rightWrist);
    const leftArmAngle = getAngle(leftShoulder, leftElbow, leftWrist);

    // 右手首 ➔ お腹
    const isRightSword = (distRightWristBelly < CLOSE_DISTANCE_THRESHOLD) && (rightArmAngle <= 130) && (rightWrist.score > 0.4);
    // 左手首 ➔ お腹
    const isLeftSword = (distLeftWristBelly < CLOSE_DISTANCE_THRESHOLD) && (leftArmAngle <= 130) && (leftWrist.score > 0.4);

    if (isRightSword) {
      currentPoseDetecting = "sword";
      debugWristKp = rightWrist;
      debugTargetKp = belly;
    }
    else if (isLeftSword) {
      currentPoseDetecting = "sword";
      debugWristKp = leftWrist;
      debugTargetKp = belly;
    }
  }

  const weaponNames = {
    sword: "刀",
    greatsword: "大剣",
    lightsaber: "ライトセーバー"
  };

  // ── キープ時間判定 (1.5秒キープ) ──
  if (currentPoseDetecting) {
    const weaponNameJP = weaponNames[currentPoseDetecting];

    if (sel.detectingWeapon === currentPoseDetecting) {
      const elapsed = Date.now() - sel.poseStartTime;
      sel.progress = Math.min(100, Math.floor((elapsed / 1500) * 100));

      regStatusEl.textContent = `${weaponNameJP}の構え... (${sel.progress}%)`;
      regStatusEl.className = "reg-status detecting";

      // Canvas上へのデバッグ用補助線とロックオン線の描画
      if (debugWristKp && debugTargetKp) {
        ctx.beginPath();
        ctx.moveTo(debugWristKp.x, debugWristKp.y);
        ctx.lineTo(debugTargetKp.x, debugTargetKp.y);
        if (debugWristKp2) { // ライトセーバー（両手）の場合
          ctx.moveTo(debugWristKp2.x, debugWristKp2.y);
          ctx.lineTo(debugTargetKp.x, debugTargetKp.y);
        }
        ctx.strokeStyle = '#ffdd59'; // 黄色ロックオン線
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(debugTargetKp.x, debugTargetKp.y, 45, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255, 221, 89, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 1.5秒キープ成功
      if (elapsed >= 1500) {
        sel.locked = true;
        sel.selectedWeapon = currentPoseDetecting;
        sel.progress = 100;
        regStatusEl.textContent = `確定！[${weaponNameJP}]`;
        regStatusEl.className = "reg-status ready";
        cardEl.classList.add('ready');

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        console.log(`[武器確定] ${playerKey} の武器が ${weaponNameJP} に確定しました。`);

        checkAllWeaponsSelected();
      }
    } else {
      sel.detectingWeapon = currentPoseDetecting;
      sel.poseStartTime = Date.now();
      sel.progress = 0;
      regStatusEl.textContent = `${weaponNameJP}の構え... (0%)`;
      regStatusEl.className = "reg-status detecting";
    }
  } else {
    sel.detectingWeapon = null;
    sel.poseStartTime = 0;
    sel.progress = 0;
    regStatusEl.textContent = "武器の構えを取ってください (大剣/刀/セーバー)";
    regStatusEl.className = "reg-status";
  }
}

// 両プレイヤーの武器選択が完了したかチェック
async function checkAllWeaponsSelected() {
  if (selectionState.player1.locked && selectionState.player2.locked) {
    console.log("[フェーズ移行] 両者の武器確定 ➔ 抜刀待ちフェーズへ");
    statusText.textContent = "武器確定！抜刀準備をしてください！";
    
    setTimeout(async () => {
      gameStatus = "drawing";
      updatePhaseUI();
      
      p1RegStatusEl.textContent = "スマホ側抜刀待ち...";
      p1RegStatusEl.className = "reg-status detecting";
      p2RegStatusEl.textContent = "スマホ側抜刀待ち...";
      p2RegStatusEl.className = "reg-status detecting";

      p1Card.classList.remove('ready');
      p2Card.classList.remove('ready');

      // Firestore の状態を drawing に更新し、iOSアプリ側の抜刀検知用に ready を false にリセット
      try {
        const battleDocRef = doc(db, "shinken_rooms", "battle");
        await setDoc(battleDocRef, {
          status: "drawing",
          match_status: "drawing",
          p1_weapon: selectionState.player1.selectedWeapon,
          p2_weapon: selectionState.player2.selectedWeapon,
          p1_ready: false,
          p2_ready: false
        }, { merge: true });
        console.log("[Firestore] drawing フェーズへ移行し、ready を false で初期化しました。");
      } catch (error) {
        console.error("Firestore drawing更新エラー:", error);
      }
    }, 1500);
  }
}

// ── 【ステップ3：バトルフェーズのスイング物理判定】 ──
function processMovementLogics(pose, playerKey) {
  const state = playersState[playerKey];
  const leftWrist = pose.keypoints[15]; // MediaPipe Pose
  const rightWrist = pose.keypoints[16]; // MediaPipe Pose

  const currentLeftWristY = (leftWrist && leftWrist.score > 0.4) ? leftWrist.y : null;
  const currentRightWristY = (rightWrist && rightWrist.score > 0.4) ? rightWrist.y : null;

  let maxNormalizedDY = 0;

  // 左手首の移動量計算 (フレーム間の手首の移動量 dy = (currentY - prevY) / 300)
  if (state.prevLeftWristY !== null && currentLeftWristY !== null) {
    const dyLeft = (currentLeftWristY - state.prevLeftWristY) / 300;
    if (dyLeft > maxNormalizedDY) {
      maxNormalizedDY = dyLeft;
    }
  }

  // 右手首の移動量計算
  if (state.prevRightWristY !== null && currentRightWristY !== null) {
    const dyRight = (currentRightWristY - state.prevRightWristY) / 300;
    if (dyRight > maxNormalizedDY) {
      maxNormalizedDY = dyRight;
    }
  }

  // リアルなスイング判定 (フレーム間の手首の移動量 dy > 0.09)
  if (maxNormalizedDY > 0.09) {
    handleSwing(playerKey);
  }

  if (currentLeftWristY !== null) state.prevLeftWristY = currentLeftWristY;
  if (currentRightWristY !== null) state.prevRightWristY = currentRightWristY;
}

// ── 骨格ワイヤーフレーム描画メイン処理 ──
function drawSkeleton(poses) {
  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  ctx.save();
  ctx.translate(canvasElement.width, 0);
  ctx.scale(-1, 1); // 鏡像反転に対応

  poses.forEach((pose) => {
    if (pose.score < 0.25) return;

    // 肩のキーポイント（11, 12番）から、プレイヤーの立ち位置（左右）を識別
    const leftShoulder = pose.keypoints[11];
    const rightShoulder = pose.keypoints[12];
    
    let poseCenterX = 200;
    if (leftShoulder && rightShoulder && leftShoulder.score > 0.3 && rightShoulder.score > 0.3) {
      poseCenterX = (leftShoulder.x + rightShoulder.x) / 2;
    }

    const isPlayer1 = poseCenterX < 200;
    const playerKey = isPlayer1 ? 'player1' : 'player2';
    const playerColor = isPlayer1 ? '#00f2fe' : '#f35588'; // P1: シアン, P2: マゼンタ (ピンク)
    const shadowColor = isPlayer1 ? 'rgba(0, 242, 254, 0.8)' : 'rgba(243, 85, 136, 0.8)';
    const regStatusEl = isPlayer1 ? p1RegStatusEl : p2RegStatusEl;
    const cardEl = isPlayer1 ? p1Card : p2Card;

    // ── 1. 全身の骨格線 (ワイヤーフレーム) の描画 ──
    SKELETON_CONNECTIONS.forEach(([i, j]) => {
      const kp1 = pose.keypoints[i];
      const kp2 = pose.keypoints[j];

      if (kp1 && kp2 && kp1.score > 0.3 && kp2.score > 0.3) {
        ctx.beginPath();
        ctx.moveTo(kp1.x, kp1.y);
        ctx.lineTo(kp2.x, kp2.y);
        ctx.strokeStyle = playerColor;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 10;
        ctx.stroke();
      }
    });

    // ── 2. 各関節キーポイント（点）の描画 ──
    pose.keypoints.forEach((kp) => {
      if (kp.score > 0.3) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = shadowColor;
        ctx.fill();
      }
    });

    // ── 3. READY! Canvas文字演出の描画 ──
    const nose = pose.keypoints[0];
    const isReadyToShow = (gameStatus === "drawing" && selectionState[playerKey].locked) || (gameStatus === "selecting" && selectionState[playerKey].locked);
    
    if (isReadyToShow && nose && nose.score > 0.4) {
      ctx.save();
      ctx.translate(nose.x, nose.y - 30);
      ctx.scale(-1, 1); // テキストが反転しないように再反転
      
      ctx.font = "bold 14px 'Space Grotesk', sans-serif";
      ctx.fillStyle = playerColor;
      ctx.textAlign = "center";
      ctx.shadowBlur = 6;
      ctx.shadowColor = shadowColor;
      ctx.fillText("READY!", 0, 0);
      
      ctx.restore();
    }

    // ── 4. ゲーム状態に応じた行動処理 ──
    if (gameStatus === "selecting") {
      handleWeaponSelection(pose, playerKey, regStatusEl, cardEl);
    } else if (gameStatus === "playing") {
      processMovementLogics(pose, playerKey);
    }
  });

  ctx.restore();
}

// ── ポーズ推定のループ処理 ──
async function detectionLoop() {
  if (!isDetecting) return;

  try {
    const poses = await detector.estimatePoses(videoElement, {
      maxPoses: 2,
      flipHorizontal: false
    });

    const activePoses = poses.filter(p => p.score > 0.25);
    if (activePoses.length > 0) {
      statusDot.classList.add('active');
      statusText.textContent = `骨格検出中 (ロックオン: ${activePoses.length}人) - ステータス: ${gameStatus === "selecting" ? "武器選択中" : (gameStatus === "drawing" ? "抜刀待機中" : "試合中")}`;
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = "カメラの前に全身が映るように立ってください";
      
      if (gameStatus === "selecting") {
        resetSelectionIfAbsent('player1', p1RegStatusEl, p1Card);
        resetSelectionIfAbsent('player2', p2RegStatusEl, p2Card);
      }
    }

    drawSkeleton(poses);

  } catch (error) {
    console.error("Pose 推定中にエラー:", error);
  }

  requestAnimationFrame(detectionLoop);
}

function resetSelectionIfAbsent(playerKey, regStatusEl, cardEl) {
  const sel = selectionState[playerKey];
  if (!sel.locked && sel.detectingWeapon) {
    sel.detectingWeapon = null;
    sel.poseStartTime = 0;
    sel.progress = 0;
    regStatusEl.textContent = "カメラに映ってください";
    regStatusEl.className = "reg-status";
  }
}

// ── Webカメラ ＆ TensorFlow.js MediaPipe Pose の初期化 ──
async function initPoseBattleSystem() {
  setupStatus.textContent = "MediaPipe Pose 超高精度検出器をロード中...";

  try {
    // MediaPipe Pose (BlazePose Heavy) を超高精度・ガチガチ設定で初期化
    detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.BlazePose,               // BlazePose に修正
      {
        runtime: 'mediapipe',
        modelComplexity: 2,               // 最上位超高精度モデル (Heavy)
        minDetectionConfidence: 0.65,      // ノイズを強力に弾く閾値
        minTrackingConfidence: 0.65,       // 死ぬ気で追跡させるトラッキング閾値
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose'
      }
    );

    setupStatus.textContent = "Webカメラを起動中...";

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 400, height: 300, facingMode: "user" },
      audio: false
    });
    videoElement.srcObject = stream;
    
    await new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        resolve();
      };
    });

    setupStatus.textContent = "ゲーム開始準備中...";

    gameStatus = "selecting";
    updatePhaseUI();
    p1RegStatusEl.textContent = "カメラに映ってください";
    p2RegStatusEl.textContent = "カメラに映ってください";
    
    // Firestore の対戦部屋を初期化 (selecting 状態へ)
    const battleDocRef = doc(db, "shinken_rooms", "battle");
    await setDoc(battleDocRef, {
      status: "selecting",
      match_status: "selecting",
      p1_ready: false,
      p2_ready: false,
      player1_score: 0,
      player2_score: 0
    }, { merge: true });
    console.log("[Firestore] ゲームステータスを完全にリセット初期化しました。");

    // Firebase リアルタイム同期リスナーを起動 (スマホ抜刀監視 ＆ UIバインド用)
    setupFirestoreListener();

    isDetecting = true;
    requestAnimationFrame(detectionLoop);

    setupOverlay.style.opacity = 0;
    setTimeout(() => {
      setupOverlay.classList.add('hidden');
    }, 500);

  } catch (error) {
    console.error("システム初期化エラー:", error);
    setupStatus.textContent = "エラーが発生しました。カメラ権限を確認してください。";
    setupStatus.style.color = "#ff5e57";
  }
}

// ── 開始ボタンのクリックイベント ──
startBtn.addEventListener('click', () => {
  initPoseBattleSystem();
});


// =====================================================================
// ── 💡 1回生UI合体用の「空っぽの受け皿関数」の実実装 ──
// =====================================================================
//
// 昼の合体作業で、1回生が作成してくれたHPゲージ増減処理や、
// 武器選択➔バトルへのフェード遷移などの演出をこの関数の中へ一瞬で繋ぎ込めます！
//

/**
 * プレイヤー1（LEFT）のスコア増加・HPゲージ連動演出用
 * @param {number} score 最新のプレイヤー1スコア
 */
function updateP1HealthGauge(score) {
  console.log("[受け皿関数] updateP1HealthGauge が呼び出されました。最新スコア:", score);
  // 💡 昼の合体時に、1回生の作成したHPバー減少コードをここに追記してください！
  // 例: document.getElementById('p1-hp-bar').style.width = `${100 - score * 5}%`;
}

/**
 * プレイヤー2（RIGHT）のスコア増加・HPゲージ連動演出用
 * @param {number} score 最新のプレイヤー2スコア
 */
function updateP2HealthGauge(score) {
  console.log("[受け皿関数] updateP2HealthGauge が呼び出されました。最新スコア:", score);
  // 💡 昼の合体時に、1回生の作成したHPバー減少コードをここに追記してください！
  // 例: document.getElementById('p2-hp-bar').style.width = `${100 - score * 5}%`;
}

/**
 * 状態が "playing" になった際に、武器選択画面を隠してバトル画面を表示するための画面遷移用
 */
function switchToBattleScreen() {
  console.log("[受け皿関数] switchToBattleScreen が呼び出されました。バトル画面へ遷移します。");
  // 💡 昼の合体時に、1回生の画面遷移演出コードをここに追記してください！
  // 例: 
  // document.getElementById('weapon-select-screen').classList.add('hidden');
  // document.getElementById('battle-screen').classList.remove('hidden');
}


// =====================================================================
// ── 1回生・3回生 連携用のリアルタイム Firestore 監視 ──
// =====================================================================
//
function setupFirestoreListener() {
  const battleDocRef = doc(db, "shinken_rooms", "battle");
  onSnapshot(battleDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log("[Firestoreリアルタイム受信]", data);

      // ── ■ ステップ2：抜刀待ちフェーズ（drawing）での iOS アプリの ready 待ち受け ──
      if (gameStatus === "drawing") {
        
        // P1（プレイヤー1）のスマホ側抜刀状態をUIにリアルタイム反映
        if (data.p1_ready) {
          p1RegStatusEl.textContent = "抜刀完了！(READY)";
          p1RegStatusEl.className = "reg-status ready";
          p1Card.classList.add('ready');
          // 💡 P1の抜刀成功時効果音（シャキーン！）などをここに追記できます！
        } else {
          p1RegStatusEl.textContent = "スマホ側抜刀待ち...";
          p1RegStatusEl.className = "reg-status detecting";
          p1Card.classList.remove('ready');
        }

        // P2（プレイヤー2）のスマホ側抜刀状態をUIにリアルタイム反映
        if (data.p2_ready) {
          p2RegStatusEl.textContent = "抜刀完了！(READY)";
          p2RegStatusEl.className = "reg-status ready";
          p2Card.classList.add('ready');
          // 💡 P2の抜刀成功時効果音などをここに追記できます！
        } else {
          p2RegStatusEl.textContent = "スマホ側抜刀待ち...";
          p2RegStatusEl.className = "reg-status detecting";
          p2Card.classList.remove('ready');
        }

        // 双方のプレイヤーがスマホ側で抜刀完了（p1_ready & p2_ready === true）したら、
        // 1.5秒後に自動的にバトルフェーズへ移行し、画面切り替え用受け皿をキックします
        if (data.p1_ready === true && data.p2_ready === true) {
          console.log("[抜刀同期完了] 両プレイヤーがスマホでの抜刀に成功！試合開始！");
          statusText.textContent = "全員抜刀完了！バトルスタート！";
          
          // 1.5秒間の余韻演出ののち、バトル画面への切り替えとバトル開始処理を実行
          setTimeout(() => {
            p1Card.classList.remove('ready');
            p2Card.classList.remove('ready');
            
            const weaponLabels = {
              sword: "刀装備中",
              greatsword: "大剣装備中",
              lightsaber: "セーバー装備中"
            };

            const p1W = selectionState.player1.selectedWeapon || data.p1_weapon || "sword";
            const p2W = selectionState.player2.selectedWeapon || data.p2_weapon || "sword";

            p1RegStatusEl.textContent = weaponLabels[p1W];
            p2RegStatusEl.textContent = weaponLabels[p2W];
            p1RegStatusEl.className = "reg-status ready";
            p2RegStatusEl.className = "reg-status ready";

            // 💡 画面をバトル用のレイアウトに切り替える受け皿関数を実行
            switchToBattleScreen();

            // バトル開始（status を "playing" にしてタイマーを起動します）
            startMatch();
          }, 1500);
        }
      }

      // ── 💡 演出・スコア連携用 ──
      
      // 1. プレイヤー1（画面左側）のスコア増加演出
      if (data.player1_score !== undefined && data.player1_score !== p1Score && gameStatus === "playing") {
        p1Score = data.player1_score;
        p1ScoreEl.textContent = p1Score;
        
        // 💡 1回生が作ったHPゲージ減少演出用の受け皿関数をコール
        updateP1HealthGauge(p1Score);

        // 💡 斬撃ヒット時のポップアップ・発光アニメーション
        p1ScoreEl.classList.remove('pop-animation');
        void p1ScoreEl.offsetWidth; // リフロー
        p1ScoreEl.classList.add('pop-animation');

        p1Card.classList.add('active');
        setTimeout(() => p1Card.classList.remove('active'), 200);

        p1Flash.classList.remove('flash-cyan');
        void p1Flash.offsetWidth;
        p1Flash.classList.add('flash-cyan');
      }

      // 2. プレイヤー2（画面右側）のスコア増加演出
      if (data.player2_score !== undefined && data.player2_score !== p2Score && gameStatus === "playing") {
        p2Score = data.player2_score;
        p2ScoreEl.textContent = p2Score;

        // 💡 1回生が作ったHPゲージ減少演出用の受け皿関数をコール
        updateP2HealthGauge(p2Score);

        p2ScoreEl.classList.remove('pop-animation');
        void p2ScoreEl.offsetWidth; // リフロー
        p2ScoreEl.classList.add('pop-animation');

        p2Card.classList.add('active');
        setTimeout(() => p2Card.classList.remove('active'), 200);

        p2Flash.classList.remove('flash-magenta');
        void p2Flash.offsetWidth;
        p2Flash.classList.add('flash-magenta');
      }

      // 3. 試合時間切れ・ゲーム終了時
      if ((data.status === "finished" || data.match_status === "finished") && gameStatus !== "finished") {
        gameStatus = "finished";
        updatePhaseUI();
        if (timerInterval) clearInterval(timerInterval);
        isDetecting = false;
        
        // 💡 試合終了時の「タイムアップ！」演出などをここに自由に追加してください！
      }
    }
  });
}
