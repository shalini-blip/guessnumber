/* =========================================================
   NumberQuest — Guess The Number
   Vanilla JS game logic
   ========================================================= */
(() => {
  'use strict';

  /* ---------- DOM references ---------- */
  const loader        = document.getElementById('loader');
  const body          = document.body;
  const themeToggle    = document.getElementById('themeToggle');
  const soundToggle    = document.getElementById('soundToggle');
  const diffButtons    = document.querySelectorAll('.diff-btn');
  const rangeText      = document.getElementById('rangeText');
  const rangeMax       = document.getElementById('rangeMax');
  const attemptsVal    = document.getElementById('attemptsVal');
  const scoreVal       = document.getElementById('scoreVal');
  const bestScoreVal   = document.getElementById('bestScoreVal');
  const timerVal       = document.getElementById('timerVal');
  const guessForm      = document.getElementById('guessForm');
  const guessInput     = document.getElementById('guessInput');
  const inputWrap      = document.getElementById('inputWrap');
  const guessBtn       = document.getElementById('guessBtn');
  const playAgainBtn   = document.getElementById('playAgainBtn');
  const errorMsg       = document.getElementById('errorMsg');
  const hintBox        = document.getElementById('hintBox');
  const hintIcon       = document.getElementById('hintIcon');
  const hintText       = document.getElementById('hintText');
  const progressFill   = document.getElementById('progressFill');
  const progressPercent= document.getElementById('progressPercent');
  const motivation     = document.getElementById('motivation');
  const winPanel       = document.getElementById('winPanel');
  const winNumber      = document.getElementById('winNumber');
  const winAttempts    = document.getElementById('winAttempts');
  const winScore       = document.getElementById('winScore');
  const historyList    = document.getElementById('historyList');
  const historyCount   = document.getElementById('historyCount');
  const cardGlow       = document.getElementById('cardGlow');
  const gamesPlayedEl  = document.getElementById('gamesPlayed');
  const gamesWonEl     = document.getElementById('gamesWon');
  const avgAttemptsEl  = document.getElementById('avgAttempts');
  const highestScoreEl = document.getElementById('highestScore');
  const confettiCanvas = document.getElementById('confettiCanvas');

  /* ---------- Persistent storage keys ---------- */
  const STORAGE_KEYS = {
    best: 'nq_best_scores',       // per difficulty best scores
    stats: 'nq_global_stats',     // games played/won/attempts
    theme: 'nq_theme',
    sound: 'nq_sound'
  };

  /* ---------- State ---------- */
  let state = {
    min: 1,
    max: 50,
    difficulty: 'Easy',
    secretNumber: null,
    attempts: 0,
    score: 100,
    gameOver: false,
    history: [],
    startTime: null,
    timerInterval: null,
    closestDistance: Infinity
  };

  let soundOn = loadJSON(STORAGE_KEYS.sound, true);
  let audioCtx = null;

  /* ---------- Utility: storage helpers ---------- */
  function loadJSON(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    }catch(e){ return fallback; }
  }
  function saveJSON(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){ /* storage unavailable */ }
  }

  function getBestScores(){ return loadJSON(STORAGE_KEYS.best, {}); }
  function getGlobalStats(){
    return loadJSON(STORAGE_KEYS.stats, { played:0, won:0, totalAttempts:0, highestScore:0 });
  }

  /* ---------- Motivational messages ---------- */
  const MOTIVATION_MESSAGES = [
    "Keep going, you're narrowing it down! 💪",
    "Every guess brings you closer. 🔍",
    "Trust the process, mathematician. 🧠",
    "You've got sharp instincts — use them! ✨",
    "The number is hiding, but not for long. 🕵️",
    "Nice logic — refine and strike again. ⚡",
    "Getting warmer... or are you? 🌡️",
    "Stay focused, victory is close. 🎯"
  ];

  /* =========================================================
     Sound effects (Web Audio API — no external files needed)
     ========================================================= */
  function ensureAudio(){
    if(!audioCtx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC) audioCtx = new AC();
    }
    return audioCtx;
  }

  function playTone(freq, duration, type='sine', delay=0, volume=0.18){
    if(!soundOn) return;
    const ctx = ensureAudio();
    if(!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const startAt = ctx.currentTime + delay;
    osc.start(startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    osc.stop(startAt + duration);
  }

  function soundHigh(){ playTone(320, 0.18, 'triangle'); }
  function soundLow(){ playTone(220, 0.18, 'triangle'); }
  function soundError(){ playTone(140, 0.25, 'sawtooth'); }
  function soundWin(){
    // little ascending victory arpeggio
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      playTone(freq, 0.32, 'sine', i * 0.13, 0.2);
    });
  }

  /* =========================================================
     Game setup
     ========================================================= */
  function startNewGame(min, max, difficulty){
    state.min = min;
    state.max = max;
    state.difficulty = difficulty;
    state.secretNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    state.attempts = 0;
    state.score = 100;
    state.gameOver = false;
    state.history = [];
    state.closestDistance = Infinity;
    clearInterval(state.timerInterval);
    state.startTime = Date.now();
    state.timerInterval = setInterval(updateTimerDisplay, 1000);

    rangeText.textContent = min;
    rangeMax.textContent = max;
    attemptsVal.textContent = '0';
    scoreVal.textContent = '100';
    timerVal.textContent = '0:00';
    guessInput.value = '';
    guessInput.disabled = false;
    guessBtn.disabled = false;
    guessBtn.classList.remove('hidden');
    playAgainBtn.classList.add('hidden');
    errorMsg.classList.remove('show');
    hintBox.className = 'hint-box';
    hintIcon.textContent = '👋';
    hintText.textContent = 'Make your first guess to begin the hunt.';
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    motivation.textContent = '';
    winPanel.classList.add('hidden');
    cardGlow.classList.remove('active');
    historyList.innerHTML = '';
    historyCount.textContent = '(0)';

    renderBestScore();
    renderGlobalStats();
    guessInput.focus();
  }

  function updateTimerDisplay(){
    if(!state.startTime) return;
    const elapsedSec = Math.floor((Date.now() - state.startTime) / 1000);
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;
    timerVal.textContent = `${mins}:${secs.toString().padStart(2,'0')}`;
  }

  function renderBestScore(){
    const best = getBestScores();
    const val = best[state.difficulty];
    bestScoreVal.textContent = (val !== undefined) ? val : '--';
  }

  function renderGlobalStats(){
    const stats = getGlobalStats();
    gamesPlayedEl.textContent = stats.played;
    gamesWonEl.textContent = stats.won;
    avgAttemptsEl.textContent = stats.won > 0 ? (stats.totalAttempts / stats.won).toFixed(1) : '0';
    highestScoreEl.textContent = stats.highestScore;
  }

  /* =========================================================
     Validation
     ========================================================= */
  function validateGuess(raw){
    if(raw === null || raw.trim() === ''){
      return { valid:false, message:'Please enter a number — the field can\'t be empty.' };
    }
    const num = Number(raw);
    if(!Number.isFinite(num) || !Number.isInteger(num)){
      return { valid:false, message:'Only whole numbers are allowed. Letters and symbols won\'t work here.' };
    }
    if(num < state.min || num > state.max){
      return { valid:false, message:`Please enter a valid number between ${state.min} and ${state.max}.` };
    }
    return { valid:true, value:num };
  }

  function showError(message){
    errorMsg.textContent = message;
    errorMsg.classList.add('show');
    soundError();
    triggerShake();
  }

  function clearError(){
    errorMsg.classList.remove('show');
  }

  function triggerShake(){
    inputWrap.classList.remove('shake');
    // force reflow to restart animation
    void inputWrap.offsetWidth;
    inputWrap.classList.add('shake');
  }

  /* =========================================================
     Core guess handling
     ========================================================= */
  function handleGuess(){
    if(state.gameOver) return;
    const raw = guessInput.value;
    const result = validateGuess(raw);

    if(!result.valid){
      showError(result.message);
      return;
    }
    clearError();

    const guess = result.value;
    state.attempts += 1;
    attemptsVal.textContent = state.attempts;
    bumpElement(attemptsVal);

    const distance = Math.abs(guess - state.secretNumber);
    state.closestDistance = Math.min(state.closestDistance, distance);
    updateProgressMeter();

    if(guess === state.secretNumber){
      handleWin();
    }else if(guess > state.secretNumber){
      applyHint('high', '📈', 'Too High! Try a smaller number.');
      addHistoryChip(guess, 'high');
      soundHigh();
      triggerShake();
      showMotivation();
    }else{
      applyHint('low', '📉', 'Too Low! Try a bigger number.');
      addHistoryChip(guess, 'low');
      soundLow();
      triggerShake();
      showMotivation();
    }

    // live score preview (not final until win, but reflects attempts)
    const liveScore = Math.max(0, 100 - state.attempts);
    scoreVal.textContent = liveScore;
    bumpElement(scoreVal);

    guessInput.value = '';
    guessInput.focus();
  }

  function applyHint(kind, icon, text){
    hintBox.className = `hint-box ${kind}`;
    hintIcon.textContent = icon;
    hintText.textContent = text;
  }

  function updateProgressMeter(){
    const range = state.max - state.min;
    if(range <= 0) return;
    const closeness = 1 - (state.closestDistance / range);
    const pct = Math.max(0, Math.min(100, Math.round(closeness * 100)));
    progressFill.style.width = pct + '%';
    progressPercent.textContent = pct + '%';
  }

  function showMotivation(){
    const msg = MOTIVATION_MESSAGES[Math.floor(Math.random() * MOTIVATION_MESSAGES.length)];
    motivation.textContent = msg;
  }

  function addHistoryChip(guess, kind){
    state.history.push({ guess, kind });
    const chip = document.createElement('span');
    chip.className = `history-chip ${kind}`;
    chip.textContent = guess;
    historyList.appendChild(chip);
    historyCount.textContent = `(${state.history.length})`;
  }

  function bumpElement(el){
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /* =========================================================
     Win flow
     ========================================================= */
  function handleWin(){
    state.gameOver = true;
    clearInterval(state.timerInterval);

    const finalScore = Math.max(0, 100 - state.attempts);
    state.score = finalScore;

    applyHint('correct', '🎉', 'Correct! You guessed the number!');
    addHistoryChip(state.secretNumber, 'correct');
    progressFill.style.width = '100%';
    progressPercent.textContent = '100%';
    motivation.textContent = '';

    winNumber.textContent = state.secretNumber;
    winAttempts.textContent = state.attempts;
    winScore.textContent = finalScore;
    winPanel.classList.remove('hidden');
    cardGlow.classList.add('active');

    guessBtn.classList.add('hidden');
    playAgainBtn.classList.remove('hidden');
    guessInput.disabled = true;

    soundWin();
    launchConfetti();

    // persist best score
    const bestScores = getBestScores();
    const prevBest = bestScores[state.difficulty];
    if(prevBest === undefined || finalScore > prevBest){
      bestScores[state.difficulty] = finalScore;
      saveJSON(STORAGE_KEYS.best, bestScores);
    }
    renderBestScore();

    // persist global stats
    const stats = getGlobalStats();
    stats.played += 1;
    stats.won += 1;
    stats.totalAttempts += state.attempts;
    stats.highestScore = Math.max(stats.highestScore, finalScore);
    saveJSON(STORAGE_KEYS.stats, stats);
    renderGlobalStats();
  }

  /* =========================================================
     Confetti animation (canvas)
     ========================================================= */
  function launchConfetti(){
    const ctx = confettiCanvas.getContext('2d');
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;

    const colors = ['#4f7cff', '#a855f7', '#34d399', '#f59e0b', '#fb7185', '#6ea8fe'];
    const pieces = [];
    const count = 140;

    for(let i = 0; i < count; i++){
      pieces.push({
        x: Math.random() * confettiCanvas.width,
        y: -20 - Math.random() * confettiCanvas.height * 0.5,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: 2 + Math.random() * 3,
        speedX: -1.5 + Math.random() * 3,
        rotation: Math.random() * 360,
        rotationSpeed: -8 + Math.random() * 16
      });
    }

    let frame = 0;
    const maxFrames = 220;

    function animate(){
      frame++;
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      pieces.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });
      if(frame < maxFrames){
        requestAnimationFrame(animate);
      }else{
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      }
    }
    animate();
  }

  /* =========================================================
     Floating background particles
     ========================================================= */
  function createParticles(){
    const container = document.getElementById('particles');
    const total = 28;
    for(let i = 0; i < total; i++){
      const p = document.createElement('span');
      p.className = 'particle';
      const left = Math.random() * 100;
      const duration = 10 + Math.random() * 14;
      const delay = Math.random() * 14;
      const size = 2 + Math.random() * 3;
      p.style.left = left + 'vw';
      p.style.bottom = '-10px';
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.animationDuration = duration + 's';
      p.style.animationDelay = delay + 's';
      container.appendChild(p);
    }
  }

  /* =========================================================
     Difficulty switching
     ========================================================= */
  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      diffButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const min = parseInt(btn.dataset.min, 10);
      const max = parseInt(btn.dataset.max, 10);
      const label = btn.dataset.label;
      startNewGame(min, max, label);
    });
  });

  /* =========================================================
     Form + button events
     ========================================================= */
  guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleGuess();
  });

  playAgainBtn.addEventListener('click', () => {
    startNewGame(state.min, state.max, state.difficulty);
  });

  guessInput.addEventListener('input', () => {
    if(errorMsg.classList.contains('show')) clearError();
  });

  /* =========================================================
     Theme toggle
     ========================================================= */
  function applyTheme(theme){
    body.dataset.theme = theme;
    themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
    saveJSON(STORAGE_KEYS.theme, theme);
  }
  themeToggle.addEventListener('click', () => {
    const next = body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  /* =========================================================
     Sound toggle
     ========================================================= */
  function applySoundIcon(){
    soundToggle.textContent = soundOn ? '🔊' : '🔇';
  }
  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    saveJSON(STORAGE_KEYS.sound, soundOn);
    applySoundIcon();
  });

  /* =========================================================
     Init
     ========================================================= */
  function init(){
    // restore theme preference
    const savedTheme = loadJSON(STORAGE_KEYS.theme, 'dark');
    applyTheme(savedTheme);
    applySoundIcon();

    createParticles();
    startNewGame(1, 50, 'Easy');
    renderGlobalStats();

    // loading screen
    window.addEventListener('load', () => {
      setTimeout(() => loader.classList.add('hide'), 500);
    });
    // fallback in case load already fired
    setTimeout(() => loader.classList.add('hide'), 1800);

    window.addEventListener('resize', () => {
      confettiCanvas.width = window.innerWidth;
      confettiCanvas.height = window.innerHeight;
    });
  }

  init();
})();
