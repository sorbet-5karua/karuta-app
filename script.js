// script.js — 堅牢版（色セレクト自動検出 / replay 表示信頼化 / デバッグログ追加）
// 既存の機能は維持（暗記タイマー、読み上げファイル再生、1秒インターバル等）

let currentCard = null;
let allCards = [];
let quizCards = [];
let currentIndex = 0;
let correctCount = 0;
let wrongCount = 0;
let reactionTimes = [];
let questionStartTime = null;
let currentColor = null;
let currentAudio = null;
let firstStart = false;
let isStopped = false;
let processedIds = new Set();
let questionAnswered = false;
let currentVoice = "kurono"; // 追加：デフォルトの声フォルダ

// 暗記タイマー用
let memorizeTimer = 60;
let memorizeInterval = null;
let timerRunning = false;
const alarmAudio = new Audio("audio/alarm.mp3"); // アラーム音（00:00時に鳴る）

document.addEventListener("DOMContentLoaded", () => {
  const unlockBtn = document.getElementById("audio-unlock");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", () => {
      const dummy = new Audio("audio/kurono/yomimasu.mp3");
      dummy.play().then(() => {
        console.log("Audio permission granted by user.");
        unlockBtn.style.display = "none";
      }).catch(err => {
        console.warn("Audio unlock failed:", err);
      });
    });
  }

  console.log("DOMContentLoaded: start parsing CSV...");
  // CSV 読み込み（papaparse）完了時にセッティング
  Papa.parse("cards.csv", {
    download: true,
    header: true,
    complete: function (results) {
      console.log("Papa.parse complete.", results && results.data && results.data.length ? `${results.data.length} rows` : "no rows");
      allCards = results.data.filter(row => row.ID !== '');
      // 自動で色コントロールをセット（select があればそれを使い、なければ従来のボタンを使う）
      setupColorControls(allCards);
      setupMemorizeTimer();

      // UIテキストの保護（HTML に上書きされている場合があるため）
      const startBtn = document.getElementById("start-quiz");
      if (startBtn) startBtn.textContent = "読み上げを開始";
    },
    error: function(err) {
      console.error("Papa.parse error:", err);
    }
  });
});

// time を mm:ss 形式に
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
}

// 暗記タイマー初期化
function setupMemorizeTimer() {
  const display = document.getElementById("timer-display");
  const title = document.getElementById("timer-title");
  const startStopBtn = document.getElementById("timer-start-stop");
  const resetBtn = document.getElementById("timer-reset");

  if (!display) { console.warn("Timer display element not found (#timer-display). Timer will not work."); return; }
  if (title) title.textContent = "暗記1分タイマー";
  display.textContent = formatTime(memorizeTimer);

  if (!startStopBtn) { console.warn("Timer start/stop button not found (#timer-start-stop)."); }
  if (!resetBtn) { console.warn("Timer reset button not found (#timer-reset)."); }

  if (startStopBtn) {
    startStopBtn.addEventListener("click", () => {
      if (!timerRunning) {
        // start
        timerRunning = true;
        startStopBtn.textContent = "ストップ";
        startStopBtn.classList.add("running");
        memorizeInterval = setInterval(() => {
          if (memorizeTimer > 0) {
            memorizeTimer--;
            display.textContent = formatTime(memorizeTimer);
            if (memorizeTimer === 0) {
              // アラーム一回
              try {
                alarmAudio.currentTime = 0;
                alarmAudio.play().catch(()=>{ /* 無害 */ });
              } catch(e) { /* ignore */ }
            }
          } else {
            clearInterval(memorizeInterval);
            timerRunning = false;
            startStopBtn.textContent = "スタート";
            startStopBtn.classList.remove("running");
          }
        }, 1000);
      } else {
        // stop
        clearInterval(memorizeInterval);
        timerRunning = false;
        startStopBtn.textContent = "スタート";
        startStopBtn.classList.remove("running");
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      clearInterval(memorizeInterval);
      timerRunning = false;
      memorizeTimer = 60;
      display.textContent = formatTime(memorizeTimer);
      if (startStopBtn) {
        startStopBtn.textContent = "スタート";
        startStopBtn.classList.remove("running");
      }
    });
  }
}

// 色選択UI を自動検出して設定（select があれば select を使い、なければ button を使う）
function setupColorControls(allCards) {
  // 要素参照
  const colorSelect = document.getElementById("color-select"); // プルダウン方式
  const voiceSelect = document.getElementById("voice-select"); // 追加：声選択ドロップダウン取得
  const colorButtonContainer = document.getElementById("color-selection"); // ボタン群方式（内部に buttons）
  const backButton = document.getElementById("back-button");
  const quizControls = document.getElementById("quiz-controls");
  const startButton = document.getElementById("start-quiz");
  const stopButton = document.getElementById("stop-quiz");
  const replayButton = document.getElementById("replay-button");
  const cardArea = document.getElementById("card-area");
  const timerContainer = document.getElementById("memorize-timer");

// デフォルトの音声設定（両方を記載）
const credit = document.getElementById("voice-credit");
if (credit) {
  credit.textContent = "VOICEVOX：玄野武宏・東北きりたん";
}

// 声選択がある場合は currentVoice を切り替えられるようにする
if (voiceSelect) {
  voiceSelect.addEventListener("change", () => {
    const v = voiceSelect.value;
    currentVoice = v;
    console.log("voice-select change:", currentVoice);
    const credit = document.getElementById("voice-credit");
    if (credit) {
      if (currentVoice === "kurono") {
        credit.textContent = "VOICEVOX：玄野武宏";
      } else if (currentVoice === "kiritan") {
        credit.textContent = "VOICEVOX：東北きりたん";
      } else {
        // 「選んでください」状態に戻した場合（空欄）
        credit.textContent = "VOICEVOX：玄野武宏・東北きりたん";
      }
    }
  });
}

  console.log("setupColorControls: elements", {
    colorSelect: !!colorSelect,
    colorButtonContainer: !!colorButtonContainer,
    backButton: !!backButton,
    startButton: !!startButton,
    stopButton: !!stopButton,
    replayButton: !!replayButton,
    cardArea: !!cardArea
  });

  // replayButton の表示制御を確実にするユーティリティ
  function showReplay() {
    if (!replayButton) return;
    try {
      replayButton.hidden = false;
      replayButton.style.display = ""; // CSSに依存しない形でクリア
      // 強制的に可視化（最後の保険）
      setTimeout(() => {
        replayButton.hidden = false;
        replayButton.style.display = "inline-block";
      }, 30);
    } catch(e) { /* ignore */ }
  }
  function hideReplay() {
    if (!replayButton) return;
    try {
      replayButton.hidden = true;
      replayButton.style.display = "none";
    } catch(e) {}
  }

  // 共通：選んだ色でカードを表示する処理（ボタン／select 両方から使う）
  function handleColorChosen(colorValue) {
    if (!colorValue) return;
    currentColor = colorValue.toLowerCase();
    const selectedCards = allCards.filter(c => {
      const cardColor = (c["色"] || "").toLowerCase();
      return cardColor === currentColor;
    });
    if (!selectedCards || selectedCards.length === 0) {
      console.warn("選択色に対応する札が見つかりません:", currentColor);
      return;
    }

    showCards(shuffleArray([...selectedCards]));
    quizCards = shuffleArray([...selectedCards]).slice(0,17);

    currentIndex = 0;
    correctCount = 0;
    wrongCount = 0;
    reactionTimes = [];
    processedIds.clear();
    firstStart = true;
    isStopped = false;

    if (currentAudio) { currentAudio.pause(); currentAudio = null; }

    // UI 表示
    if (backButton) backButton.style.display = "inline-block";
    if (quizControls) quizControls.style.display = "block";
    if (startButton) startButton.textContent = "読み上げを開始";
    if (stopButton) stopButton.textContent = "一時停止";
    showReplay();
    if (timerContainer) timerContainer.style.display = "block";
  }

  // --- select があればそちらを優先 ---
  if (colorSelect) {
    // select に option を入れる（既に入ってる場合はスキップしてもOK）
    if (colorSelect.children.length <= 1) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "色を選ぶ";
      colorSelect.insertBefore(placeholder, colorSelect.firstChild);
      // ユニークな色セットを作成して追加
      const colorSet = [...new Set(allCards.map(c => c["色"]))];
      colorSet.forEach(col => {
        const opt = document.createElement("option");
        opt.value = col;
        // ラベルとしては CSV の色文字列では無いので、ユーザ側が見やすい文言にしていない場合はそのまま表示
        opt.textContent = col;
        colorSelect.appendChild(opt);
      });
    }

    colorSelect.addEventListener("change", () => {
      const val = colorSelect.value;
      console.log("color-select change:", val);
      handleColorChosen(val);
    });
  } else if (colorButtonContainer) {
    // 従来のボタン群（button[data-color]）がある場合の設定
    const btns = colorButtonContainer.querySelectorAll("button[data-color]");
    if (!btns || btns.length === 0) {
      console.warn("color-selection に button[data-color] が見つかりません");
    }
    btns.forEach(btn => {
      btn.addEventListener("click", () => {
        const col = btn.dataset.color;
        console.log("color button clicked:", col);
        handleColorChosen(col);
      });
    });
  } else {
    console.warn("色選択UIが見つかりません（#color-select または #color-selection）");
  }

  // back button
  if (backButton) {
    backButton.addEventListener("click", () => {
      if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }
      if (cardArea) cardArea.innerHTML = "";
      // reset select or show color buttons
      const select = document.getElementById("color-select");
      if (select) select.value = "";
      // show color buttons if existing
      const colorButtons = document.querySelectorAll("#color-selection button[data-color]");
      colorButtons.forEach(b => b.style.display = "inline-block");
      if (quizControls) quizControls.style.display = "none";
      hideReplay();
      if (backButton) backButton.style.display = "none";
      if (timerContainer) timerContainer.style.display = "none";
    });
  }

  // start button
  if (!startButton) { console.warn("start button not found (#start-quiz)"); }
  if (startButton) {
    startButton.addEventListener("click", () => {
      if (!quizCards || quizCards.length === 0) {
        console.warn("start clicked but quizCards empty");
        return;
      }
      isStopped = false;
      const cardEls = Array.from(document.querySelectorAll(".card"));
      const visibleCount = cardEls.filter(d => d.style.visibility !== "hidden" && !d.classList.contains("answered")).length;
      console.log("start clicked. visibleCount:", visibleCount, "firstStart:", firstStart);

      if (visibleCount === 20 && firstStart) {
        firstStart = false;
        const startAudioPath = `audio/${currentVoice}/yomimasu.mp3`; // 変更点：currentVoice を使う
        if (currentAudio) { currentAudio.pause(); currentAudio = null; }
        try {
          currentAudio = new Audio(startAudioPath);
        } catch (e) {
          console.warn("Failed to construct start audio", e);
          currentAudio = null;
        }
        if (currentAudio) {
          currentAudio.onended = () => {
            console.log("'読みます' ended");
            currentAudio = null;
            if (!isStopped) {
              // 「読みます」が終わったら 1 秒のインターバルを置いてから最初の句へ
              setTimeout(() => startQuizSequence(), 1000);
            }
          };
          currentAudio.onerror = () => {
            console.warn("'読みます' audio error -> fallback to startQuizSequence");
            currentAudio = null;
            setTimeout(() => startQuizSequence(), 1000);
          };
          const p = currentAudio.play();
          if (p && typeof p.catch === "function") {
            p.catch(err => {
              console.warn("'読みます' play() rejected:", err);
              currentAudio = null;
              setTimeout(() => startQuizSequence(), 1000);
            });
          }
        } else {
          // audio 構築できなければすぐ次へ
          setTimeout(() => startQuizSequence(), 1000);
        }
      } else {
        startQuizSequence();
      }
      if (timerContainer) timerContainer.style.display = "none";
    });
  }

  // stop button
  if (stopButton) {
    stopButton.addEventListener("click", () => {
      console.log("stop clicked");
      isStopped = true;
      if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }
      currentCard = null;
    });
  }

  // replay button
  if (replayButton) {
    replayButton.addEventListener("click", () => {
      if (!currentColor) {
        console.warn("replay clicked but currentColor empty");
        return;
      }
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      const selectedCards = allCards.filter(c => c["色"] === currentColor);
      showCards(shuffleArray([...selectedCards]));
      quizCards = shuffleArray([...selectedCards]).slice(0,17);

      currentIndex = 0;
      correctCount = 0;
      wrongCount = 0;
      reactionTimes = [];
      processedIds.clear();
      firstStart = true;
      isStopped = false;

      // ensure button visible
      showReplay();
      if (timerContainer) timerContainer.style.display = "block";
      if (startButton) startButton.textContent = "読み上げを開始";
    });
  } else {
    console.warn("#replay-button element not found");
  }
}

// カード描画（表示はランダム化して配置、正解で非表示にするが位置は詰めない）
function showCards(cards) {
  const cardArea = document.getElementById("card-area");
  const timerContainer = document.getElementById("memorize-timer");
  if (!cardArea) {
    console.error("card-area element not found!");
    return;
  }
  cardArea.innerHTML = "";
  const displayList = shuffleArray([...cards]);

  displayList.forEach((card, index) => {
    const div = document.createElement("div");
    div.className = "card";
    if (index < 10) div.classList.add("reversed");
    div.innerHTML = `
      <div class="card-text" style="user-select: none;">
        <span>${card["下の句１（最初の5文字）"]}</span>
        <span>${card["下の句２（中間の5文字）"]}</span>
        <span>${card["下の句３（最後の5〜7文字）"]}</span>
      </div>
    `;
    div.style.backgroundColor = card["色"];
    div.dataset.id = card.ID;

    div.addEventListener("click", () => { 
       
      if (!currentCard || isStopped) return;
      if (processedIds.has(String(card.ID))) return;
      if (questionAnswered) return; // 1問1回答ルール

      const clickTime = (performance.now() - questionStartTime) / 1000;
      if (String(card.ID) === String(currentCard.ID)) {
        // 正解
        processedIds.add(String(card.ID));
        div.classList.add("answered");
        correctCount++;
        reactionTimes.push(clickTime);
        showResultMark(div, "◯");
        // 正解は必ず非表示（位置は詰めない）
        setTimeout(() => { div.style.visibility = "hidden"; }, 800);
      } else {
        // お手つき（不正解）。札はそのまま。✗ を表示（ただしその問ではもう回答できない）
        wrongCount++;
        showResultMark(div, "✗");
      }
      questionAnswered = true;
    });

    cardArea.appendChild(div);
  });

  if (timerContainer) timerContainer.style.display = "block";
}

// 出題開始（順序は quizCards をシャッフルして使用）
function startQuizSequence() {
  // 出題順だけシャッフル（表示カードとは独立）
  quizCards = shuffleArray([...quizCards]);
  currentIndex = 0;
  correctCount = 0;
  wrongCount = 0;
  reactionTimes = [];
  const timerContainer = document.getElementById("memorize-timer");
  if (timerContainer) timerContainer.style.display = "none";
  console.log("startQuizSequence: quizCards length:", quizCards.length);
  startNextQuestion();
}

// 次の問題
function startNextQuestion() {
  if (isStopped) {
    console.log("startNextQuestion: stopped, returning");
    return;
  }
  clearResultMarks();
  if (currentIndex >= quizCards.length) {
    endGame();
    return;
  }

  currentCard = quizCards[currentIndex];
  currentIndex++;
  questionStartTime = performance.now();
  questionAnswered = false;

  if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }

  // 変更点：reader を廃止し currentVoice を使用
  const colorFolder = currentCard["色"];
  const fileNumber = String(currentCard["ID"]).padStart(3,"0");
  const audioPath = `audio/${currentVoice}/${colorFolder}/${fileNumber}.mp3`;
  try {
    currentAudio = new Audio(audioPath);
  } catch(e) {
    console.warn("Failed to construct audio for", audioPath, e);
    currentAudio = null;
  }

  const hideCurrentCard = () => {
    const cardDiv = document.querySelector(`.card[data-id="${currentCard.ID}"]`);
    if (cardDiv) cardDiv.style.visibility = "hidden";
  };

  if (currentAudio) {
    currentAudio.onended = () => {
      if (isStopped) { currentAudio = null; return; }
      if (!questionAnswered) {
        wrongCount++;
        questionAnswered = true;
      }
      // 正解札は必ず消す（位置は詰めない）
      hideCurrentCard();
      currentAudio = null;
      currentCard = null;
      // 1 秒インターバルの後、次の句へ
      setTimeout(() => startNextQuestion(), 1000);
    };
    currentAudio.onerror = () => {
      console.warn("audio error for", audioPath);
      if (!questionAnswered) { wrongCount++; questionAnswered = true; }
      hideCurrentCard();
      currentAudio = null;
      currentCard = null;
      setTimeout(() => startNextQuestion(), 1000);
    };

    const p = currentAudio.play();
    if (p && typeof p.catch === "function") {
      p.catch(err => {
        console.warn("audio.play() rejected for", audioPath, err);
        // 再生できない場合はその問を不正解扱いして次へ
        if (!questionAnswered) { wrongCount++; questionAnswered = true; }
        hideCurrentCard();
        currentAudio = null;
        currentCard = null;
        setTimeout(() => startNextQuestion(), 1000);
      });
    }
  } else {
    // audio 作れない場合は不正解扱いして次へ
    if (!questionAnswered) { wrongCount++; questionAnswered = true; }
    hideCurrentCard();
    currentCard = null;
    setTimeout(() => startNextQuestion(), 1000);
  }
}

function endGame() {
  let avgTime = 0;
  if (reactionTimes.length > 0) {
    avgTime = reactionTimes.reduce((a,b) => a + b, 0) / reactionTimes.length;
  }
  avgTime = avgTime.toFixed(2);
  alert(`終了！ 正解: ${correctCount} / 不正解: ${wrongCount}\n正解の平均反応時間: ${avgTime}秒`);
  currentCard = null;
  currentAudio = null;
  processedIds.clear();
}

// 表示用マーク
function showResultMark(cardDiv, mark) {
  const span = document.createElement("span");
  span.className = "result-mark";
  span.textContent = mark;
  cardDiv.appendChild(span);
}

function clearResultMarks() {
  document.querySelectorAll(".result-mark").forEach(m => m.remove());
}

// Fisher-Yates シャッフル
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}










































