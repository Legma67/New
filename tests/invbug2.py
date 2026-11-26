import asyncio
from playwright.async_api import async_playwright
URL='file:///home/claude/new/index.html'
VIS="(s=>{const e=document.querySelector(s); if(!e) return 'none'; const b=e.getBoundingClientRect(); return getComputedStyle(e).display!=='none' && b.width>0 ? 'shown':'hidden'})"
async def run(p, vw, vh, label, mobile=True, rich=False):
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx = await b.new_context(viewport={'width':vw,'height':vh}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(2500)
    if rich:
        await pg.evaluate("""()=>{Save.P.tutorialDone=true; Save.P.towerInv={crossbow:[5,2],cannon:[4,1],ice:[3],laser:[2],tesla:[1],catapult:[3,1],snowman:[2],ballista:[2],acid:[1],beehive:[1],ninja:[1],harpoon:[1],mushroom:[2],quake:[1],storm:[1],phoenix:[1],cosmic:[1]}; Save.P.trapInv={spike:2}; Save.save&&Save.save(); UI.goMenu();}""")
        await pg.wait_for_timeout(500)
        await pg.click('[data-act=play]', force=True); await pg.wait_for_timeout(1500)
        print(label,'screen',await pg.evaluate('UI.screen'))
    cdp = await ctx.new_cdp_session(pg)
    async def tapel(sel):
        r = await pg.evaluate('''s=>{const e=[...document.querySelectorAll(s)].find(e=>e.getBoundingClientRect().width>0); if(!e) return null; const b=e.getBoundingClientRect(); const x=b.left+b.width/2,y=b.top+b.height/2; const h=document.elementFromPoint(x,y); return [Math.round(x),Math.round(y),h&&e.contains(h)]}''', sel)
        if not r: print(label,'NICHT SICHTBAR',sel); return
        if mobile:
            await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':r[0],'y':r[1]}]})
            await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        else: await pg.mouse.click(r[0],r[1])
        await pg.wait_for_timeout(350)
        print(label,'tap',sel,r,'bar',await pg.evaluate(VIS+"('#buildBar')"),'toggle',await pg.evaluate(VIS+"('#buildToggle')"))
    await pg.screenshot(path=f'ib2_{label}_0.png')
    if not rich: await tapel('#tut .btn')
    await tapel('.bb-close')
    await tapel('#buildToggle')
    await pg.screenshot(path=f'ib2_{label}_1.png')
    if rich:
        await tapel('#bbTabs [data-tab=traps]'); await tapel('#bbTabs [data-tab=roads]'); await tapel('#bbTabs [data-tab=towers]')
    await tapel('#bbItems .item:not(.locked)')
    print(label,'sel',await pg.evaluate('JSON.stringify(Game.buildSel)'))
    await pg.screenshot(path=f'ib2_{label}_2.png')
    await tapel('.bb-close')
    print(label, 'errs', errs); await b.close()
async def main():
    async with async_playwright() as p:
        await run(p, 844, 390, 'land')
        await run(p, 390, 844, 'port')
        await run(p, 844, 390, 'landR', rich=True)
        await run(p, 1280, 720, 'pcR', mobile=False, rich=True)
asyncio.run(main())
