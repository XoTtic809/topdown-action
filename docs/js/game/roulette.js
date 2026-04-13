// roulette.js
// European Roulette (single zero) within the casino lobby.
// Canvas-rendered wheel with spinning animation + clickable betting board.

(function () {
  'use strict';

  const API = (typeof API_BASE !== 'undefined' && API_BASE) ||
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3001/api'
      : 'https://topdown-action-production-8a95.up.railway.app/api');

  function getToken() { return localStorage.getItem('topdown_token') || null; }

  // ── European roulette pocket order (clockwise on wheel) ────
  const WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36,
    11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9,
    22, 18, 29, 7, 28, 12, 35, 3, 26
  ];
  const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

  function pocketColor(n) {
    if (n === 0) return 'green';
    return RED_NUMBERS.has(n) ? 'red' : 'black';
  }

  // ── State ──────────────────────────────────────────────────
  let bets = {};       // { 'red': amount, 'straight:17': amount, ... }
  let spinning = false;
  let wheelAngle = 0;  // current rotation in degrees
  let wheelDrawn = false;

  // ── Canvas wheel drawing ───────────────────────────────────
  function drawWheel() {
    const canvas = document.getElementById('rlCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const outerR = W / 2 - 2;
    const innerR = outerR * 0.68;
    const textR = (outerR + innerR) / 2;
    const numPockets = WHEEL_ORDER.length; // 37
    const arcAngle = (Math.PI * 2) / numPockets;

    ctx.clearRect(0, 0, W, H);

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2014';
    ctx.fill();

    // Draw pockets
    for (let i = 0; i < numPockets; i++) {
      const num = WHEEL_ORDER[i];
      const startAngle = i * arcAngle - Math.PI / 2 - arcAngle / 2;
      const endAngle = startAngle + arcAngle;

      // Pocket slice
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR - 2, startAngle, endAngle);
      ctx.closePath();

      const col = pocketColor(num);
      if (col === 'red') ctx.fillStyle = '#c41e3a';
      else if (col === 'black') ctx.fillStyle = '#1a1a1a';
      else ctx.fillStyle = '#0a7a2a';
      ctx.fill();

      // Pocket border
      ctx.strokeStyle = 'rgba(200,180,100,0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Number text
      ctx.save();
      const midAngle = startAngle + arcAngle / 2;
      ctx.translate(cx + Math.cos(midAngle) * textR, cy + Math.sin(midAngle) * textR);
      ctx.rotate(midAngle + Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 7px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), 0, 0);
      ctx.restore();
    }

    // Inner circle (dark center)
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx, cy, innerR * 0.3, cx, cy, innerR);
    grad.addColorStop(0, '#1a3020');
    grad.addColorStop(1, '#0a1a10');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,180,100,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Decorative ring
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200,180,100,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();

    wheelDrawn = true;
  }

  // ── Spin animation ─────────────────────────────────────────
  function spinWheel(resultNumber, callback) {
    const wheel = document.getElementById('rlWheel');
    const ball = document.getElementById('rlBall');
    if (!wheel) return callback();

    // Find the pocket index of the result
    const pocketIndex = WHEEL_ORDER.indexOf(resultNumber);
    const numPockets = WHEEL_ORDER.length;
    const pocketAngle = 360 / numPockets;

    // Target: the pocket should align with the top pointer
    // The wheel rotates clockwise, pointer is at top (0 deg)
    // Pocket i is at angle i * pocketAngle from start
    // We want that pocket at the top, so rotate to bring it there
    const targetPocketAngle = pocketIndex * pocketAngle;
    // Add multiple full rotations for drama
    const fullSpins = 5 + Math.floor(Math.random() * 3); // 5-7 full rotations
    const targetAngle = wheelAngle + fullSpins * 360 + (360 - targetPocketAngle);

    // Show the ball
    if (ball) {
      ball.classList.add('visible');
      _animateBall(ball, 4000);
    }

    wheel.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    wheel.style.transform = `rotate(${targetAngle}deg)`;
    wheelAngle = targetAngle % 360;

    setTimeout(() => {
      if (ball) ball.classList.remove('visible');
      callback();
    }, 4200);
  }

  function _animateBall(ball, duration) {
    const canvas = document.getElementById('rlCanvas');
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const startR = 80;  // starts near outer edge
    const endR = 62;    // ends closer to inner
    const startTime = performance.now();

    function frame(now) {
      const t = Math.min((now - startTime) / duration, 1);
      // Ball spirals inward and slows down
      const angle = t * (360 * 6) * (Math.PI / 180) * (1 - t * 0.3);
      const r = startR - (startR - endR) * t;
      const bx = cx + Math.cos(angle) * r - 5;
      const by = cy + Math.sin(angle) * r - 5;
      ball.style.left = bx + 'px';
      ball.style.top = by + 'px';
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ── Betting board ──────────────────────────────────────────
  function buildBoard() {
    const board = document.getElementById('rlBoard');
    if (!board) return;
    board.innerHTML = '';

    // Row 1: Zero spans 3 rows on the left, then numbers 1-36 in a 3×12 grid
    // Zero cell
    const zero = _cell('0', 'rl-green', 'straight', 0);
    zero.style.gridColumn = '1';
    zero.style.gridRow = '1 / 4';
    board.appendChild(zero);

    // Numbers 1-36: 3 rows, 12 columns (col 2-13)
    // Row layout: bottom row = 1,4,7,...,34  mid = 2,5,8,...,35  top = 3,6,9,...,36
    for (let col = 0; col < 12; col++) {
      for (let row = 0; row < 3; row++) {
        const num = (col * 3) + (3 - row); // 3,2,1, 6,5,4, ...
        const colorClass = RED_NUMBERS.has(num) ? 'rl-red' : 'rl-black';
        const cell = _cell(String(num), colorClass, 'straight', num);
        cell.style.gridColumn = String(col + 2);
        cell.style.gridRow = String(row + 1);
        board.appendChild(cell);
      }
    }

    // Column bets (bottom of each column)
    const colLabels = ['2:1', '2:1', '2:1'];
    const colTypes = ['col3', 'col2', 'col1']; // row 1=col3, row 2=col2, row 3=col1
    for (let row = 0; row < 3; row++) {
      const cell = _cell(colLabels[row], 'rl-outside', colTypes[row]);
      cell.style.gridColumn = '14';
      cell.style.gridRow = String(row + 1);
      board.appendChild(cell);
    }

    // Dozen bets (row 4)
    const dozens = [
      { label: '1st 12', type: 'dozen1' },
      { label: '2nd 12', type: 'dozen2' },
      { label: '3rd 12', type: 'dozen3' },
    ];
    dozens.forEach((d, i) => {
      const cell = _cell(d.label, 'rl-outside', d.type);
      cell.style.gridColumn = `${i * 4 + 2} / ${i * 4 + 6}`;
      cell.style.gridRow = '4';
      board.appendChild(cell);
    });

    // Even-money bets (row 5)
    const evens = [
      { label: '1-18', type: 'low' },
      { label: 'EVEN', type: 'even' },
      { label: 'RED', type: 'red', cls: 'rl-red' },
      { label: 'BLK', type: 'black', cls: 'rl-black' },
      { label: 'ODD', type: 'odd' },
      { label: '19-36', type: 'high' },
    ];
    evens.forEach((e, i) => {
      const cell = _cell(e.label, e.cls || 'rl-outside', e.type);
      cell.style.gridColumn = `${i * 2 + 2} / ${i * 2 + 4}`;
      cell.style.gridRow = '5';
      board.appendChild(cell);
    });
  }

  function _cell(label, colorClass, betType, betValue) {
    const div = document.createElement('div');
    div.className = 'rl-cell ' + colorClass;
    div.textContent = label;
    div.dataset.betType = betType;
    if (betValue !== undefined) div.dataset.betValue = betValue;
    div.addEventListener('click', () => _placeBet(div, betType, betValue));
    return div;
  }

  function _placeBet(cell, type, value) {
    if (spinning) return;
    const chipSize = parseInt(document.getElementById('rlChipSize')?.value, 10) || 100;
    if (typeof playerCoins === 'number' && _totalBet() + chipSize > playerCoins) {
      _setStatus('Not enough coins.'); return;
    }

    const key = value !== undefined ? `${type}:${value}` : type;
    bets[key] = (bets[key] || 0) + chipSize;

    _updateChipDisplay(cell, bets[key]);
    _updateTotalBet();
  }

  function _updateChipDisplay(cell, amount) {
    let chip = cell.querySelector('.rl-chip-count');
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'rl-chip-count';
      cell.appendChild(chip);
    }
    chip.textContent = amount >= 1000 ? Math.floor(amount / 1000) + 'K' : amount;
    cell.classList.add('rl-active');
  }

  function _totalBet() {
    return Object.values(bets).reduce((s, v) => s + v, 0);
  }

  function _updateTotalBet() {
    const el = document.getElementById('rlTotalBet');
    if (el) el.textContent = _totalBet();
  }

  function _clearBets() {
    if (spinning) return;
    bets = {};
    document.querySelectorAll('.rl-cell').forEach(c => {
      const chip = c.querySelector('.rl-chip-count');
      if (chip) chip.remove();
      c.classList.remove('rl-active', 'rl-win-flash');
    });
    _updateTotalBet();
    _setStatus('Place chips on the board and SPIN.');
  }

  // ── Spin ───────────────────────────────────────────────────
  async function doSpin() {
    if (spinning) return;
    const total = _totalBet();
    if (total === 0) { _setStatus('Place at least one bet.'); return; }

    spinning = true;
    const spinBtn = document.getElementById('rlSpinBtn');
    const clearBtn = document.getElementById('rlClearBtn');
    if (spinBtn) spinBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = true;

    // Hide previous result
    const resultEl = document.getElementById('rlResult');
    if (resultEl) resultEl.classList.add('hidden');

    // Convert bets map to array for server
    const betArray = Object.entries(bets).map(([key, amount]) => {
      const parts = key.split(':');
      const type = parts[0];
      let value = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
      if (type === 'straight' && value !== undefined) {
        return { type, value, amount };
      }
      return { type, amount };
    });

    try {
      const res = await fetch(`${API}/roulette/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bets: betArray }),
      });
      const data = await res.json();
      if (!res.ok) {
        _setStatus(data.error || 'Spin failed.');
        _finish();
        return;
      }

      // Animate the wheel
      spinWheel(data.result, () => {
        // Show result
        _showResult(data.result, data.color);

        // Update balance
        window.casinoApplyBalance(data.newBalance);

        // Flash winning cells
        _flashWinningCells(data.bets);

        // Status message
        if (data.totalPayout > 0) {
          _setStatus(`${data.result} ${data.color.toUpperCase()}! Won ${data.totalPayout} (+${data.netGain} net)`);
        } else {
          _setStatus(`${data.result} ${data.color.toUpperCase()}. No wins. -${data.totalBet}`);
        }

        // Clear bets for next round
        setTimeout(() => {
          _clearBetsVisual();
          _finish();
        }, 2000);
      });

    } catch (e) {
      _setStatus('Network error.');
      _finish();
    }

    function _finish() {
      spinning = false;
      if (spinBtn) spinBtn.disabled = false;
      if (clearBtn) clearBtn.disabled = false;
    }
  }

  function _showResult(num, color) {
    const el = document.getElementById('rlResult');
    const numEl = document.getElementById('rlResultNumber');
    if (!el || !numEl) return;
    numEl.textContent = num;
    numEl.className = 'rl-result-number rl-' + color;
    el.classList.remove('hidden');
  }

  function _flashWinningCells(betResults) {
    if (!betResults) return;
    betResults.forEach(b => {
      if (!b.won) return;
      const key = b.value !== undefined ? `${b.type}:${b.value}` : b.type;
      // Find matching cell
      document.querySelectorAll('.rl-cell').forEach(cell => {
        const cType = cell.dataset.betType;
        const cVal = cell.dataset.betValue;
        const cKey = cVal !== undefined ? `${cType}:${cVal}` : cType;
        if (cKey === key) cell.classList.add('rl-win-flash');
      });
    });
  }

  function _clearBetsVisual() {
    bets = {};
    document.querySelectorAll('.rl-cell').forEach(c => {
      const chip = c.querySelector('.rl-chip-count');
      if (chip) chip.remove();
      c.classList.remove('rl-active', 'rl-win-flash');
    });
    _updateTotalBet();
  }

  // ── Helpers ────────────────────────────────────────────────
  function _setStatus(text) {
    const el = document.getElementById('rlStatus');
    if (el) el.textContent = text;
  }

  function _resetTable() {
    _clearBets();
    const resultEl = document.getElementById('rlResult');
    if (resultEl) resultEl.classList.add('hidden');
    spinning = false;
    const spinBtn = document.getElementById('rlSpinBtn');
    const clearBtn = document.getElementById('rlClearBtn');
    if (spinBtn) spinBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;
    if (!wheelDrawn) drawWheel();
  }

  // ── Wiring ─────────────────────────────────────────────────
  function wire() {
    document.getElementById('rlSpinBtn')?.addEventListener('click', doSpin);
    document.getElementById('rlClearBtn')?.addEventListener('click', _clearBets);
    buildBoard();
    drawWheel();
  }

  window.addEventListener('casino:tab-activated', (e) => {
    if (e.detail === 'roulette') _resetTable();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
