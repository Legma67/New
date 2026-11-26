import asyncio
from playwright.async_api import async_playwright
URL='file:///home/claude/new/index.html'
async def run(p, vw, vh, label, mobile=True):
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx = await b.new_context(viewport={'width':vw,'height':vh}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(2500)
    await pg.evaluate("""()=>{Save.P.tutorialDone=true; Save.P.towerInv={crossbow:[3],cannon:[2],catapult:[1]}; Save.P.trapInv={spike:2}; UI.goMenu();}""")
    await pg.wait_for_timeout(400); await pg.click('[data-act=play]', force=True); await pg.wait_for_timeout(1500)
    cdp = await ctx.new_cdp_session(pg)
    async def center(sel):
        return await pg.evaluate('''s=>{const e=[...document.querySelectorAll(s)].find(e=>e.getBoundingClientRect().width>0); if(!e) return null; const b=e.getBoundingClientRect(); return [b.left+b.width/2,b.top+b.height/2]}''', sel)
    async def tile(x,z):
        return await pg.evaluate(f'''()=>{{const v=tileToWorld({x},{z}).clone(); v.project(World.camera); return [(v.x*0.5+0.5)*innerWidth, (-v.y*0.5+0.5)*innerHeight]}}''')
    async def drag(a, bpt, steps=12):
        if mobile:
            await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':a[0],'y':a[1]}]})
            for i in range(1,steps+1):
                x=a[0]+(bpt[0]-a[0])*i/steps; y=a[1]+(bpt[1]-a[1])*i/steps
                await cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y}]}); await pg.wait_for_timeout(20)
            await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        else:
            await pg.mouse.move(*a); await pg.mouse.down()
            for i in range(1,steps+1): await pg.mouse.move(a[0]+(bpt[0]-a[0])*i/steps, a[1]+(bpt[1]-a[1])*i/steps); await pg.wait_for_timeout(20)
            await pg.mouse.up()
        await pg.wait_for_timeout(400)
    async def tapc(sel):
        c = await center(sel)
        if not c: print(label,'NICHT SICHTBAR',sel); return
        if mobile:
            await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':c[0],'y':c[1]}]}); await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        else: await pg.mouse.click(*c)
        await pg.wait_for_timeout(300)
    if mobile:
        c = await center('#buildToggle'); await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':c[0],'y':c[1]}]}); await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); await pg.wait_for_timeout(300)
    # freies Feld suchen, das sichtbar und rechts vom Menü liegt
    spots = await pg.evaluate('''()=>{const g=Game._grid,out=[]; for(let x=0;x<GW;x++)for(let z=0;z<GH;z++){ if(g[x][z]) continue; const v=tileToWorld(x,z).clone(); v.project(World.camera); const sx=(v.x*0.5+0.5)*innerWidth, sy=(-v.y*0.5+0.5)*innerHeight; const r=document.querySelector('#buildBar').getBoundingClientRect(); if(sx>r.right+40 && sx<innerWidth-260 && sy>120 && sy<innerHeight-120) out.push([x,z,sx,sy]);} return out}''')
    print(label,'spots',len(spots))
    await pg.evaluate("window.PLOG=[]; for (const t of ['pointerdown','pointerup','pointercancel']) document.addEventListener(t,e=>PLOG.push(t+e.pointerId+e.pointerType),true)")
    await pg.evaluate("window.PCLOG=[]; const o=Game.ui.pendingChanged; Game.ui.pendingChanged=p=>{PCLOG.push(JSON.stringify(p)+' '+new Error().stack.split('\\n').slice(2,7).map(x=>x.trim().replace('file:///home/claude/new/index.html','')).join(' | ')); o(p)}")
    t0 = await pg.evaluate('Game.towers.length')
    await drag(await center('#bbItems .item[data-id=crossbow]'), spots[0][2:])
    print(label,'nach Ziehen (vor ✓) Türme', t0,'->', await pg.evaluate('Game.towers.length'), 'pending', await pg.evaluate('JSON.stringify(Game.pending)'))
    await pg.screenshot(path=f'drag_{label}_confirm.png')
    print(label,'OK-Knopf', await center('#placeConfirm .ok'), await pg.evaluate("(()=>{const b=document.querySelector('#placeConfirm .ok').getBoundingClientRect(); const h=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2); return h.className+' / '+h.parentElement.className})()"))
    await tapc('#placeConfirm .ok')
    print(label,'nach ✓ Türme', await pg.evaluate('Game.towers.length'), 'pending', await pg.evaluate('JSON.stringify(Game.pending)'), 'sel', await pg.evaluate('JSON.stringify(Game.buildSel)'))

    print(label,'confirm-el', await pg.evaluate("document.querySelector('#placeConfirm').className"), await center('#placeConfirm .no'))
    await tapc('#placeConfirm .no')
    print(label,'nach ✕ Türme (soll gleich bleiben)', await pg.evaluate('Game.towers.length'), 'pending', await pg.evaluate('JSON.stringify(Game.pending)'))
    await drag(await center('#bbItems .item[data-id=cannon]'), spots[len(spots)//2][2:])
    print(label,'Kanone pending', await pg.evaluate('JSON.stringify(Game.pending)'), await center('#placeConfirm .ok'))
    await tapc('#placeConfirm .ok')
    print(label,'zweiter Turm', await pg.evaluate('Game.towers.length'))
    await pg.screenshot(path=f'drag_{label}.png')
    # in Leiste zurückziehen = abbrechen ohne Platzieren
    n = await pg.evaluate('Game.towers.length')
    c = await center('#bbItems .item[data-id=catapult]'); await drag(c, [c[0]+40, c[1]], 4)
    print(label,'abgebrochen', n, await pg.evaluate('Game.towers.length'))
    # Tippen + Tippen geht weiter
    await pg.evaluate("Game.setBuild(null)")
    if mobile:
        joy = await pg.evaluate("(()=>{const e=document.querySelector('#joy'); const b=e.getBoundingClientRect(); return [getComputedStyle(e).display, b.left+b.width/2, b.top+b.height/2]})()")
        print(label,'joystick bei offenem Menü', joy[0])
        p0 = await pg.evaluate('[Player.pos.x,Player.pos.z]')
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':joy[1],'y':joy[2]}]})
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':joy[1],'y':joy[2]-50}]})
        await pg.wait_for_timeout(900)
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        p1 = await pg.evaluate('[Player.pos.x,Player.pos.z]')
        print(label,'gelaufen', [round(v,2) for v in p0], '->', [round(v,2) for v in p1])
        await pg.screenshot(path=f'drag_{label}_walk.png')
    print(label,'errs',errs); await b.close()
async def main():
    async with async_playwright() as p:
        await run(p, 844, 390, 'mob')
        await run(p, 1280, 720, 'pc', mobile=False)
asyncio.run(main())
