import asyncio, json, sys
from playwright.async_api import async_playwright
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
ROUNDS = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
VIEW = sys.argv[3] if len(sys.argv) > 3 else 'pc'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        if VIEW == 'mobile': ctx = await b.new_context(viewport={'width':844,'height':390}, is_mobile=True, has_touch=True)
        elif VIEW == 'portrait': ctx = await b.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
        else: ctx = await b.new_context(viewport={'width':1100,'height':620})
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' else None)
        await pg.goto('file:///home/claude/new/index.html'); await pg.wait_for_timeout(3000)
        res = await pg.evaluate('''async ([seed, rounds]) => {
          let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
          const pick = a => a[Math.floor(rnd() * a.length)];
          const problems = []; const counts = {};
          const bad = (m) => { if (problems.length < 40) problems.push(m); };
          UI.Tut.stop(); Save.P.tutorialDone = true;
          Save.P.towerInv = { crossbow:[5,2], cannon:[4,1], ice:[3], laser:[2], tesla:[1], drone:[1], meteor:[1], blackhole:[1], heal:[1], gold:[1], buff:[1], mortar:[2], water:[1], dragon:[1], catapult:[3,1], snowman:[2], ballista:[2], acid:[1], beehive:[1], ninja:[1], harpoon:[1], mushroom:[2], quake:[1], storm:[1], tornado:[1], mirror:[1], lava:[1], mech:[1], sun:[1], totem:[1], phoenix:[1], cosmic:[1] };
          Save.P.trapInv = { trap_spike:2, trap_glue:1, trap_fire:1, trap_bomb:1, trap_frost:1 }; Save.P.roadPieces = 20;
          UI.startGame('endless','grass');
          const check = (where) => {
            const R = Game.R; if (!R || Game.demo) return;
            const grid = Game._grid;
            for (const t of Game.towers) { const c = grid[t.x] && grid[t.x][t.z]; if (!c || c.type !== 'tower' || c.t !== t) bad(where+': Turm '+t.def.id+' passt nicht zum Raster @'+t.x+','+t.z); }
            let gt = 0; for (let x=0;x<GW;x++) for (let z=0;z<GH;z++){ const c=grid[x][z]; if (c && c.type==='tower'){ gt++; if (!Game.towers.includes(c.t)) bad(where+': Geisterturm im Raster @'+x+','+z); } }
            if (gt !== Game.towers.length) bad(where+': Rasterzahl '+gt+' != Türme '+Game.towers.length);
            for (const tr of Game.traps.values()) { const c = grid[tr.x][tr.z]; if (!c || c.type !== 'road') bad(where+': Falle ohne Weg @'+tr.x+','+tr.z); }
            if (!World.findPath(grid)) bad(where+': KEIN WEG');
            for (const id in Save.P.towerInv) for (let pl=0; pl<=9; pl++) if (Game.available('tower', id, pl) < 0) bad(where+': negative Verfügbarkeit '+id+'+'+pl);
            for (const id in Save.P.trapInv) if (Game.available('trap', id) < 0) bad(where+': negative Fallen '+id);
            if (!(R.coins >= 0) || !isFinite(R.coins)) bad(where+': Münzen '+R.coins);
            if (!isFinite(R.lives)) bad(where+': Leben '+R.lives);
            if (Save.P.roadPieces < 0) bad(where+': Wegstücke '+Save.P.roadPieces);
            for (const e of Game.enemies) { if (!isFinite(e.pos.x) || !isFinite(e.pos.z) || !isFinite(e.hp)) { bad(where+': Gegner NaN '+e.def.id); break; } }
            for (const w of R.waves.values()) if (w.alive < 0 || w.queued < 0 || w.alive > w.total + 5) bad(where+': Wellenzähler '+JSON.stringify(w));
            if (Game._floats > 30) bad(where+': zu viele Floattexte');
            try { JSON.parse(JSON.stringify(Save.P)); } catch (e) { bad(where+': Speichern kaputt'); }
          };
          const acts = {
            buildTower(){ const ids = Object.keys(Save.P.towerInv); const id = pick(ids); const pl = Math.floor(rnd()*3); Game.setBuild({kind:'tower', id, plus: pl}); Game.tap(tileToWorld(Math.floor(rnd()*(GW+2))-1, Math.floor(rnd()*(GH+2))-1)); if (rnd()<0.7) Game.confirmPlace(); else if (rnd()<0.5) Game.cancelPending(); if (rnd()<0.5) Game.setBuild(null); },
            buildTrap(){ Game.setBuild({kind:'trap', id: pick(TRAPS).id}); const t = pick(Game.route ? Game.route.tiles : [[3,3]]); Game.tap(tileToWorld(t[0], t[1])); Game.setBuild(null); },
            road(){ Game.setBuild({kind:'road', id: pick(ROADS).id}); let x = Math.floor(rnd()*GW), z = Math.floor(rnd()*GH); for (let k=0;k<6;k++){ Game.paint(tileToWorld(x,z)); x += Math.floor(rnd()*3)-1; z += Math.floor(rnd()*3)-1; } Game.paintEnd(tileToWorld(x,z), false); Game.setBuild(null); },
            erase(){ Game.setBuild({kind:'erase', id:'erase'}); for (let k=0;k<4;k++) Game.tap(tileToWorld(Math.floor(rnd()*GW), Math.floor(rnd()*GH))); Game.setBuild(null); },
            deco(){ Game.R.coins += 50; Game.setBuild({kind:'deco', id: pick(DECOS.filter(d=>!d.shop)).id}); Game.tap(tileToWorld(Math.floor(rnd()*GW), Math.floor(rnd()*GH))); Game.confirmPlace(); Game.setBuild(null); },
            sell(){ if (Game.towers.length) Game.sell(pick(Game.towers)); },
            move(){ if (!Game.towers.length) return; Game.startMove(pick(Game.towers)); Game.tap(tileToWorld(Math.floor(rnd()*GW), Math.floor(rnd()*GH))); Game.confirmPlace(); Game.setBuild(null); },
            fuse(){ const ids = Object.keys(Save.P.towerInv); const id = pick(ids); for (let pl=0; pl<9; pl++) if (Save.inv(id,pl) >= 3) { Game.fuse(id, pl); break; } },
            select(){ if (Game.towers.length) { const t = pick(Game.towers); Game.select(t); const b = document.querySelector('[data-tp=tg]'); if (b) b.click(); } },
            wave(){ Game.startWave(rnd()<0.5); },
            sim(){ for (let i=0;i<Math.floor(rnd()*400);i++) Game.update(0.05, performance.now()/1000); },
            speed(){ document.getElementById('speedBtn').click(); },
            pause(){ document.getElementById('pauseBtn').click(); if (rnd()<0.8 && Game.R.paused) document.getElementById('pauseBtn').click(); },
            modal(){ const a = pick(['inventory','shop','quests','settings','stats','achievements','pause']); UI.closeModal(); document.querySelector(`#hud [data-act=${a}]`)?.click(); const tb = document.querySelectorAll('#modalBody .tabs button'); if (tb.length) pick([...tb]).click(); const inv = document.querySelectorAll('[data-inv]'); if (inv.length) { pick([...inv]).click(); document.getElementById('fuseBtn')?.click(); } UI.closeModal(); },
            tabs(){ document.body.classList.add('build-open'); const t = document.querySelectorAll('#bbTabs [data-tab]'); pick([...t]).click(); const it = document.querySelectorAll('#bbItems .item'); if (it.length) pick([...it]).click(); },
            buyRoads(){ Game.R.coins += 200; Game.buyRoadPieces(rnd()<0.5?1:5); },
            boss(){ if (Game.R.phase === 'build') { Game.R.wave = Math.floor(rnd()*6)*5 + 4; Game.startWave(false); for (let i=0;i<3000 && Game.R.phase==='wave' && !Game.R.paused;i++) Game.update(0.05, i*0.05); const ok = document.getElementById('rlOk'); setTimeout(()=>{},0); } },
            menuAndBack(){ UI.goMenu(); UI.Tut.stop(); document.querySelector('#mainmenu [data-act=play]').click(); },
            die(){ Game.R.lives = 1; for (let i=0;i<3000 && !Game.R.over;i++) Game.update(0.05, i*0.05); if (Game.R.over) { document.querySelector('[data-pick]')?.click(); document.getElementById('rsRetry')?.click(); } },
            player(){ Player.pos.x += (rnd()-0.5)*4; Player.jump(); Player.update(0.1, new Set(['w']), rnd()*6); },
            escape(){ window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); },
            bossEsc(){ if (Game.R.phase === 'build') { Game.R.wave = 4; Game.startWave(false); for (let i=0;i<3000 && Game.R.phase==='wave' && !Game.R.paused;i++) Game.update(0.05, i*0.05); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); UI.closeModal(); } },
            camera(){ CamCtl.rotate(rnd()); CamCtl.zoom(0.7 + rnd()*0.6); if (rnd()<0.2) UI.closeModal(); },
          };
          const names = Object.keys(acts);
          const weights = { bossEsc: 0.5, sim: 6, buildTower: 4, road: 3, wave: 3, erase: 2, sell: 2, fuse: 2, tabs: 2, boss: 0.6, die: 0.3, menuAndBack: 0.4, modal: 1 };
          const pool = []; names.forEach(n => { for (let i=0;i<(weights[n]||1)*10;i++) pool.push(n); });
          for (let r = 0; r < rounds; r++) {
            const a = pick(pool); counts[a] = (counts[a]||0)+1;
            // offene Belohnungsfenster schließen
            const rl = document.getElementById('rlOk') || document.getElementById('rlPlace'); if (rl && rnd() < 0.9) { await new Promise(r => setTimeout(r, 4500)); rl.click(); }
            if (Game.R && Game.R.over) { document.querySelector('[data-pick]')?.click(); document.getElementById('rsRetry')?.click(); }
            try { acts[a](); } catch (e) { bad('FEHLER in '+a+': '+e.message+' '+(e.stack||'').split('\\n').slice(0,3).join(' | ')); }
            try { check(a); } catch (e) { bad('Check-Fehler nach '+a+': '+e.message); }
            if (r % 200 === 0) await new Promise(r => setTimeout(r, 30));
          }
          return { problems, counts, wave: Game.R && Game.R.wave, towers: Game.towers.length };
        }''', [SEED, ROUNDS])
        print(json.dumps(res, ensure_ascii=False, indent=1)[:4000])
        print('PAGE ERRORS:', errs[:15])
        await b.close()
asyncio.run(main())
