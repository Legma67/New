'use strict';
// ============================================================
//  Welt: Szene, Landschaft, Grundstück, Straßen, Wegfindung, Partikel
// ============================================================
const GW = 22, GH = 14;               // Baufläche in Feldern
const SPAWN = { x: 0, z: 3 }, GOAL = { x: GW - 1, z: 10 };
const tileToWorld = (x, z) => new THREE.Vector3(x - GW / 2 + 0.5, 0, z - GH / 2 + 0.5);
const DEFAULT_ROADS = (() => {
  const r = [];
  const line = (x0, z0, x1, z1) => {
    const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
    let x = x0, z = z0; r.push([x, z]);
    while (x !== x1 || z !== z1) { x += dx; z += dz; r.push([x, z]); }
  };
  line(0, 3, 6, 3); line(6, 3, 6, 10); line(6, 10, 13, 10); line(13, 10, 13, 3); line(13, 3, 18, 3); line(18, 3, 18, 10); line(18, 10, 21, 10);
  const seen = new Set(); return r.filter(([x, z]) => { const k = x + ',' + z; if (seen.has(k)) return false; seen.add(k); return true; });
})();

const World = (() => {
  let scene, renderer, camera, sun, hemi;
  let envGroup, plotGroup, roadGroup, arrowGroup, gridLines, neighborGroup;
  let biome = BIOMES[0];
  let water = null, waterMat = null;
  const roadMeshes = new Map();
  const texCache = {};

  // ---------- Texturen ----------
  function canvasTex(key, fn, size = 128) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); fn(g, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache[key] = t; return t;
  }
  function roadTex(pattern) {
    return canvasTex('road_' + pattern, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      const rnd = mulberry(pattern.length * 977);
      if (pattern === 'cobble') {
        const n = 5, cs = s / n;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const ox = (y % 2) * cs / 2;
          const l = 70 + rnd() * 25;
          g.fillStyle = `hsl(40,6%,${l}%)`;
          roundRect(g, x * cs + ox + 2, y * cs + 2, cs - 4, cs - 4, 6); g.fill();
          if (ox) { roundRect(g, -cs / 2 + 2, y * cs + 2, cs - 4, cs - 4, 6); g.fill(); }
        }
      } else if (pattern === 'sand') {
        for (let i = 0; i < 900; i++) { g.fillStyle = `hsla(40,40%,${60 + rnd() * 35}%,0.6)`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
      } else if (pattern === 'grass') {
        for (let i = 0; i < 500; i++) { g.strokeStyle = `hsla(100,45%,${55 + rnd() * 35}%,0.8)`; const x = rnd() * s, y = rnd() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 3 - 1.5, y - 4 - rnd() * 4); g.stroke(); }
      } else if (pattern === 'asphalt') {
        g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, s, s);
        for (let i = 0; i < 1500; i++) { g.fillStyle = `hsla(0,0%,${70 + rnd() * 30}%,0.7)`; g.fillRect(rnd() * s, rnd() * s, 1.5, 1.5); }
      }
    });
  }
  function grassTex() {
    return canvasTex('grass_' + biome.id, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      const rnd = mulberry(7);
      for (let i = 0; i < 700; i++) { g.fillStyle = `hsla(0,0%,${80 + rnd() * 20}%,0.5)`; g.fillRect(rnd() * s, rnd() * s, 2, 3); }
      g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
    }, 64);
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function textSprite(text, bg = 'rgba(20,30,60,0.85)', fg = '#fff', w = 512, h = 128) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; roundRect(g, 4, 4, w - 8, h - 8, 28); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 6; g.stroke();
    g.fillStyle = fg; g.font = `bold ${h * 0.48}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
    sp.scale.set(w / h * 0.8, 0.8, 1);
    return sp;
  }

  // ---------- Setup ----------
  function init(canvas, quality) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : quality === 'low' ? 1 : 1.5));
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    hemi = new THREE.HemisphereLight(0xffffff, 0x6a8a4a, 1.25); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff2d6, 2.1);
    sun.position.set(-14, 26, 12);
    sun.castShadow = true;
    const ss = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(ss, ss);
    Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 13, bottom: -13, near: 1, far: 70 });
    sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    envGroup = new THREE.Group(); scene.add(envGroup);
    plotGroup = new THREE.Group(); scene.add(plotGroup);
    roadGroup = new THREE.Group(); scene.add(roadGroup);
    arrowGroup = new THREE.Group(); scene.add(arrowGroup);
    neighborGroup = new THREE.Group(); scene.add(neighborGroup);
    Particles.init(scene);
    resize();
  }
  function setQuality(q) {
    renderer.shadowMap.enabled = q !== 'low';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : q === 'low' ? 1 : 1.5));
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    resize();
  }
  function resize() {
    const w = View.w, h = View.h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // ---------- Landschaft ----------
  function buildEnvironment(b, playerName) {
    biome = b;
    while (envGroup.children.length) envGroup.remove(envGroup.children[0]);
    while (plotGroup.children.length) plotGroup.remove(plotGroup.children[0]);
    while (neighborGroup.children.length) neighborGroup.remove(neighborGroup.children[0]);
    scene.background = new THREE.Color(b.sky);
    scene.fog = new THREE.Fog(b.fog, 45, 120);
    hemi.color.set(0xffffff); hemi.groundColor.set(b.ground2);
    const rnd = mulberry(1234);

    // Großer Boden mit Farbvariation
    const gg = new THREE.PlaneGeometry(200, 200, 60, 60); gg.rotateX(-Math.PI / 2);
    const cols = [], c1 = new THREE.Color(b.ground), c2 = new THREE.Color(b.ground2), tmp = new THREE.Color();
    const pos = gg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = (Math.sin(x * 0.21) + Math.cos(z * 0.17) + Math.sin((x + z) * 0.09)) / 3 * 0.5 + 0.5;
      tmp.copy(c1).lerp(c2, n); cols.push(tmp.r, tmp.g, tmp.b);
      const d = Math.max(Math.abs(x) - 30, Math.abs(z) - 30, 0);
      pos.setY(i, -0.05 + (d > 0 ? Math.min(d * 0.15, 4) * (0.5 + 0.5 * Math.sin(x * 0.3 + z * 0.2)) : 0));
    }
    gg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    gg.computeVertexNormals();
    const ground = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.receiveShadow = true; envGroup.add(ground);

    // Grundstück (erhöhte Baufläche)
    const plotMat = new THREE.MeshLambertMaterial({ color: b.plot, map: grassTex() });
    plotMat.map.wrapS = plotMat.map.wrapT = THREE.RepeatWrapping; plotMat.map.repeat.set(GW, GH);
    const plot = new THREE.Mesh(new THREE.BoxGeometry(GW, 0.3, GH), [Models.M(b.ground2), Models.M(b.ground2), plotMat, Models.M(b.ground2), Models.M(b.ground2), Models.M(b.ground2)]);
    plot.position.y = -0.15; plot.receiveShadow = true; plotGroup.add(plot);
    // Rand
    const rim = Models.M('#8a7a62');
    for (const [w, d, x, z] of [[GW + 0.6, 0.3, 0, -GH / 2 - 0.15], [GW + 0.6, 0.3, 0, GH / 2 + 0.15], [0.3, GH, -GW / 2 - 0.15, 0], [0.3, GH, GW / 2 + 0.15, 0]]) {
      const m = Models.mesh(Models.box(w, 0.36, d), rim, x, -0.12, z, plotGroup);
    }
    // Zaun um das Grundstück (mit Lücken bei Spawn und Ziel)
    const sp = tileToWorld(SPAWN.x, SPAWN.z), gl = tileToWorld(GOAL.x, GOAL.z);
    for (let x = -GW / 2; x <= GW / 2; x += 1) for (const z of [-GH / 2 - 0.3, GH / 2 + 0.3]) Models.mesh(Models.box(0.08, 0.35, 0.08), Models.M('#a8784a'), x, 0.17, z, plotGroup);
    for (const z of [-GH / 2 - 0.3, GH / 2 + 0.3]) Models.mesh(Models.box(GW, 0.05, 0.04), Models.M('#c28a55'), 0, 0.27, z, plotGroup);

    // Gitter-Overlay
    const lp = [];
    for (let x = 0; x <= GW; x++) lp.push(x - GW / 2, 0.012, -GH / 2, x - GW / 2, 0.012, GH / 2);
    for (let z = 0; z <= GH; z++) lp.push(-GW / 2, 0.012, z - GH / 2, GW / 2, 0.012, z - GH / 2);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    gridLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
    gridLines.visible = false; plotGroup.add(gridLines);

    // Portal & Burg
    const portal = Models.makePortal(); portal.position.set(sp.x - 1.0, 0, sp.z); portal.rotation.y = Math.PI / 2; plotGroup.add(portal);
    World.portal = portal;
    // Wege vom Portal / zur Burg
    for (const [p, dx] of [[sp, -1], [gl, 1]]) {
      const ex = Models.mesh(Models.box(1.1, 0.06, 0.9), Models.M('#9b9a94'), p.x + dx * 0.95, 0.03, p.z, plotGroup);
    }
    World.castlePos = new THREE.Vector3(gl.x + 1.4, 0, gl.z);
    World.portalPos = new THREE.Vector3(sp.x - 1.0, 0, sp.z);

    // Schild mit Spielername
    const sign = textSprite('🏰 ' + (playerName || 'Spieler'));
    sign.position.set(0, 1.4, -GH / 2 - 1.3); plotGroup.add(sign);
    Models.mesh(Models.box(0.1, 1.0, 0.1), Models.M('#7a5230'), -1.2, 0.5, -GH / 2 - 1.3, plotGroup);
    Models.mesh(Models.box(0.1, 1.0, 0.1), Models.M('#7a5230'), 1.2, 0.5, -GH / 2 - 1.3, plotGroup);
    // Infotafel
    const info = textSprite('Spawn ▶', 'rgba(140,40,200,0.85)', '#fff', 320, 110); info.scale.set(2, 0.7, 1);
    info.position.set(sp.x - 1.0, 1.9, sp.z); plotGroup.add(info);
    const info2 = textSprite('Ziel 🏁', 'rgba(30,120,60,0.85)', '#fff', 320, 110); info2.scale.set(2, 0.7, 1);
    info2.position.set(gl.x + 1.4, 2.6, gl.z); plotGroup.add(info2);

    // Wasser (oder Lava)
    waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { t: { value: 0 }, c: { value: new THREE.Color(b.water) }, lava: { value: b.lava ? 1 : 0 } },
      vertexShader: `uniform float t; varying vec2 vUv; varying float vH;
        void main(){ vUv=uv; vec3 p=position; float h=sin(p.x*1.3+t*1.6)*0.06+cos(p.y*1.1+t*1.2)*0.06; p.z+=h; vH=h;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);} `,
      fragmentShader: `uniform float t; uniform vec3 c; uniform float lava; varying vec2 vUv; varying float vH;
        void main(){ float s=sin(vUv.x*40.0+t*2.0)*sin(vUv.y*36.0-t*1.5);
        vec3 col=c*(0.85+vH*2.0)+vec3(smoothstep(0.75,1.0,s))*0.35;
        if(lava>0.5){ col=mix(vec3(0.9,0.2,0.0),vec3(1.0,0.75,0.1),smoothstep(-0.4,0.9,s)); }
        float edge=smoothstep(0.5,0.42,length(vUv-0.5));
        gl_FragColor=vec4(col, (lava>0.5?1.0:0.82)*edge);} `,
    });
    for (const [x, z, r] of [[-20, 12, 6], [22, -13, 5], [-8, -16, 4], [16, 15, 4.5]]) {
      const wg = new THREE.PlaneGeometry(r * 2, r * 2, 24, 24);
      const w = new THREE.Mesh(wg, waterMat); w.rotation.x = -Math.PI / 2; w.position.set(x, 0.04, z); envGroup.add(w);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; Models.mesh(Models.dod(0.4 + rnd() * 0.3), Models.M('#8a8a86'), x + Math.cos(a) * r * 0.82, 0.05, z + Math.sin(a) * r * 0.82, envGroup); }
    }

    // Bäume, Büsche, Steine, Blumen, Häuser, Laternen außerhalb der Baufläche
    const inPlot = (x, z, m = 2) => Math.abs(x) < GW / 2 + m && Math.abs(z) < GH / 2 + m;
    const inPond = (x, z) => [[-20, 12, 6.5], [22, -13, 5.5], [-8, -16, 4.5], [16, 15, 5]].some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r);
    const inNeighbor = (x, z) => Math.abs(x) < 9 && (Math.abs(z - 22) < 6 || Math.abs(z + 22) < 6) ;
    const place = (n, fn, minR = 0, maxR = 45) => {
      let placed = 0, tries = 0;
      while (placed < n && tries++ < n * 20) {
        const x = (rnd() - 0.5) * 2 * maxR, z = (rnd() - 0.5) * 2 * maxR;
        if (inPlot(x, z) || inPond(x, z) || inNeighbor(x, z) || Math.hypot(x, z) < minR) continue;
        if (Math.abs(z - sp.z) < 1.6 && x < -GW / 2 && x > -GW / 2 - 4) continue;
        if (Math.abs(z - gl.z) < 1.6 && x > GW / 2 && x < GW / 2 + 4) continue;
        const o = fn(x, z); o.position.set(x, 0, z); o.rotation.y = rnd() * 6.28; envGroup.add(o); placed++;
      }
    };
    place(70, () => Models.makeTree(b.tree, b.leaf, 0.9 + rnd() * 0.8));
    place(40, () => Models.makeDeco('bush', b));
    place(30, () => Models.makeDeco('rock', b));
    place(40, () => Models.makeDeco('flowers', b));
    place(6, () => { const h = Models.makeDeco('house', b); h.scale.setScalar(1.6); return h; }, 18, 34);
    // Laternen und Zäune an den Rändern
    for (let x = -GW / 2; x <= GW / 2; x += 5.5) for (const z of [-GH / 2 - 0.9, GH / 2 + 0.9]) { const l = Models.makeDeco('lantern', b); l.position.set(x, 0, z); envGroup.add(l); }
    // Dekorative Wege um das Grundstück
    for (let x = -GW / 2 - 2; x <= GW / 2 + 2; x += 1) for (const z of [-GH / 2 - 2.2, GH / 2 + 2.2]) Models.mesh(Models.box(0.96, 0.04, 1.2), Models.M('#cbbd9a'), x, 0.02, z, envGroup, false).receiveShadow = true;

    // Berge im Hintergrund
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + rnd() * 0.1, r = 72 + rnd() * 18, h = 12 + rnd() * 16;
      const m = Models.mesh(Models.cone(8 + rnd() * 6, h, 7), Models.M(b.mountain), Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r, envGroup, false);
      if (b.snowcap || b.id === 'snow' || b.id === 'iceworld') Models.mesh(Models.cone(3.2, h * 0.3, 7), Models.M('#ffffff'), Math.cos(a) * r, h - h * 0.15 - 1, Math.sin(a) * r, envGroup, false);
      if (b.lava) Models.mesh(Models.cone(2, 1.5, 7), Models.M('#ff5a00', { e: '#ff3a00', ei: 1 }), Math.cos(a) * r, h - 1.2, Math.sin(a) * r, envGroup, false);
    }
    // Wolken
    World.clouds = [];
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) Models.mesh(Models.ico(1.2 + rnd(), 1), Models.M('#ffffff', { o: 0.9 }), j * 1.3 - 2, rnd() * 0.5, rnd() - 0.5, c, false);
      c.position.set((rnd() - 0.5) * 120, 18 + rnd() * 8, (rnd() - 0.5) * 100); envGroup.add(c); World.clouds.push(c);
    }

    // Nachbar-Grundstücke (andere Spieler-Bauflächen)
    buildNeighbors(b);
  }

  function buildNeighbors(b) {
    const rnd = mulberry(99);
    [[0, -22, NEIGHBOR_NAMES[0]], [0, 22, NEIGHBOR_NAMES[1]]].forEach(([cx, cz, name], idx) => {
      const g = new THREE.Group(); g.position.set(cx, 0, cz);
      const p = Models.mesh(Models.box(16, 0.3, 9), Models.M(b.plot), 0, -0.15, 0, g); p.receiveShadow = true;
      for (let x = -7; x <= 7; x++) Models.mesh(Models.box(0.96, 0.05, 0.9), Models.M('#9b9a94'), x, 0.02, idx ? 1 : -1, g, false);
      for (let i = 0; i < 6; i++) {
        const def = TOWERS[(i * 5 + idx * 3) % 20];
        const t = Models.makeTower(def, RARITIES[def.rarity].color);
        Models.applyTowerLevel(t, 1 + ((i + idx) % 5));
        t.position.set(-6 + i * 2.4, 0, (idx ? 1 : -1) + (i % 2 ? 1.6 : -1.6)); g.add(t);
      }
      const sign = textSprite('👤 ' + name, 'rgba(60,60,80,0.85)'); sign.position.set(0, 1.4, idx ? 5.4 : -5.4); g.add(sign);
      const castle = Models.makeCastle(CASTLES[(idx + 1) % CASTLES.length]); castle.position.set(8.6, 0, idx ? 1 : -1); g.add(castle);
      neighborGroup.add(g);
    });
  }

  // ---------- Straßen ----------
  function roadMaterial(def, skin, x, z) {
    let color = def.color;
    let emissive = null;
    if (skin && skin.tint) {
      if (skin.tint === 'rainbow') color = new THREE.Color().setHSL(((x * 0.07 + z * 0.05) % 1 + 1) % 1, 0.75, 0.6).getStyle();
      else { color = new THREE.Color(def.color).lerp(new THREE.Color(skin.tint), 0.75).getStyle(); }
      if (skin.emissive) emissive = skin.tint;
    }
    const key = 'rm_' + def.id + '_' + color + '_' + emissive;
    if (!texCache[key]) {
      const m = new THREE.MeshLambertMaterial({ color, map: roadTex(def.pattern) });
      if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 0.35; }
      texCache[key] = m;
    }
    return texCache[key];
  }
  function rebuildRoads(grid, skin) {
    for (const g of roadMeshes.values()) roadGroup.remove(g);
    roadMeshes.clear();
    for (let x = 0; x < GW; x++) for (let z = 0; z < GH; z++) {
      const c = grid[x][z];
      if (c && c.type === 'road') addRoadMesh(grid, x, z, skin);
    }
  }
  function isRoadAt(grid, x, z) {
    if (x === SPAWN.x - 1 && z === SPAWN.z) return true;
    if (x === GOAL.x + 1 && z === GOAL.z) return true;
    return x >= 0 && z >= 0 && x < GW && z < GH && grid[x][z] && grid[x][z].type === 'road';
  }
  function addRoadMesh(grid, x, z, skin) {
    const c = grid[x][z]; const def = ROAD_BY_ID[c.road] || ROADS[0];
    const g = new THREE.Group(); const p = tileToWorld(x, z); g.position.copy(p);
    const mat = roadMaterial(def, skin, x, z);
    const edgeMat = Models.M(def.edge);
    const w = def.width, hgt = 0.05;
    const n = [isRoadAt(grid, x, z - 1), isRoadAt(grid, x + 1, z), isRoadAt(grid, x, z + 1), isRoadAt(grid, x - 1, z)]; // N E S W
    const mk = (sx, sz, px, pz) => { const m = new THREE.Mesh(Models.box(sx, hgt, sz), mat); m.position.set(px, hgt / 2 + 0.005, pz); m.receiveShadow = true; g.add(m); return m; };
    mk(w, w, 0, 0);
    const arm = (1 - w) / 2;
    if (arm > 0.001) {
      if (n[0]) mk(w, arm, 0, -w / 2 - arm / 2);
      if (n[2]) mk(w, arm, 0, w / 2 + arm / 2);
      if (n[1]) mk(arm, w, w / 2 + arm / 2, 0);
      if (n[3]) mk(arm, w, -w / 2 - arm / 2, 0);
    }
    // Bordsteine an offenen Seiten
    const cw = 0.06, ch = 0.09;
    const curb = (sx, sz, px, pz) => { const m = new THREE.Mesh(Models.box(sx, ch, sz), edgeMat); m.position.set(px, ch / 2, pz); m.castShadow = false; m.receiveShadow = true; g.add(m); };
    const hw = w / 2;
    if (!n[0]) curb(w + cw, cw, 0, -hw);
    if (!n[2]) curb(w + cw, cw, 0, hw);
    if (!n[1]) curb(cw, w + cw, hw, 0);
    if (!n[3]) curb(cw, w + cw, -hw, 0);
    if (arm > 0.001) { // Bordsteine entlang der Arme
      if (n[0]) { curb(cw, arm, -hw, -hw - arm / 2); curb(cw, arm, hw, -hw - arm / 2); }
      if (n[2]) { curb(cw, arm, -hw, hw + arm / 2); curb(cw, arm, hw, hw + arm / 2); }
      if (n[1]) { curb(arm, cw, hw + arm / 2, -hw); curb(arm, cw, hw + arm / 2, hw); }
      if (n[3]) { curb(arm, cw, -hw - arm / 2, -hw); curb(arm, cw, -hw - arm / 2, hw); }
    }
    // Mittellinie für Asphalt
    if (def.pattern === 'asphalt') {
      const lm = Models.M(def.edge === '#e8e8e8' ? '#ffffff' : def.edge);
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      dirs.forEach(([dx, dz], i) => { if (!n[i]) return; const m = new THREE.Mesh(Models.box(dx ? 0.3 : 0.05, 0.01, dz ? 0.3 : 0.05), lm); m.position.set(dx * 0.3, hgt + 0.01, dz * 0.3); g.add(m); });
    }
    roadGroup.add(g); roadMeshes.set(x + ',' + z, g);
    return g;
  }

  // ---------- Wegfindung (A*) ----------
  function findPath(grid, blocked) {
    const key = (x, z) => x * 100 + z;
    const walk = (x, z) => x >= 0 && z >= 0 && x < GW && z < GH && grid[x][z] && grid[x][z].type === 'road' && !(blocked && blocked.x === x && blocked.z === z);
    if (!walk(SPAWN.x, SPAWN.z) || !walk(GOAL.x, GOAL.z)) return null;
    const open = [{ x: SPAWN.x, z: SPAWN.z, g: 0, f: 0 }];
    const came = new Map(), gs = new Map([[key(SPAWN.x, SPAWN.z), 0]]);
    const h = (x, z) => Math.abs(x - GOAL.x) + Math.abs(z - GOAL.z);
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.x === GOAL.x && cur.z === GOAL.z) {
        const path = [[cur.x, cur.z]]; let k = key(cur.x, cur.z);
        while (came.has(k)) { const p = came.get(k); path.push(p); k = key(p[0], p[1]); }
        return path.reverse();
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx, nz = cur.z + dz;
        if (!walk(nx, nz)) continue;
        const ng = cur.g + 1, nk = key(nx, nz);
        if (ng < (gs.get(nk) ?? Infinity)) {
          gs.set(nk, ng); came.set(nk, [cur.x, cur.z]);
          const ex = open.find(o => o.x === nx && o.z === nz);
          if (ex) { ex.g = ng; ex.f = ng + h(nx, nz); } else open.push({ x: nx, z: nz, g: ng, f: ng + h(nx, nz) });
        }
      }
    }
    return null;
  }

  // Aus Feldpfad eine geglättete Laufbahn (Kurven abgerundet)
  function buildRoute(tilePath) {
    const pts = [World.portalPos.clone()];
    for (const [x, z] of tilePath) pts.push(tileToWorld(x, z));
    pts.push(World.castlePos.clone());
    const out = [pts[0].clone()];
    const R = 0.42;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const d1 = b.clone().sub(a).normalize(), d2 = c.clone().sub(b).normalize();
      if (d1.dot(d2) > 0.99) { out.push(b.clone()); continue; }
      const p0 = b.clone().addScaledVector(d1, -R), p2 = b.clone().addScaledVector(d2, R);
      for (let s = 0; s <= 6; s++) {
        const t = s / 6, it = 1 - t;
        out.push(new THREE.Vector3(it * it * p0.x + 2 * it * t * b.x + t * t * p2.x, 0, it * it * p0.z + 2 * it * t * b.z + t * t * p2.z));
      }
    }
    out.push(pts[pts.length - 1].clone());
    const cum = [0];
    for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + out[i].distanceTo(out[i - 1]));
    return { pts: out, cum, len: cum[cum.length - 1], tiles: tilePath };
  }
  const _v = new THREE.Vector3();
  function routePos(route, d, outV, outDir) {
    const { pts, cum, len } = route;
    if (d <= 0) { outV.copy(pts[0]); if (outDir) outDir.copy(pts[1]).sub(pts[0]).normalize(); return; }
    if (d >= len) { outV.copy(pts[pts.length - 1]); if (outDir) outDir.copy(pts[pts.length - 1]).sub(pts[pts.length - 2]).normalize(); return; }
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const t = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
    outV.copy(pts[lo]).lerp(pts[hi], t);
    if (outDir) outDir.copy(pts[hi]).sub(pts[lo]).normalize();
  }

  // Richtungspfeile auf dem Weg
  let arrowMat = null;
  function showArrows(route) {
    while (arrowGroup.children.length) arrowGroup.remove(arrowGroup.children[0]);
    if (!route) return;
    if (!arrowMat) arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, depthWrite: false });
    const shape = new THREE.Shape(); shape.moveTo(-0.15, -0.12); shape.lineTo(0, 0.08); shape.lineTo(0.15, -0.12); shape.lineTo(0.15, -0.02); shape.lineTo(0, 0.18); shape.lineTo(-0.15, -0.02);
    const ag = Models.geo('arrow', () => { const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); return g; });
    const dir = new THREE.Vector3(), p = new THREE.Vector3();
    for (let d = 0.8; d < route.len - 0.5; d += 1.0) {
      routePos(route, d, p, dir);
      const m = new THREE.Mesh(ag, arrowMat);
      m.position.set(p.x, 0.075, p.z);
      m.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
      m.userData.d = d;
      arrowGroup.add(m);
    }
  }
  function setBuildOverlay(on) { if (gridLines) gridLines.visible = on; arrowGroup.visible = true; }

  function update(dt, t) {
    if (waterMat) waterMat.uniforms.t.value = t;
    if (arrowMat) arrowMat.opacity = 0.35 + 0.3 * Math.sin(t * 3);
    if (World.portal) { World.portal.userData.disc.rotation.z = t; World.portal.userData.swirl.rotation.z = -t * 2; }
    if (World.clouds) for (const c of World.clouds) { c.position.x += dt * 0.6; if (c.position.x > 70) c.position.x = -70; }
    Particles.update(dt);
  }

  return {
    init, resize, setQuality, buildEnvironment, rebuildRoads, addRoadMesh, findPath, buildRoute, routePos, showArrows, setBuildOverlay, update, textSprite,
    get scene() { return scene; }, get camera() { return camera; }, get renderer() { return renderer; }, get biome() { return biome; },
    roadMeshes, portal: null, castlePos: null, portalPos: null, clouds: null,
  };
})();

// ============================================================
//  Partikelsystem (ein einziges Points-Objekt, gepoolt)
// ============================================================
const Particles = (() => {
  const CAP = 2500;
  let geo, pts, n = 0, enabled = true, tintColor = null, rainbow = false;
  const pos = new Float32Array(CAP * 3), col = new Float32Array(CAP * 3), size = new Float32Array(CAP), alpha = new Float32Array(CAP);
  const vel = new Float32Array(CAP * 3), life = new Float32Array(CAP), maxLife = new Float32Array(CAP), grav = new Float32Array(CAP), size0 = new Float32Array(CAP);
  function init(scene) {
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; float a=smoothstep(0.5,0.0,d)*vA; gl_FragColor=vec4(vC*a, a);} `,
    });
    pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 10;
    scene.add(pts);
  }
  const c = new THREE.Color();
  function setTint(fx) { tintColor = fx && fx.tint && fx.tint !== 'rainbow' ? new THREE.Color(fx.tint) : null; rainbow = fx && fx.tint === 'rainbow'; }
  function emit(x, y, z, count, color, opt = {}) {
    if (!enabled) count = Math.ceil(count / 4);
    const sp = opt.speed ?? 2, up = opt.up ?? 1.5, lf = opt.life ?? 0.6, sz = opt.size ?? 0.25, g = opt.gravity ?? 3;
    for (let k = 0; k < count; k++) {
      if (n >= CAP) return;
      const i = n++;
      pos[i * 3] = x + (Math.random() - 0.5) * (opt.spread ?? 0.1); pos[i * 3 + 1] = y; pos[i * 3 + 2] = z + (Math.random() - 0.5) * (opt.spread ?? 0.1);
      const a = Math.random() * Math.PI * 2, s = Math.random() * sp;
      vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = up * (0.5 + Math.random()); vel[i * 3 + 2] = Math.sin(a) * s;
      if (opt.dir) { vel[i * 3] += opt.dir.x; vel[i * 3 + 1] += opt.dir.y; vel[i * 3 + 2] += opt.dir.z; }
      c.set(color);
      if (opt.tint !== false) { if (rainbow) c.setHSL(Math.random(), 1, 0.6); else if (tintColor) c.lerp(tintColor, 0.6); }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      life[i] = maxLife[i] = lf * (0.6 + Math.random() * 0.6);
      size0[i] = sz * (0.6 + Math.random() * 0.8); grav[i] = g;
    }
  }
  function update(dt) {
    for (let i = 0; i < n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) { // swap remove
        n--;
        if (i !== n) {
          for (let k = 0; k < 3; k++) { pos[i * 3 + k] = pos[n * 3 + k]; vel[i * 3 + k] = vel[n * 3 + k]; col[i * 3 + k] = col[n * 3 + k]; }
          life[i] = life[n]; maxLife[i] = maxLife[n]; grav[i] = grav[n]; size0[i] = size0[n];
          i--;
        }
        continue;
      }
      vel[i * 3 + 1] -= grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.3; }
      const t = life[i] / maxLife[i];
      alpha[i] = Math.min(1, t * 2); size[i] = size0[i] * (0.5 + t * 0.5);
    }
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true; geo.attributes.alpha.needsUpdate = true;
  }
  function clear() { n = 0; }
  return { init, emit, update, clear, setTint, set enabled(v) { enabled = v; }, get count() { return n; } };
})();
