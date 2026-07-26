import React, { useState, useRef, useEffect } from "react";
import * as THREE from "three";

/* ============================================================
   BOOP CHESS 3D — WALNUT EDITION
   Staunton-proportioned wooden pieces, procedural grain,
   lift-glide moves, knock-and-tumble captures that land on
   a felt-lined tray. Same full engine + Sleepy Panda AI.
   ============================================================ */

/* ---------------- engine (unchanged) ---------------- */
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const TIER = { p: 1, n: 2, b: 2, r: 3, q: 4, k: 4 };

const idx = (r, c) => r * 8 + c;
const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
let idCounter = 0;
const mk = (t, c) => ({ t, c, id: `${c}${t}${idCounter++}` });

function initialBoard() {
  const B = Array(64).fill(null);
  const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
  for (let c = 0; c < 8; c++) {
    B[idx(0, c)] = mk(back[c], "b");
    B[idx(1, c)] = mk("p", "b");
    B[idx(6, c)] = mk("p", "w");
    B[idx(7, c)] = mk(back[c], "w");
  }
  return B;
}
function newGame() {
  return {
    board: initialBoard(), turn: "w",
    rights: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null, benches: { w: [], b: [] },
    lastMove: null, status: "play", winner: null, check: false,
  };
}
const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KG = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ORTH = [[-1,0],[1,0],[0,-1],[0,1]];

function isAttacked(board, r, c, by) {
  const pr = by === "w" ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (inB(pr, c + dc)) {
    const p = board[idx(pr, c + dc)];
    if (p && p.c === by && p.t === "p") return true;
  }
  for (const [dr, dc] of KN) if (inB(r + dr, c + dc)) {
    const p = board[idx(r + dr, c + dc)];
    if (p && p.c === by && p.t === "n") return true;
  }
  for (const [dr, dc] of KG) if (inB(r + dr, c + dc)) {
    const p = board[idx(r + dr, c + dc)];
    if (p && p.c === by && p.t === "k") return true;
  }
  for (const [dirs, types] of [[DIAG, "bq"], [ORTH, "rq"]]) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inB(rr, cc)) {
        const p = board[idx(rr, cc)];
        if (p) { if (p.c === by && types.includes(p.t)) return true; break; }
        rr += dr; cc += dc;
      }
    }
  }
  return false;
}
function kingSquare(board, color) {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.t === "k" && p.c === color) return i;
  }
  return -1;
}
function pseudoMoves(g, i) {
  const p = g.board[i];
  if (!p) return [];
  const r = i >> 3, c = i & 7, out = [], B = g.board;
  const push = (to, extra = {}) => out.push({ from: i, to, piece: p, cap: extra.cap !== undefined ? extra.cap : B[to], ...extra });
  if (p.t === "p") {
    const dir = p.c === "w" ? -1 : 1;
    const startR = p.c === "w" ? 6 : 1;
    const lastR = p.c === "w" ? 0 : 7;
    if (inB(r + dir, c) && !B[idx(r + dir, c)]) {
      push(idx(r + dir, c), { cap: null, promote: r + dir === lastR });
      if (r === startR && !B[idx(r + 2 * dir, c)]) push(idx(r + 2 * dir, c), { cap: null, dbl: true });
    }
    for (const dc of [-1, 1]) {
      const rr = r + dir, cc = c + dc;
      if (!inB(rr, cc)) continue;
      const to = idx(rr, cc), tgt = B[to];
      if (tgt && tgt.c !== p.c) push(to, { promote: rr === lastR });
      else if (g.ep === to) push(to, { ep: true, cap: B[idx(r, cc)], capIdx: idx(r, cc) });
    }
  } else if (p.t === "n" || p.t === "k") {
    for (const [dr, dc] of (p.t === "n" ? KN : KG)) {
      const rr = r + dr, cc = c + dc;
      if (!inB(rr, cc)) continue;
      const tgt = B[idx(rr, cc)];
      if (!tgt || tgt.c !== p.c) push(idx(rr, cc));
    }
    if (p.t === "k") {
      const home = p.c === "w" ? 7 : 0, foe = p.c === "w" ? "b" : "w", rt = g.rights;
      if (r === home && c === 4 && !isAttacked(B, home, 4, foe)) {
        if (rt[p.c + "K"] && !B[idx(home, 5)] && !B[idx(home, 6)] &&
            !isAttacked(B, home, 5, foe) && !isAttacked(B, home, 6, foe))
          push(idx(home, 6), { cap: null, castle: "K" });
        if (rt[p.c + "Q"] && !B[idx(home, 1)] && !B[idx(home, 2)] && !B[idx(home, 3)] &&
            !isAttacked(B, home, 3, foe) && !isAttacked(B, home, 2, foe))
          push(idx(home, 2), { cap: null, castle: "Q" });
      }
    }
  } else {
    const dirs = p.t === "b" ? DIAG : p.t === "r" ? ORTH : [...DIAG, ...ORTH];
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inB(rr, cc)) {
        const tgt = B[idx(rr, cc)];
        if (!tgt) push(idx(rr, cc));
        else { if (tgt.c !== p.c) push(idx(rr, cc)); break; }
        rr += dr; cc += dc;
      }
    }
  }
  return out;
}
function applyMove(g, m) {
  const B = g.board.slice();
  const rights = { ...g.rights };
  let piece = m.piece, captured = null, capIdx = null;
  if (m.ep) { captured = B[m.capIdx]; capIdx = m.capIdx; B[m.capIdx] = null; }
  else if (B[m.to]) { captured = B[m.to]; capIdx = m.to; }
  if (m.promote) piece = { ...piece, t: "q" };
  B[m.from] = null; B[m.to] = piece;
  if (m.castle) {
    const home = piece.c === "w" ? 7 : 0;
    if (m.castle === "K") { B[idx(home, 5)] = B[idx(home, 7)]; B[idx(home, 7)] = null; }
    else { B[idx(home, 3)] = B[idx(home, 0)]; B[idx(home, 0)] = null; }
  }
  if (piece.t === "k") { rights[piece.c + "K"] = false; rights[piece.c + "Q"] = false; }
  const corner = (i, key) => { if (m.from === i || capIdx === i) rights[key] = false; };
  corner(idx(7, 0), "wQ"); corner(idx(7, 7), "wK");
  corner(idx(0, 0), "bQ"); corner(idx(0, 7), "bK");
  const ep = m.dbl ? (m.from + m.to) / 2 : null;
  const benches = { w: g.benches.w.slice(), b: g.benches.b.slice() };
  if (captured) benches[captured.c].push(captured);
  return {
    next: { ...g, board: B, rights, ep, benches, turn: g.turn === "w" ? "b" : "w",
            lastMove: { from: m.from, to: m.to } },
    captured, capIdx, promoted: !!m.promote,
  };
}
function legalMoves(g, color) {
  const out = [];
  for (let i = 0; i < 64; i++) {
    const p = g.board[i];
    if (!p || p.c !== color) continue;
    for (const m of pseudoMoves(g, i)) {
      const { next } = applyMove(g, m);
      const ks = kingSquare(next.board, color);
      if (!isAttacked(next.board, ks >> 3, ks & 7, color === "w" ? "b" : "w")) out.push(m);
    }
  }
  return out;
}
function insufficient(board) {
  const minors = [];
  for (const p of board) {
    if (!p || p.t === "k") continue;
    if (p.t === "p" || p.t === "r" || p.t === "q") return false;
    minors.push(p);
  }
  return minors.length <= 1;
}
function resolve(g) {
  const foe = g.turn === "w" ? "b" : "w";
  const ks = kingSquare(g.board, g.turn);
  const check = isAttacked(g.board, ks >> 3, ks & 7, foe);
  const moves = legalMoves(g, g.turn);
  let status = "play", winner = null;
  if (moves.length === 0) { status = check ? "mate" : "draw"; winner = check ? foe : null; }
  else if (insufficient(g.board)) status = "draw";
  return { ...g, check, status, winner };
}

/* ---------------- 3D constants ---------------- */
const BOARD_Y = 0.13;
const UP = new THREE.Vector3(0, 1, 0);
const sqPos = (i) => ({ x: (i & 7) - 3.5, z: (i >> 3) - 3.5 });
const BENCH_SCALE = 0.72;
const benchPos = (color, i) => ({
  x: -3.33 + (i % 8) * 0.95,
  z: (color === "b" ? -1 : 1) * (5.15 + Math.floor(i / 8) * 0.95),
  y: 0.12,
});
const TOP_Y = { p: 0.95, n: 1.15, b: 1.28, r: 1.2, q: 1.52, k: 1.72 };

const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeIn = (k) => k * k;
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeBack = (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const linear = (k) => k;

/* ---------------- Stockfish integration ---------------- */
/* v1 launch ships the built-in Panda AI. Flip to true after settling GPL/licensing
   and dropping stockfish.js into /public (then set SF_URL = "/stockfish.js"). */
const ENABLE_STOCKFISH = false;
const SF_URL = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";

/* storage adapter: artifact shared-storage when present, localStorage otherwise */
const store = {
  persistOk() {
    if (typeof window !== "undefined" && window.storage) return true;
    try { localStorage.setItem("__bc_t", "1"); localStorage.removeItem("__bc_t"); return true; } catch (e) { return false; }
  },
  sharedOk() { return !!(typeof window !== "undefined" && window.storage); },
  async get(key, shared) {
    if (typeof window !== "undefined" && window.storage) return window.storage.get(key, shared);
    if (shared) throw new Error("no shared store");
    const v = localStorage.getItem(key);
    return v != null ? { value: v } : null;
  },
  async set(key, value, shared) {
    if (typeof window !== "undefined" && window.storage) return window.storage.set(key, value, shared);
    if (shared) throw new Error("no shared store");
    localStorage.setItem(key, value);
  },
};
/* skill/search per level; blunder = chance the panda ignores the engine and improvises,
   which is what keeps low levels genuinely beatable by a beginner */
const LEVELS = {
  1: { skill: 0, depth: 1, blunder: 0.45 },
  2: { skill: 1, depth: 1, blunder: 0.25 },
  3: { skill: 3, depth: 2, blunder: 0.12 },
  4: { skill: 6, ms: 120, blunder: 0.05 },
  5: { skill: 10, ms: 200, blunder: 0 },
  6: { skill: 14, ms: 320, blunder: 0 },
  7: { skill: 17, ms: 500, blunder: 0 },
  8: { skill: 20, ms: 800, blunder: 0 },
};
/* capture animation styles; req = highest panda level you must have beaten */
const CAPTURE_STYLES = [
  { id: "tumble", name: "Tumble", req: 0 },
  { id: "rocket", name: "Rocket", req: 1 },
  { id: "barrel", name: "Barrel", req: 1 },
  { id: "cage", name: "Cage", req: 1 },
  { id: "portal", name: "Portal", req: 1 },
  { id: "cyclone", name: "Cyclone", req: 2 },
  { id: "meteor", name: "Meteor", req: 3 },
  { id: "midas", name: "Midas", req: 4 },
  { id: "nova", name: "Supernova", req: 5 },
  { id: "hole", name: "Black Hole", req: 8 },
];
const AVATARS = ["🦊", "🐸", "🦉", "🐯", "🦄", "🐢", "🐙", "🦖"];
const NAME = { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" };
const GLYPH = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };
const BATTLE_MOVES = { p: "Tiny Jab", n: "Gallop Strike", b: "Holy Beam", r: "Castle Crush", q: "Royal Decree", k: "Sovereign Slam" };
const FILES = "abcdefgh";
function toFEN(g, plies) {
  let fen = "";
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = g.board[idx(r, c)];
      if (!p) { empty++; continue; }
      if (empty) { fen += empty; empty = 0; }
      fen += p.c === "w" ? p.t.toUpperCase() : p.t;
    }
    if (empty) fen += empty;
    if (r < 7) fen += "/";
  }
  const cast = (g.rights.wK ? "K" : "") + (g.rights.wQ ? "Q" : "") + (g.rights.bK ? "k" : "") + (g.rights.bQ ? "q" : "");
  const ep = g.ep != null ? FILES[g.ep & 7] + (8 - (g.ep >> 3)) : "-";
  return `${fen} ${g.turn} ${cast || "-"} ${ep} 0 ${Math.floor(plies / 2) + 1}`;
}
function uciToMove(tok, moves) {
  if (!tok || tok.length < 4) return null;
  const from = idx(8 - +tok[1], tok.charCodeAt(0) - 97);
  const to = idx(8 - +tok[3], tok.charCodeAt(2) - 97);
  return moves.find((m) => m.from === from && m.to === to) || null;
}
function moveToUci(m) {
  const sq = (i) => FILES[i & 7] + (8 - (i >> 3));
  return sq(m.from) + sq(m.to) + (m.promote ? "q" : "");
}
function genRoomCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += A[(Math.random() * A.length) | 0];
  return s;
}

/* procedural wood grain */
function woodTexture(base, streaks, repeat = 1) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * 256;
    g.strokeStyle = streaks[i % streaks.length];
    g.globalAlpha = 0.05 + Math.random() * 0.13;
    g.lineWidth = 0.6 + Math.random() * 2.4;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 14) {
      g.lineTo(x + Math.sin(y * 0.02 + i * 1.7) * 5 + (Math.random() - 0.5) * 2, y);
    }
    g.stroke();
  }
  g.globalAlpha = 0.05;
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? "#000" : "#fff";
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}

/* ---------------- component ---------------- */
export default function WalnutChess3D() {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const modeRef = useRef("panda");
  const soundRef = useRef(true);
  const engineRef = useRef(null);
  const levelRef = useRef(1);
  const styleRef = useRef("tumble");
  const maxBeatenRef = useRef(0);
  const characterRef = useRef(null);
  const pointsRef = useRef(0);
  const crazyRef = useRef(false);
  const hungerRef = useRef(100);
  const invRef = useRef({ chicken: 2, flesh: 1 });
  const battleSkipRef = useRef(null);
  const creditsRef = useRef(false);

  const [banner, setBanner] = useState({ text: "Your move (maple)", tone: "" });
  const [mode, setMode] = useState("panda");
  const [sound, setSound] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [trayCount, setTrayCount] = useState({ w: 0, b: 0 });
  const [level, setLevel] = useState(1);
  const [engineStatus, setEngineStatus] = useState("loading");
  const [credits, setCredits] = useState(false);
  const [styleId, setStyleId] = useState("tumble");
  const [maxBeaten, setMaxBeaten] = useState(0);
  const [unlockMsg, setUnlockMsg] = useState(null);
  const [character, setCharacter] = useState(null);
  const [points, setPoints] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState("🦊");
  const [crazy, setCrazy] = useState(false);
  const [battle, setBattle] = useState(null);
  const [hunger, setHunger] = useState(100);
  const [inv, setInv] = useState({ chicken: 2, flesh: 1 });
  const [online, setOnline] = useState(null); // { code, seat }
  const [showOnline, setShowOnline] = useState(false);
  const [roomInput, setRoomInput] = useState("");
  const [onlineMsg, setOnlineMsg] = useState(null);
  const [saveState, setSaveState] = useState("ok"); // ok | none
  const [viewMode, setViewMode] = useState("full");
  const persistTimerRef = useRef(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { soundRef.current = sound; }, [sound]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { styleRef.current = styleId; }, [styleId]);
  useEffect(() => { maxBeatenRef.current = maxBeaten; }, [maxBeaten]);
  useEffect(() => { creditsRef.current = credits; }, [credits]);

  /* progression + character persist across sessions when artifact storage is available */
  useEffect(() => {
    setSaveState(store.persistOk() ? "ok" : "none");
    (async () => {
      try {
        if (store.persistOk()) {
          const r = await store.get("boopchess-progress");
          if (r && r.value) {
            const p = JSON.parse(r.value);
            if (typeof p.maxBeaten === "number") { setMaxBeaten(p.maxBeaten); maxBeatenRef.current = p.maxBeaten; }
            if (p.style && CAPTURE_STYLES.some((s) => s.id === p.style && s.req <= (p.maxBeaten || 0))) {
              setStyleId(p.style); styleRef.current = p.style;
            }
            if (typeof p.points === "number") { setPoints(p.points); pointsRef.current = p.points; }
            if (p.character && p.character.name) { setCharacter(p.character); characterRef.current = p.character; }
          }
        }
      } catch (e) { /* no saved progress yet — fresh start */ }
      if (!characterRef.current) { setDraftAvatar(AVATARS[0]); setShowCreate(true); }
    })();
    const onHide = () => { if (document.visibilityState === "hidden") persistNow(); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const persistNow = () => {
    const payload = JSON.stringify({
      maxBeaten: maxBeatenRef.current, style: styleRef.current,
      points: pointsRef.current, character: characterRef.current,
    });
    const write = (attempt) => {
      try {
        if (!store.persistOk()) return;
        Promise.resolve(store.set("boopchess-progress", payload)).catch(() => {
          if (attempt < 1) setTimeout(() => write(attempt + 1), 1500);
        });
      } catch (e) { /* best effort */ }
    };
    write(0);
  };
  const persist = persistNow;
  const schedulePersist = () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(persistNow, 4000);
  };
  const pickStyle = (id) => { setStyleId(id); styleRef.current = id; persist(); };
  const confirmCharacter = () => {
    const nm = (draftName || "").trim().slice(0, 14) || "Player";
    const ch = { name: nm, avatar: draftAvatar || AVATARS[0] };
    characterRef.current = ch;
    setCharacter(ch);
    setShowCreate(false);
    persist();
  };
  const openEdit = () => {
    if (characterRef.current) { setDraftName(characterRef.current.name); setDraftAvatar(characterRef.current.avatar); }
    setShowCreate(true);
  };
  const toggleCrazy = () => {
    const v = !crazy;
    crazyRef.current = v;
    setCrazy(v);
  };
  const eatFood = (kind) => {
    if (invRef.current[kind] <= 0) return;
    const nextInv = { ...invRef.current, [kind]: invRef.current[kind] - 1 };
    invRef.current = nextInv;
    setInv(nextInv);
    hungerRef.current = Math.min(100, hungerRef.current + (kind === "chicken" ? 30 : 12));
    setHunger(hungerRef.current);
    if (apiRef.current) {
      if (kind === "flesh" && apiRef.current.queasy) apiRef.current.queasy();
      else if (apiRef.current.munch) apiRef.current.munch();
    }
  };

  /* ---- woody synth: filtered-noise clacks + sine thumps ---- */
  const audioRef = useRef(null);
  const noiseRef = useRef(null);
  const busRef = useRef(null);
  function actx() {
    if (!audioRef.current) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      audioRef.current = new C();
    }
    return audioRef.current;
  }
  function noiseBuf(a) {
    if (!noiseRef.current) {
      const buf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseRef.current = buf;
    }
    return noiseRef.current;
  }
  function bus(a) {
    if (!busRef.current) {
      const comp = a.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.16;
      comp.connect(a.destination);
      // small-room convolution reverb: generated stereo impulse, sent post-compressor
      const len = Math.floor(a.sampleRate * 1.1);
      const ir = a.createBuffer(2, len, a.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++)
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
      const conv = a.createConvolver();
      conv.buffer = ir;
      const send = a.createGain();
      send.gain.value = 0.22;
      comp.connect(send).connect(conv).connect(a.destination);
      busRef.current = comp;
    }
    return busRef.current;
  }
  function clack(freq = 1800, vol = 0.25, dur = 0.05, delay = 0) {
    if (!soundRef.current) return;
    try {
      const a = actx(); if (!a) return;
      const t = a.currentTime + delay;
      const src = a.createBufferSource();
      src.buffer = noiseBuf(a);
      const bp = a.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = freq * (0.94 + Math.random() * 0.12); bp.Q.value = 2.5;
      const g = a.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(bus(a));
      src.start(t); src.stop(t + dur + 0.02);
    } catch (e) { /* optional */ }
  }
  function thump(freq = 120, vol = 0.15, dur = 0.14, delay = 0) {
    if (!soundRef.current) return;
    try {
      const a = actx(); if (!a) return;
      const t = a.currentTime + delay;
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq * (0.92 + Math.random() * 0.16), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(bus(a));
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* optional */ }
  }
  function rumble(cutoff = 700, vol = 0.3, dur = 0.35, delay = 0) {
    if (!soundRef.current) return;
    try {
      const a = actx(); if (!a) return;
      const t = a.currentTime + delay;
      const src = a.createBufferSource();
      src.buffer = noiseBuf(a);
      src.loop = true;
      const lp = a.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = cutoff;
      const g = a.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(lp).connect(g).connect(bus(a));
      src.start(t); src.stop(t + dur + 0.02);
    } catch (e) { /* optional */ }
  }
  function note(f, delay, vol = 0.12, dur = 0.22) {
    if (!soundRef.current) return;
    try {
      const a = actx(); if (!a) return;
      const t = a.currentTime + delay;
      const o = a.createOscillator(), g = a.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(bus(a));
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* optional */ }
  }
  function whoosh(f0 = 300, f1 = 1400, dur = 0.35, vol = 0.1, delay = 0) {
    if (!soundRef.current) return;
    try {
      const a = actx(); if (!a) return;
      const t = a.currentTime + delay;
      const src = a.createBufferSource();
      src.buffer = noiseBuf(a); src.loop = true;
      const bp = a.createBiquadFilter();
      bp.type = "bandpass"; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = a.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.75);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(bus(a));
      src.start(t); src.stop(t + dur + 0.02);
    } catch (e) { /* optional */ }
  }
  function whinny(delay = 0) {
    if (!soundRef.current) return;
    try {
      const a = actx(); if (!a) return;
      const t = a.currentTime + delay;
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(760, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.5);
      const lfo = a.createOscillator(), lg = a.createGain();
      lfo.type = "sine"; lfo.frequency.value = 13;
      lg.gain.value = 70;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(bus(a));
      o.start(t); lfo.start(t);
      o.stop(t + 0.6); lfo.stop(t + 0.6);
    } catch (e) { /* optional */ }
  }
  function bellTone(f = 520, delay = 0) {
    if (!soundRef.current) return;
    try {
      const a = actx(); if (!a) return;
      const t = a.currentTime + delay;
      [[1, 0.06, 0.7], [2.76, 0.03, 0.5], [5.4, 0.012, 0.3]].forEach(([mul, v, d]) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "sine"; o.frequency.value = f * mul;
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(bus(a));
        o.start(t); o.stop(t + d + 0.05);
      });
    } catch (e) { /* optional */ }
  }
  function rubble(dur = 0.5, delay = 0) {
    if (!soundRef.current) return;
    try {
      const a = actx(); if (!a) return;
      const t = a.currentTime + delay;
      const src = a.createBufferSource();
      src.buffer = noiseBuf(a); src.loop = true;
      const lp = a.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 340;
      const g = a.createGain();
      const steps = 6;
      for (let i = 0; i < steps; i++)
        g.gain.setValueAtTime(0.2 * (1 - i / steps) * (i % 2 ? 0.4 : 1), t + (i * dur) / steps);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(lp).connect(g).connect(bus(a));
      src.start(t); src.stop(t + dur + 0.02);
    } catch (e) { /* optional */ }
  }
  function gliss(f0, f1, dur = 0.35, vol = 0.08, delay = 0) {
    if (!soundRef.current) return;
    try {
      const a = actx(); if (!a) return;
      const t = a.currentTime + delay;
      const o = a.createOscillator(), g = a.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(bus(a));
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* optional */ }
  }
  function swell(f, dur = 1.2, vol = 0.05, delay = 0) {
    if (!soundRef.current) return;
    try {
      const a = actx(); if (!a) return;
      const t = a.currentTime + delay;
      const o = a.createOscillator(), g = a.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
      g.gain.setValueAtTime(vol, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(bus(a));
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* optional */ }
  }
  const S = {
    choir: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      swell(f, 1.6, i === 3 ? 0.03 : 0.05, i * 0.06);
      swell(f * 1.006, 1.6, 0.025, i * 0.06);
    }),
    lift: () => clack(1500, 0.08, 0.03),
    set: () => { clack(1300, 0.14, 0.045); thump(150, 0.07, 0.08); },
    knock: (tier) => { clack(2100 - tier * 150, 0.2 + tier * 0.05, 0.05); thump(140 - tier * 8, 0.1 + tier * 0.03, 0.1); },
    crackle: (tier) => {
      const n = 2 + tier;
      for (let i = 0; i < n; i++)
        clack(1700 + Math.random() * 1400, Math.max(0.03, 0.1 - i * 0.015), 0.035, 0.03 + i * 0.05 + Math.random() * 0.03);
    },
    voice: (type) => {
      if (type === "p") gliss(950, 1500, 0.12, 0.07, 0.06);                    // startled squeak
      else if (type === "n") whinny(0.05);                                      // the horse objects
      else if (type === "b") bellTone(520, 0.08);                               // a solemn toll
      else if (type === "r") rubble(0.5, 0.05);                                 // masonry giving way
      else if (type === "q") { gliss(1400, 320, 0.45, 0.08, 0.05); note(659, 0.05, 0.06, 0.18); note(494, 0.2, 0.05, 0.2); }
    },
    whistle: (dur) => gliss(1250, 380, Math.max(0.3, dur * 0.9), 0.05, 0.08),  // falling arc
    approach: (dur, big) => whoosh(big ? 220 : 320, big ? 1600 : 1300, dur, big ? 0.12 : 0.08),
    skitter: () => {
      for (let i = 0; i < 7; i++)
        clack(2200 + Math.random() * 900, 0.05, 0.025, i * 0.045 + Math.random() * 0.02);
    },
    slide: (roll) => whoosh(roll ? 380 : 500, roll ? 1100 : 900, roll ? 0.5 : 0.38, roll ? 0.05 : 0.032),
    air: () => whoosh(260, 950, 0.55, 0.05),
    groan: () => {
      gliss(170, 72, 0.7, 0.09);
      clack(820, 0.05, 0.04, 0.12); clack(700, 0.05, 0.04, 0.3); clack(560, 0.05, 0.05, 0.5);
    },
    thud: (tier) => { thump(110 - tier * 10, 0.16 + tier * 0.05, 0.16 + tier * 0.02); clack(900, 0.1, 0.05); },
    bounce: (tier) => thump(120 - tier * 8, 0.07 + tier * 0.02, 0.09),
    rattle: () => { clack(1250, 0.07, 0.03); clack(1150, 0.05, 0.03, 0.09); clack(1250, 0.03, 0.025, 0.2); },
    settle: () => clack(1200, 0.06, 0.03),
    boom: (tier) => {
      rumble(500 + tier * 150, 0.16 + tier * 0.06, 0.22 + tier * 0.07);
      thump(70 - tier * 5, 0.14 + tier * 0.05, 0.2 + tier * 0.04);
    },
    uhoh: () => { note(392, 0, 0.09, 0.2); note(311, 0.18, 0.09, 0.28); },
    win: () => [440, 554, 659, 880].forEach((f, i) => note(f, i * 0.14, 0.11, 0.3)),
  };

  /* ---- Stockfish boot: cdnjs script → blob worker → heuristic fallback ---- */
  useEffect(() => {
    if (!ENABLE_STOCKFISH) { setEngineStatus("fallback"); return; }
    const st = { ready: false, send: null, onBest: null, kill: null };
    engineRef.current = st;
    let dead = false;
    const handle = (raw) => {
      const line = typeof raw === "string" ? raw : raw && raw.data;
      if (typeof line !== "string") return;
      if (line.startsWith("uciok")) st.send("isready");
      else if (line.startsWith("readyok")) { st.ready = true; if (!dead) setEngineStatus("stockfish"); }
      else if (line.startsWith("bestmove")) {
        const tok = line.split(/\s+/)[1];
        if (st.onBest) st.onBest(tok);
      }
    };
    (async () => {
      try {
        await new Promise((res, rej) => {
          if (window.STOCKFISH) return res();
          const s = document.createElement("script");
          s.src = SF_URL;
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      } catch (e) { /* fall through to the worker path */ }
      try {
        if (window.STOCKFISH) {
          const e = window.STOCKFISH();
          e.onmessage = handle;
          st.send = (c) => e.postMessage(c);
          st.kill = () => { try { e.postMessage("quit"); } catch (x) { /* gone */ } };
        } else {
          const txt = await fetch(SF_URL).then((r) => { if (!r.ok) throw new Error("fetch failed"); return r.text(); });
          const w = new Worker(URL.createObjectURL(new Blob([txt], { type: "application/javascript" })));
          w.onmessage = handle;
          st.send = (c) => w.postMessage(c);
          st.kill = () => w.terminate();
        }
        st.send("uci");
        setTimeout(() => {
          if (!st.ready && !dead) setEngineStatus((s) => (s === "stockfish" ? s : "fallback"));
        }, 6000);
      } catch (e) {
        if (!dead) setEngineStatus("fallback");
      }
    })();
    return () => { dead = true; st.onBest = null; st.kill && st.kill(); engineRef.current = null; };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    /* ---------- renderer / scene / camera ---------- */
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const dprSteps = [...new Set([2, 1.5, 1.25, 1].map((v) => Math.min(v, window.devicePixelRatio || 1)))];
    let dprIdx = 0;
    renderer.setPixelRatio(dprSteps[0]);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x171310);
    scene.fog = new THREE.Fog(0x171310, 20, 46);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    let camTheta = 0, camPhi = 0.8, camR = 17.5, shake = 0;
    function placeCamera() {
      camera.position.set(
        camR * Math.sin(camPhi) * Math.sin(camTheta),
        camR * Math.cos(camPhi),
        camR * Math.sin(camPhi) * Math.cos(camTheta)
      );
      camera.lookAt(0, 0.45, 0);
    }
    placeCamera();

    scene.add(new THREE.HemisphereLight(0x8a7460, 0x1a1008, 0.55));
    const key = new THREE.DirectionalLight(0xffdcb0, 1.05);
    key.position.set(5.5, 10, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -9; key.shadow.camera.right = 9;
    key.shadow.camera.top = 9; key.shadow.camera.bottom = -9;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x5a6a80, 0.28);
    fill.position.set(-6, 5, -5);
    scene.add(fill);

    /* ---------- materials ---------- */
    const mapleTex = woodTexture("#D8B889", ["#B08D5C", "#C4A06C", "#96733F"]);
    const walnutTex = woodTexture("#4A2C18", ["#2E1A0C", "#5C3A20", "#241206"]);
    const ebonyTex = woodTexture("#2A1B10", ["#170D06", "#3A2614", "#0F0803"]);
    const frameTex = woodTexture("#3A2515", ["#241406", "#4A311C", "#180C04"], 3);
    const tableTex = woodTexture("#241812", ["#170E08", "#2E1F14", "#100904"], 7);

    const M = {
      maple: new THREE.MeshStandardMaterial({ map: mapleTex, roughness: 0.42, metalness: 0.05 }),
      walnutPiece: new THREE.MeshStandardMaterial({ map: ebonyTex, roughness: 0.4, metalness: 0.06 }),
      sqLight: new THREE.MeshStandardMaterial({ map: mapleTex, roughness: 0.55 }),
      sqDark: new THREE.MeshStandardMaterial({ map: walnutTex, roughness: 0.55 }),
      frame: new THREE.MeshStandardMaterial({ map: frameTex, roughness: 0.6 }),
      table: new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.85 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xc9a24b, roughness: 0.32, metalness: 0.85 }),
      felt: new THREE.MeshStandardMaterial({ color: 0x2e5140, roughness: 1 }),
      selRing: new THREE.MeshBasicMaterial({ color: 0xc9a24b, transparent: true, opacity: 0.9 }),
      dot: new THREE.MeshBasicMaterial({ color: 0x58c99a, transparent: true, opacity: 0.95 }),
      capRing: new THREE.MeshBasicMaterial({ color: 0xc85a3a, transparent: true, opacity: 0.95 }),
      lastGlow: new THREE.MeshBasicMaterial({ color: 0xc9a24b, transparent: true, opacity: 0.13 }),
      redGlow: new THREE.MeshBasicMaterial({ color: 0xd05050, transparent: true, opacity: 0.32 }),
    };

    /* ---------- table, frame, squares, trays ---------- */
    const table = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), M.table);
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.5;
    table.receiveShadow = true;
    scene.add(table);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.55, 9.5), M.frame);
    frame.position.y = -0.17;
    frame.castShadow = true; frame.receiveShadow = true;
    scene.add(frame);

    // brass inlay strips around the playing field
    const inlayGeoH = new THREE.BoxGeometry(8.3, 0.015, 0.05);
    const inlayGeoV = new THREE.BoxGeometry(0.05, 0.015, 8.3);
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(inlayGeoH, M.brass);
      h.position.set(0, 0.125, s * 4.12);
      const v = new THREE.Mesh(inlayGeoV, M.brass);
      v.position.set(s * 4.12, 0.125, 0);
      scene.add(h, v);
    }

    const cellGeo = new THREE.BoxGeometry(1, 0.12, 1);
    for (let i = 0; i < 64; i++) {
      const { x, z } = sqPos(i);
      const light = (((i >> 3) + (i & 7)) % 2) === 0;
      const cell = new THREE.Mesh(cellGeo, light ? M.sqLight : M.sqDark);
      cell.position.set(x, 0.065, z);
      cell.rotation.y = ((Math.random() * 4) | 0) * (Math.PI / 2); // vary grain
      cell.receiveShadow = true;
      cell.userData.sq = i;
      scene.add(cell);
    }

    for (const color of ["w", "b"]) {
      const zc = (color === "b" ? -1 : 1) * 5.6;
      const tray = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.24, 2.2), M.frame);
      tray.position.set(0, -0.02, zc);
      tray.castShadow = true; tray.receiveShadow = true;
      scene.add(tray);
      const felt = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.02, 1.9), M.felt);
      felt.position.set(0, 0.11, zc);
      felt.receiveShadow = true;
      scene.add(felt);
    }

    /* ---------- Staunton-ish piece factory ---------- */
    const L = (pts) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), 32);
    const PROFILE = {
      p: [[0,0],[0.3,0],[0.3,0.04],[0.24,0.07],[0.19,0.1],[0.22,0.13],[0.16,0.17],[0.1,0.3],[0.09,0.5],[0.15,0.56],[0.1,0.6],[0.15,0.66],[0.165,0.75],[0.13,0.86],[0.06,0.93],[0,0.95]],
      b: [[0,0],[0.31,0],[0.31,0.04],[0.25,0.07],[0.2,0.1],[0.23,0.13],[0.16,0.17],[0.1,0.34],[0.09,0.66],[0.16,0.72],[0.1,0.76],[0.17,0.86],[0.16,0.98],[0.1,1.1],[0.05,1.18],[0.04,1.22],[0,1.28]],
      r: [[0,0],[0.33,0],[0.33,0.05],[0.27,0.08],[0.21,0.12],[0.24,0.15],[0.19,0.2],[0.17,0.78],[0.24,0.84],[0.24,1.06],[0.18,1.06],[0.18,0.98],[0,0.98]],
      q: [[0,0],[0.33,0],[0.33,0.04],[0.27,0.07],[0.21,0.11],[0.24,0.14],[0.16,0.19],[0.1,0.42],[0.09,0.86],[0.17,0.94],[0.11,0.99],[0.2,1.18],[0.22,1.3],[0.13,1.36],[0.08,1.42],[0,1.46]],
      k: [[0,0],[0.34,0],[0.34,0.04],[0.28,0.07],[0.22,0.11],[0.25,0.14],[0.17,0.19],[0.11,0.46],[0.1,0.98],[0.18,1.06],[0.12,1.11],[0.21,1.32],[0.23,1.44],[0.13,1.5],[0.07,1.55],[0,1.58]],
      nBase: [[0,0],[0.31,0],[0.31,0.04],[0.25,0.07],[0.2,0.11],[0.23,0.14],[0.17,0.19],[0.15,0.3],[0.2,0.36],[0,0.38]],
    };

    function buildPiece(piece) {
      const mat = piece.c === "w" ? M.maple : M.walnutPiece;
      const grp = new THREE.Group();
      const add = (mesh) => { mesh.castShadow = true; grp.add(mesh); return mesh; };

      if (piece.t === "n") {
        add(new THREE.Mesh(L(PROFILE.nBase), mat));
        const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.62, 18), mat));
        neck.position.set(0, 0.64, 0.03);
        neck.rotation.x = -0.5;
        const head = new THREE.Group();
        const skull = add(new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 16), mat));
        skull.position.set(0, 0, 0);
        head.add(skull);
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.3), mat);
        snout.position.set(0, -0.05, -0.19);
        snout.rotation.x = 0.18;
        snout.castShadow = true;
        head.add(snout);
        for (const s of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.11, 8), mat);
          ear.position.set(s * 0.07, 0.15, 0.04);
          ear.rotation.x = 0.25;
          head.add(ear);
        }
        const mane = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.1), mat);
        mane.position.set(0, -0.16, 0.15);
        mane.rotation.x = -0.45;
        mane.castShadow = true;
        head.add(mane);
        head.position.set(0, 0.98, -0.13);
        head.rotation.x = 0.12;
        grp.add(head);
      } else {
        add(new THREE.Mesh(L(PROFILE[piece.t]), mat));
        if (piece.t === "r") {
          for (let k = 0; k < 5; k++) {
            const cren = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.09), mat);
            const a = (k / 5) * Math.PI * 2;
            cren.position.set(Math.cos(a) * 0.19, 1.12, Math.sin(a) * 0.19);
            cren.rotation.y = -a;
            cren.castShadow = true;
            grp.add(cren);
          }
        }
        if (piece.t === "q") {
          for (let k = 0; k < 6; k++) {
            const bead = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), M.brass);
            const a = (k / 6) * Math.PI * 2;
            bead.position.set(Math.cos(a) * 0.17, 1.34, Math.sin(a) * 0.17);
            grp.add(bead);
          }
          const orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), M.brass);
          orb.position.y = 1.5;
          grp.add(orb);
        }
        if (piece.t === "k") {
          const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), M.brass);
          v.position.y = 1.66;
          const h = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.05), M.brass);
          h.position.y = 1.68;
          grp.add(v, h);
        }
        if (piece.t === "b") {
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), M.brass);
          tip.position.y = 1.3;
          grp.add(tip);
        }
      }
      if (piece.c === "b") grp.rotation.y = Math.PI;
      grp.userData.pieceId = piece.id;
      grp.traverse((o) => { o.userData.pieceId = piece.id; });
      return grp;
    }

    /* ---------- state, meshes, overlays ---------- */
    let game = resolve(newGame());
    const history = [];
    const meshes = new Map();
    const indicators = new THREE.Group();
    const transient = new THREE.Group();
    scene.add(indicators, transient);

    let selSq = null, selMoves = [], seqActive = false;

    /* gamepad square cursors — one per seat */
    function buildCursor(color) {
      const g = new THREE.Group();
      const cm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const barH = new THREE.BoxGeometry(0.92, 0.03, 0.06);
      const barV = new THREE.BoxGeometry(0.06, 0.03, 0.92);
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(barH, cm); h.position.set(0, 0, s * 0.43); g.add(h);
        const v = new THREE.Mesh(barV, cm); v.position.set(s * 0.43, 0, 0); g.add(v);
      }
      g.visible = false;
      g.position.y = 0.135;
      scene.add(g);
      return g;
    }
    const cursors = [buildCursor(0xf0e6d0), buildCursor(0xe0a94f)];
    const padSt = (c0) => ({ active: false, prev: [], lastMoveT: 0, lastDir: null, cursor: c0 });
    const gp = { blocked: false, seats: [padSt(idx(6, 4)), padSt(idx(1, 4))] };
    let thinkTimer = null;
    const burstBits = [];
    let dangerPlane = null, lastPlanes = [];
    const glowPlaneGeo = new THREE.PlaneGeometry(0.98, 0.98);

    function snapshot(g) {
      return { ...g, board: g.board.slice(), rights: { ...g.rights },
               benches: { w: g.benches.w.slice(), b: g.benches.b.slice() } };
    }
    function ensureMesh(piece) {
      let rec = meshes.get(piece.id);
      if (rec && rec.t !== piece.t) { scene.remove(rec.grp); rec = null; }
      if (!rec) {
        rec = { grp: buildPiece(piece), t: piece.t };
        meshes.set(piece.id, rec);
        scene.add(rec.grp);
      }
      return rec.grp;
    }
    function syncScene(g) {
      const present = new Set();
      g.board.forEach((p, i) => {
        if (!p) return;
        present.add(p.id);
        const m = ensureMesh(p);
        const { x, z } = sqPos(i);
        m.position.set(x, BOARD_Y, z);
        m.rotation.set(0, p.c === "b" ? Math.PI : 0, 0);
        m.scale.set(1, 1, 1);
      });
      for (const color of ["w", "b"]) g.benches[color].forEach((p, i) => {
        present.add(p.id);
        const m = ensureMesh(p);
        const bp = benchPos(color, i);
        m.position.set(bp.x, bp.y, bp.z);
        m.rotation.set(0, color === "b" ? Math.PI : 0, 0);
        m.scale.set(BENCH_SCALE, BENCH_SCALE, BENCH_SCALE);
      });
      for (const [id, rec] of [...meshes]) {
        if (!present.has(id)) { scene.remove(rec.grp); meshes.delete(id); }
      }
      while (transient.children.length) transient.remove(transient.children[0]);
      burstBits.length = 0;
      clearSelection();
      refreshOverlays(g);
      setTrayCount({ w: g.benches.w.length, b: g.benches.b.length });
    }
    function refreshOverlays(g) {
      if (dangerPlane) { scene.remove(dangerPlane); dangerPlane = null; }
      lastPlanes.forEach((p) => scene.remove(p));
      lastPlanes = [];
      if (g.lastMove) for (const i of [g.lastMove.from, g.lastMove.to]) {
        const pl = new THREE.Mesh(glowPlaneGeo, M.lastGlow);
        pl.rotation.x = -Math.PI / 2;
        const { x, z } = sqPos(i);
        pl.position.set(x, 0.128, z);
        scene.add(pl); lastPlanes.push(pl);
      }
      if (g.check && g.status === "play") {
        const ks = kingSquare(g.board, g.turn);
        dangerPlane = new THREE.Mesh(glowPlaneGeo, M.redGlow);
        dangerPlane.rotation.x = -Math.PI / 2;
        const { x, z } = sqPos(ks);
        dangerPlane.position.set(x, 0.13, z);
        scene.add(dangerPlane);
      }
    }
    function clearSelection() {
      if (selSq !== null) {
        const p = game.board[selSq];
        if (p) {
          const rec = meshes.get(p.id);
          if (rec) rec.grp.position.y = BOARD_Y;
        }
      }
      selSq = null; selMoves = [];
      while (indicators.children.length) indicators.remove(indicators.children[0]);
    }
    function showSelection(sq, moves) {
      clearSelection();
      selSq = sq; selMoves = moves;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.028, 10, 40), M.selRing);
      ring.rotation.x = -Math.PI / 2;
      const sp = sqPos(sq);
      ring.position.set(sp.x, 0.14, sp.z);
      indicators.add(ring);
      for (const m of moves) {
        const p = sqPos(m.to);
        if (m.cap) {
          const r = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 10, 40), M.capRing);
          r.rotation.x = -Math.PI / 2;
          r.position.set(p.x, 0.15, p.z);
          r.userData.sq = m.to; r.userData.pulse = true;
          indicators.add(r);
        } else {
          const d = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 24), M.dot);
          d.position.set(p.x, 0.15, p.z);
          d.userData.sq = m.to; d.userData.pulse = true;
          indicators.add(d);
        }
      }
    }

    /* ---------- tween system ---------- */
    let anims = [];
    let chainCarry = 0; // leftover time handed to a finished tween's successor — keeps chains gap-free
    const nowSec = () => performance.now() / 1000;
    const tween = (dur, update, done, ease = easeOut) =>
      anims.push({ t0: nowSec() - chainCarry, dur: dur * (crazyRef.current && hungerRef.current <= 0 ? 1.8 : 1), update, done, ease });
    function fastForward() {
      chainCarry = 0;
      let guard = 0;
      while (anims.length && guard++ < 300) {
        const batch = anims; anims = [];
        for (const a of batch) { a.update(1); a.done && a.done(); }
      }
    }
    function stepAnims(t) {
      if (!anims.length) return;
      const survivors = [];
      const count = anims.length;
      for (let i = 0; i < count; i++) {
        const a = anims[i];
        const k = Math.min(1, (t - a.t0) / a.dur);
        a.update(a.ease(k));
        if (k >= 1) {
          chainCarry = Math.min(0.05, (t - a.t0) - a.dur);
          if (a.done) a.done();
          chainCarry = 0;
        } else survivors.push(a);
      }
      // tweens spawned by done() this frame get their first update now — no held frame
      for (let i = count; i < anims.length; i++) {
        const a = anims[i];
        const k = Math.min(1, (t - a.t0) / a.dur);
        a.update(a.ease(k));
        survivors.push(a);
      }
      anims = survivors;
    }

    /* gold dust burst (checkmate / queen falls) */
    function goldBurst(origin, n = 30) {
      const colors = [0xc9a24b, 0xe0be6a, 0x8a6a2c, 0xf0e0b0];
      const geo = new THREE.BoxGeometry(0.06, 0.015, 0.04);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
        m.position.copy(origin);
        transient.add(m);
        const a = Math.random() * Math.PI * 2;
        burstBits.push({
          mesh: m,
          vel: new THREE.Vector3(Math.cos(a) * (0.6 + Math.random()), 1.6 + Math.random() * 1.4, Math.sin(a) * (0.6 + Math.random())),
          spin: new THREE.Vector3(Math.random() * 7, Math.random() * 7, Math.random() * 7),
          t: 0, life: 2.5,
        });
      }
    }
    function stepBurst(dt) {
      for (let i = burstBits.length - 1; i >= 0; i--) {
        const b = burstBits[i];
        b.t += dt;
        b.vel.y -= (b.g || 5.5) * (crazyRef.current ? 0.35 : 1) * dt;
        b.mesh.position.addScaledVector(b.vel, dt);
        b.mesh.rotation.x += b.spin.x * dt;
        b.mesh.rotation.y += b.spin.y * dt;
        b.mesh.rotation.z += b.spin.z * dt;
        if (b.fade) b.mesh.material.opacity = Math.max(0, 1 - b.t / b.life);
        if (b.mesh.position.y < -0.4 || b.t > b.life) {
          transient.remove(b.mesh);
          burstBits.splice(i, 1);
        }
      }
    }

    /* ---------- impact explosions ---------- */
    function debrisBurst(origin, n, palette, speed, size, life, fade, g) {
      const geo = new THREE.BoxGeometry(size, size * 0.3, size * 0.6);
      for (let i = 0; i < n; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: palette[i % palette.length], transparent: !!fade });
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(origin);
        transient.add(m);
        const a = Math.random() * Math.PI * 2;
        const up = 0.6 + Math.random() * 1.2;
        burstBits.push({
          mesh: m,
          vel: new THREE.Vector3(Math.cos(a), up, Math.sin(a)).multiplyScalar(speed * (0.5 + Math.random() * 0.7)),
          spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
          t: 0, life, fade, g,
        });
      }
    }
    function explosion(origin, tier) {
      S.boom(tier);
      shake = Math.max(shake, 0.02 + tier * 0.022);

      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), flashMat);
      flash.position.copy(origin);
      transient.add(flash);
      const grow = 0.8 + tier * 0.5;
      tween(0.26, (k) => {
        flash.scale.setScalar(1 + grow * k);
        flashMat.opacity = 0.95 * (1 - k);
      }, () => transient.remove(flash), easeOut);

      if (tier >= 3) {
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 40), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(origin.x, 0.16, origin.z);
        transient.add(ring);
        tween(0.45, (k) => {
          const s = 1 + k * (1.5 + tier);
          ring.scale.set(s, s, 1);
          ringMat.opacity = 0.65 * (1 - k);
        }, () => transient.remove(ring), easeOut);
      }

      const sparkPal = tier === 4
        ? [0xffcf7a, 0xff9d4a, 0xffe9b0, 0xc9a24b, 0xd96a2b]
        : [0xffcf7a, 0xff9d4a, 0xffe9b0, 0xd96a2b];
      debrisBurst(origin, 8 + tier * 7, sparkPal, 2.4 + tier * 0.5, 0.07, 0.7, true, 4.5);
      debrisBurst(origin, 4 + tier * 3, [0x8a5a2c, 0x5c3a20, 0xb08d5c, 0x3a2515], 1.7, 0.1, 1.3, false, 6.5);

      for (let i = 0, np = 2 + tier; i < np; i++) {
        const pm = new THREE.MeshBasicMaterial({ color: 0x3a332c, transparent: true, opacity: 0.32, depthWrite: false });
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), pm);
        puff.position.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 0.35, Math.random() * 0.2, (Math.random() - 0.5) * 0.35));
        transient.add(puff);
        const y0 = puff.position.y;
        const rise = 0.5 + Math.random() * 0.6;
        const grow2 = 1.6 + tier * 0.4 + Math.random();
        tween(0.7 + Math.random() * 0.4, (k) => {
          puff.position.y = y0 + rise * k;
          puff.scale.setScalar(1 + grow2 * k);
          pm.opacity = 0.32 * (1 - k);
        }, () => transient.remove(puff), easeOut);
      }
    }

    /* ---------- realistic motion helpers ---------- */
    const qTmp = new THREE.Quaternion();
    function settleWobble(grp, axis, amp, done) {
      const q0 = grp.quaternion.clone();
      tween(0.5, (k) => {
        qTmp.setFromAxisAngle(axis, amp * (1 - k) * Math.sin(k * Math.PI * 3.5));
        grp.quaternion.copy(q0).premultiply(qTmp);
      }, () => { grp.quaternion.copy(q0); done && done(); }, linear);
    }

    /* lift → glide → set down, like a hand moving the piece; roll = barrel roll around the travel axis */
    function moveGlide(grp, toV, lift, done, roll = false) {
      const fromV = grp.position.clone();
      const dir = new THREE.Vector3().subVectors(toV, fromV).setY(0).normalize();
      const tiltAxis = new THREE.Vector3().crossVectors(UP, dir).normalize();
      const q0 = grp.quaternion.clone();
      S.lift();
      S.slide(roll);
      tween(0.15, (k) => { grp.position.y = fromV.y + lift * k; }, () => {
        tween(roll ? 0.45 : 0.32, (k) => {
          grp.position.x = fromV.x + (toV.x - fromV.x) * k;
          grp.position.z = fromV.z + (toV.z - fromV.z) * k;
          grp.position.y = fromV.y + lift;
          if (roll) qTmp.setFromAxisAngle(dir, Math.PI * 2 * k);
          else qTmp.setFromAxisAngle(tiltAxis, 0.07 * Math.sin(k * Math.PI));
          grp.quaternion.copy(q0).premultiply(qTmp);
        }, () => {
          grp.quaternion.copy(q0);
          tween(0.13, (k) => { grp.position.y = fromV.y + lift * (1 - k); }, () => {
            grp.position.copy(toV);
            S.set();
            settleWobble(grp, tiltAxis, 0.045, done);
          }, easeIn);
        }, easeIO);
      }, easeOut);
    }

    /* knight somersault: parabolic hop with a full flip, opening up for the landing */
    function knightFlip(grp, toV, done) {
      const fromV = grp.position.clone();
      const dir = new THREE.Vector3().subVectors(toV, fromV).setY(0).normalize();
      const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
      const q0 = grp.quaternion.clone();
      S.lift();
      S.air();
      const peak = crazyRef.current ? 2.6 : 1.7;
      const flips = crazyRef.current ? 2 : 1;
      tween(0.6, (k) => {
        grp.position.x = fromV.x + (toV.x - fromV.x) * k;
        grp.position.z = fromV.z + (toV.z - fromV.z) * k;
        grp.position.y = BOARD_Y + peak * 4 * k * (1 - k);
        qTmp.setFromAxisAngle(axis, Math.PI * 2 * flips * k);
        grp.quaternion.copy(q0).premultiply(qTmp);
      }, () => {
        grp.position.copy(toV);
        grp.quaternion.copy(q0);
        S.set();
        settleWobble(grp, axis, 0.07, done);
      }, easeIO);
    }

    /* the king travels inverted: rise into a slow forward loop, cross upside down, land upright */
    function kingLoop(grp, toV, done) {
      const fromV = grp.position.clone();
      const dir = new THREE.Vector3().subVectors(toV, fromV).setY(0).normalize();
      const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
      const q0 = grp.quaternion.clone();
      const lift = 2.0; // crown clears the board while inverted
      S.lift();
      S.air();
      tween(0.22, (k) => {
        grp.position.y = fromV.y + lift * k;
        qTmp.setFromAxisAngle(axis, Math.PI * k);
        grp.quaternion.copy(q0).premultiply(qTmp);
      }, () => {
        tween(0.3, (k) => {
          grp.position.x = fromV.x + (toV.x - fromV.x) * k;
          grp.position.z = fromV.z + (toV.z - fromV.z) * k;
          qTmp.setFromAxisAngle(axis, Math.PI);
          grp.quaternion.copy(q0).premultiply(qTmp);
        }, () => {
          tween(0.2, (k) => {
            grp.position.y = fromV.y + lift * (1 - k);
            qTmp.setFromAxisAngle(axis, Math.PI * (1 + k));
            grp.quaternion.copy(q0).premultiply(qTmp);
          }, () => {
            grp.position.copy(toV);
            grp.quaternion.copy(q0);
            S.set();
            settleWobble(grp, axis, 0.05, done);
          }, easeIn);
        }, easeIO);
      }, easeOut);
    }

    /* shared tray landing: thud, dead-cat bounce, rattle, settle */
    function trayLanding(victimGrp, slot, axis, tier, onDone) {
      victimGrp.position.set(slot.x, slot.y, slot.z);
      victimGrp.scale.set(BENCH_SCALE, BENCH_SCALE, BENCH_SCALE);
      S.thud(tier);
      if (tier >= 3) shake = Math.max(shake, tier === 4 ? 0.09 : 0.05);
      tween(0.18, (k) => {
        victimGrp.position.y = slot.y + 0.28 * 4 * k * (1 - k) * (tier * 0.25 + 0.25);
      }, () => {
        victimGrp.position.y = slot.y;
        S.bounce(tier);
        if (crazyRef.current) {
          tween(0.16, (k2) => {
            victimGrp.position.y = slot.y + 0.5 * 4 * k2 * (1 - k2);
          }, () => {
            victimGrp.position.y = slot.y;
            S.bounce(1);
            S.rattle();
            settleWobble(victimGrp, axis, 0.2, onDone);
          }, linear);
        } else {
          S.rattle();
          settleWobble(victimGrp, axis, 0.16, onDone);
        }
      }, linear);
    }

    /* knock → tumble through the air → land upright on the tray */
    function captureTumble(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const slotV = new THREE.Vector3(slot.x, slot.y, slot.z);
      const dir = new THREE.Vector3().subVectors(slotV, start).setY(0).normalize();
      if (!isFinite(dir.x) || dir.lengthSq() < 0.01) dir.set(0, 0, victimColor === "b" ? -1 : 1);
      const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
      const q0 = victimGrp.quaternion.clone();
      let turns = { 1: 1, 2: 1, 3: 2, 4: 3 }[tier];
      let peakMul = 1, durMul = 1;
      if (crazyRef.current) { turns += 1 + ((Math.random() * 2) | 0); peakMul = 2 + Math.random() * 1.5; durMul = 1.25; }
      const flightAng = turns * Math.PI * 2 - 0.5; // tip(0.5) + flight = whole turns → lands upright
      const flightDur = { 1: 0.5, 2: 0.62, 3: 0.68, 4: 1.0 }[tier] * durMul;
      const peak = { 1: 1.0, 2: 1.5, 3: 1.9, 4: 2.5 }[tier] * peakMul;

      S.knock(tier);
      S.crackle(tier);
      S.voice(victimType);
      if (tier >= 2) S.whistle(flightDur);
      explosion(start.clone().setY(0.4), tier);

      tween(0.09, (k) => {
        qTmp.setFromAxisAngle(axis, 0.5 * k);
        victimGrp.quaternion.copy(q0).premultiply(qTmp);
      }, () => {
        tween(flightDur, (k) => {
          victimGrp.position.x = start.x + (slotV.x - start.x) * k;
          victimGrp.position.z = start.z + (slotV.z - start.z) * k;
          victimGrp.position.y = start.y + (slotV.y - start.y) * k + peak * 4 * k * (1 - k);
          qTmp.setFromAxisAngle(axis, 0.5 + flightAng * k);
          victimGrp.quaternion.copy(q0).premultiply(qTmp);
          const s = 1 - (1 - BENCH_SCALE) * k;
          victimGrp.scale.set(s, s, s);
        }, () => {
          victimGrp.quaternion.copy(q0);
          trayLanding(victimGrp, slot, axis, tier, onDone);
        }, linear);
      }, easeIn);
    }

    /* ---------- unlockable capture styles ---------- */
    function smokePuff(origin, big = 0) {
      const pm = new THREE.MeshBasicMaterial({ color: 0x3a332c, transparent: true, opacity: 0.3, depthWrite: false });
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), pm);
      puff.position.copy(origin);
      transient.add(puff);
      const y0 = origin.y, rise = 0.4 + Math.random() * 0.4, grow2 = 1.4 + big + Math.random();
      tween(0.6 + Math.random() * 0.3, (k) => {
        puff.position.y = y0 + rise * k;
        puff.scale.setScalar(1 + grow2 * k);
        pm.opacity = 0.3 * (1 - k);
      }, () => transient.remove(puff), easeOut);
    }

    function captureRocket(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const axis = new THREE.Vector3(1, 0, 0);
      S.knock(tier); S.crackle(tier); S.voice(victimType);
      explosion(start.clone().setY(0.4), Math.min(tier, 2));
      rumble(300, 0.2, 0.6);
      whoosh(200, 1800, 0.55, 0.1);
      const q0 = victimGrp.quaternion.clone();
      let puffAt = 0.15;
      tween(0.55, (k) => {
        victimGrp.position.y = start.y + 8 * k * k;
        qTmp.setFromAxisAngle(UP, k * Math.PI * 4);
        victimGrp.quaternion.copy(q0).premultiply(qTmp);
        if (k > puffAt) {
          puffAt += 0.18;
          smokePuff(new THREE.Vector3(start.x, victimGrp.position.y - 0.4, start.z));
        }
      }, () => {
        victimGrp.position.set(slot.x, 6.5, slot.z);
        victimGrp.quaternion.copy(q0);
        S.whistle(0.6);
        tween(0.5, (k) => {
          victimGrp.position.y = 6.5 + (slot.y - 6.5) * k;
          const s = 1 - (1 - BENCH_SCALE) * k;
          victimGrp.scale.set(s, s, s);
        }, () => trayLanding(victimGrp, slot, axis, tier, onDone), easeIn);
      }, linear);
    }

    function captureCyclone(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const slotV = new THREE.Vector3(slot.x, slot.y, slot.z);
      const axis = new THREE.Vector3(1, 0, 0);
      S.knock(tier); S.voice(victimType);
      whoosh(250, 1200, 0.9, 0.09);
      whoosh(300, 1400, 1.1, 0.07, 0.15);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x8a6a4a, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 32), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(start.x, 0.16, start.z);
      transient.add(ring);
      tween(0.7, (k) => {
        const s = 1 + k * 3;
        ring.scale.set(s, s, 1);
        ringMat.opacity = 0.5 * (1 - k);
      }, () => transient.remove(ring), easeOut);
      const q0 = victimGrp.quaternion.clone();
      tween(0.7, (k) => {
        victimGrp.position.y = start.y + 2.4 * k;
        victimGrp.position.x = start.x + Math.sin(k * Math.PI * 5) * 0.25 * k;
        victimGrp.position.z = start.z + Math.cos(k * Math.PI * 5) * 0.25 * k;
        qTmp.setFromAxisAngle(UP, k * Math.PI * 8);
        victimGrp.quaternion.copy(q0).premultiply(qTmp);
      }, () => {
        const top = victimGrp.position.clone();
        tween(0.6, (k) => {
          victimGrp.position.x = top.x + (slotV.x - top.x) * k;
          victimGrp.position.z = top.z + (slotV.z - top.z) * k;
          victimGrp.position.y = top.y + (slotV.y - top.y) * k + 0.6 * 4 * k * (1 - k);
          qTmp.setFromAxisAngle(UP, Math.PI * 8 + k * Math.PI * 4);
          victimGrp.quaternion.copy(q0).premultiply(qTmp);
          const s = 1 - (1 - BENCH_SCALE) * k;
          victimGrp.scale.set(s, s, s);
        }, () => {
          victimGrp.quaternion.copy(q0);
          trayLanding(victimGrp, slot, axis, tier, onDone);
        }, easeIO);
      }, easeOut);
    }

    function captureMeteor(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const axis = new THREE.Vector3(1, 0, 0);
      const apexY = start.y + 5.2;
      S.knock(tier); S.crackle(tier); S.voice(victimType);
      explosion(start.clone().setY(0.4), Math.min(tier, 2));
      const q0 = victimGrp.quaternion.clone();
      tween(0.45, (k) => {
        victimGrp.position.x = start.x + (slot.x - start.x) * k;
        victimGrp.position.z = start.z + (slot.z - start.z) * k;
        victimGrp.position.y = start.y + (apexY - start.y) * k;
        qTmp.setFromAxisAngle(axis, k * Math.PI * 2);
        victimGrp.quaternion.copy(q0).premultiply(qTmp);
      }, () => {
        S.whistle(0.3);
        tween(0.22, (k) => {
          victimGrp.position.y = apexY + (slot.y - apexY) * k;
          const s = 1 - (1 - BENCH_SCALE) * k;
          victimGrp.scale.set(s, s, s);
        }, () => {
          victimGrp.quaternion.copy(q0);
          explosion(new THREE.Vector3(slot.x, 0.35, slot.z), Math.min(4, tier + 1));
          shake = Math.max(shake, 0.1);
          trayLanding(victimGrp, slot, axis, tier, onDone);
        }, easeIn);
      }, easeOut);
    }

    function captureMidas(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const slotV = new THREE.Vector3(slot.x, slot.y, slot.z);
      const dir = new THREE.Vector3().subVectors(slotV, start).setY(0).normalize();
      if (!isFinite(dir.x) || dir.lengthSq() < 0.01) dir.set(0, 0, victimColor === "b" ? -1 : 1);
      const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
      S.knock(tier); S.voice(victimType);
      bellTone(880, 0.05); bellTone(1320, 0.18);
      const saved = [];
      victimGrp.traverse((o) => { if (o.isMesh) { saved.push([o, o.material]); o.material = M.brass; } });
      goldBurst(start.clone().setY(0.8), 20);
      const q0 = victimGrp.quaternion.clone();
      let trailAt = 0.12;
      tween(1.15, (k) => {
        victimGrp.position.x = start.x + (slotV.x - start.x) * k;
        victimGrp.position.z = start.z + (slotV.z - start.z) * k;
        victimGrp.position.y = start.y + (slotV.y - start.y) * k + 2.6 * 4 * k * (1 - k);
        qTmp.setFromAxisAngle(axis, k * Math.PI * 2);
        victimGrp.quaternion.copy(q0).premultiply(qTmp);
        const s = 1 - (1 - BENCH_SCALE) * k;
        victimGrp.scale.set(s, s, s);
        if (k > trailAt) { trailAt += 0.12; goldBurst(victimGrp.position.clone(), 3); }
      }, () => {
        victimGrp.quaternion.copy(q0);
        saved.forEach(([o, mat]) => { o.material = mat; });
        clack(2400, 0.12, 0.05);
        goldBurst(slotV.clone().setY(0.6), 14);
        trayLanding(victimGrp, slot, axis, tier, onDone);
      }, easeIO);
    }

    function captureNova(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const slotV = new THREE.Vector3(slot.x, slot.y, slot.z);
      const dir = new THREE.Vector3().subVectors(slotV, start).setY(0).normalize();
      if (!isFinite(dir.x) || dir.lengthSq() < 0.01) dir.set(0, 0, victimColor === "b" ? -1 : 1);
      const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
      S.knock(4); S.crackle(4); S.voice(victimType); S.whistle(1.2);
      explosion(start.clone().setY(0.5), 4);
      rumble(260, 0.22, 0.7, 0.15);
      const q0 = victimGrp.quaternion.clone();
      const flightAng = 4 * Math.PI * 2;
      tween(1.3, (k) => {
        victimGrp.position.x = start.x + (slotV.x - start.x) * k;
        victimGrp.position.z = start.z + (slotV.z - start.z) * k;
        victimGrp.position.y = start.y + (slotV.y - start.y) * k + 3.6 * 4 * k * (1 - k);
        qTmp.setFromAxisAngle(axis, flightAng * k);
        victimGrp.quaternion.copy(q0).premultiply(qTmp);
        const s = 1 - (1 - BENCH_SCALE) * k;
        victimGrp.scale.set(s, s, s);
      }, () => {
        victimGrp.quaternion.copy(q0);
        explosion(slotV.clone().setY(0.4), 3);
        shake = Math.max(shake, 0.13);
        trayLanding(victimGrp, slot, axis, 4, onDone);
      }, linear);
    }

    /* bishops receive last rites: beam of light, choir, ascension — then a gentle return to the tray */
    function captureAscend(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const axis = new THREE.Vector3(1, 0, 0);
      S.choir();
      bellTone(660, 0.1);
      bellTone(880, 0.5);

      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xffe9b8, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 7, 20, 1, true), beamMat);
      beam.position.set(start.x, 3.4, start.z);
      transient.add(beam);
      tween(0.35, (k) => { beamMat.opacity = 0.22 * k; }, null, easeOut);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.025, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 1.42;
      victimGrp.add(halo);

      debrisBurst(start.clone().setY(0.5), 14, [0xffe9b8, 0xe8c972, 0xfff6dd], 0.9, 0.05, 1.6, true, 0.4);

      const q0 = victimGrp.quaternion.clone();
      tween(1.35, (k) => {
        victimGrp.position.y = start.y + 6.2 * k;
        qTmp.setFromAxisAngle(UP, k * Math.PI);
        victimGrp.quaternion.copy(q0).premultiply(qTmp);
        if (k > 0.8) {
          const s = Math.max(0.02, 1 - (k - 0.8) / 0.2);
          victimGrp.scale.set(s, s, s);
        }
      }, () => {
        victimGrp.quaternion.copy(q0);
        bellTone(1320, 0.05);
        tween(0.4, (k) => { beamMat.opacity = 0.22 * (1 - k); }, () => transient.remove(beam), easeIn);
        tween(0.35, () => {}, () => {
          victimGrp.position.set(slot.x, 5, slot.z);
          swell(659.25, 0.9, 0.04);
          tween(0.95, (k) => {
            victimGrp.position.y = 5 + (slot.y - 5) * k;
            victimGrp.position.x = slot.x + Math.sin(k * Math.PI * 3) * 0.12 * (1 - k);
            const s = 0.02 + (BENCH_SCALE - 0.02) * Math.min(1, k * 2.5);
            victimGrp.scale.set(s, s, s);
          }, () => {
            victimGrp.remove(halo);
            victimGrp.position.set(slot.x, slot.y, slot.z);
            victimGrp.scale.set(BENCH_SCALE, BENCH_SCALE, BENCH_SCALE);
            bellTone(880, 0);
            clack(1500, 0.06, 0.03);
            settleWobble(victimGrp, axis, 0.06, onDone);
          }, linear);
        }, linear);
      }, easeIO);
    }

    const styleFns = {
      tumble: captureTumble, rocket: captureRocket, cyclone: captureCyclone,
      meteor: captureMeteor, midas: captureMidas, nova: captureNova,
      cage: captureCage, portal: capturePortal, hole: captureBlackhole,
      barrel: captureBarrel,
    };

    /* ---------- points ---------- */
    function pointsPop(v, pos) {
      const cv = document.createElement("canvas");
      cv.width = 256; cv.height = 128;
      const g = cv.getContext("2d");
      g.font = "700 64px Georgia, serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.strokeStyle = "rgba(18,11,5,.85)"; g.lineWidth = 9; g.lineJoin = "round";
      g.strokeText("+" + v, 128, 66);
      g.fillStyle = "#E8C972";
      g.fillText("+" + v, 128, 66);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
      const y0 = (pos.y || 0) + 1.2;
      sp.position.set(pos.x, y0, pos.z);
      sp.scale.set(1.05, 0.52, 1);
      transient.add(sp);
      tween(0.95, (k) => {
        sp.position.y = y0 + k * 0.85;
        sp.material.opacity = 1 - Math.max(0, k - 0.5) / 0.5;
      }, () => transient.remove(sp), easeOut);
    }
    function award(pts, pos) {
      if (modeRef.current !== "panda") return; // points are earned against the Panda
      pointsRef.current += pts;
      setPoints(pointsRef.current);
      schedulePersist();
      if (pos) pointsPop(pts, pos);
    }

    /* ---------- crazy mode capture events ---------- */
    function captureCage(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const axis = new THREE.Vector3(1, 0, 0);
      S.voice(victimType);
      const cage = new THREE.Group();
      const barGeo = new THREE.CylinderGeometry(0.024, 0.024, 1.35, 8);
      for (let i = 0; i < 8; i++) {
        const bar = new THREE.Mesh(barGeo, M.brass);
        const a = (i / 8) * Math.PI * 2;
        bar.position.set(Math.cos(a) * 0.42, 0.675, Math.sin(a) * 0.42);
        cage.add(bar);
      }
      for (const y of [0.06, 1.32]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 24), M.brass);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        cage.add(ring);
      }
      cage.position.set(start.x, 6, start.z);
      transient.add(cage);
      whoosh(1400, 300, 0.35, 0.09);
      tween(0.3, (k) => { cage.position.y = 6 * (1 - k) + 0.13 * k; }, () => {
        cage.position.y = 0.13;
        clack(2400, 0.22, 0.06); clack(2600, 0.15, 0.05, 0.07); thump(140, 0.12, 0.1);
        shake = Math.max(shake, 0.05);
        settleWobble(victimGrp, axis, 0.2, null);
        tween(0.5, () => {}, () => {
          whoosh(300, 1600, 0.4, 0.1);
          tween(0.4, (k) => {
            const y = 8 * k * k;
            cage.position.y = 0.13 + y;
            victimGrp.position.y = start.y + y;
          }, () => {
            transient.remove(cage);
            victimGrp.position.set(slot.x, 4, slot.z);
            victimGrp.scale.set(BENCH_SCALE, BENCH_SCALE, BENCH_SCALE);
            S.whistle(0.4);
            tween(0.35, (k) => { victimGrp.position.y = 4 + (slot.y - 4) * k; },
              () => trayLanding(victimGrp, slot, axis, tier, onDone), easeIn);
          }, easeIn);
        }, linear);
      }, easeIn);
    }

    function captureBarrel(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const slotV = new THREE.Vector3(slot.x, slot.y, slot.z);
      const dir = new THREE.Vector3().subVectors(slotV, start).setY(0).normalize();
      if (!isFinite(dir.x) || dir.lengthSq() < 0.01) dir.set(0, 0, victimColor === "b" ? -1 : 1);
      const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
      S.knock(tier); S.voice(victimType);
      const barrel = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 18), M.frame);
      body.castShadow = true;
      barrel.add(body);
      for (const y of [-0.3, 0, 0.3]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 8, 24), M.brass);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = y;
        barrel.add(hoop);
      }
      barrel.position.set(start.x, 2.6, start.z);
      transient.add(barrel);
      const qTip = new THREE.Quaternion().setFromAxisAngle(dir, Math.PI / 2);
      tween(0.22, (k) => { barrel.position.y = 2.6 + (0.6 - 2.6) * k; }, () => {
        thump(120, 0.14, 0.12); clack(900, 0.14, 0.05);
        victimGrp.scale.set(0.02, 0.02, 0.02); // stuffed inside
        tween(0.15, (k) => {
          qTmp.setFromAxisAngle(dir, (Math.PI / 2) * k);
          barrel.quaternion.copy(qTmp);
          barrel.position.y = 0.6 + (0.55 - 0.6) * k;
        }, () => {
          const dist = Math.hypot(slotV.x - start.x, slotV.z - start.z);
          let lastClack = 0;
          tween(0.9, (k) => {
            barrel.position.x = start.x + (slotV.x - start.x) * k;
            barrel.position.z = start.z + (slotV.z - start.z) * k;
            qTmp.setFromAxisAngle(axis, (dist / 0.42) * k);
            barrel.quaternion.copy(qTmp).multiply(qTip);
            if (k - lastClack > 0.22) { lastClack = k; clack(700 + Math.random() * 300, 0.09, 0.04); }
          }, () => {
            debrisBurst(slotV.clone().setY(0.5), 12, [0x8a5a2c, 0x5c3a20, 0xb08d5c], 1.8, 0.09, 1.1, false, 6.5);
            thump(100, 0.15, 0.12); clack(1100, 0.16, 0.05);
            transient.remove(barrel);
            victimGrp.position.set(slot.x, slot.y + 0.4, slot.z);
            tween(0.22, (k) => {
              const s = 0.02 + (BENCH_SCALE - 0.02) * k;
              victimGrp.scale.set(s, s, s);
              victimGrp.position.y = slot.y + 0.4 * (1 - k);
            }, () => trayLanding(victimGrp, slot, axis, tier, onDone), easeBack);
          }, easeIO);
        }, easeIn);
      }, easeIn);
    }

    function capturePortal(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const axis = new THREE.Vector3(1, 0, 0);
      S.voice(victimType);
      function portal(color, pos) {
        const g2 = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 32),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.46, 32),
          new THREE.MeshBasicMaterial({ color: 0x090604, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
        g2.add(ring, disc);
        g2.rotation.x = -Math.PI / 2;
        g2.position.copy(pos);
        g2.scale.set(0.01, 0.01, 0.01);
        transient.add(g2);
        tween(0.25, (k) => g2.scale.setScalar(Math.max(0.01, k)), null, easeBack);
        return g2;
      }
      const inP = portal(0xff8c2a, new THREE.Vector3(start.x, 0.16, start.z));
      whoosh(500, 1500, 0.4, 0.08);
      const q0 = victimGrp.quaternion.clone();
      tween(0.6, (k) => {
        inP.rotation.z = k * 4;
        qTmp.setFromAxisAngle(UP, k * Math.PI * 5);
        victimGrp.quaternion.copy(q0).premultiply(qTmp);
        const s = Math.max(0.02, 1 - 0.98 * k);
        victimGrp.scale.set(s, s, s);
        victimGrp.position.y = start.y - 0.1 * k;
      }, () => {
        victimGrp.quaternion.copy(q0);
        gliss(1200, 300, 0.3, 0.07);
        tween(0.25, (k) => inP.scale.setScalar(Math.max(0.01, 1 - k)), () => transient.remove(inP), easeIn);
        const outP = portal(0x37b8ff, new THREE.Vector3(slot.x, 3.2, slot.z));
        tween(0.35, () => {}, () => {
          gliss(300, 1200, 0.25, 0.07);
          victimGrp.position.set(slot.x, 3.0, slot.z);
          tween(0.45, (k) => {
            const s = Math.max(0.02, 0.02 + (BENCH_SCALE - 0.02) * Math.min(1, k * 2));
            victimGrp.scale.set(s, s, s);
            victimGrp.position.y = 3.0 + (slot.y - 3.0) * k;
          }, () => {
            tween(0.22, (k) => outP.scale.setScalar(Math.max(0.01, 1 - k)), () => transient.remove(outP), easeIn);
            trayLanding(victimGrp, slot, axis, tier, onDone);
          }, easeIn);
        }, linear);
      }, easeIn);
    }

    function captureBlackhole(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const axis = new THREE.Vector3(1, 0, 0);
      S.voice(victimType);
      rumble(140, 0.22, 1.2);
      whoosh(1600, 220, 1.0, 0.1); // the suck
      const holePos = new THREE.Vector3(start.x, 1.9, start.z);
      const hole = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000 }));
      const disk = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 10, 40),
        new THREE.MeshBasicMaterial({ color: 0xffb45c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      disk.rotation.x = Math.PI / 2.4;
      const disk2 = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.02, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0x9f6bff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      disk2.rotation.x = Math.PI / 2.1;
      hole.add(core, disk, disk2);
      hole.position.copy(holePos);
      hole.scale.set(0.01, 0.01, 0.01);
      transient.add(hole);
      tween(0.4, (k) => hole.scale.setScalar(Math.max(0.01, k)), null, easeBack);
      tween(1.5, (k) => { disk.rotation.z = k * 14; disk2.rotation.z = -k * 9; }, null, linear);
      // infalling debris
      for (let i = 0; i < 10; i++) {
        const mote = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.04),
          new THREE.MeshBasicMaterial({ color: [0xffb45c, 0xe8c972, 0x9f6bff][i % 3] }));
        const a0 = Math.random() * Math.PI * 2;
        const r0 = 1.4 + Math.random() * 1.2;
        const y0 = 0.3 + Math.random() * 2.6;
        transient.add(mote);
        tween(0.6 + Math.random() * 0.6, (k) => {
          const r = r0 * (1 - k);
          const a = a0 + k * 7;
          mote.position.set(holePos.x + Math.cos(a) * r, y0 + (holePos.y - y0) * k, holePos.z + Math.sin(a) * r);
          mote.scale.setScalar(Math.max(0.05, 1 - k));
        }, () => transient.remove(mote), easeIn);
      }
      const q0 = victimGrp.quaternion.clone();
      shake = Math.max(shake, 0.04);
      tween(1.0, (k) => {
        // spaghettification: taller, thinner, spiraling up into the hole
        victimGrp.position.x = start.x + Math.sin(k * Math.PI * 4) * 0.15 * (1 - k);
        victimGrp.position.z = start.z + Math.cos(k * Math.PI * 4) * 0.15 * (1 - k);
        victimGrp.position.y = start.y + (holePos.y - 0.5 - start.y) * k;
        qTmp.setFromAxisAngle(UP, k * Math.PI * 6);
        victimGrp.quaternion.copy(q0).premultiply(qTmp);
        const sy = 1 + k * 1.6;
        const sxz = Math.max(0.02, 1 - k * 0.95);
        victimGrp.scale.set(sxz, k > 0.85 ? Math.max(0.02, sy * (1 - (k - 0.85) / 0.15)) : sy, sxz);
      }, () => {
        victimGrp.quaternion.copy(q0);
        victimGrp.scale.set(0.02, 0.02, 0.02);
        thump(42, 0.22, 0.35);
        clack(500, 0.1, 0.06);
        shake = Math.max(shake, 0.08);
        tween(0.3, (k) => hole.scale.setScalar(Math.max(0.01, 1 - k)), () => transient.remove(hole), easeIn);
        tween(0.4, () => {}, () => {
          const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
          const flash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), flashMat);
          flash.position.set(slot.x, 2.6, slot.z);
          transient.add(flash);
          tween(0.3, (k) => { flash.scale.setScalar(1 + 3 * k); flashMat.opacity = 0.9 * (1 - k); }, () => transient.remove(flash), easeOut);
          gliss(200, 1100, 0.25, 0.08);
          victimGrp.position.set(slot.x, 2.5, slot.z);
          tween(0.4, (k) => {
            const s = Math.max(0.02, 0.02 + (BENCH_SCALE - 0.02) * Math.min(1, k * 2));
            victimGrp.scale.set(s, s, s);
            victimGrp.position.y = 2.5 + (slot.y - 2.5) * k;
            qTmp.setFromAxisAngle(axis, k * Math.PI * 2);
            victimGrp.quaternion.copy(q0).premultiply(qTmp);
          }, () => {
            victimGrp.quaternion.copy(q0);
            trayLanding(victimGrp, slot, axis, tier, onDone);
          }, easeIn);
        }, linear);
      }, easeIn);
    }

    function buildSpider() {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 0.85 });
      const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), bodyMat);
      abdomen.position.set(0, 0, 0.12);
      abdomen.scale.set(1, 0.85, 1.15);
      abdomen.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), bodyMat);
      head.position.set(0, -0.02, -0.16);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff5a4a }));
        eye.position.set(s * 0.045, 0.02, -0.25);
        g.add(eye);
      }
      const legsL = new THREE.Group(), legsR = new THREE.Group();
      const legGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.42, 6);
      for (let i = 0; i < 4; i++) {
        for (const [s, grp2] of [[-1, legsL], [1, legsR]]) {
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(s * 0.22, -0.08, -0.12 + i * 0.09);
          leg.rotation.z = s * 1.15;
          leg.rotation.y = s * (i - 1.5) * 0.25;
          grp2.add(leg);
        }
      }
      g.add(abdomen, head, legsL, legsR);
      g.userData.legsL = legsL;
      g.userData.legsR = legsR;
      return g;
    }

    function captureSpider(victimGrp, tier, victimType, victimColor, benchIdx, onDone) {
      const start = victimGrp.position.clone();
      const slot = benchPos(victimColor, benchIdx);
      const axis = new THREE.Vector3(1, 0, 0);
      S.voice(victimType);
      S.skitter();
      rumble(180, 0.1, 0.8);
      const rig = new THREE.Group();
      rig.position.set(start.x, 0, start.z);
      transient.add(rig);
      const spider = buildSpider();
      rig.add(spider);
      const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6),
        new THREE.MeshBasicMaterial({ color: 0xe8e2d0 }));
      rig.add(thread);
      const TOPY = 7;
      let spiderY = TOPY;
      const setSpider = (y) => {
        spiderY = y;
        spider.position.y = y;
        const len = Math.max(0.01, TOPY - y);
        thread.scale.y = len;
        thread.position.y = y + len / 2;
      };
      setSpider(TOPY);
      const wig = (k, sp) => {
        spider.userData.legsL.rotation.x = Math.sin(k * sp) * 0.24;
        spider.userData.legsR.rotation.x = -Math.sin(k * sp) * 0.24;
      };
      tween(0.7, (k) => {
        setSpider(TOPY + (1.35 - TOPY) * k);
        rig.position.x = start.x + Math.sin(k * Math.PI * 2.5) * 0.08 * (1 - k);
        wig(k, 26);
      }, () => {
        thump(150, 0.1, 0.08); clack(1900, 0.12, 0.04);
        tween(0.14, (k) => {
          victimGrp.scale.set(1 + 0.18 * k, 1 - 0.22 * k, 1 + 0.18 * k);
          setSpider(1.35 - 0.25 * k);
        }, () => {
          victimGrp.scale.set(1, 1, 1);
          S.skitter();
          whoosh(700, 1200, 0.5, 0.05);
          const cocoon = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14),
            new THREE.MeshStandardMaterial({ color: 0xefead8, roughness: 0.85 }));
          cocoon.scale.set(0.01, 0.01, 0.01);
          cocoon.position.y = 0.6;
          cocoon.castShadow = true;
          rig.add(cocoon);
          tween(0.55, (k) => {
            const a = k * Math.PI * 4;
            spider.position.x = Math.cos(a) * 0.5;
            spider.position.z = Math.sin(a) * 0.5;
            setSpider(0.6 + Math.sin(a * 0.5) * 0.1);
            wig(k, 40);
            const cs = Math.max(0.01, k);
            cocoon.scale.set(cs, cs * 1.35, cs);
            const vs = Math.max(0.02, 1 - k);
            victimGrp.scale.set(vs, vs, vs);
          }, () => {
            spider.position.x = 0;
            spider.position.z = 0;
            S.skitter();
            whoosh(300, 900, 0.7, 0.06);
            tween(0.45, (k) => {
              setSpider(0.35 + (3.2 - 0.35) * k);
              cocoon.position.y = spiderY - 0.55;
              wig(k, 22);
            }, () => {
              tween(0.8, (k) => {
                rig.position.x = start.x + (slot.x - start.x) * k;
                rig.position.z = start.z + (slot.z - start.z) * k;
                setSpider(3.2 + Math.sin(k * Math.PI) * 0.3);
                cocoon.position.y = spiderY - 0.55;
                cocoon.rotation.z = Math.sin(k * Math.PI * 3) * 0.15;
                wig(k, 30);
              }, () => {
                clack(1400, 0.1, 0.04);
                tween(0.32, (k) => {
                  cocoon.position.y = (spiderY - 0.55) + (0.45 - (spiderY - 0.55)) * k;
                }, () => {
                  rig.remove(cocoon);
                  thump(110, 0.14, 0.12);
                  debrisBurst(new THREE.Vector3(slot.x, 0.5, slot.z), 10, [0xefead8, 0xdcd4bc, 0xfff8e8], 1.6, 0.07, 0.9, true, 5);
                  victimGrp.position.set(slot.x, slot.y + 0.35, slot.z);
                  tween(0.2, (k) => {
                    const s = 0.02 + (BENCH_SCALE - 0.02) * k;
                    victimGrp.scale.set(s, s, s);
                    victimGrp.position.y = slot.y + 0.35 * (1 - k);
                  }, () => trayLanding(victimGrp, slot, axis, tier, onDone), easeBack);
                  S.skitter();
                  tween(0.3, (k) => { setSpider(3.2 + (TOPY - 3.2) * k); wig(k, 34); },
                    () => transient.remove(rig), easeIn);
                }, easeIn);
              }, easeIO);
            }, easeOut);
          }, linear);
        }, easeOut);
      }, easeIO);
    }

    /* ---------- pokémon-style battle (crazy mode) ---------- */
    let battleCancel = null;
    function startBattle(attacker, victim, onEnd) {
      const timers = [];
      let finished = false;
      const finish = (fire) => {
        if (finished) return;
        finished = true;
        timers.forEach(clearTimeout);
        battleCancel = null;
        battleSkipRef.current = null;
        setBattle(null);
        if (fire) onEnd();
      };
      battleCancel = () => finish(false);
      battleSkipRef.current = () => finish(true);
      const step = (ms, fn) => timers.push(setTimeout(fn, ms));
      const A = { t: attacker.t, c: attacker.c }, V = { t: victim.t, c: victim.c };
      setBattle({ a: A, v: V, hp: 100, log: `A wild ${NAME[V.t]} blocks the way!`, shake: false });
      [392, 523, 659].forEach((f, i) => note(f, i * 0.09, 0.08, 0.14));
      step(1100, () => setBattle((b) => b && { ...b, log: `${NAME[A.t]} used ${BATTLE_MOVES[A.t]}!` }));
      step(1900, () => {
        clack(2000, 0.22, 0.05); thump(110, 0.16, 0.12);
        setBattle((b) => b && { ...b, hp: 25 + Math.random() * 20, shake: true });
      });
      step(2300, () => setBattle((b) => b && { ...b, shake: false, log: "It's super effective!" }));
      step(3100, () => {
        clack(2100, 0.2, 0.05); thump(100, 0.16, 0.12);
        setBattle((b) => b && { ...b, hp: 0, shake: true });
      });
      step(3500, () => setBattle((b) => b && { ...b, shake: false, log: `${NAME[V.t]} fainted!` }));
      step(3600, () => gliss(600, 120, 0.5, 0.08));
      step(4400, () => finish(true));
    }

    function dropFood() {
      const kind = Math.random() < 0.75 ? "chicken" : "flesh";
      invRef.current = { ...invRef.current, [kind]: invRef.current[kind] + 1 };
      setInv(invRef.current);
    }

    /* the losing king's death scene: tremble, blast, slow topple, lie in state */
    function kingDeath(grp, pos, done) {
      const a2 = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a2), 0, Math.sin(a2));
      const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
      const q0 = grp.quaternion.clone();
      S.groan();
      tween(0.55, (k) => {
        qTmp.setFromAxisAngle(axis, Math.sin(k * Math.PI * 7) * 0.07 * k);
        grp.quaternion.copy(q0).premultiply(qTmp);
      }, () => {
        explosion(pos.clone().setY(0.6), 4);
        tween(0.6, (k) => {
          qTmp.setFromAxisAngle(axis, (Math.PI / 2) * k);
          grp.quaternion.copy(q0).premultiply(qTmp);
          grp.position.y = BOARD_Y + 0.2 * k;
        }, () => {
          S.thud(4);
          S.rattle();
          shake = Math.max(shake, 0.11);
          settleWobble(grp, axis, 0.08, () => {
            goldBurst(pos.clone().setY(1.0), 60);
            S.win();
            done && done();
          });
        }, easeIn);
      }, linear);
    }

    /* ---------- game flow ---------- */
    function statusBanner(g, thinkingNow) {
      const m = modeRef.current;
      const nm = characterRef.current && characterRef.current.name;
      if (m === "online" && net) {
        if (g.status === "mate")
          return { text: g.winner === net.seat ? "Checkmate — " + (nm || "you") + " win" + (nm ? "s" : "") + "! ✦"
            : "Checkmate — " + (net.oppName || "your opponent") + " wins", tone: "final" };
        if (g.status === "draw") return { text: "Drawn — good game 🤝", tone: "final" };
        if (g.check) return { text: g.turn === net.seat ? "Your king is in check" : "Their king is in check", tone: "danger" };
        return g.turn === net.seat
          ? { text: "Your move · room " + net.code, tone: "" }
          : { text: (net.oppName || "Opponent") + " is thinking…", tone: "" };
      }
      if (g.status === "mate")
        return { text: g.winner === "w"
          ? (m === "panda" ? "Checkmate — " + (nm || "you") + " win" + (nm ? "s" : "") + "! ✦" : "Checkmate — maple wins ✦")
          : (m === "panda" ? "Checkmate — Panda takes it 🐼" : "Checkmate — walnut wins ✦"), tone: "final" };
      if (g.status === "draw") return { text: "Drawn — neither side can continue", tone: "final" };
      if (thinkingNow) return { text: "Panda is thinking…", tone: "" };
      if (g.check) return { text: g.turn === "w" ? "Your king is in check" : "Panda's king is in check", tone: "danger" };
      if (g.turn === "w") return { text: m === "panda" ? (nm ? nm + "'s move (maple)" : "Your move (maple)") : "Maple to move", tone: "" };
      return { text: m === "panda" ? "Panda's move" : "Walnut to move", tone: "" };
    }
    function updateChrome(thinkingNow = false) {
      setBanner(statusBanner(game, thinkingNow));
      setCanUndo(history.length > 0);
      setTrayCount({ w: game.benches.w.length, b: game.benches.b.length });
      refreshOverlays(game);
    }

    function doMove(m) {
      history.push(snapshot(game));
      const { next, captured, capIdx, promoted } = applyMove(game, m);
      void capIdx;
      game = resolve(next);
      clearSelection();
      seqActive = true;
      if (crazyRef.current && m.piece.c === "w") {
        hungerRef.current = Math.max(0, hungerRef.current - 6);
        setHunger(hungerRef.current);
      }
      if (modeRef.current === "online" && net && m.piece.c === net.seat) {
        const uci = moveToUci(m);
        net.applied++; // count our own move so polling never replays it
        (async () => {
          try {
            const room = (await roomRead(net.code)) || { moves: [], players: {} };
            room.moves.push(uci);
            await roomWrite(net.code, room);
          } catch (e) { setOnlineMsg("Move sync hiccup — reconnecting…"); }
        })();
      }

      const moverGrp = meshes.get(m.piece.id).grp;
      const toSq = sqPos(m.to);
      const toV = new THREE.Vector3(toSq.x, BOARD_Y, toSq.z);
      const victimGrp = captured ? meshes.get(captured.id).grp : null;
      const benchIdx = captured ? game.benches[captured.c].length - 1 : 0;

      let remaining = 1 + (captured ? 1 : 0) + (promoted ? 1 : 0);
      const part = () => {
        if (--remaining > 0) return;
        updateChrome();
        if (m.piece.c === "w" && game.status === "play" && game.check) {
          const eks = kingSquare(game.board, game.turn);
          const ekp = sqPos(eks);
          award(15, new THREE.Vector3(ekp.x, 0.6, ekp.z));
        }
        if (game.status !== "play") persist();
        if (game.status === "mate") {
          const ks = kingSquare(game.board, game.turn);
          const kp = sqPos(ks);
          const kpiece = game.board[ks];
          const krec = kpiece && meshes.get(kpiece.id);
          const fin = () => {
            seqActive = false;
            if (modeRef.current === "panda" && game.winner === "w") {
              const lv = levelRef.current;
              award(100 * lv, null);
              if (lv > maxBeatenRef.current) {
                const prev = maxBeatenRef.current;
                maxBeatenRef.current = lv;
                setMaxBeaten(lv);
                award(200, null); // first-clear bonus
                const fresh = CAPTURE_STYLES.filter((s2) => s2.req > prev && s2.req <= lv);
                setUnlockMsg(fresh.length ? "Unlocked: " + fresh.map((s2) => s2.name).join(" · ") : null);
              } else setUnlockMsg(null);
              persist();
              setCredits(true);
            }
          };
          if (krec) kingDeath(krec.grp, new THREE.Vector3(kp.x, 0, kp.z), fin);
          else fin();
          return;
        }
        seqActive = false;
        if (game.check) S.uhoh();
        if (game.status === "play" && modeRef.current === "panda" && game.turn === "b") schedulePanda();
      };

      moverGrp.position.y = BOARD_Y;
      const moverDone = () => {
        if (m.castle) {
          const home = m.piece.c === "w" ? 7 : 0;
          const rookTo = m.castle === "K" ? idx(home, 5) : idx(home, 3);
          const rp = game.board[rookTo];
          if (rp) {
            const rg = meshes.get(rp.id).grp;
            const rt = sqPos(rookTo);
            moveGlide(rg, new THREE.Vector3(rt.x, BOARD_Y, rt.z), 0.85, null, true);
          }
          if (m.piece.c === "w") award(20, toV.clone());
        }
        if (promoted) {
          const np = game.board[m.to];
          // the pawn is carried off, the queen is set down in its place
          tween(0.35, (k) => { moverGrp.position.y = BOARD_Y + k * 2.6; }, () => {
            scene.remove(moverGrp);
            const fresh = ensureMesh(np); // rebuilds as a queen
            fresh.position.set(toV.x, BOARD_Y + 2.4, toV.z);
            fresh.rotation.y = np.c === "b" ? Math.PI : 0;
            tween(0.32, (k) => { fresh.position.y = BOARD_Y + 2.4 * (1 - k); }, () => {
              fresh.position.copy(toV);
              S.set();
              if (np.c === "w") award(40, toV.clone());
              settleWobble(fresh, new THREE.Vector3(1, 0, 0), 0.05, part);
            }, easeIn);
          }, easeOut);
        }
        part();
      };
      if (m.piece.t === "n") knightFlip(moverGrp, toV, moverDone);
      else if (m.piece.t === "k") kingLoop(moverGrp, toV, moverDone);
      else if (m.piece.t === "r") moveGlide(moverGrp, toV, 0.85, moverDone, true);
      else moveGlide(moverGrp, toV, 0.5, moverDone);
      if (captured) {
        // the knock lands as the mover arrives (knights, rooks, and kings detonate on touchdown)
        const knockDelay = m.piece.t === "n" ? 0.56 : m.piece.t === "r" ? 0.58 : m.piece.t === "k" ? 0.68 : 0.34;
        S.approach(knockDelay, m.piece.t === "n");
        tween(knockDelay, () => {}, () => {
          const go = () => {
            if (m.piece.c === "w") {
              award(VAL[captured.t] * 10, victimGrp.position.clone());
              if (crazyRef.current) dropFood();
            }
            let fn = captured.t === "b" ? captureAscend : (styleFns[styleRef.current] || captureTumble);
            if (crazyRef.current && captured.t !== "b") {
              const pool = [captureSpider, captureCage, captureBarrel, capturePortal, captureBlackhole, captureTumble, captureRocket, captureCyclone, captureMeteor, captureNova];
              fn = pool[(Math.random() * pool.length) | 0];
            }
            fn(victimGrp, TIER[captured.t], captured.t, captured.c, benchIdx, part);
          };
          if (crazyRef.current) startBattle(m.piece, captured, go);
          else go();
        }, linear);
      }
      updateChrome();
    }

    let searchCancel = null;
    function heuristicPick(moves) {
      let best = -1, pool = [];
      for (const mv of moves) {
        const s = (mv.cap ? VAL[mv.cap.t] : 0) + (mv.promote ? 8 : 0);
        if (s > best) { best = s; pool = [mv]; }
        else if (s === best) pool.push(mv);
      }
      return pool[(Math.random() * pool.length) | 0];
    }
    function schedulePanda() {
      setThinking(true);
      setBanner(statusBanner(game, true));
      const moves = legalMoves(game, "b");
      if (!moves.length) { setThinking(false); updateChrome(); return; }
      const L = LEVELS[levelRef.current] || LEVELS[1];
      const t0 = performance.now();
      const play = (mv) => {
        const wait = Math.max(0, 650 + Math.random() * 450 - (performance.now() - t0));
        thinkTimer = setTimeout(() => {
          thinkTimer = null;
          setThinking(false);
          if (game.status !== "play" || game.turn !== "b" || modeRef.current !== "panda") { updateChrome(); return; }
          doMove(mv);
        }, wait);
      };
      const blend = (mv) =>
        (!mv || Math.random() < L.blunder)
          ? (Math.random() < 0.5 ? moves[(Math.random() * moves.length) | 0] : heuristicPick(moves))
          : mv;
      const eng = engineRef.current;
      if (eng && eng.ready && eng.send) {
        let answered = false;
        const guard = setTimeout(() => {
          if (answered) return;
          answered = true;
          eng.onBest = null;
          play(blend(heuristicPick(moves)));
        }, 3000);
        searchCancel = () => { answered = true; clearTimeout(guard); eng.onBest = null; };
        eng.onBest = (tok) => {
          if (answered) return;
          answered = true;
          clearTimeout(guard);
          eng.onBest = null;
          play(blend(uciToMove(tok, moves)));
        };
        eng.send("setoption name Skill Level value " + L.skill);
        eng.send("position fen " + toFEN(game, history.length));
        eng.send(L.depth ? "go depth " + L.depth : "go movetime " + L.ms);
      } else {
        play(blend(heuristicPick(moves)));
      }
    }

    function undo() {
      if (modeRef.current === "online" && net) return; // shared games can't rewind
      if (!history.length) return;
      fastForward();
      if (battleCancel) battleCancel();
      if (searchCancel) { searchCancel(); searchCancel = null; }
      if (engineRef.current && engineRef.current.ready) engineRef.current.send("stop");
      if (thinkTimer) { clearTimeout(thinkTimer); thinkTimer = null; }
      setCredits(false);
      setThinking(false);
      seqActive = false;
      let snap = history.pop();
      if (modeRef.current === "panda") {
        while (snap && snap.turn !== "w" && history.length) snap = history.pop();
        if (snap && snap.turn !== "w") snap = null;
      }
      if (!snap) { restart(); return; }
      game = snap;
      syncScene(game);
      updateChrome();
      S.set();
    }

    function restart(newMode) {
      if (modeRef.current === "online" && net && !newMode) return; // leave the room instead
      fastForward();
      if (battleCancel) battleCancel();
      if (searchCancel) { searchCancel(); searchCancel = null; }
      if (engineRef.current && engineRef.current.ready) engineRef.current.send("stop");
      if (thinkTimer) { clearTimeout(thinkTimer); thinkTimer = null; }
      setCredits(false);
      setThinking(false);
      seqActive = false;
      history.length = 0;
      if (newMode) { modeRef.current = newMode; setMode(newMode); }
      game = resolve(newGame());
      syncScene(game);
      updateChrome();
    }

    /* ---------- online rooms (shared artifact storage, ~2.5s polling) ---------- */
    let net = null; // { code, seat, applied, timer, oppName }
    async function roomRead(code) {
      const r = await store.get("bc-room:" + code, true);
      return r && r.value ? JSON.parse(r.value) : null;
    }
    async function roomWrite(code, obj) {
      await store.set("bc-room:" + code, JSON.stringify(obj), true);
    }
    function startNet(code, seat) {
      stopNet();
      restart("online");
      camTheta = seat === "b" ? Math.PI : 0;
      placeCamera();
      net = { code, seat, applied: 0, timer: setInterval(pollNet, 2500), oppName: null };
      setOnline({ code, seat });
      pollNet();
    }
    function stopNet() {
      if (net) { clearInterval(net.timer); net = null; }
      setOnline(null);
    }
    async function createRoom() {
      if (!store.sharedOk()) { setOnlineMsg("Online rooms need the multiplayer server — coming right after launch"); return; }
      try {
        const code = genRoomCode();
        const nm = (characterRef.current && characterRef.current.name) || "Maple";
        await roomWrite(code, { moves: [], players: { w: nm, b: null }, t: Date.now() });
        startNet(code, "w");
        setOnlineMsg("Room " + code + " — share the code, waiting for a challenger…");
      } catch (e) { setOnlineMsg("Couldn't create a room — try again"); }
    }
    async function joinRoom(codeRaw) {
      if (!store.sharedOk()) { setOnlineMsg("Online rooms need the multiplayer server — coming right after launch"); return; }
      const code = (codeRaw || "").trim().toUpperCase();
      if (code.length !== 4) { setOnlineMsg("Enter the 4-letter room code"); return; }
      try {
        const room = await roomRead(code);
        if (!room) { setOnlineMsg("No room " + code + " found"); return; }
        const nm = (characterRef.current && characterRef.current.name) || "Walnut";
        room.players.b = nm;
        await roomWrite(code, room);
        startNet(code, "b");
        setOnlineMsg("Joined " + code + " — you play walnut");
      } catch (e) { setOnlineMsg("Couldn't join — try again"); }
    }
    function leaveOnline() {
      stopNet();
      setOnlineMsg(null);
      setShowOnline(false);
      restart("panda");
    }
    async function pollNet() {
      if (!net) return;
      try {
        const room = await roomRead(net.code);
        if (!room || !net) return;
        const opp = net.seat === "w" ? room.players.b : room.players.w;
        if (opp && net.oppName !== opp) { net.oppName = opp; setOnlineMsg("Playing " + opp + " — room " + net.code); }
        else if (!opp) setOnlineMsg("Room " + net.code + " — waiting for a challenger…");
        while (net && room.moves.length > net.applied && !seqActive) {
          const mv = uciToMove(room.moves[net.applied], legalMoves(game, game.turn));
          net.applied++;
          if (!mv) continue; // out-of-sync guard
          const isLast = room.moves.length === net.applied;
          doMove(mv);
          if (!isLast) fastForward(); // catching up a backlog: only the newest move animates
        }
      } catch (e) { /* transient storage hiccup — next poll retries */ }
    }

    apiRef.current = {
      undo, restart, createRoom, joinRoom, leaveOnline, goView,
      queasy: () => {
        shake = Math.max(shake, 0.07);
        gliss(300, 80, 0.5, 0.08);
        rumble(220, 0.08, 0.35);
      },
      munch: () => { clack(900, 0.12, 0.04); clack(700, 0.1, 0.04, 0.12); },
    };

    /* ---------- input: custom orbit + tap picking ---------- */
    const el = renderer.domElement;
    const pointers = new Map();
    let dragMoved = false, pinchDist = 0;

    function onDown(e) {
      gp.seats.forEach((s) => { s.active = false; });
      cursors.forEach((c) => { c.visible = false; });
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragMoved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    }
    function onMove(e) {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
        camTheta -= dx * 0.006;
        camPhi = Math.max(0.3, Math.min(1.36, camPhi - dy * 0.005));
        placeCamera();
      } else if (pointers.size === 2) {
        dragMoved = true;
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        camR = Math.max(8, Math.min(24, camR * (pinchDist / Math.max(d, 1))));
        pinchDist = d;
        placeCamera();
      }
    }
    function onUp(e) {
      pointers.delete(e.pointerId);
      if (pointers.size > 0) return;
      if (dragMoved) return;
      if (seqActive) { fastForward(); return; }
      handleTap(e);
    }
    function onWheel(e) {
      e.preventDefault();
      camR = Math.max(8, Math.min(24, camR * (1 + e.deltaY * 0.001)));
      placeCamera();
    }
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function activateSquare(sq, actor) {
      if (game.status !== "play") return;
      if (modeRef.current === "panda" && game.turn === "b") return;
      if (modeRef.current === "online" && net && game.turn !== net.seat) return;
      if (actor && game.turn !== actor) return;
      if (sq === null) { clearSelection(); return; }
      if (selSq !== null) {
        const mv = selMoves.find((m) => m.to === sq);
        if (mv) { doMove(mv); return; }
      }
      const p = game.board[sq];
      if (p && p.c === game.turn && sq !== selSq) {
        S.lift();
        showSelection(sq, legalMoves(game, game.turn).filter((m) => m.from === sq));
      } else clearSelection();
    }
    function handleTap(e) {
      if (game.status !== "play") return;
      if (modeRef.current === "panda" && game.turn === "b") return;
      const rect = el.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      let sq = null, pieceId = null;
      for (const h of hits) {
        let o = h.object;
        while (o) {
          if (o.userData && o.userData.sq !== undefined) { sq = o.userData.sq; break; }
          if (o.userData && o.userData.pieceId) { pieceId = o.userData.pieceId; break; }
          o = o.parent;
        }
        if (sq !== null || pieceId !== null) break;
      }
      if (pieceId) {
        for (let i = 0; i < 64; i++) {
          const p = game.board[i];
          if (p && p.id === pieceId) { sq = i; break; }
        }
      }
      activateSquare(sq);
    }
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    /* ---------- gamepad support (works in any Chromium/Edge, incl. Xbox Edge) ---------- */
    function placeCursor(pi) {
      const st = gp.seats[pi];
      const { x, z } = sqPos(st.cursor);
      cursors[pi].position.set(x, 0.135, z);
    }
    function moveCursor(pi, dc, dr) {
      const st = gp.seats[pi];
      const c = Math.min(7, Math.max(0, (st.cursor & 7) + dc));
      const r = Math.min(7, Math.max(0, (st.cursor >> 3) + dr));
      const ni = idx(r, c);
      if (ni !== st.cursor) { st.cursor = ni; clack(1600, 0.05, 0.02); }
      placeCursor(pi);
    }
    function padSeat(pi) {
      if (modeRef.current === "2p") return pi === 0 ? "w" : "b";
      if (modeRef.current === "online" && net) return net.seat;
      return "w";
    }
    function handlePad(pad, pi, dt, t) {
      const st = gp.seats[pi];
      const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const val = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
      const edge = (i) => btn(i) && !st.prev[i];
      let pressedAny = false;
      for (let i = 0; i < pad.buttons.length; i++)
        if (pad.buttons[i] && pad.buttons[i].pressed) { pressedAny = true; break; }
      const anyInput = pressedAny ||
        Math.abs(pad.axes[0] || 0) > 0.45 || Math.abs(pad.axes[1] || 0) > 0.45 ||
        Math.abs(pad.axes[2] || 0) > 0.25 || Math.abs(pad.axes[3] || 0) > 0.25;
      if (anyInput && !st.active) { st.active = true; cursors[pi].visible = true; placeCursor(pi); }

      let sx = 0, sy = 0;
      if (btn(14)) sx = -1; else if (btn(15)) sx = 1;
      if (btn(12)) sy = -1; else if (btn(13)) sy = 1;
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (!sx && Math.abs(ax) > 0.45) sx = ax > 0 ? 1 : -1;
      if (!sy && Math.abs(ay) > 0.45) sy = ay > 0 ? 1 : -1;
      if (sx || sy) {
        const key = sx + ":" + sy;
        if (st.lastDir !== key || t - st.lastMoveT > 0.17) {
          st.lastDir = key;
          st.lastMoveT = t;
          const q = ((Math.round(camTheta / (Math.PI / 2)) % 4) + 4) % 4;
          const UPQ = [[0, -1], [-1, 0], [0, 1], [1, 0]][q];
          const RTQ = [[1, 0], [0, -1], [-1, 0], [0, 1]][q];
          const ui = -sy;
          moveCursor(pi, sx * RTQ[0] + ui * UPQ[0], sx * RTQ[1] + ui * UPQ[1]);
        }
      } else st.lastDir = null;

      const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
      if (Math.abs(rx) > 0.2) camTheta -= rx * dt * 2.4;
      if (Math.abs(ry) > 0.2) camPhi = Math.max(0.3, Math.min(1.36, camPhi + ry * dt * 1.6));
      const zi = val(7) - val(6);
      if (Math.abs(zi) > 0.05) camR = Math.max(8, Math.min(24, camR - zi * dt * 7));

      if (edge(0)) { // A: confirm (or skip whatever is playing)
        if (battleSkipRef.current) battleSkipRef.current();
        else if (seqActive) fastForward();
        else if (creditsRef.current) setCredits(false);
        else activateSquare(st.cursor, padSeat(pi));
      }
      if (edge(1)) { // B: cancel / skip
        if (battleSkipRef.current) battleSkipRef.current();
        else if (seqActive) fastForward();
        else if (creditsRef.current) setCredits(false);
        else clearSelection();
      }
      if (edge(2)) undo();                                  // X
      if (edge(3)) { crazyRef.current = !crazyRef.current; setCrazy(crazyRef.current); } // Y
      if (edge(4)) cycleStyle(-1);                          // LB
      if (edge(5)) cycleStyle(1);                           // RB
      if (edge(8)) { soundRef.current = !soundRef.current; setSound(soundRef.current); } // View
      if (edge(9)) restart();                               // Menu
      if (edge(11)) goView(curView === "full" ? "close" : "full"); // R3: view toggle
      for (let i = 0; i < pad.buttons.length; i++)
        st.prev[i] = !!(pad.buttons[i] && pad.buttons[i].pressed);
    }
    function pollGamepads(dt, t) {
      if (gp.blocked) return;
      let padsRaw = [];
      try {
        padsRaw = navigator.getGamepads ? navigator.getGamepads() : [];
      } catch (e) {
        // permissions policy blocks the gamepad feature here (e.g. sandboxed preview) —
        // disable polling; controller support activates in environments that allow it
        gp.blocked = true;
        return;
      }
      const list = [];
      for (const p of padsRaw) if (p && p.connected) list.push(p);
      if (!list.length) return;
      list.slice(0, 2).forEach((pad, pi) => handlePad(pad, pi, dt, t));
    }
    const VIEWS = { close: { r: 11.8, phi: 1.0 }, full: { r: 17.5, phi: 0.8 } };
    let curView = "full";
    function goView(name) {
      const v = VIEWS[name] || VIEWS.full;
      curView = name;
      setViewMode(name);
      const r0 = camR, p0 = camPhi;
      tween(0.5, (k) => {
        camR = r0 + (v.r - r0) * k;
        camPhi = p0 + (v.phi - p0) * k;
      }, null, easeIO);
    }
    function cycleStyle(d) {
      const un = CAPTURE_STYLES.filter((s) => s.req <= maxBeatenRef.current);
      const i = Math.max(0, un.findIndex((s) => s.id === styleRef.current));
      const next = un[(i + d + un.length) % un.length];
      styleRef.current = next.id;
      setStyleId(next.id);
      persist();
      clack(1700, 0.08, 0.03);
    }
    /* ---------- sizing ---------- */
    function resize() {
      const w = mount.clientWidth;
      const h = Math.max(360, Math.min(mount.clientHeight, 640));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    /* ---------- render loop ---------- */
    let raf, lastT = nowSec();
    let perfAcc = 0, perfN = 0;
    function loop() {
      raf = requestAnimationFrame(loop);
      const t = nowSec();
      const raw = t - lastT;
      const dt = Math.min(0.05, raw);
      lastT = t;

      // adaptive resolution: if sustained frames run slow, render at a lower pixel ratio
      if (raw < 0.08) { perfAcc += raw; perfN++; }
      if (perfN >= 60) {
        const avg = perfAcc / perfN;
        perfAcc = 0; perfN = 0;
        if (avg > 0.026 && dprIdx < dprSteps.length - 1) {
          dprIdx++;
          renderer.setPixelRatio(dprSteps[dprIdx]);
          resize();
        }
      }

      pollGamepads(dt, t);
      const cs = 1 + Math.sin(t * 5) * 0.04;
      cursors.forEach((c) => { if (c.visible) c.scale.set(cs, 1, cs); });

      if (game.status !== "play") camTheta += dt * 0.1; // slow victory orbit
      placeCamera();
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake * 0.6;
        camera.position.z += (Math.random() - 0.5) * shake;
        shake = Math.max(0, shake - dt * 0.35);
      }

      stepAnims(t);
      stepBurst(dt);

      indicators.children.forEach((o, i2) => {
        if (o.userData.pulse) {
          const s = 1 + Math.sin(t * 5 + i2) * 0.1;
          o.scale.set(s, s, s);
        }
      });
      if (dangerPlane) dangerPlane.material.opacity = 0.2 + Math.sin(t * 6) * 0.12;
      if (selSq !== null && !seqActive) {
        const p = game.board[selSq];
        if (p) {
          const rec = meshes.get(p.id);
          if (rec) rec.grp.position.y = BOARD_Y + 0.08 + Math.sin(t * 3) * 0.015;
        }
      }
      renderer.render(scene, camera);
    }

    syncScene(game);
    updateChrome();
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (thinkTimer) clearTimeout(thinkTimer);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      mount.removeChild(el);
      renderer.dispose();
      apiRef.current = null;
    };
  }, []);

  return (
    <div className="wc-app">
      <style>{CSS}</style>
      <header className="wc-head">
        <h1 className="wc-title">Boop Chess <span className="wc-ed">walnut edition</span></h1>
        <button className="wc-icon" onClick={() => setSound((s) => !s)} aria-label="toggle sound">
          {sound ? "♪" : "∅"}
        </button>
      </header>

      {character && (
        <div className="wc-profile" onClick={openEdit} title="Edit your player">
          <span className="wc-profav">{character.avatar}</span>
          <span className="wc-profname">{character.name}{saveState === "none" && <em className="wc-nosave"> · progress won't save here</em>}</span>
          <span className="wc-profpts">{points.toLocaleString()} pts</span>
        </div>
      )}

      <div className={`wc-banner ${banner.tone}`}>{thinking ? "Panda is thinking…" : banner.text}</div>

      <div className="wc-traytags">
        <span>walnut captured · {trayCount.b}</span>
        <span>maple captured · {trayCount.w}</span>
      </div>

      <div className="wc-stagewrap">
        <div className="wc-stage" ref={mountRef} />
        {battle && (
          <div className={`wc-battle ${battle.shake ? "hit" : ""}`} onClick={() => battleSkipRef.current && battleSkipRef.current()}>
            <div className="wc-bcard foe">
              <div className="wc-bname">{NAME[battle.v.t]} <span className="wc-bteam">{battle.v.c === "b" ? "walnut" : "maple"}</span></div>
              <div className="wc-bhp"><div className="wc-bhpfill" style={{ width: battle.hp + "%" }} /></div>
            </div>
            <div className={`wc-bglyph foe ${battle.v.c === "b" ? "plumg" : "creamg"}`}>{GLYPH[battle.v.t]}</div>
            <div className={`wc-bglyph me ${battle.a.c === "b" ? "plumg" : "creamg"}`}>{GLYPH[battle.a.t]}</div>
            <div className="wc-bcard me">
              <div className="wc-bname">{NAME[battle.a.t]} <span className="wc-bteam">{battle.a.c === "b" ? "walnut" : "maple"}</span></div>
              <div className="wc-bhp"><div className="wc-bhpfill" style={{ width: "100%" }} /></div>
            </div>
            <div className="wc-blog">{battle.log}</div>
          </div>
        )}
        {credits && (
          <div className="wc-credits" onClick={() => setCredits(false)}>
            <div className="wc-credroll">
              <div className="wc-cred-title">BOOP CHESS</div>
              <div className="wc-cred-sub">walnut edition</div>
              {[
                ["Creative Director", "Jameson Moore"],
                ["Inspiration — App, Animations & Design", "Jameson Moore"],
                ["Supplies", "Audra Moore"],
                ["Associate Designers", "Luke Saunders & Hudson Saunders"],
                ["Starring", "The Maple Army"],
                ["Also Starring", "The Walnut Legion"],
                ["The Panda", "Himself"],
                ["Stunts", "The Knights (no wires)"],
                ["Aerial Unit", "The Flying Kings"],
                ["Pyrotechnics", "Royal Demolition Co."],
                ["Foley", "Genuine Hardwood"],
                ["Physics", "Sir Isaac Newton (uncredited)"],
                ["Chess Brain", "Stockfish — open source"],
                ["Casualties", "None. Every piece stood back up."],
                ["A Production Of", "Your Living Room"],
              ].map(([r, n]) => (
                <div className="wc-cred-row" key={r}>
                  <div className="wc-cred-role">{r}</div>
                  <div className="wc-cred-name">{n}</div>
                </div>
              ))}
            </div>
            <div className="wc-endcard">
              <div className="wc-endstar">⭐</div>
              <div className="wc-endtitle">YOU WIN</div>
              {unlockMsg && <div className="wc-endunlock">🔓 {unlockMsg}</div>}
              <div className="wc-endsub">tap to continue</div>
            </div>
          </div>
        )}
      </div>

      <div className="wc-hint">drag to orbit · pinch or scroll to zoom · tap a piece to play · tap during a capture to skip · 🎮 d-pad/stick moves, Ⓐ select, Ⓑ cancel, Ⓧ undo, right stick orbits</div>

      {crazy && (
        <div className="wc-hungerrow">
          <span className="wc-hlabel">hunger</span>
          <div className={`wc-hungerbar ${hunger <= 0 ? "empty" : ""}`}>
            <div className="wc-hungerfill" style={{ width: hunger + "%" }} />
          </div>
          {hunger <= 0 && <span className="wc-starve">😵 starving!</span>}
          <button className="wc-food" disabled={inv.chicken <= 0} onClick={() => eatFood("chicken")}>
            🍗<i>{inv.chicken}</i>
          </button>
          <button className="wc-food rotten" disabled={inv.flesh <= 0} onClick={() => eatFood("flesh")}>
            🥩<i>{inv.flesh}</i>
          </button>
        </div>
      )}

      <div className="wc-controls">
        {online ? (
          <>
            <button className="wc-btn primary" onClick={() => apiRef.current && apiRef.current.leaveOnline()}>
              Leave room {online.code}
            </button>
            <button className="wc-icon" onClick={() => setSound((s) => !s)} aria-label="toggle sound">
              {sound ? "♪" : "∅"}
            </button>
          </>
        ) : (
          <>
            <button className="wc-btn primary" onClick={() => apiRef.current && apiRef.current.restart()}>New game</button>
            <button className="wc-btn" disabled={!canUndo} onClick={() => apiRef.current && apiRef.current.undo()}>Undo</button>
            <button className="wc-btn" onClick={() => apiRef.current && apiRef.current.restart(mode === "panda" ? "2p" : "panda")}>
              {mode === "panda" ? "Two players" : "Play the Panda"}
            </button>
            <button className={`wc-btn ${crazy ? "crazyon" : ""}`} onClick={toggleCrazy}>
              {crazy ? "🤪 Crazy ON" : "🤪 Crazy"}
            </button>
            <button className="wc-btn" onClick={() => apiRef.current && apiRef.current.goView(viewMode === "full" ? "close" : "full")}>
              {viewMode === "full" ? "🔍 Close-up" : "🔭 Fit all"}
            </button>
            <button className="wc-btn" onClick={() => setShowOnline((v) => !v)}>🌐 Online</button>
          </>
        )}
      </div>

      {showOnline && !online && (
        <div className="wc-online">
          <button className="wc-btn primary" onClick={() => apiRef.current && apiRef.current.createRoom()}>Create room</button>
          <input
            className="wc-nameinput wc-code"
            maxLength={4}
            placeholder="CODE"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
          />
          <button className="wc-btn" onClick={() => apiRef.current && apiRef.current.joinRoom(roomInput)}>Join</button>
        </div>
      )}
      {onlineMsg && <div className="wc-onlinemsg">{onlineMsg}</div>}

      {mode === "panda" && (
        <div className="wc-level">
          <span>Panda level</span>
          <div className="wc-levelbtns">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button key={n} className={`wc-lvl ${level === n ? "on" : ""}`} onClick={() => setLevel(n)}>{n}</button>
            ))}
          </div>
        </div>
      )}
      <div className="wc-level">
        <span>Capture style</span>
        <div className="wc-levelbtns">
          {CAPTURE_STYLES.map((s) => {
            const locked = s.req > maxBeaten;
            return (
              <button
                key={s.id}
                className={`wc-style ${styleId === s.id ? "on" : ""} ${locked ? "locked" : ""}`}
                disabled={locked}
                title={locked ? `Beat panda level ${s.req} to unlock` : s.name}
                onClick={() => pickStyle(s.id)}
              >
                {locked ? `🔒${s.req}` : s.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="wc-engine">
        {engineStatus === "stockfish" ? `engine · stockfish · level ${level}`
          : engineStatus === "loading" ? "engine · warming up…"
          : "engine · panda brain (offline fallback)"}
      </div>

      <p className="wc-foot">
        Knights somersault to their squares. Captured bishops ascend — then are politely returned to the tray. Everyone else goes out with a bang. Pawns reaching the far rank are exchanged for a queen.
      </p>

      {showCreate && (
        <div className="wc-modal">
          <div className="wc-modalcard">
            <div className="wc-modaltitle">{character ? "Edit your player" : "Create your player"}</div>
            <div className="wc-avatars">
              {AVATARS.map((a) => (
                <button key={a} className={`wc-av ${draftAvatar === a ? "on" : ""}`} onClick={() => setDraftAvatar(a)}>
                  {a}
                </button>
              ))}
            </div>
            <input
              className="wc-nameinput"
              value={draftName}
              maxLength={14}
              placeholder="Your name"
              onChange={(e) => setDraftName(e.target.value)}
            />
            <button className="wc-btn primary wc-modalgo" onClick={confirmCharacter}>Let's play</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- chrome styles ---------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,600;0,700;1,600&family=Nunito:wght@600;700;800&display=swap');

.wc-app{
  /* content column width — media queries below scale this per device */
  --wc-col:520px;
  min-height:100vh; min-height:100dvh; width:100%; margin:0 auto; box-sizing:border-box;
  /* viewport-fit=cover means the notch/home-indicator can overlap; keep clear of it */
  padding:calc(16px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right))
          calc(36px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));
  background:
    radial-gradient(120% 90% at 50% 0%, #2b2016 0%, #1d1510 45%, #120c08 100%);
  font-family:'Nunito', system-ui, sans-serif;
  color:#E9DCC3; display:flex; flex-direction:column; align-items:center;
  -webkit-tap-highlight-color:transparent; user-select:none;
  -webkit-user-select:none; -webkit-touch-callout:none;
}
/* iOS ignores user-scalable=no — kill the double-tap zoom on controls instead */
.wc-btn, .wc-icon, .wc-lvl, .wc-style, .wc-av, .wc-food, .wc-profile{touch-action:manipulation;}
.wc-head{width:100%; max-width:var(--wc-col); display:flex; align-items:baseline; justify-content:space-between;}
.wc-title{
  font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:26px;
  margin:0; color:#EFE3C8; letter-spacing:.3px;
}
.wc-ed{
  font-family:'Fraunces', Georgia, serif; font-style:italic; font-weight:600;
  font-size:14px; color:#C9A24B; margin-left:6px; letter-spacing:.5px;
}
.wc-icon{
  font-size:16px; line-height:1; background:transparent; color:#C9A24B;
  border:1.5px solid #C9A24B; border-radius:10px; padding:6px 12px; cursor:pointer;
}
.wc-icon:active{background:rgba(201,162,75,.15);}

.wc-banner{
  width:100%; max-width:var(--wc-col); box-sizing:border-box; text-align:center;
  background:#241A12; border:1.5px solid #5A452C; border-radius:12px;
  padding:9px 12px; font-weight:700; font-size:14.5px; margin:12px 0 6px;
  letter-spacing:.2px;
}
.wc-banner.danger{border-color:#B0492F; color:#F0C0AE;}
.wc-banner.final{border-color:#C9A24B; color:#EFDDA8;}

.wc-traytags{width:100%; max-width:var(--wc-col); display:flex; justify-content:space-between;
  font-size:11.5px; font-weight:700; color:#9A8668; padding:0 4px 8px; letter-spacing:.4px;}

.wc-stage{
  width:100%; max-width:var(--wc-col);
  height:min(70vh, 640px);
  /* dvh so the board doesn't jump when Safari's toolbars slide away */
  height:min(var(--wc-stage-h, 70dvh), var(--wc-stage-max, 640px));
  border:2px solid #5A452C; border-radius:18px; overflow:hidden;
  box-shadow:0 18px 40px rgba(0,0,0,.55), inset 0 0 0 1px rgba(201,162,75,.15);
  background:#171310;
}
.wc-stage canvas{display:block; width:100% !important; height:100% !important;}

.wc-hint{font-size:11px; font-weight:600; color:#8A7458; margin-top:9px; text-align:center; letter-spacing:.3px;}

.wc-controls{display:flex; gap:8px; margin-top:12px; width:100%; max-width:var(--wc-col);}
.wc-btn{
  flex:1; font-family:inherit; font-weight:800; font-size:13.5px; color:#E9DCC3;
  background:#2A1F15; border:1.5px solid #5A452C; border-radius:12px; padding:11px 6px;
  cursor:pointer; letter-spacing:.3px;
}
.wc-btn.primary{background:#C9A24B; border-color:#C9A24B; color:#231A10;}
.wc-btn:active{transform:translateY(1px); filter:brightness(1.08);}
.wc-btn:disabled{opacity:.4; cursor:default;}

.wc-foot{width:100%; max-width:var(--wc-col); text-align:center; font-size:12px; font-weight:600;
  color:#9A8668; margin-top:12px; line-height:1.6;}

.wc-level{width:100%; max-width:var(--wc-col); display:flex; align-items:center; justify-content:space-between;
  flex-wrap:wrap; gap:6px; margin-top:12px; font-size:12px; font-weight:700; color:#9A8668; letter-spacing:.4px;}
.wc-levelbtns{display:flex; gap:5px; flex-wrap:wrap;}
.wc-lvl{width:32px; height:32px; border-radius:9px; border:1.5px solid #5A452C; background:#241A12;
  color:#B9A47F; font-family:inherit; font-weight:800; font-size:13px; cursor:pointer; padding:0;}
.wc-lvl.on{background:#C9A24B; border-color:#C9A24B; color:#231A10;}
.wc-lvl:active{transform:translateY(1px);}
.wc-engine{width:100%; max-width:var(--wc-col); text-align:center; font-size:10.5px; font-weight:700;
  color:#6E5C42; margin-top:8px; letter-spacing:.6px; text-transform:uppercase;}

.wc-stagewrap{position:relative; width:100%; max-width:var(--wc-col);}
.wc-stagewrap .wc-stage{max-width:none;}
.wc-credits{position:absolute; inset:0; border-radius:18px; overflow:hidden; z-index:5; cursor:pointer;
  background:linear-gradient(rgba(16,10,6,.45), rgba(16,10,6,.88));}
.wc-credroll{position:absolute; left:0; right:0; top:100%; text-align:center; padding:0 24px;
  animation:wcRoll 22s linear forwards;}
@keyframes wcRoll{from{top:100%}to{top:-150%}}
.wc-cred-title{font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:30px; color:#EFE3C8; margin-bottom:2px;}
.wc-cred-sub{font-family:'Fraunces', Georgia, serif; font-style:italic; color:#C9A24B; font-size:15px; margin-bottom:26px;}
.wc-cred-row{margin:13px 0;}
.wc-cred-role{font-size:10.5px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase; color:#8A7458;}
.wc-cred-name{font-size:15px; font-weight:700; color:#E9DCC3; margin-top:2px;}
.wc-endcard{position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  opacity:0; animation:wcEnd .8s ease-out 21s forwards; pointer-events:none;}
@keyframes wcEnd{to{opacity:1}}
.wc-endstar{font-size:34px;}
.wc-endtitle{font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:34px; color:#EFDDA8;
  letter-spacing:2px; margin:6px 0 2px;}
.wc-endsub{font-size:11px; font-weight:700; letter-spacing:1px; color:#9A8668; text-transform:uppercase;}
.wc-endunlock{margin:8px 0 4px; font-size:13px; font-weight:800; color:#C9A24B; letter-spacing:.5px;}
.wc-style{height:32px; padding:0 10px; border-radius:9px; border:1.5px solid #5A452C; background:#241A12;
  color:#B9A47F; font-family:inherit; font-weight:800; font-size:11.5px; cursor:pointer; letter-spacing:.3px;}
.wc-style.on{background:#C9A24B; border-color:#C9A24B; color:#231A10;}
.wc-style.locked{opacity:.45; cursor:default;}
.wc-style:active:not(:disabled){transform:translateY(1px);}

.wc-profile{width:100%; max-width:var(--wc-col); box-sizing:border-box; display:flex; align-items:center; gap:8px;
  margin-top:10px; background:#241A12; border:1.5px solid #5A452C; border-radius:12px; padding:7px 12px; cursor:pointer;}
.wc-profav{font-size:20px; line-height:1;}
.wc-profname{font-weight:800; font-size:14px; color:#E9DCC3; flex:1; text-align:left;}
.wc-profpts{font-weight:800; font-size:13px; color:#C9A24B; letter-spacing:.4px;}
.wc-nosave{font-style:normal; font-weight:700; font-size:10.5px; color:#B0785A;}

.wc-modal{position:fixed; inset:0; z-index:30; display:flex; align-items:center; justify-content:center;
  background:rgba(10,6,3,.72); padding:20px;}
.wc-modalcard{width:100%; max-width:340px; background:#241A12; border:1.5px solid #C9A24B; border-radius:16px;
  padding:20px; text-align:center; box-shadow:0 22px 50px rgba(0,0,0,.6);}
.wc-modaltitle{font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:22px; color:#EFE3C8; margin-bottom:14px;}
.wc-avatars{display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:14px;}
.wc-av{width:44px; height:44px; font-size:24px; border-radius:12px; border:1.5px solid #5A452C; background:#1A120B;
  cursor:pointer; padding:0;}
.wc-av.on{border-color:#C9A24B; background:#3A2A16; box-shadow:0 0 0 2px rgba(201,162,75,.35);}
.wc-nameinput{width:100%; box-sizing:border-box; background:#1A120B; border:1.5px solid #5A452C; border-radius:10px;
  color:#E9DCC3; font-family:inherit; font-weight:700; font-size:15px; padding:10px 12px; margin-bottom:14px;
  outline:none; text-align:center;}
.wc-nameinput:focus{border-color:#C9A24B;}
.wc-modalgo{width:100%;}

.wc-controls{flex-wrap:wrap;}
.wc-btn.crazyon{background:#7C3AED; border-color:#9F6BFF; color:#F3E9FF;}

.wc-battle{position:absolute; inset:0; z-index:6; border-radius:18px; overflow:hidden; cursor:pointer;
  background:linear-gradient(rgba(16,10,6,.6), rgba(16,10,6,.85));}
.wc-battle.hit{animation:bShake .28s linear;}
@keyframes bShake{0%,100%{transform:translate(0,0)}25%{transform:translate(-5px,3px)}50%{transform:translate(5px,-3px)}75%{transform:translate(-3px,-2px)}}
.wc-bcard{position:absolute; background:#2A1F15; border:1.5px solid #C9A24B; border-radius:10px; padding:8px 12px; min-width:46%;}
.wc-bcard.foe{top:10%; left:6%;}
.wc-bcard.me{bottom:22%; right:6%;}
.wc-bname{font-weight:800; font-size:14px; color:#E9DCC3;}
.wc-bteam{font-size:10px; font-weight:800; letter-spacing:.8px; text-transform:uppercase; color:#8A7458; margin-left:6px;}
.wc-bhp{height:9px; background:#171008; border:1px solid #5A452C; border-radius:6px; margin-top:6px; overflow:hidden;}
.wc-bhpfill{height:100%; background:linear-gradient(90deg,#58C99A,#8FE0B8); transition:width .35s ease;}
.wc-bglyph{position:absolute; font-size:74px; line-height:1; filter:drop-shadow(0 4px 6px rgba(0,0,0,.5));}
.wc-bglyph.foe{top:24%; right:14%;}
.wc-bglyph.me{bottom:30%; left:14%;}
.wc-bglyph.creamg{color:#FFFDF7; text-shadow:0 0 2px #4A3A6B;}
.wc-bglyph.plumg{color:#3A2414; text-shadow:0 0 2px #E9DCC3;}
.wc-blog{position:absolute; left:4%; right:4%; bottom:4%; background:#241A12; border:1.5px solid #C9A24B;
  border-radius:10px; padding:10px 14px; font-weight:800; font-size:14px; color:#EFE3C8; min-height:22px;}

.wc-hungerrow{width:100%; max-width:var(--wc-col); display:flex; align-items:center; gap:8px; margin-top:10px;
  font-size:11px; font-weight:800; color:#9A8668;}
.wc-hlabel{letter-spacing:.8px; text-transform:uppercase;}
.wc-hungerbar{flex:1; height:12px; background:#171008; border:1.5px solid #5A452C; border-radius:8px; overflow:hidden;}
.wc-hungerbar.empty{border-color:#B0492F;}
.wc-hungerfill{height:100%; background:linear-gradient(90deg,#D97E3A,#F0B45C); transition:width .3s ease;}
.wc-starve{color:#F0A090; font-weight:800;}
.wc-food{position:relative; font-size:18px; line-height:1; background:#241A12; border:1.5px solid #5A452C;
  border-radius:10px; padding:6px 9px; cursor:pointer;}
.wc-food i{font-style:normal; font-size:10px; font-weight:800; color:#C9A24B; margin-left:3px;}
.wc-food.rotten{filter:hue-rotate(70deg) saturate(1.4);}
.wc-food:disabled{opacity:.35; cursor:default;}

.wc-online{width:100%; max-width:var(--wc-col); display:flex; gap:8px; margin-top:10px; align-items:stretch;}
.wc-online .wc-btn{flex:1;}
.wc-code{flex:0 0 92px; margin-bottom:0; letter-spacing:4px; text-transform:uppercase; font-size:16px;}
.wc-onlinemsg{width:100%; max-width:var(--wc-col); text-align:center; font-size:12px; font-weight:800;
  color:#C9A24B; margin-top:8px; letter-spacing:.4px;}

/* ---- tablets, portrait (iPad mini 744, 10.2" 810, Air/Pro11 834, Pro12.9 1024) ----
   The phone layout stranded a 520px column in the middle of the screen. Widen the
   column and let the board take the space it earns. */
@media (min-width:700px){
  /* 62dvh, not 70 — at 70 the board pushes the controls off a 10.2" screen */
  .wc-app{--wc-col:700px; --wc-stage-h:62dvh; --wc-stage-max:760px;
          padding-top:calc(24px + env(safe-area-inset-top));}
  .wc-title{font-size:34px;}
  .wc-ed{font-size:17px;}
  .wc-banner{font-size:17px; padding:12px 16px;}
  .wc-btn{font-size:16px; padding:14px 10px; border-radius:14px;}
  .wc-icon{font-size:19px; padding:9px 15px;}
  .wc-hint{font-size:13px;}
  .wc-foot{font-size:14px;}
  .wc-level{font-size:14px;}
  .wc-lvl{width:40px; height:40px; font-size:16px; border-radius:11px;}
  .wc-style{height:40px; font-size:13.5px; padding:0 14px;}
  .wc-profname{font-size:17px;} .wc-profpts{font-size:16px;} .wc-profav{font-size:24px;}
  .wc-traytags{font-size:13px;}
  .wc-hungerrow{font-size:13px;}
  .wc-hungerbar{height:15px;}
  .wc-food{font-size:22px; padding:8px 12px;}
  .wc-engine{font-size:12px;}
  .wc-modalcard{max-width:420px; padding:26px;}
  .wc-modaltitle{font-size:27px;}
  .wc-av{width:54px; height:54px; font-size:29px;}
  .wc-nameinput{font-size:17px; padding:12px 14px;}
  .wc-bname{font-size:17px;} .wc-blog{font-size:17px;} .wc-bglyph{font-size:96px;}
}

/* ---- tablets, landscape ----
   A tall stack wastes the whole right half of the screen and pushes the controls
   below the fold. Board on the left, everything else in a sidebar. */
@media (min-width:1000px) and (orientation:landscape){
  .wc-app{
    display:grid;
    grid-template-columns:minmax(0,1fr) minmax(300px,400px);
    column-gap:24px;
    align-content:start; justify-items:center;
    max-width:1600px;
    --wc-col:100%;
    --wc-stage-h:calc(100dvh - 190px);
    --wc-stage-max:900px;
  }
  /* default every child to the sidebar, then pull the board back out to column 1 */
  .wc-app > *{grid-column:2; width:100%;}
  .wc-head{grid-column:1 / -1; max-width:none;}
  .wc-stagewrap{grid-column:1; grid-row:2 / span 30; align-self:start;}
  .wc-modal{grid-column:1 / -1;}          /* position:fixed, placement is cosmetic */
  .wc-head + *{margin-top:10px;}
  .wc-hint{order:99; font-size:12px; line-height:1.5; text-align:left;}
  .wc-controls{flex-wrap:wrap;}
  .wc-foot{margin-top:14px;}
}
`;
