// Gemeinsamer Spielzustand (wird von allen Systemen gelesen/geschrieben)
export const S = {
  scene: null, camera: null, renderer: null, controls: null,
  profile: null,
  run: null,            // aktuelle Runde
  grid: null,
  plotKey: 'grass',
  biome: null,
  towers: [], enemies: [], projectiles: [], mines: [], decos: [], roads: new Map(),
  path: null,           // aktuelle Feld-Route
  pathPoints: [],       // Welt-Punkte der Route
  time: 0, speed: 1, paused: false,
  demo: false,          // Hauptmenü-Hintergrund
  state: 'menu',        // 'menu' | 'play'
  selected: null,       // ausgewählter Turm
  worldGroup: null, plotGroup: null,
  shake: 0,
};
