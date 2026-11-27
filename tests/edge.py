# Sonderfälle rund ums Platzieren – alles per echtem Finger-Tipp
import asyncio, sys
from playwright.async_api import async_playwright
URL='file:///home/claude/new/index.html'
async def run(p, vw, vh, label):
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx = await b.new_context(viewport={'width':vw,'height':vh}, device_scale_factor=1, is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); errs=[]; fails=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(2500)
    await pg.evaluate("""()=>{Save.P.tutorialDone=true; Save.P.towerInv={crossbow:[4],cannon:[2],ice:[1]}; Save.P.trapInv={trap_spike:2}; UI.goMenu();}""")
    await pg.wait_for_timeout(400)
    cdp = await ctx.new_cdp_session(pg)
    E = pg.evaluate
    async def center(sel):
        return await E('''s=>{const e=[...document.querySelectorAll(s)].find(e=>{const b=e.getBoundingClientRect(); return b.width>0&&getComputedStyle(e).visibility!=='hidden'}); if(!e) return null; const b=e.getBoundingClientRect(); return [b.left+b.width/2,b.top+b.height/2]}''', sel)
    async def touch(pts):
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':pts[0][0],'y':pts[0][1]}]})
        for q in pts[1:]:
            await cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':q[0],'y':q[1]}]}); await pg.wait_for_timeout(18)
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); await pg.wait_for_timeout(350)
    async def tap(sel):
        c = await center(sel)
        if not c: fails.append('nicht sichtbar: '+sel); return False
        await touch([c]); return True
    # Bildschirmpunkt eines Feldes (Client-Koordinaten, auch im gedrehten Hochformat)
    async def tilept(x,z):
        return await E(f'''()=>{{const v=tileToWorld({x},{z}).clone(); v.project(World.camera); const lx=(v.x*0.5+0.5)*View.w, ly=(-v.y*0.5+0.5)*View.h;
          return View.portrait? [innerWidth-ly, lx] : [lx,ly]}}''')
    async def freeSpot(excl=()):
        return await E('''(ex)=>{const g=Game._grid; const bar=document.querySelector('#buildBar').getBoundingClientRect(); let best=null;
          for(let x=0;x<GW;x++)for(let z=0;z<GH;z++){ if(g[x][z]||ex.includes(x+','+z)) continue; const v=tileToWorld(x,z).clone(); v.project(World.camera); const lx=(v.x*0.5+0.5)*View.w, ly=(-v.y*0.5+0.5)*View.h;
          if(lx>View.w*0.45&&lx<View.w*0.7&&ly>View.h*0.3&&ly<View.h*0.65){best=[x,z];break;} } return best}''', list(excl))
    def check(cond, msg):
        if not cond: fails.append(msg)
    await tap('[data-act=play]'); await pg.wait_for_timeout(1500)
    print(label, 'hochformat', await E('View.portrait'))
    await tap('#buildToggle')
    # A: antippen + Feld + ✓, Vorschau danach weg
    s1 = await freeSpot()
    await tap('#bbItems .item[data-id=crossbow]')
    await touch([await tilept(*s1)])
    check(await E('JSON.stringify(Game.pending)') == f'{{"x":{s1[0]},"z":{s1[1]}}}', f'A: pending falsch {await E("JSON.stringify(Game.pending)")} statt {s1}')
    await tap('#placeConfirm .ok')
    check(await E('Game.towers.length') == 1, 'A: Turm nicht gesetzt')
    check(await E('!!(Game._ghost && Game._ghost.visible)') == False, 'A: grüne Vorschau bleibt über gesetztem Turm stehen')
    # B: wählen, dann Baumenü schließen -> ✓ verschwindet
    s2 = await freeSpot([f'{s1[0]},{s1[1]}'])
    await touch([await tilept(*s2)])
    check(await E('!!Game.pending'), 'B: pending fehlt')
    await tap('.bb-close')
    check(await E('Game.pending') is None, 'B: pending bleibt nach Schließen')
    check(await E("document.querySelector('#placeConfirm').classList.contains('hidden')"), 'B: ✓ bleibt sichtbar')
    # C: wählen, Welle starten, dann ✓
    await tap('#buildToggle'); await tap('#bbItems .item[data-id=crossbow]')
    await touch([await tilept(*s2)])
    await tap('#waveBtn'); await pg.wait_for_timeout(400)
    if await E('!!Game.pending'): await tap('#placeConfirm .ok')
    check(await E('Game.towers.length') == 2, f'C: Platzieren während Welle klappt nicht ({await E("Game.towers.length")})')
    # D: Kamera drehen während ✓ offen -> Knopf folgt
    s3 = await freeSpot([f'{s1[0]},{s1[1]}', f'{s2[0]},{s2[1]}'])
    if await E('!Game.buildSel'): await tap('#bbItems .item[data-id=crossbow]')
    await touch([await tilept(*s3)])
    c0 = await center('#placeConfirm .ok')
    await E("CamCtl.rotate(Math.PI/2)"); await pg.wait_for_timeout(1200)
    c1 = await center('#placeConfirm .ok')
    check(c0 and c1 and abs(c0[0]-c1[0])+abs(c0[1]-c1[1]) > 15, f'D: ✓ folgt Kamera nicht {c0} {c1}')
    print(label,'D vor ✓', await E('JSON.stringify(Game.pending)'), await center('#placeConfirm .ok'), s3, 'sel', await E('JSON.stringify(Game.buildSel)'))
    await tap('#placeConfirm .ok')
    check(await E('Game.towers.length') == 3, f'D: Turm 3 nicht gesetzt ({await E("Game.towers.length")}) pending {await E("JSON.stringify(Game.pending)")}')
    await E("CamCtl.rotate(-Math.PI/2)"); await pg.wait_for_timeout(800)
    # E: Inventar öffnen während ✓ offen
    await tap('#bbItems .item[data-id=cannon]')
    s4 = await freeSpot([f'{a},{c}' for a,c in [s1,s2,s3]])
    await touch([await tilept(*s4)])
    await tap('.sbtn[data-act=inventory]'); await pg.wait_for_timeout(300)
    check(await E("!document.querySelector('#modal').classList.contains('hidden')"), 'E: Inventar öffnet nicht')
    await tap('#modalClose')
    if await E('!!Game.pending'): await tap('#placeConfirm .ok')
    check(await E('Game.towers.length') == 4, 'E: nach Inventar kein Platzieren')
    # F: Falle direkt auf den Weg (ohne ✓)
    await E("Game.setBuild(null)"); await tap('#bbTabs [data-tab=traps]')
    print(label,'F', await E("document.body.classList.contains('build-open')"), await E("document.querySelector('#bbTabs .on')?.dataset.tab"), await E("JSON.stringify(Save.P.trapInv)"), (await E("document.querySelector('#bbItems').innerText"))[:120].replace('\n',' '))
    await tap('#bbItems .item[data-id=trap_spike]')
    rt = None
    for cand in await E("Game.route.tiles.slice(3).filter(([x,z])=>!Game.traps.has(x+','+z))"):
        q = await tilept(*cand)
        if await E(f"(()=>{{const h=document.elementFromPoint({q[0]},{q[1]}); return !!h && h.id==='c'}})()"): rt = cand; break
    pt = await tilept(*rt)
    await E("window.FL=[]; for(const t of ['pointerdown','pointerup','pointercancel']) window.addEventListener(t,e=>FL.push(t+':'+e.pointerId+':'+(e.target.id||e.target.className)),true); const o=Game.paintStart; CamCtl.handlers.paintStart=p=>{FL.push('paintStart '+(p?p.x.toFixed(1)+','+p.z.toFixed(1):'null')); Game.paintStart(p)}; CamCtl.handlers.paintEnd=(p,t)=>{FL.push('paintEnd '+t); Game.paintEnd(p,t)}; CamCtl.handlers.tap=p=>{FL.push('tap'); Game.tap(p)}")
    print(label,'F Feld', rt, pt, await E(f"(()=>{{const h=document.elementFromPoint({pt[0]},{pt[1]}); return h.tagName+'#'+h.id+'.'+h.className}})()"), 'sel', await E('JSON.stringify(Game.buildSel)'))
    await touch([await tilept(*rt)])
    if await E('Game.traps.size') != 1:
        print(label,'F Toasts', await E("[...document.querySelectorAll('#toasts > *')].map(t=>t.textContent).join(' | ')"), 'grid', await E(f"JSON.stringify(Game._grid[{rt[0]}][{rt[1]}])"), 'phase', await E('Game.R.phase'), 'avail', await E("Game.available('trap','trap_spike')"), 'FL', await E('FL'))
        await E(f"Game.tap(tileToWorld({rt[0]},{rt[1]}))"); print(label,'F direkt', await E('Game.traps.size'), await E("[...document.querySelectorAll('#toasts > *')].map(t=>t.textContent).join(' | ')"))
    check(await E('Game.traps.size') == 1, 'F: Falle nicht gelegt')
    # G: Turm verschieben per Panel
    await E("Game.setBuild(null)"); await tap('#bbTabs [data-tab=towers]'); await pg.wait_for_timeout(300)
    if not await E('Game.towers.length'): print(label,'keine Türme – Abbruch', fails); await b.close(); return
    t0 = await E('[Game.towers[0].x, Game.towers[0].z]')
    await tap('.bb-close')
    await touch([await tilept(*t0)]); await pg.wait_for_timeout(300)
    check(await E('!!Game.selected'), 'G: Turm lässt sich nicht antippen')
    await tap('[data-tp=move]')
    print(label,'G nach move', await E('JSON.stringify(Game.buildSel && Game.buildSel.kind)'))
    s5 = await freeSpot([f'{a},{c}' for a,c in [s1,s2,s3,s4]])
    await touch([await tilept(*s5)])
    print(label,'G pending', await E('JSON.stringify(Game.pending)'), s5, await center('#placeConfirm .ok'))
    await tap('#placeConfirm .ok')
    print(label,'G danach sel', await E('Game.selected ? [Game.selected.x, Game.selected.z] : null'), 'build', await E('JSON.stringify(Game.buildSel && Game.buildSel.kind)'))
    t1 = await E('Game.selected ? [Game.selected.x, Game.selected.z] : null')
    check(t1 == list(s5), f'G: Verschieben fehlgeschlagen {t0} -> {t1}, Ziel {s5}')
    await tap('[data-tp=close]')
    # H: Ziehen ins Feld + ✓
    await tap('#buildToggle'); await pg.wait_for_timeout(200)
    n = await E('Game.towers.length')
    s6 = await freeSpot([f'{a},{c}' for a,c in [s1,s2,s3,s4,s5]])
    src = await center('#bbItems .item:not(.locked)'); dst = await tilept(*s6)
    await touch([src] + [[src[0]+(dst[0]-src[0])*i/10, src[1]+(dst[1]-src[1])*i/10] for i in range(1,11)])
    check(await E('JSON.stringify(Game.pending)') == f'{{"x":{s6[0]},"z":{s6[1]}}}', f'H: Ziehen landet falsch {await E("JSON.stringify(Game.pending)")} statt {s6}')
    print(label,'H', await E('JSON.stringify(Game.pending)'), await center('#placeConfirm .ok'))
    await tap('#placeConfirm .ok')
    check(await E('Game.towers.length') == n+1, 'H: gezogener Turm nicht gesetzt')
    # I: viele Auswahlwechsel -> Speicher
    m0 = await E('World.renderer.info.programs.length')
    await E("for(let i=0;i<60;i++){ Game.setBuild({kind:'tower',id:i%2?'ice':'cannon',plus:0}); Game.hover(tileToWorld(3,3)); } Game.setBuild(null)")
    await pg.wait_for_timeout(300)
    await E("(()=>{let n=0; const seen=new Set(); World.scene.traverse(o=>{ if(o.material&&!seen.has(o.material)){seen.add(o.material);n++} }); window._mats=n})()")
    print(label, 'Materialien in Szene', await E('_mats'), 'Programme', m0, '->', await E('World.renderer.info.programs.length'))
    await pg.screenshot(path=f'edge_{label}.png')
    print(label, 'FEHLER:' if fails else 'alles ok', *fails, sep='\n   ')
    print(label, 'errs', errs); await b.close()
async def main():
    async with async_playwright() as p:
        for a in (sys.argv[1:] or ['land','port']):
            await run(p, *( (844,390) if a=='land' else (390,844) if a=='port' else (667,375) ), a)
asyncio.run(main())
