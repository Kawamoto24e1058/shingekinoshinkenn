let p1Count = 0;
let p2Count = 0;
let isAudioUnlocked = false; // 音声解放フラグ

const p1ScoreEl = document.getElementById('p1Score');
const p2ScoreEl = document.getElementById('p2Score');
const slashLine = document.getElementById('slashLine');
const slashText = document.getElementById('slashText');
const body = document.body;

// 🌟 【重要】音源はダウンロードして、htmlファイルと同じフォルダ（または指定の相対パス）に置いてください
const sounds = {
    katana: new Audio('./sounds/斬撃1.mp3'),
    taiken: new Audio('./sounds/大剣.mp3'),
    sabers: new Audio('./sounds/ライトセーバー.mp3')
};

function unlockAudio() {
    if (isAudioUnlocked) return;

    for (let key in sounds) {
        sounds[key].muted = true;
        sounds[key].play().then(() => {
            const audio = sounds[key];
            audio.pause();
            audio.muted = false;
            audio.currentTime = 0;
        }).catch(e => console.log('Audio unlock wait...', e));
    }

    isAudioUnlocked = true;
    const notice = document.getElementById('audioNotice');
    if (notice) notice.style.display = 'none';
}

function playWeaponSound(weaponType) {
    const audio = sounds[weaponType];
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.error('再生エラー:', e));
    }
}

function triggerSlash(playerNum, weaponType) {
    body.classList.remove('flash-p1', 'flash-p2');
    void body.offsetWidth;

    if (playerNum === 1) {
        p1Count++;
        p1ScoreEl.innerText = p1Count;
        p1ScoreEl.classList.add('bump');
        setTimeout(() => p1ScoreEl.classList.remove('bump'), 100);

        body.classList.add('flash-p1');
        setTimeout(() => body.classList.remove('flash-p1'), 100);

        showVisuals('line-p1', 'text-p1');
    } else {
        p2Count++;
        p2ScoreEl.innerText = p2Count;
        p2ScoreEl.classList.add('bump');
        setTimeout(() => p2ScoreEl.classList.remove('bump'), 100);

        body.classList.add('flash-p2');
        setTimeout(() => body.classList.remove('flash-p2'), 100);

        showVisuals('line-p2', 'text-p2');
    }

    playWeaponSound(weaponType);
}

function showVisuals(lineClass, textClass) {
    slashLine.className = 'slash-line ' + lineClass;
    slashLine.classList.remove('swipe-animation');
    void slashLine.offsetWidth;
    slashLine.classList.add('swipe-animation');

    slashText.className = 'slash-text ' + textClass;
    slashText.classList.remove('pop-animation');
    void slashText.offsetWidth;
    slashText.classList.add('pop-animation');
}
