// Biome, Straßen und Dekorationen.
export const BIOMES = [
  { id: 'grass',  name: 'Grünes Grasland', unlock: 1,  gems: 0,
    ground: '#6cc24a', ground2: '#5aae3c', side: '#7a5230', sky: '#8fd3ff', sky2: '#e6f6ff', fog: '#cfeeff',
    water: '#3fa7e0', mountain: '#7c9a6b', snowcap: true, trees: ['oak', 'pine', 'oak', 'bush'], rocks: '#9aa0a6',
    ambient: 'leaves', enemyBias: [], sun: 1.0 },
  { id: 'desert', name: 'Wüstenlandschaft', unlock: 4, gems: 150,
    ground: '#e7c77a', ground2: '#d9b462', side: '#a87a3c', sky: '#ffd59a', sky2: '#fff3dc', fog: '#ffe9c2',
    water: '#33b5c9', mountain: '#c9955a', snowcap: false, trees: ['cactus', 'palm', 'cactus', 'deadbush'], rocks: '#c4a070',
    ambient: 'dust', enemyBias: ['fireling', 'skeleton', 'runner'], sun: 1.15 },
  { id: 'snow',   name: 'Schneegebiet', unlock: 7, gems: 220,
    ground: '#eef6fb', ground2: '#dbe9f2', side: '#8ca3b3', sky: '#b9d7ee', sky2: '#f2f8ff', fog: '#e4eef7',
    water: '#7cc4ea', mountain: '#d7e4ee', snowcap: true, trees: ['snowpine', 'snowpine', 'pine', 'rock'], rocks: '#aab8c2',
    ambient: 'snow', enemyBias: ['frostling', 'frostgolem'], sun: 0.95 },
  { id: 'volcano',name: 'Vulkanlandschaft', unlock: 10, gems: 300,
    ground: '#4a3b36', ground2: '#3a2d29', side: '#24180f', sky: '#ff8a5c', sky2: '#3b1d1d', fog: '#5a2d22',
    water: '#ff5a00', lava: true, mountain: '#2d2220', snowcap: false, trees: ['deadtree', 'lavarock', 'deadtree', 'rock'], rocks: '#3b302c',
    ambient: 'embers', enemyBias: ['fireling', 'lava', 'babydragon'], sun: 0.85 },
  { id: 'jungle', name: 'Dschungel', unlock: 13, gems: 360,
    ground: '#3f9a3a', ground2: '#2f8530', side: '#5c3d1e', sky: '#9be8c4', sky2: '#e6fff2', fog: '#bfe8cf',
    water: '#2bb6a3', mountain: '#3d7a3a', snowcap: false, trees: ['jungle', 'palm', 'jungle', 'bush'], rocks: '#7b8a6a',
    ambient: 'leaves', enemyBias: ['toxic', 'spider', 'jumper'], sun: 0.95 },
  { id: 'darkforest', name: 'Dunkler Wald', unlock: 17, gems: 420,
    ground: '#2f4a33', ground2: '#263d2a', side: '#2a1d12', sky: '#3b4a6b', sky2: '#11162a', fog: '#26304a',
    water: '#2c4f7a', mountain: '#1f2a33', snowcap: false, trees: ['darkpine', 'deadtree', 'darkpine', 'mushroom'], rocks: '#4a4f57',
    ambient: 'fireflies', enemyBias: ['zombie', 'ghost', 'phantom', 'curse'], sun: 0.6 },
  { id: 'ice',    name: 'Eiswelt', unlock: 21, gems: 480,
    ground: '#bfe6ff', ground2: '#a6d8f5', side: '#5b8fb3', sky: '#7fb8ff', sky2: '#e8f4ff', fog: '#cde7ff',
    water: '#9ee7ff', mountain: '#e0f2ff', snowcap: true, trees: ['icecrystal', 'snowpine', 'icecrystal', 'rock'], rocks: '#9cc6e0',
    ambient: 'snow', enemyBias: ['frostling', 'frostgolem', 'crystalm'], sun: 1.0 },
  { id: 'magic',  name: 'Magische Landschaft', unlock: 25, gems: 550,
    ground: '#b48cf0', ground2: '#9f76e3', side: '#4b2a7a', sky: '#ff9ee8', sky2: '#a9c4ff', fog: '#e3c6ff',
    water: '#ff7ad9', mountain: '#7a5cc4', snowcap: false, trees: ['crystaltree', 'mushroom', 'crystaltree', 'bush'], rocks: '#c7a6ff',
    ambient: 'sparkles', enemyBias: ['mage', 'crystalm', 'magicdragon'], sun: 0.9 },
];
export const BIOME_BY_ID = Object.fromEntries(BIOMES.map((b) => [b.id, b]));

// Straßenstile. width relativ zur Feldgröße (2). Kurven/Kreuzungen entstehen automatisch.
export const ROADS = [
  { id: 'r_stone',  name: 'Steinweg',      cost: 10, color: '#a7a9ac', edge: '#6e7276', width: 1.5, pattern: 'cobble', desc: 'Klassischer Pflasterweg.' },
  { id: 'r_road',   name: 'Breite Straße', cost: 15, color: '#4b5058', edge: '#2d3036', width: 1.95, pattern: 'lines', desc: 'Breite Asphaltstraße mit Mittellinie.' },
  { id: 'r_narrow', name: 'Schmale Straße',cost: 8,  color: '#8f8a80', edge: '#5f5a52', width: 1.05, pattern: 'plain', desc: 'Schmaler Pfad.' },
  { id: 'r_sand',   name: 'Sandweg',       cost: 6,  color: '#e2c48a', edge: '#b8955a', width: 1.5, pattern: 'plain', desc: 'Weicher Sandweg.' },
  { id: 'r_grass',  name: 'Grasweg',       cost: 5,  color: '#86c35a', edge: '#5d8f3a', width: 1.4, pattern: 'dots', desc: 'Ein ausgetretener Grasweg.' },
  { id: 'r_brick',  name: 'Ziegelweg',     cost: 12, color: '#c2593d', edge: '#7a3220', width: 1.6, pattern: 'cobble', desc: 'Roter Ziegelweg.' },
  // Shop-Skins
  { id: 'r_marble', name: 'Marmorweg',     cost: 20, color: '#f3f1ec', edge: '#c9c3b6', width: 1.7, pattern: 'cobble', shop: true, desc: 'Edler weißer Marmor.' },
  { id: 'r_gold',   name: 'Goldstraße',    cost: 30, color: '#f6c445', edge: '#a87508', width: 1.7, pattern: 'lines', shop: true, glow: 0.15, desc: 'Pures Gold für echte Könige.' },
  { id: 'r_neon',   name: 'Neonstraße',    cost: 25, color: '#1f1b3a', edge: '#ff2bd6', width: 1.8, pattern: 'neon', shop: true, glow: 0.6, desc: 'Leuchtende Cyberstraße.' },
  { id: 'r_lava',   name: 'Lavastein',     cost: 25, color: '#3a2a26', edge: '#ff5a00', width: 1.7, pattern: 'neon', shop: true, glow: 0.5, desc: 'Glühender Lavastein.' },
  { id: 'r_rainbow',name: 'Regenbogenweg', cost: 35, color: '#ff77aa', edge: '#7c3aed', width: 1.7, pattern: 'rainbow', shop: true, glow: 0.2, desc: 'Ein magischer Regenbogen.' },
];
export const ROAD_BY_ID = Object.fromEntries(ROADS.map((r) => [r.id, r]));

// Dekoration & Gebäude
export const DECOS = [
  { id: 'd_tree',     cat: 'deco',  name: 'Baum',        cost: 20,  kind: 'tree' },
  { id: 'd_bush',     cat: 'deco',  name: 'Busch',       cost: 10,  kind: 'bush' },
  { id: 'd_flowers',  cat: 'deco',  name: 'Blumen',      cost: 8,   kind: 'flowers' },
  { id: 'd_lantern',  cat: 'deco',  name: 'Laterne',     cost: 25,  kind: 'lantern' },
  { id: 'd_fence',    cat: 'deco',  name: 'Zaun',        cost: 10,  kind: 'fence' },
  { id: 'd_rock',     cat: 'deco',  name: 'Felsen',      cost: 12,  kind: 'rock' },
  { id: 'd_fountain', cat: 'build', name: 'Brunnen',     cost: 120, kind: 'fountain' },
  { id: 'd_house',    cat: 'build', name: 'Kleines Haus',cost: 150, kind: 'house' },
  { id: 'd_statue',   cat: 'build', name: 'Statue',      cost: 200, kind: 'statue' },
  { id: 'd_well',     cat: 'build', name: 'Windmühle',   cost: 250, kind: 'windmill' },
  { id: 'd_tent',     cat: 'build', name: 'Zelt',        cost: 60,  kind: 'tent' },
  // Shop-Dekorationen
  { id: 'd_goldstatue', cat: 'build', name: 'Goldene Statue', cost: 300, kind: 'goldstatue', shop: true },
  { id: 'd_dragonstatue', cat: 'build', name: 'Drachenstatue', cost: 400, kind: 'dragonstatue', shop: true },
  { id: 'd_crystaltree', cat: 'deco', name: 'Kristallbaum', cost: 80, kind: 'crystaltree', shop: true },
  { id: 'd_mushroom', cat: 'deco', name: 'Riesenpilz', cost: 60, kind: 'mushroom', shop: true },
  { id: 'd_banner',   cat: 'deco', name: 'Banner', cost: 50, kind: 'banner', shop: true },
];
export const DECO_BY_ID = Object.fromEntries(DECOS.map((d) => [d.id, d]));

export const BASE_SKINS = [
  { id: 'base_crystal', name: 'Kristallkern', desc: 'Der Standard-Kern.' },
  { id: 'base_castle', name: 'Burg', desc: 'Eine kleine Festung.', shop: true },
  { id: 'base_temple', name: 'Goldtempel', desc: 'Ein goldener Tempel.', shop: true },
];

export const KILL_FX = [
  { id: 'fx_default', name: 'Standard', colors: null },
  { id: 'fx_confetti', name: 'Konfetti', colors: ['#ff3d6e', '#ffd23f', '#3fa9ff', '#5fd35f', '#b65cff'], shop: true },
  { id: 'fx_stars', name: 'Sterne', colors: ['#fff7a8', '#ffd23f', '#ffffff'], shop: true },
  { id: 'fx_hearts', name: 'Herzen', colors: ['#ff4d8d', '#ff8fb8', '#ffffff'], shop: true },
  { id: 'fx_void', name: 'Leere', colors: ['#7c3aed', '#1e1b4b', '#c084fc'], shop: true },
];
