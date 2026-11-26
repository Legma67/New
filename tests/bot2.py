import asyncio, json
from playwright.async_api import async_playwright
import os
INDEX = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width':800,'height':450}); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(INDEX); await pg.wait_for_timeout(2500)
        out = await pg.evaluate('''async () => {
          UI.Tut.stop(); Save.reset(); Save.P.tutorialDone = true;
          // Belohnungs-Modal im Bot überspringen
          Game.ui.bossReward = (rw) => { if (rw.kind==='tower') pending.push(rw.id); if (rw.kind==='trap') pendingT.push(rw.id); };
          let pending = [], pendingT = [];
          const runs = [];
          for (let run = 0; run < 3; run++) {
            Save.P.run = null; UI.startGame('endless','grass'); Game.ui.bossReward = (rw) => { if (rw.kind==='tower') pending.push(rw.id); if (rw.kind==='trap') pendingT.push(rw.id); };
            Game.ui.gameOver = () => {};
            const R = Game.R; R.hold = false;
            const placeAll = () => {
              for (const id of Object.keys(Save.P.towerInv)) for (let pl=9; pl>=0; pl--) while (Game.available('tower', id, pl) > 0) { const sp = Game.bestSpot(TOWER_BY_ID[id].range || 3); if (!sp) return; Game.setBuild({kind:'tower', id, plus: pl}); Game.tap(tileToWorld(sp.x, sp.z)); Game.setBuild(null); }
              for (const id of Object.keys(Save.P.trapInv)) while (Game.available('trap', id) > 0) { const t = Game.route.tiles.find(([x,z],i)=> i>3 && !Game.traps.has(x+','+z)); if(!t) break; Game.setBuild({kind:'trap', id}); Game.tap(tileToWorld(t[0], t[1])); Game.setBuild(null); }
            };
            const upg = () => { for (const id of Object.keys(Save.P.towerInv)) for (let pl=0; pl<9; pl++) while (Save.inv(id,pl) >= 3) Game.fuse(id,pl); };
            const log = [];
            let n = 0;
            while (!R.over && R.wave < 120 && n < 400000) {
              placeAll(); upg();
              if (R.phase === 'build') Game.startWave(false);
              for (let k=0;k<200 && !R.over;k++){ Game.update(0.05, n*0.05); n++; }
              if (R.wave % 10 === 0 && R.phase==='build' && log[log.length-1]?.[0] !== R.wave) log.push([R.wave, R.lives, Game.towers.length, Game.towers.map(t=>t.plus).join('')]);
            }
            runs.push({ died: R.wave, log, inv: JSON.stringify(Save.P.towerInv) });
            // Belohnung nach dem Tod: ersten Vorschlag nehmen
            if (Save.P.pendingPicks) Save.P.pendingPicks.forEach((p,i)=>{ if(!p.done) Save.choosePick(i, p.options ? p.options[0] : null); });
          }
          return runs;
        }''')
        [print(r["died"], r["log"], r["inv"]) for r in out]; print(errs[:5]); await b.close()
asyncio.run(main())
