import asyncio, json, sys
from playwright.async_api import async_playwright
import os
INDEX = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
MOBILE = len(sys.argv)>1 and sys.argv[1]=='mobile'
PORTRAIT = len(sys.argv)>1 and sys.argv[1]=='portrait'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        if MOBILE: ctx = await b.new_context(viewport={'width':844,'height':390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        elif PORTRAIT: ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        else: ctx = await b.new_context(viewport={'width':1280,'height':720})
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        tag = 'mob' if MOBILE else 'por' if PORTRAIT else 'pc'
        await pg.goto(INDEX); await pg.wait_for_timeout(500)
        await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(3000)
        print('screen', await pg.evaluate("[UI.screen, !!Game.R && Game.R.tutorial, UI.Tut.step]"))
        await pg.screenshot(path=f'/home/claude/tests/t_{tag}_1.png')
        await pg.evaluate("document.getElementById('tutBtn').click()"); await pg.wait_for_timeout(300)
        # laufen
        await pg.evaluate("Player.pos.x += 3"); await pg.wait_for_timeout(500)
        print('step', await pg.evaluate("UI.Tut.step"))
        await pg.screenshot(path=f'/home/claude/tests/t_{tag}_2.png')
        # bauen: Baumenü öffnen falls zu
        await pg.evaluate("if(!document.body.classList.contains('build-open')) document.getElementById('buildToggle').click()")
        await pg.wait_for_timeout(200)
        await pg.evaluate("document.querySelector('#bbItems .item[data-id=crossbow]').click()")
        sp = await pg.evaluate("Game.bestSpot(TOWER_BY_ID.crossbow.range)")
        await pg.evaluate(f"Game.tap(tileToWorld({sp['x']},{sp['z']}))"); await pg.wait_for_timeout(300)
        print('placed at', sp, 'step', await pg.evaluate("UI.Tut.step"), 'towers', await pg.evaluate("Game.towers.length"))
        await pg.wait_for_timeout(500)
        print('after place', await pg.evaluate("[Game.R.wave, Game.R.phase, UI.Tut.step, document.getElementById('waveBtn').classList.contains('hidden')]"))
        await pg.evaluate("document.getElementById('waveBtn').click()"); await pg.wait_for_timeout(300)
        print('wave', await pg.evaluate("[Game.R.wave, Game.R.phase, UI.Tut.step]"))
        await pg.screenshot(path=f'/home/claude/tests/t_{tag}_3.png')
        r = await pg.evaluate('''(()=>{ const log=[]; let n=0; while(UI.Tut.step!=='bosswarn' && n<60000){ Game.update(0.05,n*0.05); n++; if (Game.R.phase==='build' && UI.Tut.step==='next'){ log.push([Game.R.wave, Game.R.lives]); Game.R.skipUntil=0; Game.startWave(false); } } return [Game.R.wave, Game.R.lives, UI.Tut.step, JSON.stringify(log).slice(0,200)];})()''')
        print('before boss', r)
        await pg.screenshot(path=f'/home/claude/tests/t_{tag}_4.png')
        await pg.evaluate("document.getElementById('tutBtn').click()"); await pg.wait_for_timeout(200)
        await pg.evaluate("Game.R.skipUntil=0; Game.startWave(false)")
        r = await pg.evaluate("(()=>{let n=0; while(!Game.R.paused && n<30000){ Game.update(0.05,n*0.05); n++; } return [Game.R.wave, Game.R.lives, JSON.stringify(Save.P.towerInv), Game.R.boss&&Game.R.boss.hp];})()")
        print('boss done', r)
        await pg.wait_for_timeout(2000)
        await pg.screenshot(path=f'/home/claude/tests/t_{tag}_5.png')
        await pg.wait_for_timeout(3000)
        await pg.screenshot(path=f'/home/claude/tests/t_{tag}_6.png')
        await pg.evaluate("document.getElementById('rlPlace').click()"); await pg.wait_for_timeout(300)
        print('step', await pg.evaluate("[UI.Tut.step, JSON.stringify(Game.buildSel && {k:Game.buildSel.kind,id:Game.buildSel.id})]"))
        sp = await pg.evaluate("Game.bestSpot(3.5)")
        await pg.evaluate(f"Game.tap(tileToWorld({sp['x']},{sp['z']}))"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'/home/claude/tests/t_{tag}_7.png')
        await pg.evaluate("document.getElementById('tutBtn').click()"); await pg.wait_for_timeout(300)
        print('done', await pg.evaluate("[Save.P.tutorialDone, Game.R.tutorial, Game.towers.length, Math.round(Game.R.pauseTimer)]"))
        await pg.screenshot(path=f'/home/claude/tests/t_{tag}_8.png')
        print(errs[:10]); await b.close()
asyncio.run(main())
