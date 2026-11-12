// Core Checkers (American/English 8x8) rules, state management, board rendering, and UI controller.
// Board: Int8Array(64), index = r*8+c. 1 = X man, 2 = X king, -1 = O man, -2 = O king. X (player 0) starts at the bottom and moves first.
const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const ownerOf = (v) => (v > 0 ? 0 : 1);
const isKing = (v) => v === 2 || v === -2;
const kingRow = (v) => (v > 0 ? 0 : 7);
const dirsOf = (v) => (isKing(v) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : v > 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);

function newState() {
  const b = new Int8Array(64);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) { if (r < 3) b[r * 8 + c] = -1; else if (r > 4) b[r * 8 + c] = 1; }
  return { b, turn: 0, np: 0 };
}
const cloneState = (s) => ({ b: s.b.slice(), turn: s.turn, np: s.np });
const countPieces = (s, pi) => { let n = 0; for (let i = 0; i < 64; i++) if (s.b[i] && ownerOf(s.b[i]) === pi) n++; return n; };

// Move = { f: fromIndex, p: [landing indices], c: [captured indices] }
function jumpsFrom(b, f, v, r, c, caps, path, out) {
  let any = false;
  for (const [dr, dc] of dirsOf(v)) {
    const lr = r + 2 * dr, lc = c + 2 * dc;
    if (!inb(lr, lc)) continue;
    const mi = (r + dr) * 8 + (c + dc), li = lr * 8 + lc, mv = b[mi];
    if (mv === 0 || ownerOf(mv) === ownerOf(v) || caps.includes(mi)) continue;
    if (b[li] !== 0 && li !== f) continue;
    any = true;
    const nc = caps.concat(mi), np = path.concat(li);
    if (!isKing(v) && lr === kingRow(v)) out.push({ f, p: np, c: nc }); // man crowned mid-jump: turn ends
    else jumpsFrom(b, f, v, lr, lc, nc, np, out);
  }
  if (!any && caps.length) out.push({ f, p: path, c: caps });
}
function legalMoves(s) {
  const b = s.b, jumps = [], steps = [];
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (!v || ownerOf(v) !== s.turn) continue;
    const r = i >> 3, c = i & 7;
    jumpsFrom(b, i, v, r, c, [], [], jumps);
    if (!jumps.length) for (const [dr, dc] of dirsOf(v)) { const nr = r + dr, nc = c + dc; if (inb(nr, nc) && !b[nr * 8 + nc]) steps.push({ f: i, p: [nr * 8 + nc], c: [] }); }
  }
  return jumps.length ? jumps : steps; // capturing is mandatory
}
function applyMove(s, m) {
  const n = cloneState(s), v = n.b[m.f], end = m.p[m.p.length - 1];
  n.b[m.f] = 0; for (const x of m.c) n.b[x] = 0;
  n.b[end] = (!isKing(v) && (end >> 3) === kingRow(v)) ? v * 2 : v;
  n.np = (m.c.length || !isKing(v)) ? 0 : s.np + 1;
  n.turn = 1 - s.turn;
  return n;
}
// -1 = ongoing, 0/1 = winner, 2 = draw (80 plies with no capture or man move)
function resultOf(s, moves) { moves = moves || legalMoves(s); if (!moves.length) return 1 - s.turn; return s.np >= 80 ? 2 : -1; }
function findMove(s, m) {
  if (!m || !Array.isArray(m.p)) return null;
  return legalMoves(s).find(x => x.f === m.f && x.p.length === m.p.length && x.p.every((q, i) => q === m.p[i])) || null;
}

/* ==========================================================================
   GAME CONTROLLER + UI
   ========================================================================== */
class CheckersGame {
  constructor() {
    this.mode = 'bot'; this.difficulty = 'medium';
    this.sel = null; this.chain = [];
    this.scores = this.loadScores();
    this.dialogue = {
      thinking: ['อืม... ตานี้ต้องสุขุม คิดลึกแป๊บนะเพื่อน...', 'ขอเวลาจิบน้ำแป๊บ กระดานนี้ซับซ้อนจัดเลย!', 'กำลังคำนวณทางกินหมาก... อย่าเพิ่งใจร้อนนะ!', 'อ่านเกมล่วงหน้าหลายตา... แป๊บเดียวนะเพื่อน!'],
      playerTurnStart: ['ตาเธอแล้วเพื่อน! ค่อยๆ คิด ไม่ต้องรีบนะ', 'เดินหมากไหนดีเอ่ย? ให้ดูฝีมือหน่อย!', 'ลุยเลยเพื่อน อย่าให้ฉันกินหมากเธอหมดนะ หึๆ'],
      playerIdle: ['คิดนานจังเพื่อน กาแฟฉันจะหมดแก้วแล้วเนี่ย 555 ☕', 'แอบเปิดสูตรมารึเปล่าเนี่ย? เงียบไปนานเลยนะ!', 'ค่อย ๆ คิดได้ ไม่ต้องรีบ... แต่เดินไว ๆ หน่อยก็ดีนะ 😆'],
      botMoved: ['จัดไป! ดูซิว่าจะแก้หมากนี้ยังไง!', 'ก้าวนี้สวยงามตามตำรา!', 'วางแผนไว้หมดแล้ว ตาเธอแล้วเพื่อน!'],
      botCapture: ['ขอกินหมากหน่อยนะเพื่อน! 😋', 'งับ! ขอบคุณสำหรับหมากนะ 🍴', 'กินแล้วจ้า ตาเธอแก้เกมเลย!'],
      playerCapture: ['โอ้โห กินหมากฉันเฉยเลย! ต้องแก้เกมแล้ว', 'กินได้สวยนะเพื่อน แต่ฉันยังไม่ยอมแพ้!'],
      playerGameWin: ['สุดยอดไปเลยเพื่อน! ยอมรับในฝีมือเลย คารวะ 1 จอก! 🏆', 'เฉียบขาดมาก! เกมนี้เป็นของเธอแล้ว 👑'],
      botGameWin: ['เกมนี้สนุกมากเพื่อน! ตาหน้าแก้ตัวใหม่นะ! 🤖', 'เกือบไปเหมือนกันนะเนี่ย! ฝีมือเธอพัฒนาขึ้นเยอะมาก!'],
      draw: ['เสมอกันซะงั้น! สูสีสมศักดิ์ศรีเลยเพื่อน 🤝']
    };
    this.playerIdleTimer = null; this.aiMidThinkTimer = null; this.aiTimer = null; this.hintTimer = null;
    this.initDOM(); this.resetGame(); this.bindEvents(); this.handleInviteLink();
  }

  /* ---------- storage ---------- */
  loadScores() {
    const def = { bot: { x: 0, o: 0 }, pvp: { x: 0, o: 0 }, online: { x: 0, o: 0 } };
    try {
      const saved = localStorage.getItem('retro_checkers_scores'); if (!saved) return def;
      const parsed = JSON.parse(saved), merged = {};
      Object.keys(def).forEach(k => { merged[k] = Object.assign({}, def[k], parsed[k] || {}); });
      return merged;
    } catch (e) { return def; }
  }
  saveScores() { try { localStorage.setItem('retro_checkers_scores', JSON.stringify(this.scores)); } catch (e) {} }

  /* ---------- DOM ---------- */
  initDOM() {
    const $ = (id) => document.getElementById(id);
    this.boardEl = $('cboard');
    this.turnIndicatorEl = $('turn-indicator'); this.turnPlayerMarkEl = $('turn-player-mark'); this.turnTextEl = $('turn-text');
    this.boardHintEl = $('board-hint');
    this.scoreXEl = $('score-x'); this.scoreOEl = $('score-o'); this.moveCountEl = $('move-count');
    this.labelXEl = $('label-x'); this.labelOEl = $('label-o'); this.piecesXEl = $('walls-x'); this.piecesOEl = $('walls-o');
    this.modeBtns = document.querySelectorAll('.mode-btn'); this.diffBtns = document.querySelectorAll('.diff-btn');
    this.diffContainerEl = $('difficulty-container');
    this.botChatSectionEl = $('bot-chat-section'); this.botAvatarEl = $('bot-avatar'); this.speechTextEl = $('speech-text'); this.chatToggleBtn = $('chat-toggle-btn');
    try { this.isChatMuted = localStorage.getItem('retro_checkers_chat_muted') === 'true'; } catch (e) { this.isChatMuted = false; }
    if (this.isChatMuted) { this.botChatSectionEl.classList.add('chat-hidden'); this.chatToggleBtn.textContent = '🤫'; }
    this.modalEl = $('result-modal'); this.modalTitleEl = $('modal-title'); this.modalSubtitleEl = $('modal-subtitle'); this.modalIconEl = $('modal-icon'); this.playAgainBtn = $('play-again-btn');
    this.rulesModalEl = $('rules-modal'); this.openRulesBtn = $('open-rules-btn'); this.closeRulesBtn = $('close-rules-btn'); this.rulesOkBtn = $('rules-ok-btn');
    this.restartBtn = $('restart-btn'); this.muteBtn = $('mute-btn');
    this.onlineBarEl = $('online-bar'); this.onlineCodeEl = $('online-room-code'); this.onlineRoleEl = $('online-role'); this.onlineStatusEl = $('online-status');
    this.copyLinkBtn = $('copy-link-btn'); this.leaveRoomBtn = $('leave-room-btn');
    this.lobbyModalEl = $('lobby-modal'); this.lobbyCreateBtn = $('lobby-create-btn'); this.lobbyCloseBtn = $('lobby-close-btn');
    this.lobbyCodeBoxEl = $('lobby-code-box'); this.lobbyCodeDisplayEl = $('lobby-code-display'); this.lobbyCopyBtn = $('lobby-copy-btn');
    this.lobbyCodeInputEl = $('lobby-code-input'); this.lobbyJoinBtn = $('lobby-join-btn'); this.lobbyStatusEl = $('lobby-status'); this.lobbyTransportEl = $('lobby-transport');
    this.initOnline();
  }

  /* ---------- online ---------- */
  initOnline() {
    this.online = { active: false, code: null, isHost: false, myIdx: null, peerOnline: false, joined: false };
    this.net = new QNet({ onMessage: (m) => this.handleNetMessage(m), onPeerChange: (v) => this.handlePeerChange(v), onStatus: (st) => this.handleNetStatus(st) });
    this.updateOnlineBar();
  }
  generateRoomCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 6; i++) c += a[Math.floor(Math.random() * a.length)]; return c; }
  markModeButton(mode) { this.modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode)); }
  applyModeUI() {
    const isBot = this.mode === 'bot';
    this.diffContainerEl.style.display = isBot ? 'flex' : 'none';
    this.botChatSectionEl.style.display = isBot ? 'flex' : 'none';
    this.updateOnlineBar();
  }
  get flip() { return this.mode === 'online' && this.online.active && this.online.myIdx === 1; }
  canPlayNow() {
    if (this.gameOver) return false;
    if (this.mode === 'bot') return !this.isAiThinking && this.s.turn === 0;
    if (this.mode === 'online') {
      if (!this.online.active || !this.online.joined || !this.online.peerOnline) return false;
      return this.s.turn === this.online.myIdx;
    }
    return true;
  }
  openLobby() {
    this.lobbyStatusEl.textContent = ''; this.lobbyCodeBoxEl.classList.add('hidden');
    this.lobbyTransportEl.textContent = QNet.transportName() === 'pubnub' ? 'โหมดออนไลน์: PubNub — เล่นข้ามเครื่องได้' : 'โหมดทดสอบ: ใช้ได้เฉพาะแท็บ/หน้าต่างในเบราว์เซอร์เดียวกัน';
    this.lobbyModalEl.classList.remove('hidden'); this.updateOnlineBar();
  }
  closeLobby() { this.lobbyModalEl.classList.add('hidden'); }
  cancelLobby() {
    this.closeLobby();
    if (!this.online.active && this.mode === 'online') { this.mode = 'bot'; this.markModeButton('bot'); this.applyModeUI(); this.resetGame(); }
  }
  createRoom() {
    const code = this.generateRoomCode();
    this.transportWarning = null;
    this.online = { active: true, code, isHost: true, myIdx: 0, peerOnline: false, joined: true };
    this.mode = 'online'; this.markModeButton('online'); this.applyModeUI();
    this.lobbyCodeBoxEl.classList.remove('hidden'); this.lobbyCodeDisplayEl.textContent = code;
    this.lobbyStatusEl.textContent = 'รอคู่แข่งเข้าห้อง...';
    this.updateOnlineBar(); this.resetGame(); this.net.connect(code);
  }
  joinRoom(input) {
    const code = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length !== 6) { this.lobbyStatusEl.textContent = 'รหัสห้องต้องมี 6 ตัวอักษร'; return; }
    this.transportWarning = null;
    this.online = { active: true, code, isHost: false, myIdx: 1, peerOnline: false, joined: true };
    this.mode = 'online'; this.markModeButton('online'); this.applyModeUI();
    this.lobbyCodeBoxEl.classList.remove('hidden'); this.lobbyCodeDisplayEl.textContent = code;
    this.lobbyStatusEl.textContent = `กำลังเข้าห้อง ${code}...`;
    this.updateOnlineBar(); this.resetGame();
    this.net.connect(code).then((ok) => { if (ok) this.net.send({ type: 'hello' }); });
  }
  leaveRoom() {
    if (this.net) { this.net.send({ type: 'leave' }); this.net.disconnect(); }
    this.online = { active: false, code: null, isHost: false, myIdx: null, peerOnline: false, joined: false };
    this.closeLobby(); this.updateOnlineBar();
  }
  getRoomLink() { const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : null; return base ? `${base}?room=${this.online.code}` : null; }
  async copyRoomLink() {
    if (!this.online.code) return;
    const link = this.getRoomLink(), text = link || this.online.code; let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {}
    const msg = copied ? (link ? 'คัดลอกลิงก์เชิญแล้ว ส่งให้เพื่อนได้เลย!' : `คัดลอกรหัส ${this.online.code} แล้ว`) : (link ? `ส่งลิงก์นี้ให้เพื่อน: ${link}` : `รหัสห้อง: ${this.online.code}`);
    this.lobbyStatusEl.textContent = msg; this.onlineStatusEl.title = msg;
  }
  handleInviteLink() {
    let raw = null; try { raw = new URLSearchParams(location.search).get('room'); } catch (e) {}
    if (!raw) return;
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length !== 6) return;
    this.markModeButton('online'); this.openLobby(); this.joinRoom(code);
  }
  updateOnlineBar() {
    const active = this.mode === 'online' && this.online.active;
    this.onlineBarEl.classList.toggle('hidden', !active);
    if (!active) return;
    this.onlineCodeEl.textContent = this.online.code || '------';
    this.onlineRoleEl.textContent = this.online.isHost ? 'เจ้าของห้อง (X)' : 'ผู้เข้าร่วม (O)';
    const transport = QNet.transportName() === 'pubnub' ? 'PubNub' : 'ทดสอบในเบราว์เซอร์';
    if (this.transportWarning) { this.onlineStatusEl.textContent = 'เชื่อมต่อไม่สำเร็จ'; this.onlineStatusEl.className = 'online-status is-error'; this.onlineStatusEl.title = this.transportWarning; return; }
    this.onlineStatusEl.textContent = this.online.peerOnline ? 'คู่แข่งออนไลน์' : 'รอคู่แข่ง...';
    this.onlineStatusEl.className = this.online.peerOnline ? 'online-status is-online' : 'online-status is-waiting';
    this.onlineStatusEl.title = (this.online.peerOnline ? 'คู่แข่งเชื่อมต่อแล้ว' : 'กำลังรอคู่แข่งเข้าห้อง') + ` — ช่องทาง: ${transport}`;
  }
  handleNetStatus(st) {
    if (st.state === 'error' && st.message) { this.transportWarning = st.message; this.lobbyStatusEl.textContent = st.message; this.updateOnlineBar(); return; }
    if (st.state === 'connected' && st.transport === 'pubnub') { this.transportWarning = null; this.updateOnlineBar(); }
  }
  handlePeerChange(on) {
    if (!this.online.active) return;
    this.online.peerOnline = on;
    if (on) { this.lobbyStatusEl.textContent = 'คู่แข่งเชื่อมต่อแล้ว เริ่มเกมได้เลย!'; this.closeLobby(); }
    else this.lobbyStatusEl.textContent = 'คู่แข่งหลุดการเชื่อมต่อ...';
    this.updateOnlineBar(); this.renderBoard(); this.updateStatus();
  }
  handleNetMessage(msg) {
    if (!this.online.active || !msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'hello': if (this.online.isHost) { this.broadcastState(); this.lobbyStatusEl.textContent = 'คู่แข่งเข้าห้องแล้ว! เริ่มเกมได้เลย'; this.closeLobby(); } break;
      case 'state': if (!this.online.isHost) { this.applyRemoteState(msg.state); this.closeLobby(); } break;
      case 'move': if (this.online.isHost) this.applyGuestMove(msg.m); break;
      case 'restart': if (this.online.isHost) this.resetGame(); break;
      case 'leave': this.lobbyStatusEl.textContent = 'คู่แข่งออกจากห้องแล้ว'; this.updateOnlineBar(); break;
    }
  }
  broadcastState() {
    if (!this.online || !this.online.active || !this.online.isHost || !this.net) return;
    this.net.send({ type: 'state', state: { b: Array.from(this.s.b), turn: this.s.turn, np: this.s.np, gameOver: this.gameOver, winner: this.winner, last: this.last, moveCount: this.moveCount } });
  }
  applyGuestMove(m) {
    if (this.gameOver || this.s.turn !== 1) return;
    const lm = findMove(this.s, m); if (!lm) return;
    this.commit(lm); this.broadcastState();
  }
  applyRemoteState(st) {
    if (!st || !st.b || st.b.length !== 64) return;
    const wasOver = this.gameOver, prevKey = this.last ? JSON.stringify(this.last) : null;
    this.s = { b: Int8Array.from(st.b), turn: st.turn, np: st.np || 0 };
    this.gameOver = st.gameOver; this.winner = st.winner; this.last = st.last || null; this.moveCount = st.moveCount || 0;
    this.isAiThinking = false; this.sel = null; this.chain = []; this.moves = legalMoves(this.s);
    const nextKey = this.last ? JSON.stringify(this.last) : null;
    if (nextKey && nextKey !== prevKey && window.retroAudio) this.last.cap ? window.retroAudio.playCapture() : window.retroAudio.playMove(this.last.player);
    if (!this.gameOver) this.hideModal();
    this.renderBoard(); this.updateStatus(); this.updateScoreboardDisplay();
    if (!wasOver && this.gameOver) this.handleGameOver(this.winner);
  }
  requestRematch() {
    if (this.mode !== 'online') { this.resetGame(); return; }
    if (this.online.isHost) this.resetGame();
    else { this.net.send({ type: 'restart' }); this.lobbyStatusEl.textContent = 'ขอเล่นใหม่อีกครั้ง...'; }
  }

  /* ---------- bot chat ---------- */
  botSpeak(category, custom = null) {
    if (this.mode !== 'bot') return;
    let text = custom;
    if (!text && this.dialogue[category]) { const l = this.dialogue[category]; text = l[Math.floor(Math.random() * l.length)]; }
    if (!text) return;
    this.speechTextEl.textContent = text;
    this.botAvatarEl.classList.remove('is-speaking'); void this.botAvatarEl.offsetWidth; this.botAvatarEl.classList.add('is-speaking');
  }
  startPlayerIdleTimer() {
    this.clearPlayerIdleTimer();
    if (this.mode !== 'bot' || this.gameOver || this.s.turn !== 0) return;
    this.playerIdleTimer = setTimeout(() => { if (!this.gameOver && this.s.turn === 0 && !this.isAiThinking) this.botSpeak('playerIdle'); }, 6500);
  }
  clearPlayerIdleTimer() { if (this.playerIdleTimer) { clearTimeout(this.playerIdleTimer); this.playerIdleTimer = null; } }

  /* ---------- game flow ---------- */
  resetGame() {
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    if (this.aiMidThinkTimer) { clearTimeout(this.aiMidThinkTimer); this.aiMidThinkTimer = null; }
    this.clearPlayerIdleTimer();
    this.botAvatarEl.classList.remove('is-thinking', 'is-speaking');
    this.s = newState(); this.moves = legalMoves(this.s);
    this.gameOver = false; this.winner = null; this.isAiThinking = false; this.last = null; this.moveCount = 0;
    this.sel = null; this.chain = [];
    this.hideModal(); this.renderBoard(); this.updateStatus(); this.updateScoreboardDisplay();
    if (this.mode === 'bot') { this.botSpeak('playerTurnStart'); this.startPlayerIdleTimer(); }
    if (this.mode === 'online' && this.online.active && this.online.isHost) this.broadcastState();
  }
  flash(msg) {
    this.boardHintEl.textContent = msg;
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { this.hintTimer = null; this.updateHint(); }, 2600);
  }
  shake(el) { el.classList.remove('shake-anim'); void el.offsetWidth; el.classList.add('shake-anim'); }

  tryHumanMove(m) {
    this.sel = null; this.chain = [];
    if (!this.canPlayNow()) { window.retroAudio.playInvalid(); this.shake(this.boardEl); this.renderBoard(); return; }
    const lm = findMove(this.s, m);
    if (!lm) { window.retroAudio.playInvalid(); this.shake(this.boardEl); this.flash('เดินแบบนั้นไม่ได้'); this.renderBoard(); return; }
    if (this.mode === 'online' && !this.online.isHost) { this.net.send({ type: 'move', m: { f: lm.f, p: lm.p } }); this.renderBoard(); return; }
    this.commit(lm);
    if (this.mode === 'online') this.broadcastState();
    this.renderBoard(); this.updateStatus();
    if (this.mode === 'bot' && !this.gameOver && this.s.turn === 1) this.triggerAiMove();
  }

  commit(m) {
    this.clearPlayerIdleTimer();
    const mover = this.s.turn, before = this.s.b[m.f];
    this.s = applyMove(this.s, m); this.moveCount++;
    this.last = { f: m.f, p: m.p, player: mover, cap: m.c.length > 0 };
    const crowned = !isKing(before) && isKing(this.s.b[m.p[m.p.length - 1]]);
    if (crowned) window.retroAudio.playKing(); else if (m.c.length) window.retroAudio.playCapture(); else window.retroAudio.playMove(mover);
    if (this.mode === 'bot' && m.c.length && mover === 0) this.botSpeak('playerCapture');
    this.moves = legalMoves(this.s);
    const w = resultOf(this.s, this.moves);
    if (w >= 0) {
      this.gameOver = true; this.winner = w;
      this.renderBoard(); this.updateStatus(); this.updateScoreboardDisplay(); this.handleGameOver(w); return;
    }
    this.renderBoard(); this.updateStatus(); this.updateScoreboardDisplay();
    if (this.mode === 'bot' && this.s.turn === 0) this.startPlayerIdleTimer();
  }

  getAiThinkingDelay() {
    const ranges = { easy: [1000, 2000], medium: [1500, 3000], hard: [2000, 3800] };
    const [min, max] = ranges[this.difficulty];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  triggerAiMove() {
    this.clearPlayerIdleTimer();
    this.isAiThinking = true; this.botAvatarEl.classList.add('is-thinking'); this.botSpeak('thinking');
    this.renderBoard(); this.updateStatus();
    const delay = this.getAiThinkingDelay();
    if (this.aiTimer) clearTimeout(this.aiTimer);
    if (this.aiMidThinkTimer) clearTimeout(this.aiMidThinkTimer);
    if (delay >= 2500) {
      this.aiMidThinkTimer = setTimeout(() => {
        if (this.isAiThinking && !this.gameOver) {
          const l = ['กำลังวิเคราะห์หมากของเธอ... 🤔', 'โอเค ใกล้ได้ก้าวที่เฉียบคมแล้ว!', 'อ่านเกมทะลุปรุโปร่งแล้ว พร้อมลุย!'];
          this.botSpeak(null, l[Math.floor(Math.random() * l.length)]);
        }
      }, Math.floor(delay * 0.52));
    }
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (this.gameOver) { this.isAiThinking = false; this.botAvatarEl.classList.remove('is-thinking'); return; }
      const m = botBestMove(this.s, this.difficulty);
      this.isAiThinking = false; this.botAvatarEl.classList.remove('is-thinking');
      if (m) { this.botSpeak(m.c.length ? 'botCapture' : 'botMoved'); this.commit(m); this.renderBoard(); this.updateStatus(); }
    }, delay);
  }

  handleGameOver(w) {
    this.clearPlayerIdleTimer();
    if (w < 2) { const bucket = this.scores[this.mode]; if (w === 0) bucket.x++; else bucket.o++; this.saveScores(); }
    this.updateScoreboardDisplay();
    if (this.mode === 'bot') {
      if (w === 0) { window.retroAudio.playGameWin(); this.botSpeak('playerGameWin'); }
      else if (w === 1) { window.retroAudio.playDraw(); this.botSpeak('botGameWin'); }
      else { window.retroAudio.playDraw(); this.botSpeak('draw'); }
    } else if (w === 2) window.retroAudio.playDraw(); else window.retroAudio.playGameWin();
    setTimeout(() => this.showModal(w), 600);
  }

  /* ---------- rendering ---------- */
  candidates() {
    if (this.sel === null) return [];
    return this.moves.filter(m => m.f === this.sel && this.chain.every((q, i) => m.p[i] === q));
  }
  renderBoard() {
    const s = this.s, f = this.flip, canAct = this.canPlayNow();
    const movable = new Set(canAct && this.sel === null ? this.moves.map(m => m.f) : []);
    const cand = canAct ? this.candidates() : [];
    const targets = new Set(cand.map(m => m.p[this.chain.length]));
    const ghost = new Set(cand.length ? cand[0].c.slice(0, this.chain.length) : []);
    const lastSq = new Set(this.last ? [this.last.f, this.last.p[this.last.p.length - 1]] : []);
    const frag = document.createDocumentFragment();
    for (let R = 0; R < 8; R++) for (let C = 0; C < 8; C++) {
      const r = f ? 7 - R : R, c = f ? 7 - C : C, i = r * 8 + c, dark = (r + c) % 2 === 1;
      let cls = 'csq ' + (dark ? 'dk' : 'lt');
      if (dark && r === 0) cls += ' goal-x'; if (dark && r === 7) cls += ' goal-o';
      if (lastSq.has(i)) cls += ' last';
      const isT = targets.has(i), isM = movable.has(i), isS = canAct && this.sel === i;
      if (isT) cls += ' target'; if (isM) cls += ' movable'; if (isS) cls += ' sel';
      const cell = document.createElement(dark ? 'button' : 'div');
      cell.className = cls; cell.style.gridArea = `${R + 1} / ${C + 1}`;
      if (dark) { cell.dataset.i = i; cell.setAttribute('aria-label', `แถว ${r + 1} คอลัมน์ ${c + 1}`); cell.tabIndex = -1; }
      const v = s.b[i];
      if (v) {
        const o = ownerOf(v), pawn = document.createElement('div');
        pawn.className = 'pawn ' + (o === 0 ? 'pawn-x' : 'pawn-o') + (isKing(v) ? ' king' : '') + (ghost.has(i) ? ' ghost' : '') + (this.gameOver && this.winner === o ? ' winner' : '');
        pawn.textContent = isKing(v) ? '♛' : (o === 0 ? 'X' : 'O');
        cell.appendChild(pawn);
      }
      frag.appendChild(cell);
    }
    this.boardEl.innerHTML = ''; this.boardEl.appendChild(frag);
  }

  onBoardClick(e) {
    const el = e.target.closest('[data-i]'); if (!el) return;
    if (!this.canPlayNow()) { window.retroAudio.playInvalid(); return; }
    const i = +el.dataset.i;
    if (this.sel !== null) {
      const cand = this.candidates();
      if (cand.some(m => m.p[this.chain.length] === i)) {
        this.chain.push(i); window.retroAudio.playClick();
        const done = cand.find(m => m.p.length === this.chain.length && m.p.every((q, k) => q === this.chain[k]));
        if (done) { this.tryHumanMove(done); return; }
        this.renderBoard(); this.updateHint(); return;
      }
      if (i === this.sel) { this.sel = null; this.chain = []; window.retroAudio.playClick(); this.renderBoard(); this.updateHint(); return; }
      if (this.chain.length > 0) { window.retroAudio.playInvalid(); this.shake(this.boardEl); this.flash('ต้องกินต่อ! เลือกช่องที่เรืองแสง (กดหมากเดิมเพื่อยกเลิก)'); return; }
    }
    if (this.moves.some(m => m.f === i)) { this.sel = i; this.chain = []; window.retroAudio.playClick(); this.renderBoard(); this.updateHint(); return; }
    window.retroAudio.playInvalid(); this.shake(this.boardEl);
    if (this.s.b[i] && ownerOf(this.s.b[i]) === this.s.turn && this.moves[0] && this.moves[0].c.length) this.flash('ต้องกินหมากก่อน! เลือกหมากที่เรืองแสง');
    else if (this.s.b[i] && ownerOf(this.s.b[i]) === this.s.turn) this.flash('หมากตัวนี้ไม่มีทางเดิน');
    this.sel = null; this.chain = []; this.renderBoard();
  }

  nameOf(idx) {
    if (this.mode === 'bot') return idx === 0 ? 'คุณ' : 'บอท';
    if (this.mode === 'online') return idx === this.online.myIdx ? 'คุณ' : 'คู่แข่ง';
    return `ผู้เล่น ${idx === 0 ? 'X' : 'O'}`;
  }
  updateHint() {
    if (this.hintTimer) return;
    if (this.gameOver) { this.boardHintEl.textContent = 'กดเริ่มเกมใหม่เพื่อประลองอีกครั้ง'; return; }
    if (this.mode === 'online' && !this.online.peerOnline) { this.boardHintEl.textContent = 'รอคู่แข่งเข้าห้อง...'; return; }
    if (this.isAiThinking) { this.boardHintEl.textContent = ''; return; }
    if (!this.canPlayNow()) { this.boardHintEl.textContent = `กำลังรอ ${this.nameOf(this.s.turn)} เดินหมาก`; return; }
    const forced = this.moves[0] && this.moves[0].c.length > 0;
    if (this.chain.length) this.boardHintEl.innerHTML = '<span class="badge-free">⚔️ กินต่อ</span> เลือกช่องที่เรืองแสงเพื่อกินต่อเนื่อง';
    else if (forced) this.boardHintEl.innerHTML = '<span class="badge-free">⚔️ บังคับกิน</span> เลือกหมากที่เรืองแสงเพื่อกินหมากคู่แข่ง';
    else this.boardHintEl.textContent = 'เลือกหมากที่เรืองแสง แล้วเลือกช่องปลายทาง';
  }
  updateStatus() {
    const s = this.s;
    if (this.gameOver) {
      this.turnIndicatorEl.classList.remove('is-thinking');
      this.turnPlayerMarkEl.textContent = '🏁'; this.turnPlayerMarkEl.className = 'player-badge';
      if (this.winner === 2) this.turnTextEl.textContent = 'เสมอ!';
      else this.turnTextEl.textContent = `${this.mode === 'bot' ? (this.winner === 0 ? 'ผู้เล่น X' : 'บอท (CPU)') : `ผู้เล่น ${this.winner === 0 ? 'X' : 'O'}`} ชนะเกม!`;
    } else {
      const mark = s.turn === 0 ? 'X' : 'O';
      this.turnPlayerMarkEl.textContent = mark; this.turnPlayerMarkEl.className = `player-badge badge-${mark.toLowerCase()}`;
      if (this.isAiThinking) {
        this.turnIndicatorEl.classList.add('is-thinking');
        this.turnTextEl.innerHTML = '<span class="thinking-text">🤖 บอทกำลังคิด</span><span class="thinking-dots"></span>';
      } else {
        this.turnIndicatorEl.classList.remove('is-thinking');
        if (this.mode === 'bot') this.turnTextEl.textContent = s.turn === 0 ? 'ตาของคุณ (X)' : 'ตาของบอท (O)';
        else if (this.mode === 'online') {
          if (!this.online.peerOnline) this.turnTextEl.textContent = 'รอคู่แข่งเชื่อมต่อ...';
          else this.turnTextEl.textContent = s.turn === this.online.myIdx ? `ตาคุณ (${mark})` : `ตาคู่แข่ง (${mark})`;
        } else this.turnTextEl.textContent = `ตาผู้เล่น ${mark}`;
      }
    }
    this.moveCountEl.textContent = this.moveCount + (this.gameOver ? 0 : 1);
    this.piecesXEl.textContent = `หมาก ${countPieces(s, 0)}`; this.piecesOEl.textContent = `หมาก ${countPieces(s, 1)}`;
    this.updateHint();
  }
  updateScoreboardDisplay() {
    const sc = this.scores[this.mode] || { x: 0, o: 0 };
    this.scoreXEl.textContent = sc.x; this.scoreOEl.textContent = sc.o;
    if (this.mode === 'bot') { this.labelXEl.textContent = 'ผู้เล่น X'; this.labelOEl.textContent = 'บอท (O)'; }
    else if (this.mode === 'online') {
      this.labelXEl.textContent = this.online.myIdx === 0 ? 'คุณ (X)' : 'คู่แข่ง (X)';
      this.labelOEl.textContent = this.online.myIdx === 1 ? 'คุณ (O)' : 'คู่แข่ง (O)';
    } else { this.labelXEl.textContent = 'ผู้เล่น X'; this.labelOEl.textContent = 'ผู้เล่น O'; }
  }
  showModal(w) {
    if (w === 2) {
      this.modalTitleEl.textContent = 'DRAW!'; this.modalSubtitleEl.textContent = 'เสมอกัน! ไม่มีใครกินหรือรุกคืบมานานเกินไป';
      this.modalIconEl.textContent = '🤝'; this.modalIconEl.className = 'modal-icon'; this.modalEl.classList.remove('hidden'); return;
    }
    const mark = w === 0 ? 'X' : 'O';
    const mine = (this.mode === 'bot' && w === 0) || this.mode === 'pvp' || (this.mode === 'online' && w === this.online.myIdx);
    if (mine) {
      this.modalTitleEl.textContent = `VICTORY! ${mark} WINS`;
      if (this.mode === 'bot') this.modalSubtitleEl.textContent = `ยอดเยี่ยมมาก! คุณเอาชนะบอทระดับ ${this.getDifficultyThai()} ได้สำเร็จ!`;
      else if (this.mode === 'online') this.modalSubtitleEl.textContent = 'คุณเอาชนะคู่แข่งออนไลน์! สุดยอดมาก!';
      else this.modalSubtitleEl.textContent = `ขอแสดงความยินดีกับ ผู้เล่น ${mark} เป็นฝ่ายชนะ!`;
      this.modalIconEl.textContent = w === 0 ? '⚡' : '👑'; this.modalIconEl.className = `modal-icon ${mark.toLowerCase()}-glow`;
    } else {
      this.modalTitleEl.textContent = 'GAME OVER!';
      this.modalSubtitleEl.textContent = this.mode === 'online' ? 'คู่แข่งชนะ ลองใหม่อีกครั้ง!' : `บอทระดับ ${this.getDifficultyThai()} ชนะ ลองใหม่อีกครั้ง!`;
      this.modalIconEl.textContent = '🤖'; this.modalIconEl.className = 'modal-icon o-glow';
    }
    this.modalEl.classList.remove('hidden');
  }
  hideModal() { this.modalEl.classList.add('hidden'); }
  getDifficultyThai() { return this.difficulty === 'easy' ? 'ง่าย (Easy)' : this.difficulty === 'medium' ? 'ปานกลาง (Medium)' : 'ยาก (Hard)'; }

  /* ---------- events ---------- */
  bindEvents() {
    const click = () => window.retroAudio.playClick();
    this.boardEl.addEventListener('click', (e) => this.onBoardClick(e));
    this.modeBtns.forEach(btn => btn.addEventListener('click', () => {
      click();
      const nm = btn.dataset.mode;
      if (nm === this.mode && nm !== 'online') return;
      if (this.mode === 'online' && nm !== 'online') this.leaveRoom();
      if (this.mode === 'online' && nm === 'online') { this.openLobby(); return; }
      this.modeBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active');
      this.mode = nm; this.applyModeUI();
      if (nm === 'online') this.openLobby(); else this.resetGame();
    }));
    this.chatToggleBtn.addEventListener('click', () => {
      this.isChatMuted = !this.isChatMuted;
      try { localStorage.setItem('retro_checkers_chat_muted', this.isChatMuted); } catch (e) {}
      this.botChatSectionEl.classList.toggle('chat-hidden', this.isChatMuted);
      this.chatToggleBtn.textContent = this.isChatMuted ? '🤫' : '💬'; click();
    });
    this.diffBtns.forEach(btn => btn.addEventListener('click', () => {
      click(); this.diffBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active');
      this.difficulty = btn.dataset.diff; this.resetGame();
    }));
    this.restartBtn.addEventListener('click', () => { click(); this.requestRematch(); });
    this.playAgainBtn.addEventListener('click', () => { click(); this.requestRematch(); });
    this.lobbyCreateBtn.addEventListener('click', () => { click(); this.createRoom(); });
    this.lobbyJoinBtn.addEventListener('click', () => { click(); this.joinRoom(this.lobbyCodeInputEl.value); });
    this.lobbyCodeInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.joinRoom(this.lobbyCodeInputEl.value); } });
    this.lobbyCodeInputEl.addEventListener('input', () => { this.lobbyCodeInputEl.value = this.lobbyCodeInputEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
    this.lobbyCloseBtn.addEventListener('click', () => { click(); this.cancelLobby(); });
    this.lobbyModalEl.addEventListener('click', (e) => { if (e.target === this.lobbyModalEl) this.cancelLobby(); });
    this.lobbyCopyBtn.addEventListener('click', () => { click(); this.copyRoomLink(); });
    this.copyLinkBtn.addEventListener('click', () => { click(); this.copyRoomLink(); });
    this.leaveRoomBtn.addEventListener('click', () => { click(); this.leaveRoom(); this.mode = 'bot'; this.markModeButton('bot'); this.applyModeUI(); this.resetGame(); });
    this.openRulesBtn.addEventListener('click', () => { click(); this.rulesModalEl.classList.remove('hidden'); });
    this.closeRulesBtn.addEventListener('click', () => { click(); this.rulesModalEl.classList.add('hidden'); });
    this.rulesOkBtn.addEventListener('click', () => { click(); this.rulesModalEl.classList.add('hidden'); });
    this.rulesModalEl.addEventListener('click', (e) => { if (e.target === this.rulesModalEl) this.rulesModalEl.classList.add('hidden'); });
    this.muteBtn.addEventListener('click', () => { const m = window.retroAudio.toggleMute(); this.muteBtn.textContent = m ? '🔇' : '🔊'; });
    if (window.retroAudio.isMuted) this.muteBtn.textContent = '🔇';
  }
}

document.addEventListener('DOMContentLoaded', () => { window.game = new CheckersGame(); });
