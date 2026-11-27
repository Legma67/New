import asyncio, sys
from playwright.async_api import async_playwright
URL='file:///home/claude/new/index.html'
async def run(p, vw, vh, label):
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx = await b.new_context(viewport={'width':vw,'height':vh}, device_scale_factor=1, is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); E=pg.evaluate
    await pg.goto(URL); await pg.wait_for_timeout(2500)
    await E("""()=>{Save.P.tutorialDone=true; const inv={}; for(const t of TOWERS) inv[t.id]=[1]; Save.P.towerInv=inv; UI.goMenu();}""")
    await pg.wait_for_timeout(400)
    cdp = await ctx.new_cdp_session(pg)
    async def swipe(a, bb, steps=12):
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':a[0],'y':a[1]}]})
        for i in range(1,steps+1):
            await cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':a[0]+(bb[0]-a[0])*i/steps,'y':a[1]+(bb[1]-a[1])*i/steps}]}); await pg.wait_for_timeout(16)
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); await pg.wait_for_timeout(500)
    # lokale Richtung "nach oben wischen" (Inhalt nach unten scrollen) in Bildschirmkoordinaten
    async def rect(sel): return await E(f"(()=>{{const b=document.querySelector('{sel}').getBoundingClientRect(); return [b.left,b.top,b.width,b.height]}})()")
    port = await E('View.portrait')
    def up(r):   # Mitte, 120px lokale Bewegung nach oben
        cx, cy = r[0]+r[2]/2, r[1]+r[3]/2
        return ([cx,cy],[cx+120,cy]) if port else ([cx,cy],[cx,cy-120])
    # Modal scrollen
    await E("document.querySelector('[data-act=towers]').click()"); await pg.wait_for_timeout(600)
    r = await rect('#modalBody'); a,bb = up(r)
    s0 = await E("document.querySelector('#modalBody').scrollTop"); await swipe(a,bb)
    print(label,'Fenster scrollt:', s0, '->', await E("document.querySelector('#modalBody').scrollTop"))
    await E("UI.closeModal(true)")
    await E("document.querySelector('[data-act=play]').click()"); await pg.wait_for_timeout(1500)
    await E("document.querySelector('#buildToggle').click()"); await pg.wait_for_timeout(300)
    r = await rect('#bbItems'); a,bb = up(r)
    s0 = await E("document.querySelector('#bbItems').scrollTop"); await swipe(a,bb)
    print(label,'Baumenü scrollt:', s0, '->', await E("document.querySelector('#bbItems').scrollTop"), 'pending', await E('JSON.stringify(Game.pending)'))
    await b.close()
async def main():
    async with async_playwright() as p:
        await run(p, 844, 390, 'land'); await run(p, 390, 844, 'port')
asyncio.run(main())
