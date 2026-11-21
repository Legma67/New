// Grundlegende Konstanten und Hilfsfunktionen für das Raster.
export const N = 22;            // Rastergröße (N x N Felder)
export const TILE = 2;          // Weltgröße eines Feldes
export const HALF = (N - 1) / 2;
export const SPAWN = { x: 0, z: 11 };
export const GOAL = { x: 21, z: 10 };

export function tileToWorld(x, z) {
  return { x: (x - HALF) * TILE, z: (z - HALF) * TILE };
}
export function worldToTile(wx, wz) {
  return { x: Math.round(wx / TILE + HALF), z: Math.round(wz / TILE + HALF) };
}
export const inPlot = (x, z) => x >= 0 && z >= 0 && x < N && z < N;

export const RARITY = {
  Common:    { color: '#b9c4cc', order: 0, label: 'Common' },
  Uncommon:  { color: '#5fd35f', order: 1, label: 'Uncommon' },
  Rare:      { color: '#3fa9ff', order: 2, label: 'Rare' },
  Epic:      { color: '#b65cff', order: 3, label: 'Epic' },
  Legendary: { color: '#ffb400', order: 4, label: 'Legendary' },
  Mythic:    { color: '#ff3d6e', order: 5, label: 'Mythic' },
  Secret:    { color: '#00ffd5', order: 6, label: 'Secret' },
};

export const MAX_LEVEL = 5; // Stufe 0 (gebaut) bis 5 => 5 Upgrades
export const SELL_RATE = 0.7;

export const MODES = {
  normal:   { id: 'normal',   name: 'Normal',    desc: 'Klassisch: Überstehe 50 Wellen und besiege den Ultimativen Titan.', hp: 1, spd: 1, lives: 20, reward: 1, winWave: 50, minLevel: 1 },
  endless:  { id: 'endless',  name: 'Endlos',    desc: 'Unbegrenzte Wellen mit ständig steigender Schwierigkeit.', hp: 1, spd: 1, lives: 20, reward: 1, winWave: 0, minLevel: 3 },
  boss:     { id: 'boss',     name: 'Bossmodus', desc: 'Nur Bosse! Besiege 10 Bosse in Folge.', hp: 1, spd: 1, lives: 30, reward: 1.3, winWave: 10, bossOnly: true, minLevel: 8 },
  hard:     { id: 'hard',     name: 'Schwer',    desc: 'Gegner haben +60% Leben und sind schneller. Nur 10 Leben. +50% Belohnung.', hp: 1.6, spd: 1.15, lives: 10, reward: 1.5, winWave: 50, minLevel: 6 },
  creative: { id: 'creative', name: 'Kreativ',   desc: 'Unendlich Münzen, kein Game Over. Baue und experimentiere frei (keine Belohnungen).', hp: 1, spd: 1, lives: 999, reward: 0, winWave: 0, creative: true, minLevel: 1 },
};

export const fmt = (n) => {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('de-DE');
};
