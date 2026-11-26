'use strict';
// ============================================================
//  BUILD YOUR OWN TOWER DEFENSE – Spieldaten
// ============================================================

const RARITIES = {
  common:    { name: 'Common',    color: '#9aa4b1', glow: '#c9d1db', order: 0 },
  uncommon:  { name: 'Uncommon',  color: '#4cc96b', glow: '#8ff0a8', order: 1 },
  rare:      { name: 'Rare',      color: '#3d8bff', glow: '#8cbcff', order: 2 },
  epic:      { name: 'Epic',      color: '#a64dff', glow: '#d3a3ff', order: 3 },
  legendary: { name: 'Legendary', color: '#ffb320', glow: '#ffe08a', order: 4 },
  mythic:    { name: 'Mythic',    color: '#ff3d6e', glow: '#ff9ab4', order: 5 },
  secret:    { name: 'Secret',    color: '#16f2d6', glow: '#9dfff1', order: 6 },
};

// Damage types: phys, fire, ice, poison, magic, energy, explosive
// Tower types: bullet, splash, beam, slow, flame, sniper, poison, chain, mine, push, multi,
//              drone, heal, buff, shock, aura, gold, meteor, blackhole
const TOWERS = [
  { id:'crossbow', name:'Armbrust', rarity:'common', cost:100, level:1, type:'bullet', dmg:24, range:3.8, rate:1.35, speed:20, dt:'phys', air:true,
    body:'wood', head:'crossbow', c1:'#a8743f', c2:'#5a3a1c', c3:'#c9ced6', desc:'Dein erster Turm: schießt schwere Bolzen auf ein Ziel. Trifft auch Flieger.', lv5:'Doppelbolzen: trifft 2 Gegner' },
  { id:'cannon', name:'Kanonenturm', rarity:'common', cost:150, level:1, type:'splash', dmg:40, range:3.2, rate:0.8, speed:9, splash:0.9, dt:'explosive',
    body:'stone', head:'cannon', c1:'#8d8f99', c2:'#3b3f4a', c3:'#ffcc33', desc:'Feuert schwere Kanonenkugeln mit kleinem Flächenschaden.', lv5:'Riesenkugeln: +50% Explosionsradius' },
  { id:'archer', name:'Bogenschützenturm', rarity:'common', cost:100, level:1, type:'bullet', dmg:14, range:3.5, rate:2.2, speed:18, dt:'phys', air:true,
    body:'wood', head:'bow', c1:'#b07a45', c2:'#6b4423', c3:'#46c46b', desc:'Günstig und schnell. Trifft auch fliegende Gegner.', lv5:'Dreifachpfeil: trifft 3 Gegner' },
  { id:'laser', name:'Laserturm', rarity:'rare', cost:500, level:4, type:'beam', dmg:48, range:4.5, rate:1, dt:'energy', air:true, detect:true,
    body:'metal', head:'dish', c1:'#dfe6f0', c2:'#5a6b80', c3:'#ff2d55', desc:'Kontinuierlicher Laserstrahl (Schaden pro Sekunde). Erkennt Unsichtbare.', lv5:'Strahl springt auf ein zweites Ziel' },
  { id:'ice', name:'Eisturm', rarity:'uncommon', cost:350, level:2, type:'slow', dmg:18, range:3.2, rate:1.2, speed:12, dt:'ice', slow:0.45, slowDur:2, air:true,
    body:'ice', head:'crystal', c1:'#bfefff', c2:'#5bb8e8', c3:'#e8fbff', desc:'Eisgeschosse verlangsamen Gegner deutlich.', lv5:'Schockfrost: friert kurz komplett ein' },
  { id:'fire', name:'Feuerturm', rarity:'uncommon', cost:400, level:3, type:'flame', dmg:12, range:2.5, rate:3, dt:'fire', burn:10, burnDur:3, splash:1.0,
    body:'stone', head:'brazier', c1:'#a0522d', c2:'#4a2a1a', c3:'#ff7b00', desc:'Flammen verursachen Flächenschaden und setzen Gegner in Brand.', lv5:'Inferno: Brand-Schaden verdoppelt' },
  { id:'rocket', name:'Raketenturm', rarity:'rare', cost:800, level:6, type:'splash', dmg:160, range:5.5, rate:0.4, speed:7, splash:1.5, dt:'explosive', homing:true, air:true,
    body:'metal', head:'launcher', c1:'#7d8b5a', c2:'#3c4430', c3:'#ff4b2b', desc:'Zielsuchende Raketen mit großer Explosion.', lv5:'Salve: 2 Raketen pro Schuss' },
  { id:'magic', name:'Magieturm', rarity:'epic', cost:1000, level:8, type:'bullet', dmg:120, range:4.2, rate:1.0, speed:10, dt:'magic', homing:true, air:true, detect:true, pierce:true,
    body:'arcane', head:'orb', c1:'#6a4bc4', c2:'#2e1f63', c3:'#e07bff', desc:'Magische Kugeln ignorieren Rüstung und erkennen Unsichtbare.', lv5:'Arkane Explosion beim Treffer' },
  { id:'sniper', name:'Scharfschützenturm', rarity:'uncommon', cost:450, level:5, type:'sniper', dmg:180, range:8, rate:0.35, dt:'phys', air:true, detect:true, pierce:true,
    body:'wood', head:'rifle', c1:'#5d6b4a', c2:'#2f3526', c3:'#d8d8d8', desc:'Riesige Reichweite, durchschlägt Rüstung.', lv5:'Kopfschuss: 15% Chance auf 4x Schaden' },
  { id:'poison', name:'Giftkanone', rarity:'uncommon', cost:300, level:3, type:'poison', dmg:8, range:3.2, rate:1.0, speed:9, dt:'poison', dot:14, dotDur:4, splash:0.8,
    body:'stone', head:'cannon', c1:'#5f7d3a', c2:'#2c3d1b', c3:'#9dff3d', desc:'Giftwolken vergiften alle Gegner im Bereich.', lv5:'Seuche: Gift breitet sich aus' },
  { id:'tesla', name:'Blitzwerfer', rarity:'rare', cost:650, level:7, type:'chain', dmg:45, range:3.3, rate:0.9, dt:'energy', chains:4, air:true,
    body:'metal', head:'coil', c1:'#4a5a78', c2:'#222b3d', c3:'#7fd8ff', desc:'Blitze springen auf mehrere Gegner über.', lv5:'+3 Sprünge' },
  { id:'mortar', name:'Minenwerfer', rarity:'uncommon', cost:380, level:4, type:'mine', dmg:110, range:3.0, rate:0.5, dt:'explosive', splash:1.0, ground:true,
    body:'stone', head:'mortar', c1:'#6e6a5c', c2:'#34322b', c3:'#ff3b3b', desc:'Legt Minen auf die Straße. Nur Bodengegner.', lv5:'Cluster-Minen' },
  { id:'gatling', name:'Maschinengewehrturm', rarity:'rare', cost:700, level:6, type:'bullet', dmg:9, range:3.4, rate:9, speed:24, dt:'phys', air:true,
    body:'metal', head:'gatling', c1:'#5c636e', c2:'#2a2e35', c3:'#ffd24a', desc:'Extrem hohe Feuerrate.', lv5:'Brandmunition' },
  { id:'water', name:'Wasserwerfer', rarity:'uncommon', cost:320, level:5, type:'push', dmg:6, range:2.8, rate:3, dt:'phys', push:0.25, slow:0.2, slowDur:0.6,
    body:'stone', head:'nozzle', c1:'#3a8fd6', c2:'#1d4a73', c3:'#a8e6ff', desc:'Drückt Gegner auf der Straße zurück.', lv5:'Flutwelle: stärkerer Rückstoß' },
  { id:'plasma', name:'Plasmawerfer', rarity:'epic', cost:1400, level:11, type:'splash', dmg:200, range:4.0, rate:0.9, speed:13, splash:1.1, dt:'energy', air:true,
    body:'metal', head:'plasma', c1:'#2c2f4a', c2:'#14152a', c3:'#00ffd5', desc:'Plasmakugeln mit hohem Flächenschaden.', lv5:'Überladung: Plasma brennt nach' },
  { id:'crystal', name:'Kristallturm', rarity:'rare', cost:900, level:9, type:'multi', dmg:50, range:3.8, rate:1.2, speed:14, dt:'magic', targets:3, air:true, detect:true,
    body:'arcane', head:'crystal_big', c1:'#c88cff', c2:'#5a2d91', c3:'#ffffff', desc:'Greift drei Gegner gleichzeitig an.', lv5:'5 Ziele' },
  { id:'shadow', name:'Schattenkanone', rarity:'epic', cost:1300, level:12, type:'bullet', dmg:260, range:4.0, rate:0.6, speed:11, dt:'magic', curse:0.25, curseDur:3, detect:true, air:true,
    body:'dark', head:'cannon', c1:'#2a2238', c2:'#120e1a', c3:'#9b4dff', desc:'Verflucht Ziele: sie erleiden 25% mehr Schaden.', lv5:'Fluch +25%' },
  { id:'light', name:'Lichtturm', rarity:'rare', cost:750, level:8, type:'beam', dmg:30, range:4.0, rate:1, dt:'magic', air:true, detect:true, reveal:true,
    body:'arcane', head:'prism', c1:'#fff4c2', c2:'#c9a227', c3:'#fffbe0', desc:'Lichtstrahl; macht unsichtbare Gegner in Reichweite für alle Türme sichtbar.', lv5:'Blendung: Ziel wird verlangsamt' },
  { id:'drone', name:'Drohnenturm', rarity:'epic', cost:1500, level:13, type:'drone', dmg:22, range:5.5, rate:3, dt:'energy', drones:2, air:true,
    body:'metal', head:'pad', c1:'#d0d6de', c2:'#3b4552', c3:'#38c6ff', desc:'Kampfdrohnen jagen Gegner im großen Umkreis.', lv5:'+2 Drohnen' },
  { id:'bomb', name:'Bombenturm', rarity:'rare', cost:850, level:10, type:'splash', dmg:220, range:3.6, rate:0.35, speed:6, splash:1.8, dt:'explosive', ground:true, lob:true,
    body:'stone', head:'mortar_big', c1:'#4a4a4a', c2:'#1f1f1f', c3:'#ff9a1f', desc:'Riesige Bomben mit enormem Radius. Nur Bodengegner.', lv5:'Nachbeben: zweite Explosion' },
  { id:'multi', name:'Mehrfachkanonenturm', rarity:'epic', cost:1600, level:14, type:'multi', dmg:55, range:3.6, rate:1.0, speed:12, splash:0.5, dt:'explosive', targets:4,
    body:'stone', head:'multibarrel', c1:'#9a7b4f', c2:'#4a3b26', c3:'#ffd27a', desc:'Vier Kanonen feuern gleichzeitig auf verschiedene Ziele.', lv5:'6 Ziele' },
  { id:'heal', name:'Heilungsturm', rarity:'rare', cost:1000, level:10, type:'heal', dmg:0, range:0, rate:0, dt:'magic', healEvery:22,
    body:'arcane', head:'cross', c1:'#f4f7ff', c2:'#7cc8a0', c3:'#ff5c7a', desc:'Stellt während Wellen regelmäßig 1 Leben der Burg wieder her.', lv5:'+2 Leben pro Heilung' },
  { id:'buff', name:'Verstärkungsturm', rarity:'epic', cost:1200, level:12, type:'buff', dmg:0, range:2.2, rate:0, dt:'magic', buffDmg:0.25, buffRate:0.10,
    body:'wood', head:'banner', c1:'#c23b3b', c2:'#5a1a1a', c3:'#ffd700', desc:'Türme in Reichweite erhalten mehr Schaden und Feuerrate.', lv5:'+Reichweite für verstärkte Türme' },
  { id:'shock', name:'Schockturm', rarity:'rare', cost:800, level:9, type:'shock', dmg:30, range:2.2, rate:0.5, dt:'energy', stun:0.6,
    body:'metal', head:'ring', c1:'#2e3f63', c2:'#141d30', c3:'#5cc8ff', desc:'Schockwellen betäuben alle Gegner im Umkreis.', lv5:'Betäubung +0.6s' },
  { id:'snake', name:'Schlangenturm', rarity:'epic', cost:1350, level:15, type:'chain', dmg:30, range:3.5, rate:0.8, dt:'poison', chains:3, dot:30, dotDur:4,
    body:'stone', head:'snake', c1:'#3f8f3f', c2:'#1d401d', c3:'#d6ff3d', desc:'Giftspucke springt zwischen Gegnern und vergiftet sie.', lv5:'Gift +100%' },
  { id:'icelaser', name:'Eislaser', rarity:'epic', cost:1700, level:16, type:'beam', dmg:70, range:4.3, rate:1, dt:'ice', slow:0.5, slowDur:0.6, air:true, detect:true,
    body:'ice', head:'dish', c1:'#e0f8ff', c2:'#4aa3d8', c3:'#7ff0ff', desc:'Eisstrahl verlangsamt und verursacht hohen Dauerschaden.', lv5:'Gefrierpunkt: friert ein' },
  { id:'meteor', name:'Meteoritenturm', rarity:'legendary', cost:2500, level:18, type:'meteor', dmg:500, range:7, rate:0.25, dt:'fire', splash:2.0, burn:30, burnDur:3,
    body:'dark', head:'obelisk', c1:'#5a2a1a', c2:'#2a120a', c3:'#ff5a00', desc:'Ruft Meteore vom Himmel herab.', lv5:'Meteorschauer: 3 Meteore' },
  { id:'blackhole', name:'Schwarzes-Loch-Turm', rarity:'mythic', cost:4000, level:99, shop:{ crystals:60 }, type:'blackhole', dmg:90, range:4.5, rate:0.15, dt:'magic', pull:1.2, holeDur:3,
    body:'dark', head:'void', c1:'#1a1030', c2:'#05030a', c3:'#b44dff', desc:'Erzeugt ein schwarzes Loch, das Gegner zurückzieht und zermalmt.', lv5:'Ereignishorizont: doppelte Dauer' },
  { id:'time', name:'Zeitverlangsamungsturm', rarity:'legendary', cost:2200, level:20, type:'aura', dmg:0, range:3.5, rate:0, dt:'magic', slow:0.35,
    body:'arcane', head:'clock', c1:'#d9c38a', c2:'#6b5a2a', c3:'#7affd4', desc:'Alle Gegner in Reichweite laufen dauerhaft langsamer.', lv5:'Zeitstopp-Puls alle 8s' },
  { id:'gold', name:'Goldturm', rarity:'rare', cost:600, level:7, type:'gold', dmg:0, range:2.5, rate:0, dt:'phys', income:40, killBonus:2,
    body:'wood', head:'coin', c1:'#ffd700', c2:'#a67c00', c3:'#fff2a8', desc:'Bringt am Wellenende Münzen und Bonus für Kills in Reichweite.', lv5:'Goldrausch: doppeltes Einkommen' },
  { id:'dragon', name:'Legendärer Drachenwerfer', rarity:'secret', cost:5000, level:99, shop:{ crystals:120 }, type:'flame', dmg:90, range:3.8, rate:3, dt:'fire', burn:60, burnDur:4, splash:1.6, air:true,
    body:'dark', head:'dragon', c1:'#b8231a', c2:'#3b0a07', c3:'#ffb000', desc:'Ein gezähmter Drache speit verheerendes Feuer. Geheimer Turm.', lv5:'Drachenzorn: Flammen ignorieren Feuer-Immunität' },
];
const TOWER_BY_ID = Object.fromEntries(TOWERS.map(t => [t.id, t]));
const MAX_TOWER_LEVEL = 5;
// ---------- Fusion: 3 gleiche Türme (+N) -> 1 Turm (+N+1), bis +9 ----------
const MAX_PLUS = 9;
const plusDmg = n => Math.pow(3, n);            // ein +1 ist so stark wie die drei Türme, aus denen er entstand
const plusRate = n => 1 + 0.04 * n;
const plusRange = n => 0.25 * n;
const plusVisual = n => [1, 2, 2, 3, 3, 4, 4, 5, 5, 5][n] || 5;   // Aussehen (Ringe, Stacheln, Krone ab +7)
const PLUS_COLORS = ['#ffffff', '#7dff8a', '#5ad0ff', '#4f8bff', '#b47aff', '#ff6ad5', '#ff8a3a', '#ffd700', '#ff3b5a', '#16f2d6'];
const LEVEL_DMG = [1, 1.55, 2.3, 3.4, 5.0];
const LEVEL_RANGE = [0, 0.3, 0.6, 0.9, 1.3];
const LEVEL_RATE = [1, 1.1, 1.22, 1.36, 1.55];
const UPGRADE_COST = [0.75, 1.1, 1.6, 2.4];

// ------------------------------------------------------------
// Gegner (43 Typen inkl. Bosse)
// shape: blob, humanoid, beast, beetle, ghost, bat, robot, golem, crystal, dragon, knight, skeleton
// ------------------------------------------------------------
const ENEMIES = [
  { id:'grunt', name:'Grünling', kind:'Normaler Gegner', hp:60, speed:1.25, reward:8, size:0.55, color:'#5fcf4f', shape:'humanoid', min:1, w:10 },
  { id:'runner', name:'Flitzer', kind:'Schneller Gegner', hp:40, speed:2.3, reward:9, size:0.45, color:'#ffd23d', shape:'beast', min:2, w:7 },
  { id:'slug', name:'Schnecko', kind:'Langsamer Gegner', hp:170, speed:0.6, reward:12, size:0.6, color:'#b5835a', shape:'blob', min:2, w:5 },
  { id:'brute', name:'Brocken', kind:'Starker Gegner', hp:230, speed:1.0, reward:16, size:0.7, color:'#d9483b', shape:'humanoid', min:3, w:6 },
  { id:'skeleton', name:'Klapperknochen', kind:'Skelett', hp:110, speed:1.5, reward:10, size:0.55, color:'#efe9d6', shape:'skeleton', min:4, w:6 },
  { id:'zombie', name:'Schlurfi', kind:'Zombie', hp:220, speed:0.8, reward:13, size:0.6, color:'#7aa36a', shape:'humanoid', min:5, w:6, regen:0.02 },
  { id:'armored', name:'Panzerkäfer', kind:'Gepanzerter Gegner', hp:200, speed:0.9, reward:18, size:0.6, color:'#5a6a7a', shape:'beetle', min:5, w:5, armor:0.5 },
  { id:'slime', name:'Glibber', kind:'Schleimmonster', hp:160, speed:1.0, reward:12, size:0.55, color:'#47e0a0', shape:'blob', min:6, w:5, split:2, splitInto:'minislime' },
  { id:'minislime', name:'Mini-Glibber', kind:'Abspaltung', hp:50, speed:1.4, reward:3, size:0.32, color:'#7af0c0', shape:'blob', min:999, w:0 },
  { id:'fireimp', name:'Glutling', kind:'Feuergegner', hp:140, speed:1.3, reward:14, size:0.5, color:'#ff6a1a', shape:'humanoid', min:6, w:5, immune:['fire'], glow:'#ff8800' },
  { id:'flyer', name:'Flatterling', kind:'Fliegender Gegner', hp:90, speed:1.6, reward:12, size:0.45, color:'#8a5cc9', shape:'bat', min:6, w:5, fly:true },
  { id:'frosty', name:'Frostling', kind:'Eisgegner', hp:150, speed:1.2, reward:14, size:0.5, color:'#9fe6ff', shape:'humanoid', min:7, w:5, immune:['ice','slow'], glow:'#bff4ff' },
  { id:'toxic', name:'Giftmolch', kind:'Giftgegner', hp:160, speed:1.2, reward:14, size:0.5, color:'#9bff3d', shape:'beast', min:7, w:5, immune:['poison'] },
  { id:'giant', name:'Riesling', kind:'Riesiger Gegner', hp:650, speed:0.7, reward:35, size:1.0, color:'#c27a4a', shape:'humanoid', min:8, w:3 },
  { id:'jumper', name:'Hüpfer', kind:'Springender Gegner', hp:130, speed:1.1, reward:14, size:0.5, color:'#ff8ad8', shape:'blob', min:8, w:4, jump:true },
  { id:'invis', name:'Schleicher', kind:'Unsichtbarer Gegner', hp:120, speed:1.4, reward:16, size:0.5, color:'#aab0c0', shape:'ghost', min:9, w:4, invis:true },
  { id:'shield', name:'Schildträger', kind:'Schildgegner', hp:160, speed:1.0, reward:18, size:0.6, color:'#4a7bd6', shape:'knight', min:9, w:4, shield:160 },
  { id:'healer', name:'Sanitroll', kind:'Heilender Gegner', hp:180, speed:1.0, reward:20, size:0.6, color:'#ff9fb0', shape:'humanoid', min:10, w:3, healer:true },
  { id:'mage', name:'Zauberling', kind:'Magischer Gegner', hp:170, speed:1.1, reward:18, size:0.55, color:'#7b4dff', shape:'humanoid', min:11, w:4, resist:{ magic:0.5 }, glow:'#b38cff' },
  { id:'robot', name:'Robo-X1', kind:'Roboter', hp:260, speed:1.0, reward:20, size:0.6, color:'#b8c4d0', shape:'robot', min:12, w:4, armor:0.3 },
  { id:'splitter', name:'Splitterling', kind:'Splittergegner', hp:220, speed:1.1, reward:16, size:0.6, color:'#e0a040', shape:'crystal', min:12, w:3, split:3, splitInto:'shard' },
  { id:'shard', name:'Splitter', kind:'Abspaltung', hp:60, speed:1.6, reward:3, size:0.3, color:'#f0c060', shape:'crystal', min:999, w:0 },
  { id:'ghost', name:'Spuk', kind:'Geistergegner', hp:200, speed:1.2, reward:20, size:0.55, color:'#e8f0ff', shape:'ghost', min:13, w:3, fly:true, resist:{ phys:0.7, explosive:0.5 } },
  { id:'camo', name:'Tarnfrosch', kind:'Tarngegner', hp:240, speed:1.3, reward:20, size:0.5, color:'#3f9f5f', shape:'beast', min:14, w:3, invis:true, flicker:true },
  { id:'golem', name:'Steingolem', kind:'Steingolem', hp:750, speed:0.6, reward:40, size:0.9, color:'#8a8478', shape:'golem', min:14, w:2, armor:0.6 },
  { id:'crystalm', name:'Kristallo', kind:'Kristallmonster', hp:380, speed:0.9, reward:28, size:0.7, color:'#c08cff', shape:'crystal', min:15, w:3, armor:0.3, resist:{ energy:0.5 } },
  { id:'miniboss', name:'Krawallo', kind:'Mini-Boss', hp:1900, speed:0.75, reward:150, size:1.2, color:'#c0392b', shape:'golem', min:15, w:1, armor:0.3, mini:true },
  { id:'lava', name:'Magmamonster', kind:'Lava-Monster', hp:520, speed:0.8, reward:32, size:0.8, color:'#ff4d00', shape:'golem', min:16, w:2, immune:['fire'], glow:'#ff6a00' },
  { id:'bolt', name:'Blitzling', kind:'Blitzgegner', hp:160, speed:3.2, reward:20, size:0.45, color:'#fff03d', shape:'beast', min:16, w:3, resist:{ energy:0.8 }, glow:'#fff7a0' },
  { id:'shadoww', name:'Schattenwesen', kind:'Schattenwesen', hp:420, speed:1.2, reward:30, size:0.6, color:'#3a2a5a', shape:'ghost', min:17, w:3, invis:true, resist:{ phys:0.5 } },
  { id:'babydragon', name:'Drachenbaby', kind:'Drachenbaby', hp:450, speed:1.3, reward:34, size:0.6, color:'#ff5a3a', shape:'dragon', min:18, w:2, fly:true, immune:['fire'] },
  { id:'curse', name:'Fluchgeist', kind:'Fluchgegner', hp:380, speed:1.1, reward:30, size:0.55, color:'#6a1a8a', shape:'ghost', min:19, w:2, curser:true, glow:'#c04dff' },
  { id:'elite', name:'Elitekrieger', kind:'Elitegegner', hp:650, speed:1.1, reward:45, size:0.7, color:'#d4af37', shape:'knight', min:20, w:2, armor:0.4, shield:220 },
  { id:'frostgolem', name:'Frostgolem', kind:'Frostgolem', hp:1100, speed:0.65, reward:55, size:1.0, color:'#a8e0ff', shape:'golem', min:22, w:2, armor:0.5, immune:['ice','slow'], glow:'#d8f6ff' },
  { id:'super', name:'Supermutant', kind:'Supergegner', hp:1300, speed:1.15, reward:60, size:0.85, color:'#4fc94f', shape:'humanoid', min:24, w:2, regen:0.03 },
  { id:'kingslime', name:'Königsschleim', kind:'Königsschleim', hp:1900, speed:0.7, reward:80, size:1.1, color:'#3ad0ff', shape:'blob', min:25, w:1, split:4, splitInto:'slime', crown:true },
  { id:'megabot', name:'Riesenroboter', kind:'Riesenroboter', hp:2400, speed:0.7, reward:100, size:1.2, color:'#8e9aa8', shape:'robot', min:26, w:1, armor:0.5 },
  { id:'darkknight', name:'Dunkler Ritter', kind:'Dunkler Ritter', hp:1700, speed:1.0, reward:90, size:0.85, color:'#2a2a3a', shape:'knight', min:28, w:1, armor:0.6, shield:500, glow:'#ff2040' },
  { id:'magicdragon', name:'Magischer Drache', kind:'Magischer Drache', hp:2800, speed:1.1, reward:120, size:1.0, color:'#8a4dff', shape:'dragon', min:30, w:1, fly:true, resist:{ magic:0.6 }, glow:'#d0a0ff' },
  { id:'colossus', name:'Urzeitkoloss', kind:'Legendärer Boss', hp:9000, speed:0.55, reward:400, size:1.6, color:'#6b4f3a', shape:'golem', min:35, w:0.4, armor:0.5, mini:true },
  // ----- Bosse -----
  { id:'boss_tut', name:'Kleiner Steinriese', kind:'Tutorial-Boss', hp:260, speed:0.4, reward:120, size:1.4, color:'#9a9282', shape:'golem', boss:true, min:999, glow:'#ffcc33' },
  { id:'boss_stone', name:'Steinriese', kind:'Bossgegner', hp:6000, speed:0.5, reward:600, size:1.9, color:'#8d8576', shape:'golem', boss:true, armor:0.4, abilities:['stomp','summon'], summon:'skeleton', min:999 },
  { id:'boss_fire', name:'Feuerdrache', kind:'Bossgegner', hp:16000, speed:0.7, reward:1200, size:1.8, color:'#e8361c', shape:'dragon', boss:true, fly:true, immune:['fire'], abilities:['rage','summon'], summon:'fireimp', min:999, glow:'#ff8800' },
  { id:'boss_ice', name:'Eiskönig', kind:'Bossgegner', hp:30000, speed:0.55, reward:2000, size:1.9, color:'#bfefff', shape:'knight', boss:true, immune:['ice','slow'], armor:0.4, abilities:['freeze','shieldregen'], shield:5000, crown:true, min:999, glow:'#e0fbff' },
  { id:'boss_shadow', name:'Schattenmonster', kind:'Bossgegner', hp:52000, speed:0.65, reward:3200, size:2.0, color:'#2a1a40', shape:'ghost', boss:true, resist:{ phys:0.4 }, abilities:['vanish','summon'], summon:'shadoww', min:999, glow:'#a040ff' },
  { id:'boss_titan', name:'Ultimativer Titan', kind:'Legendärer Boss', hp:95000, speed:0.45, reward:6000, size:2.4, color:'#d4af37', shape:'golem', boss:true, armor:0.55, abilities:['stomp','summon','shieldregen','rage'], summon:'elite', shield:15000, crown:true, min:999, glow:'#ffe066' },
];
const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map(e => [e.id, e]));
const BOSS_ORDER = ['boss_stone', 'boss_fire', 'boss_ice', 'boss_shadow', 'boss_titan'];

// ------------------------------------------------------------
// Straßen & Deko (Bauelemente)
// ------------------------------------------------------------
const ROADS = [
  { id:'road_stone', name:'Steinweg', cost:5, color:'#9b9a94', edge:'#6f6e69', width:0.92, pattern:'cobble' },
  { id:'road_sand', name:'Sandweg', cost:3, color:'#e2c98d', edge:'#b89a5a', width:0.92, pattern:'sand' },
  { id:'road_grass', name:'Grasweg', cost:2, color:'#7fbf4f', edge:'#5a9a35', width:0.92, pattern:'grass' },
  { id:'road_asphalt', name:'Straße', cost:8, color:'#4a4d55', edge:'#e8e8e8', width:0.96, pattern:'asphalt' },
  { id:'road_narrow', name:'Schmale Straße', cost:4, color:'#a88a6a', edge:'#7a5f45', width:0.62, pattern:'cobble' },
  { id:'road_wide', name:'Breite Straße', cost:10, color:'#55585f', edge:'#ffd84a', width:1.0, pattern:'asphalt' },
];
const ROAD_BY_ID = Object.fromEntries(ROADS.map(r => [r.id, r]));

const DECOS = [
  { id:'tree', name:'Baum', cost:10, icon:'🌳' },
  { id:'bush', name:'Busch', cost:5, icon:'🌿' },
  { id:'flowers', name:'Blumen', cost:3, icon:'🌷' },
  { id:'lantern', name:'Laterne', cost:12, icon:'🏮' },
  { id:'fence', name:'Zaun', cost:4, icon:'🚧' },
  { id:'fountain', name:'Brunnen', cost:40, icon:'⛲' },
  { id:'house', name:'Kleines Haus', cost:60, icon:'🏠' },
  { id:'statue', name:'Statue', cost:50, icon:'🗿' },
  { id:'rock', name:'Felsen', cost:6, icon:'🪨' },
  // Shop-Spezialgebäude
  { id:'goldstatue', name:'Goldstatue', cost:100, icon:'🏆', shop:true },
  { id:'windmill', name:'Windmühle', cost:120, icon:'🌬️', shop:true },
  { id:'lighthouse', name:'Leuchtturm', cost:150, icon:'🗼', shop:true },
  { id:'crystalfountain', name:'Kristallbrunnen', cost:150, icon:'💎', shop:true },
  { id:'dragonstatue', name:'Drachenstatue', cost:200, icon:'🐉', shop:true },
];
const DECO_BY_ID = Object.fromEntries(DECOS.map(d => [d.id, d]));

// ------------------------------------------------------------
// Biome
// ------------------------------------------------------------
const BIOMES = [
  { id:'grass', name:'Grünes Grasland', level:1, gems:0, ground:'#6cc24a', ground2:'#5aae3c', plot:'#78cf55', sky:'#8fd3ff', fog:'#bfe6ff', water:'#3fa9f5', tree:'oak', leaf:'#3f9f3a', mountain:'#7a9a6a', snowcap:true, bias:{}, amb:'birds' },
  { id:'desert', name:'Wüstenlandschaft', level:5, gems:60, ground:'#e6c27a', ground2:'#d4ad62', plot:'#ecd08f', sky:'#ffd9a0', fog:'#ffe9c4', water:'#2ec4c4', tree:'palm', leaf:'#5aa03a', mountain:'#c9955a', bias:{ runner:2, fireimp:2, toxic:2 }, amb:'wind' },
  { id:'snow', name:'Schneegebiet', level:9, gems:90, ground:'#eef6ff', ground2:'#dbe9f7', plot:'#f6fbff', sky:'#c9e4ff', fog:'#e9f4ff', water:'#7ab8e8', tree:'snowpine', leaf:'#2f6f4f', mountain:'#ffffff', bias:{ frosty:3, frostgolem:2 }, amb:'wind' },
  { id:'volcano', name:'Vulkanlandschaft', level:13, gems:130, ground:'#4a3a35', ground2:'#3a2c28', plot:'#5c4a42', sky:'#ff8a5c', fog:'#9a4a3a', water:'#ff5a00', lava:true, tree:'dead', leaf:'#2a2a2a', mountain:'#3a2a25', bias:{ fireimp:3, lava:3, babydragon:2 }, amb:'rumble' },
  { id:'jungle', name:'Dschungel', level:16, gems:160, ground:'#3f8f3a', ground2:'#2f7a2c', plot:'#4fa045', sky:'#9ae6b4', fog:'#7fcf9a', water:'#2fa88f', tree:'jungle', leaf:'#1f7a2a', mountain:'#2f6a3a', bias:{ toxic:3, camo:3, slime:2 }, amb:'birds' },
  { id:'darkforest', name:'Dunkler Wald', level:20, gems:200, ground:'#2f3f2f', ground2:'#253325', plot:'#3a4a38', sky:'#4a5a7a', fog:'#2a3345', water:'#3a5a7a', tree:'dark', leaf:'#1a2f22', mountain:'#202a30', bias:{ ghost:3, shadoww:3, curse:2, skeleton:2 }, amb:'night' },
  { id:'iceworld', name:'Eiswelt', level:24, gems:240, ground:'#bfe6ff', ground2:'#a8d8f5', plot:'#d0efff', sky:'#9fd8ff', fog:'#d8f2ff', water:'#c0f0ff', tree:'icecrystal', leaf:'#8fe0ff', mountain:'#e0f6ff', bias:{ frosty:3, frostgolem:3, crystalm:2 }, amb:'wind' },
  { id:'magic', name:'Magische Landschaft', level:28, gems:300, ground:'#a07ad8', ground2:'#8a62c8', plot:'#b48ce6', sky:'#ffb3f0', fog:'#e0b8ff', water:'#ff7ae0', tree:'mushroom', leaf:'#ff5ab4', mountain:'#7a4ab8', bias:{ mage:3, crystalm:3, magicdragon:2 }, amb:'magic' },
];
const BIOME_BY_ID = Object.fromEntries(BIOMES.map(b => [b.id, b]));

// ------------------------------------------------------------
// Shop-Kosmetik
// ------------------------------------------------------------
const ROAD_SKINS = [
  { id:'skin_default', name:'Klassisch', rarity:'common', gems:0, tint:null, desc:'Die normalen Wegfarben.' },
  { id:'skin_brick', name:'Rote Ziegel', rarity:'uncommon', gems:40, tint:'#b5523b', desc:'Gemütliche Backsteinwege.' },
  { id:'skin_marble', name:'Marmor', rarity:'rare', gems:80, tint:'#f2efe8', desc:'Edler weißer Marmor.' },
  { id:'skin_gold', name:'Goldweg', rarity:'epic', gems:150, tint:'#f2c230', desc:'Straßen aus purem Gold.' },
  { id:'skin_neon', name:'Neon', rarity:'legendary', gems:220, tint:'#25f4ff', emissive:true, desc:'Leuchtende Neonbahnen.' },
  { id:'skin_lava', name:'Lavapflaster', rarity:'epic', gems:180, tint:'#ff5a1a', emissive:true, desc:'Glühende Lavasteine.' },
  { id:'skin_rainbow', name:'Regenbogen', rarity:'mythic', crystals:40, tint:'rainbow', desc:'Jedes Feld in einer anderen Farbe.' },
];
const EFFECTS = [
  { id:'fx_default', name:'Standard-Effekte', rarity:'common', gems:0, tint:null, desc:'Normale Partikelfarben.' },
  { id:'fx_gold', name:'Goldglanz', rarity:'rare', gems:90, tint:'#ffd700', desc:'Goldene Treffer- und Münzeffekte.' },
  { id:'fx_shadow', name:'Schattenflammen', rarity:'epic', gems:160, tint:'#9b4dff', desc:'Violette Schattenpartikel.' },
  { id:'fx_sakura', name:'Kirschblüte', rarity:'epic', gems:160, tint:'#ff9fd0', desc:'Rosa Blütenexplosionen.' },
  { id:'fx_rainbow', name:'Regenbogen-Effekte', rarity:'legendary', crystals:30, tint:'rainbow', desc:'Alle Effekte in Regenbogenfarben.' },
];
const CASTLES = [
  { id:'castle_default', name:'Steinburg', rarity:'common', gems:0, wall:'#c9c3b5', roof:'#3d7bd9', desc:'Deine treue Burg.' },
  { id:'castle_ice', name:'Eispalast', rarity:'rare', gems:100, wall:'#d8f4ff', roof:'#5bc8ff', desc:'Eine Burg aus ewigem Eis.' },
  { id:'castle_gold', name:'Goldpalast', rarity:'legendary', gems:260, wall:'#f2d06b', roof:'#c0392b', desc:'Prunkvoller Palast.' },
  { id:'castle_dark', name:'Dunkler Turm', rarity:'epic', gems:180, wall:'#3a3448', roof:'#9b4dff', desc:'Finster und furchteinflößend.' },
];
const BOOSTS = [
  { id:'boost_coins', name:'Startkapital +100', rarity:'uncommon', gems:50, max:10, desc:'Jede Runde mit 100 Münzen mehr starten (stapelbar bis 10x).' },
  { id:'boost_lives', name:'Burgmauer +2 Leben', rarity:'rare', gems:80, max:5, desc:'Jede Runde mit 2 Leben mehr starten (stapelbar bis 5x).' },
  { id:'boost_xp', name:'Erfahrungsbonus +10%', rarity:'rare', gems:100, max:5, desc:'10% mehr Erfahrung (stapelbar bis 5x).' },
];

// ------------------------------------------------------------
// Spielmodi
// ------------------------------------------------------------
const MODES = [
  { id:'endless', name:'Endlos', icon:'♾️', desc:'Unendlich viele Wellen – jede 5. Welle kommt ein Boss.', win:0, hp:0.5, speed:1, lives:20, bossEvery:5 },
];
const MODE_BY_ID = Object.fromEntries(MODES.map(m => [m.id, m]));

// ------------------------------------------------------------
// Aufgaben & Erfolge
// ------------------------------------------------------------
const QUESTS = [
  { id:'q_kill100', name:'Monsterjäger', desc:'Besiege 100 Gegner.', stat:'kills', goal:100, reward:{ gems:15, xp:100 } },
  { id:'q_wave10', name:'Durchhalten', desc:'Überstehe insgesamt 10 Wellen.', stat:'wavesTotal', goal:10, reward:{ gems:15, xp:120 } },
  { id:'q_tower5', name:'Baumeister', desc:'Platziere 5 Türme.', stat:'towersBuilt', goal:5, reward:{ gems:10, xp:60 } },
  { id:'q_up5', name:'Erste Fusion', desc:'Fuse einen Turm auf +1.', stat:'maxPlus', goal:1, reward:{ gems:25, xp:150 } },
  { id:'q_boss1', name:'Bossbezwinger', desc:'Besiege einen Boss.', stat:'bossKills', goal:1, reward:{ gems:30, crystals:3, xp:200 } },
  { id:'q_coins10k', name:'Schatzmeister', desc:'Verdiene 10.000 Münzen.', stat:'coinsEarned', goal:10000, reward:{ gems:25, xp:150 } },
  { id:'q_games3', name:'Stammspieler', desc:'Spiele drei Runden.', stat:'gamesPlayed', goal:3, reward:{ gems:10, xp:80 } },
  { id:'q_road30', name:'Straßenbauer', desc:'Baue 15 Straßenfelder.', stat:'roadsBuilt', goal:15, reward:{ gems:10, xp:60 } },
  { id:'q_kill1000', name:'Legendärer Jäger', desc:'Besiege 1.000 Gegner.', stat:'kills', goal:1000, reward:{ gems:50, crystals:5, xp:500 } },
  { id:'q_wave50', name:'Unerschütterlich', desc:'Überstehe insgesamt 50 Wellen.', stat:'wavesTotal', goal:50, reward:{ gems:40, crystals:4, xp:400 } },
  { id:'q_deco10', name:'Gartenkünstler', desc:'Platziere 10 Dekorationen.', stat:'decoBuilt', goal:10, reward:{ gems:10, xp:60 } },
  { id:'q_upg30', name:'Fusionsprofi', desc:'Fuse einen Turm auf +3.', stat:'maxPlus', goal:3, reward:{ gems:25, xp:200 } },
  { id:'q_boss5', name:'Bossjäger', desc:'Besiege 5 Bosse.', stat:'bossKills', goal:5, reward:{ gems:60, crystals:8, xp:600 } },
  { id:'q_skip5', name:'Ungeduldig', desc:'Überspringe 5 Wellen-Pausen.', stat:'skips', goal:5, reward:{ gems:10, xp:80 } },
];
const DAILY_POOL = [
  { id:'d_kill', name:'Tägliche Jagd', desc:'Besiege {g} Gegner.', stat:'kills', goal:150, reward:{ gems:12, xp:100 } },
  { id:'d_wave', name:'Tägliche Wellen', desc:'Überstehe {g} Wellen.', stat:'wavesTotal', goal:8, reward:{ gems:12, xp:100 } },
  { id:'d_build', name:'Täglicher Bau', desc:'Platziere {g} Türme.', stat:'towersBuilt', goal:4, reward:{ gems:8, xp:60 } },
  { id:'d_upg', name:'Tägliche Fusion', desc:'Führe {g} Fusion durch.', stat:'fusions', goal:1, reward:{ gems:8, xp:60 } },
  { id:'d_coins', name:'Tägliches Gold', desc:'Verdiene {g} Münzen.', stat:'coinsEarned', goal:4000, reward:{ gems:12, xp:100 } },
  { id:'d_boss', name:'Täglicher Boss', desc:'Besiege {g} Boss.', stat:'bossKills', goal:1, reward:{ gems:20, crystals:2, xp:150 } },
  { id:'d_road', name:'Tägliche Straßen', desc:'Baue {g} Straßenfelder.', stat:'roadsBuilt', goal:6, reward:{ gems:6, xp:40 } },
];
const ACHIEVEMENTS = [
  { id:'a_tower1', name:'Erster Turm', desc:'Baue deinen ersten Turm.', stat:'towersBuilt', goal:1, gems:5, icon:'🏰' },
  { id:'a_road1', name:'Wegbereiter', desc:'Baue dein erstes Straßenfeld.', stat:'roadsBuilt', goal:1, gems:5, icon:'🛣️' },
  { id:'a_wave1', name:'Erster Sieg', desc:'Überstehe deine erste Welle.', stat:'wavesTotal', goal:1, gems:5, icon:'🎉' },
  { id:'a_best10', name:'10 Wellen überstanden', desc:'Erreiche Welle 10 in einer Runde.', stat:'bestWave', goal:10, gems:15, icon:'🔟' },
  { id:'a_best25', name:'25 Wellen überstanden', desc:'Erreiche Welle 25 in einer Runde.', stat:'bestWave', goal:25, gems:30, icon:'⭐' },
  { id:'a_best50', name:'50 Wellen überstanden', desc:'Erreiche Welle 50 in einer Runde.', stat:'bestWave', goal:50, gems:60, crystals:10, icon:'🌟' },
  { id:'a_best100', name:'100 Wellen überstanden', desc:'Erreiche Welle 100 in einer Runde.', stat:'bestWave', goal:100, gems:150, crystals:30, icon:'💯' },
  { id:'a_boss1', name:'Erster Boss besiegt', desc:'Besiege einen Boss.', stat:'bossKills', goal:1, gems:20, icon:'👑' },
  { id:'a_boss10', name:'Bossschreck', desc:'Besiege 10 Bosse.', stat:'bossKills', goal:10, gems:60, crystals:8, icon:'🗡️' },
  { id:'a_kill100', name:'Hundert Besiegte', desc:'Besiege 100 Gegner.', stat:'kills', goal:100, gems:10, icon:'⚔️' },
  { id:'a_kill1000', name:'1.000 Gegner besiegt', desc:'Besiege 1.000 Gegner.', stat:'kills', goal:1000, gems:30, icon:'🔥' },
  { id:'a_kill10000', name:'Armeevernichter', desc:'Besiege 10.000 Gegner.', stat:'kills', goal:10000, gems:100, crystals:15, icon:'☠️' },
  { id:'a_coins10k', name:'Sparschwein', desc:'Verdiene 10.000 Münzen.', stat:'coinsEarned', goal:10000, gems:10, icon:'🐷' },
  { id:'a_coins100k', name:'100.000 Münzen verdient', desc:'Verdiene 100.000 Münzen.', stat:'coinsEarned', goal:100000, gems:40, icon:'💰' },
  { id:'a_coins1m', name:'Millionär', desc:'Verdiene 1.000.000 Münzen.', stat:'coinsEarned', goal:1000000, gems:120, crystals:20, icon:'🤑' },
  { id:'a_towers25', name:'Turmstadt', desc:'Baue 25 Türme.', stat:'towersBuilt', goal:25, gems:15, icon:'🏙️' },
  { id:'a_towers200', name:'Festungsarchitekt', desc:'Baue 200 Türme.', stat:'towersBuilt', goal:200, gems:50, icon:'🏯' },
  { id:'a_lvl5', name:'Fusionsmeister', desc:'Fuse einen Turm auf +5.', stat:'maxPlus', goal:5, gems:60, crystals:5, icon:'⚗️' },
  { id:'a_plus9', name:'Unaufhaltsam', desc:'Fuse einen Turm auf +9.', stat:'maxPlus', goal:9, gems:300, crystals:50, icon:'💠' },
  { id:'a_upg100', name:'Fusionsmaschine', desc:'Führe 25 Fusionen durch.', stat:'fusions', goal:25, gems:40, icon:'🔧' },
  { id:'a_legend', name:'Erster legendärer Turm', desc:'Baue einen Turm der Seltenheit Legendary oder höher.', stat:'legendaryBuilt', goal:1, gems:30, icon:'🏅' },
  { id:'a_road100', name:'Straßennetz', desc:'Baue 100 Straßenfelder.', stat:'roadsBuilt', goal:100, gems:20, icon:'🗺️' },
  { id:'a_deco25', name:'Landschaftsgärtner', desc:'Platziere 25 Dekorationen.', stat:'decoBuilt', goal:25, gems:15, icon:'🌸' },
  { id:'a_games10', name:'Veteran', desc:'Spiele 10 Runden.', stat:'gamesPlayed', goal:10, gems:20, icon:'🎮' },
  { id:'a_skip10', name:'Draufgänger', desc:'Überspringe 10 Wellen-Pausen.', stat:'skips', goal:10, gems:15, icon:'⏩' },
  { id:'a_victory', name:'Tutorial gemeistert', desc:'Schließe das Tutorial ab.', stat:'tutorial', goal:1, gems:20, icon:'🎓' },
  { id:'a_hard', name:'Unbezwingbar', desc:'Erreiche Welle 75 in einer Runde.', stat:'bestWave', goal:75, gems:100, crystals:15, icon:'💀' },
  { id:'a_trap', name:'Fallensteller', desc:'Platziere 10 Fallen.', stat:'trapsBuilt', goal:10, gems:15, icon:'🪤' },
  { id:'a_perfect', name:'Makellos', desc:'Überstehe ab Welle 10 eine Welle ohne Lebensverlust.', stat:'perfectWaves', goal:1, gems:15, icon:'✨' },
  { id:'a_level10', name:'Aufsteiger', desc:'Erreiche Spielerlevel 10.', stat:'playerLevel', goal:10, gems:30, icon:'📈' },
  { id:'a_level25', name:'Kommandant', desc:'Erreiche Spielerlevel 25.', stat:'playerLevel', goal:25, gems:80, crystals:10, icon:'🎖️' },
  { id:'a_collect15', name:'Sammler', desc:'Besitze 15 verschiedene Türme.', stat:'towersUnlocked', goal:15, gems:30, icon:'📚' },
  { id:'a_collect30', name:'Komplettist', desc:'Besitze alle 31 Türme.', stat:'towersUnlocked', goal:31, gems:150, crystals:30, icon:'🗃️' },
  { id:'a_seen20', name:'Monsterforscher', desc:'Entdecke 20 Gegnertypen.', stat:'enemiesSeen', goal:20, gems:20, icon:'🔍' },
  { id:'a_dmg1m', name:'Zerstörungskraft', desc:'Verursache 1.000.000 Schaden.', stat:'damage', goal:1000000, gems:40, icon:'💥' },
  { id:'a_titan', name:'Titanenbezwinger', desc:'Besiege den Ultimativen Titan.', stat:'titanKills', goal:1, gems:200, crystals:50, icon:'🗿' },
  { id:'a_shop', name:'Kunde', desc:'Kaufe etwas im Shop.', stat:'purchases', goal:1, gems:5, icon:'🛒' },
  { id:'a_streak7', name:'Treue Seele', desc:'Hole 7 Tage in Folge die Tagesbelohnung.', stat:'bestStreak', goal:7, gems:50, crystals:5, icon:'📅' },
];

// ------------------------------------------------------------
// Fallen (werden auf Straßenfelder gelegt, nur von Bossen)
// ------------------------------------------------------------
const TRAPS = [
  { id:'trap_spike', name:'Stachelfalle', rarity:'uncommon', icon:'🔺', color:'#b8bcc6', dmg:18, every:0.5, desc:'Verletzt alle Bodengegner, die darüberlaufen.' },
  { id:'trap_glue', name:'Klebefalle', rarity:'uncommon', icon:'🟫', color:'#c9a227', slow:0.55, desc:'Gegner kleben fest und laufen viel langsamer.' },
  { id:'trap_fire', name:'Feuerfalle', rarity:'rare', icon:'🔥', color:'#ff6a1a', burn:22, desc:'Setzt Gegner in Brand.' },
  { id:'trap_bomb', name:'Sprengfalle', rarity:'rare', icon:'💣', color:'#3a3a3a', dmg:140, splash:1.2, rearm:5, desc:'Explodiert, wenn ein Gegner drauftritt. Lädt sich wieder auf.' },
  { id:'trap_frost', name:'Frostfalle', rarity:'epic', icon:'❄️', color:'#9fe6ff', stun:1.2, rearm:6, desc:'Friert Gegner kurz komplett ein.' },
];
const TRAP_BY_ID = Object.fromEntries(TRAPS.map(t => [t.id, t]));
const ROAD_PIECE_PRICE = 30;   // Münzen pro Wegstück

const NEIGHBOR_NAMES = ['MaxBuilder', 'TurmTina', 'KanonenKai', 'LaserLena', 'Drachenjäger', 'PixelPaul'];

// Spielerlevel: Freischaltungen pro Level
function xpForLevel(lvl) { return Math.floor(120 * Math.pow(1.22, lvl - 1)); }
