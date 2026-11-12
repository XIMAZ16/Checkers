// Bot evaluation and search algorithms. Depends on game.js engine functions.
function evalState(s, b) {
  let sc = 0; const B = s.b;
  for (let i = 0; i < 64; i++) {
    const v = B[i]; if (!v) continue;
    const r = i >> 3, c = i & 7, own = ownerOf(v), sign = own === b ? 1 : -1, king = isKing(v);
    let x = king ? 300 : 100;
    if (!king) { const adv = own === 0 ? 7 - r : r; x += adv * 4; if (adv === 0) x += 6; }
    x += (3.5 - Math.abs(c - 3.5)) * 1.5 + (3.5 - Math.abs(r - 3.5)) * (king ? 1.5 : 0.75);
    sc += sign * x;
  }
  return sc;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function search(s, depth, alpha, beta, b, ext) {
  const moves = legalMoves(s), res = resultOf(s, moves);
  if (res === 2) return 0;
  if (res >= 0) return res === b ? 10000 + depth : -10000 - depth;
  if (depth <= 0) { if (ext > 0 && moves[0].c.length) { depth = 1; ext--; } else return evalState(s, b); }
  if (s.turn === b) {
    let best = -Infinity;
    for (const m of moves) { best = Math.max(best, search(applyMove(s, m), depth - 1, alpha, beta, b, ext)); alpha = Math.max(alpha, best); if (alpha >= beta) break; }
    return best;
  }
  let best = Infinity;
  for (const m of moves) { best = Math.min(best, search(applyMove(s, m), depth - 1, alpha, beta, b, ext)); beta = Math.min(beta, best); if (alpha >= beta) break; }
  return best;
}
function botBestMove(s, difficulty) {
  const b = s.turn, moves = shuffle(legalMoves(s));
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  if (difficulty === 'easy') {
    if (Math.random() < 0.3) return moves[0];
    let best = moves[0], bs = -Infinity;
    for (const m of moves) { const v = search(applyMove(s, m), 0, -Infinity, Infinity, b, 0) + Math.random() * 60; if (v > bs) { bs = v; best = m; } }
    return best;
  }
  const depth = difficulty === 'hard' ? 6 : 3, ext = difficulty === 'hard' ? 2 : 1;
  let best = moves[0], alpha = -Infinity;
  for (const m of moves) {
    const v = search(applyMove(s, m), depth - 1, alpha, Infinity, b, ext);
    if (v > alpha) { alpha = v; best = m; }
  }
  return best;
}
