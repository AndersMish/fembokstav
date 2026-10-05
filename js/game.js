/**
 * Fembokstav – norsk Wordle-klon
 * Daglig ord: hash av YYYY-MM-DD (Europe/Oslo) → indeks i ANSWERS
 */
(function () {
  'use strict';

  const ANSWERS = window.FEMBOKSTAV_ANSWERS || [];
  const GUESSES = new Set(window.FEMBOKSTAV_GUESSES || []);
  // Answers are also valid guesses
  ANSWERS.forEach((w) => GUESSES.add(w));

  const WORD_LEN = 5;
  const MAX_ROWS = 6;
  const STORAGE_STATS = 'fembokstav.stats_v1';
  const STORAGE_DAILY = 'fembokstav.daily_v1';
  const STORAGE_SETTINGS = 'fembokstav.settings_v1';
  const EPOCH = '2024-01-01'; // day 0 reference

  const KB_ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'å'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ø', 'æ'],
    ['Enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Backspace'],
  ];

  // ---- Timezone helpers (Europe/Oslo) ----
  function osloDateParts(date = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    // en-CA → YYYY-MM-DD
    const parts = fmt.formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t).value;
    return { y: get('year'), m: get('month'), d: get('day'), iso: `${get('year')}-${get('month')}-${get('day')}` };
  }

  function daysSinceEpoch(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const [ey, em, ed] = EPOCH.split('-').map(Number);
    const a = Date.UTC(y, m - 1, d);
    const b = Date.UTC(ey, em - 1, ed);
    return Math.floor((a - b) / 86400000);
  }

  /** Stable hash → non-neg int (djb2-ish) */
  function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
      h |= 0;
    }
    return h >>> 0;
  }

  function dailyAnswer(iso) {
    if (!ANSWERS.length) return 'skole';
    // Mix date string + day index for a well-spread sequence
    const day = daysSinceEpoch(iso);
    const h = hashString(`fembokstav:${iso}:${day}`);
    return ANSWERS[h % ANSWERS.length];
  }

  function randomAnswer() {
    return ANSWERS[Math.floor(Math.random() * ANSWERS.length)] || 'skole';
  }

  // ---- Evaluation (Wordle rules, incl. duplicate letters) ----
  function evaluate(guess, answer) {
    const g = guess.toLowerCase().split('');
    const a = answer.toLowerCase().split('');
    const res = Array(WORD_LEN).fill('absent');
    const rem = {};

    for (let i = 0; i < WORD_LEN; i++) {
      if (g[i] === a[i]) {
        res[i] = 'correct';
      } else {
        rem[a[i]] = (rem[a[i]] || 0) + 1;
      }
    }
    for (let i = 0; i < WORD_LEN; i++) {
      if (res[i] === 'correct') continue;
      if (rem[g[i]] > 0) {
        res[i] = 'present';
        rem[g[i]]--;
      }
    }
    return res;
  }

  // ---- Stats ----
  function defaultStats() {
    return {
      played: 0,
      wins: 0,
      streak: 0,
      maxStreak: 0,
      lastWinDate: null,
      distribution: [0, 0, 0, 0, 0, 0],
    };
  }

  function loadStats() {
    try {
      return { ...defaultStats(), ...JSON.parse(localStorage.getItem(STORAGE_STATS) || '{}') };
    } catch {
      return defaultStats();
    }
  }

  function saveStats(s) {
    localStorage.setItem(STORAGE_STATS, JSON.stringify(s));
  }

  function loadSettings() {
    try {
      return { hardMode: false, ...JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || '{}') };
    } catch {
      return { hardMode: false };
    }
  }

  function saveSettings(s) {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(s));
  }

  function loadDailyState(iso) {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_DAILY) || 'null');
      if (raw && raw.date === iso) return raw;
    } catch { /* ignore */ }
    return null;
  }

  function saveDailyState(state) {
    localStorage.setItem(STORAGE_DAILY, JSON.stringify(state));
  }

  // ---- Game ----
  const boardEl = document.getElementById('board');
  const keyboardEl = document.getElementById('keyboard');
  const toastEl = document.getElementById('toast');
  const modeLabel = document.getElementById('mode-label');

  let settings = loadSettings();
  let practice = false;
  let answer = '';
  let dateIso = '';
  let row = 0;
  let col = 0;
  let grid = Array.from({ length: MAX_ROWS }, () => Array(WORD_LEN).fill(''));
  let evaluations = Array.from({ length: MAX_ROWS }, () => null);
  let keyStatus = {}; // letter → correct|present|absent
  let gameOver = false;
  let busy = false;
  let tileEls = [];
  let keyEls = {};

  function showToast(msg, ms = 1600) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toastEl.hidden = true;
    }, ms);
  }

  function buildBoard() {
    boardEl.innerHTML = '';
    tileEls = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'row';
      rowDiv.dataset.row = String(r);
      const tiles = [];
      for (let c = 0; c < WORD_LEN; c++) {
        const t = document.createElement('div');
        t.className = 'tile';
        t.setAttribute('role', 'img');
        t.setAttribute('aria-label', 'tom');
        rowDiv.appendChild(t);
        tiles.push(t);
      }
      boardEl.appendChild(rowDiv);
      tileEls.push(tiles);
    }
  }

  function buildKeyboard() {
    keyboardEl.innerHTML = '';
    keyEls = {};
    KB_ROWS.forEach((keys) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'kb-row';
      keys.forEach((k) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'key' + (k === 'Enter' || k === 'Backspace' ? ' wide' : '');
        btn.dataset.key = k;
        if (k === 'Backspace') {
          btn.innerHTML = '⌫';
          btn.setAttribute('aria-label', 'Slett');
        } else if (k === 'Enter') {
          btn.textContent = 'Enter';
          btn.setAttribute('aria-label', 'Bekreft');
        } else {
          btn.textContent = k;
          btn.setAttribute('aria-label', k);
        }
        btn.addEventListener('click', () => onKey(k));
        rowDiv.appendChild(btn);
        keyEls[k] = btn;
      });
      keyboardEl.appendChild(rowDiv);
    });
  }

  function paintTile(r, c) {
    const t = tileEls[r][c];
    const ch = grid[r][c];
    t.textContent = ch;
    t.classList.toggle('filled', !!ch);
    if (!evaluations[r]) {
      t.classList.remove('correct', 'present', 'absent', 'reveal');
      t.setAttribute('aria-label', ch || 'tom');
    }
  }

  function rank(status) {
    return { correct: 3, present: 2, absent: 1 }[status] || 0;
  }

  function updateKey(letter, status) {
    const cur = keyStatus[letter];
    if (!cur || rank(status) > rank(cur)) {
      keyStatus[letter] = status;
      const el = keyEls[letter];
      if (el) {
        el.classList.remove('correct', 'present', 'absent');
        el.classList.add(status);
      }
    }
  }

  function hardModeViolation(guess) {
    if (!settings.hardMode) return null;
    // All green letters must stay; all yellow letters must be reused
    for (let r = 0; r < row; r++) {
      const ev = evaluations[r];
      if (!ev) continue;
      const prev = grid[r].join('');
      for (let i = 0; i < WORD_LEN; i++) {
        if (ev[i] === 'correct' && guess[i] !== prev[i]) {
          return `${(i + 1)}. bokstav må være ${prev[i].toUpperCase()}`;
        }
      }
      for (let i = 0; i < WORD_LEN; i++) {
        if (ev[i] === 'present' && !guess.includes(prev[i])) {
          return `Gjettet må inneholde ${prev[i].toUpperCase()}`;
        }
      }
    }
    return null;
  }

  function onKey(key) {
    if (busy || gameOver) return;
    if (key === 'Enter') {
      submit();
      return;
    }
    if (key === 'Backspace') {
      if (col > 0) {
        col--;
        grid[row][col] = '';
        paintTile(row, col);
      }
      return;
    }
    if (/^[a-zæøå]$/i.test(key) && col < WORD_LEN) {
      grid[row][col] = key.toLowerCase();
      paintTile(row, col);
      col++;
    }
  }

  async function submit() {
    if (col < WORD_LEN) {
      shakeRow(row);
      showToast('For få bokstaver');
      return;
    }
    const guess = grid[row].join('');
    if (!GUESSES.has(guess)) {
      shakeRow(row);
      showToast('Ikke i ordlista');
      return;
    }
    const violation = hardModeViolation(guess);
    if (violation) {
      shakeRow(row);
      showToast(violation, 2000);
      return;
    }

    busy = true;
    const result = evaluate(guess, answer);
    evaluations[row] = result;

    // Flip animation
    for (let i = 0; i < WORD_LEN; i++) {
      await flipTile(row, i, result[i]);
      updateKey(guess[i], result[i]);
    }

    persistIfDaily();

    if (result.every((s) => s === 'correct')) {
      await bounceWin(row);
      finish(true);
      return;
    }

    row++;
    col = 0;
    if (row >= MAX_ROWS) {
      finish(false);
      return;
    }
    busy = false;
  }

  function flipTile(r, c, status) {
    return new Promise((resolve) => {
      const t = tileEls[r][c];
      t.classList.add('reveal');
      setTimeout(() => {
        t.classList.remove('filled');
        t.classList.add(status);
        t.setAttribute('aria-label', `${grid[r][c]}, ${statusLabel(status)}`);
      }, 250);
      setTimeout(resolve, 320);
    });
  }

  function statusLabel(s) {
    return { correct: 'riktig plass', present: 'feil plass', absent: 'ikke i ordet' }[s] || s;
  }

  function shakeRow(r) {
    const el = boardEl.children[r];
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function bounceWin(r) {
    return new Promise((resolve) => {
      const el = boardEl.children[r];
      el.classList.add('win-bounce');
      tileEls[r].forEach((t, i) => {
        t.style.animationDelay = `${i * 80}ms`;
      });
      setTimeout(resolve, 700);
    });
  }

  function finish(won) {
    gameOver = true;
    busy = false;
    const winRow = won ? row : -1;

    if (!practice) {
      const stats = loadStats();
      const already = loadDailyState(dateIso);
      // Only count once per day
      if (!already || !already.counted) {
        stats.played++;
        if (won) {
          stats.wins++;
          stats.distribution[winRow]++;
          // streak
          const yesterday = shiftIso(dateIso, -1);
          if (stats.lastWinDate === yesterday || stats.lastWinDate === dateIso) {
            if (stats.lastWinDate !== dateIso) stats.streak++;
          } else {
            stats.streak = 1;
          }
          stats.lastWinDate = dateIso;
          stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
        } else {
          stats.streak = 0;
        }
        saveStats(stats);
        const st = loadDailyState(dateIso) || { date: dateIso, guesses: [], evaluations: [], status: null };
        st.counted = true;
        st.status = won ? 'win' : 'lose';
        st.row = winRow;
        saveDailyState(st);
      }
    }

    const msg = won
      ? (['Genie!', 'Fantastisk!', 'Imponerende!', 'Bra jobba!', 'Greit nok', 'Puh!'][winRow] || 'Bra!')
      : answer.toUpperCase();

    showToast(msg, won ? 1800 : 2800);
    setTimeout(() => openModal('modal-stats', true), won ? 1400 : 600);
  }

  function shiftIso(iso, deltaDays) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  function persistIfDaily() {
    if (practice) return;
    saveDailyState({
      date: dateIso,
      guesses: grid.slice(0, row + 1).map((r) => r.join('')),
      evaluations: evaluations.slice(0, row + 1),
      answer, // stored so reload matches; not secret for a static game
      status: gameOver ? (evaluations[row]?.every((s) => s === 'correct') ? 'win' : 'lose') : 'playing',
      row,
      keyStatus,
      counted: (loadDailyState(dateIso) || {}).counted || false,
    });
  }

  function restoreDaily(state) {
    answer = state.answer || dailyAnswer(dateIso);
    keyStatus = state.keyStatus || {};
    Object.entries(keyStatus).forEach(([k, s]) => {
      const el = keyEls[k];
      if (el) {
        el.classList.remove('correct', 'present', 'absent');
        el.classList.add(s);
      }
    });
    (state.guesses || []).forEach((g, r) => {
      const letters = g.split('');
      for (let c = 0; c < WORD_LEN; c++) {
        grid[r][c] = letters[c] || '';
        paintTile(r, c);
      }
      const ev = state.evaluations[r];
      if (ev) {
        evaluations[r] = ev;
        for (let c = 0; c < WORD_LEN; c++) {
          const t = tileEls[r][c];
          t.classList.remove('filled');
          t.classList.add(ev[c]);
        }
      }
    });
    row = state.guesses ? state.guesses.length : 0;
    // If last row was complete evaluation, row is already next; if mid-game incomplete shouldn't happen
    if (state.status === 'playing' && state.evaluations && state.evaluations.length === state.guesses.length) {
      // ok
    }
    col = 0;
    if (state.status === 'win' || state.status === 'lose') {
      gameOver = true;
      row = Math.min(row, MAX_ROWS - 1);
      // If won, row should be the winning row index
      if (state.status === 'win' && state.row != null) row = state.row;
    } else {
      gameOver = false;
    }
  }

  function startGame({ practiceMode = false, injectAnswer = null } = {}) {
    practice = practiceMode;
    dateIso = osloDateParts().iso;
    answer = injectAnswer || (practice ? randomAnswer() : dailyAnswer(dateIso));
    row = 0;
    col = 0;
    grid = Array.from({ length: MAX_ROWS }, () => Array(WORD_LEN).fill(''));
    evaluations = Array.from({ length: MAX_ROWS }, () => null);
    keyStatus = {};
    gameOver = false;
    busy = false;

    buildBoard();
    buildKeyboard();

    modeLabel.textContent = practice ? 'Øvingsmodus' : `Dagens ord · ${dateIso}`;
    document.getElementById('btn-practice').textContent = practice ? 'Dagens ord' : 'Øvingsmodus';
    document.getElementById('toggle-practice').checked = practice;

    if (!practice && !injectAnswer) {
      const saved = loadDailyState(dateIso);
      if (saved && saved.guesses && saved.guesses.length) {
        restoreDaily(saved);
      }
    }

    // Expose for Playwright tests
    window.__FEMBOKSTAV__ = {
      getAnswer: () => answer,
      setAnswer: (w) => {
        answer = w.toLowerCase();
      },
      startPractice: (w) => startGame({ practiceMode: true, injectAnswer: w }),
      startDaily: () => startGame({ practiceMode: false }),
      evaluate,
      getState: () => ({ row, col, grid: grid.map((r) => r.join('')), gameOver, practice, dateIso }),
    };
  }

  // ---- Share ----
  function emojiGrid() {
    const rows = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      if (!evaluations[r]) break;
      rows.push(
        evaluations[r]
          .map((s) => (s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛'))
          .join('')
      );
    }
    return rows.join('\n');
  }

  function shareText() {
    const dayNum = daysSinceEpoch(dateIso) + 1;
    let winAt = -1;
    for (let i = 0; i < MAX_ROWS; i++) {
      if (evaluations[i] && evaluations[i].every((s) => s === 'correct')) { winAt = i; break; }
    }
    const score = winAt >= 0 ? String(winAt + 1) : 'X';
    const hard = settings.hardMode ? '*' : '';
    const title = practice
      ? `Fembokstav (øving) ${score}/6${hard}`
      : `Fembokstav ${dayNum} ${score}/6${hard}`;
    return `${title}\n\n${emojiGrid()}\n\nhttps://andersmish.github.io/fembokstav/`;
  }

  async function share() {
    const text = shareText();
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch { /* fall through */ }
    try {
      await navigator.clipboard.writeText(text);
      showToast('Kopiert til utklippstavlen');
    } catch {
      showToast('Kunne ikke dele');
      console.log(text);
    }
  }

  // ---- Modals / stats UI ----
  function openModal(id, withShare) {
    renderStats(withShare);
    document.getElementById(id).hidden = false;
  }
  function closeModal(el) {
    const modal = el.closest ? el.closest('.modal') : el;
    if (modal) modal.hidden = true;
  }

  function renderStats(withShare) {
    const s = loadStats();
    const winPct = s.played ? Math.round((100 * s.wins) / s.played) : 0;
    document.getElementById('stat-played').textContent = s.played;
    document.getElementById('stat-winpct').textContent = winPct;
    document.getElementById('stat-streak').textContent = s.streak;
    document.getElementById('stat-maxstreak').textContent = s.maxStreak;

    const dist = document.getElementById('dist');
    dist.innerHTML = '';
    const max = Math.max(1, ...s.distribution);
    s.distribution.forEach((n, i) => {
      const row = document.createElement('div');
      row.className = 'dist-row';
      const label = document.createElement('span');
      label.textContent = String(i + 1);
      const bar = document.createElement('div');
      bar.className = 'dist-bar' + (gameOver && !practice && evaluations[i]?.every((x) => x === 'correct') && i === (window.__FEMBOKSTAV__?.getState().row ?? -1) ? ' win' : '');
      // highlight winning row of current game
      if (gameOver && !practice) {
        const won = evaluations.some((ev, idx) => ev && ev.every((x) => x === 'correct') && idx === i);
        if (won) bar.classList.add('win');
      }
      bar.style.width = `${Math.max(7, (n / max) * 100)}%`;
      bar.textContent = String(n);
      row.append(label, bar);
      dist.appendChild(row);
    });

    const shareArea = document.getElementById('share-area');
    if (withShare && gameOver) {
      shareArea.hidden = false;
      let winAt = -1;
      for (let i = 0; i < MAX_ROWS; i++) {
        if (evaluations[i] && evaluations[i].every((s) => s === 'correct')) { winAt = i; break; }
      }
      document.getElementById('result-msg').textContent = winAt >= 0
        ? `Du klarte det på ${winAt + 1} forsøk!`
        : `Ordet var ${answer.toUpperCase()}`;
    } else {
      shareArea.hidden = true;
    }
  }

  // ---- Events ----
  document.getElementById('btn-help').addEventListener('click', () => openModal('modal-help'));
  document.getElementById('btn-stats').addEventListener('click', () => openModal('modal-stats', gameOver));
  document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('toggle-hard').checked = settings.hardMode;
    document.getElementById('toggle-practice').checked = practice;
    openModal('modal-settings');
  });
  document.getElementById('btn-share').addEventListener('click', share);
  document.getElementById('btn-practice').addEventListener('click', () => {
    startGame({ practiceMode: !practice });
  });

  document.getElementById('toggle-hard').addEventListener('change', (e) => {
    settings.hardMode = e.target.checked;
    saveSettings(settings);
  });
  document.getElementById('toggle-practice').addEventListener('change', (e) => {
    startGame({ practiceMode: e.target.checked });
    closeModal(document.getElementById('modal-settings'));
  });

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => closeModal(modal));
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not([hidden])').forEach((m) => closeModal(m));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onKey('Enter');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      onKey('Backspace');
    } else if (/^[a-zæøåA-ZÆØÅ]$/.test(e.key)) {
      onKey(e.key.toLowerCase());
    }
  });

  // Boot
  if (!ANSWERS.length || !GUESSES.size) {
    showToast('Kunne ikke laste ordlista', 5000);
  }
  startGame({ practiceMode: false });

  // First-visit help
  try {
    if (!localStorage.getItem('fembokstav.seen_help')) {
      openModal('modal-help');
      localStorage.setItem('fembokstav.seen_help', '1');
    }
  } catch { /* ignore */ }
})();
