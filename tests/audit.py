# Prüft alle sichtbaren Knöpfe: im Bild? verdeckt? groß genug? Danach echte Tipps auf Schließen-Knöpfe.
import asyncio, sys, json
from playwright.async_api import async_playwright
URL='file:///home/claude/new/index.html'
CHECK = r'''(scope)=>{
  const root=document.querySelector(scope)||document; const out=[];
  const els=[...root.querySelectorAll('button,.btn,[data-act],[data-tab],[data-tool],[data-tp],.item,.sbtn,.cbtn,select,input')];
  for(const e of els){
    const b=e.getBoundingClientRect(); if(b.width<1||b.height<1) continue;
    const cs=getComputedStyle(e); if(cs.visibility==='hidden'||cs.pointerEvents==='none') continue;
    // nur, was im sichtbaren Bereich seines Scroll-Containers liegt
    let p=e.parentElement, clipped=false; while(p&&p!==document.body){ const s=getComputedStyle(p); if(/(auto|scroll|hidden)/.test(s.overflow+s.overflowY+s.overflowX)){ const r=p.getBoundingClientRect(); if(b.bottom<r.top+2||b.top>r.bottom-2||b.right<r.left+2||b.left>r.right-2){clipped=true;break;} } p=p.parentElement; }
    if(clipped) continue;
    const name=(e.id?'#'+e.id:'')+'.'+String(e.className).split(' ')[0]+' "'+(e.textContent||e.title||'').trim().slice(0,22)+'"';
    const iss=[];
    if(b.left<0||b.top<0||b.right>innerWidth+1||b.bottom>innerHeight+1) iss.push('ragt aus Bild');
    const pts=[[b.left+b.width/2,b.top+b.height/2]];
    let hit=0; for(const [x,y] of pts){ if(x<0||y<0||x>innerWidth||y>innerHeight) continue; const h=document.elementFromPoint(x,y); if(h&&(e.contains(h)||h.contains(e))) hit++; else iss.push('verdeckt von '+(h?(h.id?'#'+h.id:'')+'.'+String(h.className).split(' ')[0]:'nichts')); }
    if(Math.min(b.width,b.height)<24 && e.tagName!=='INPUT') iss.push('klein '+Math.round(b.width)+'x'+Math.round(b.height));
    if(iss.length) out.push(name+': '+iss.join(', '));
  }
  return out;
}'''
async def main(vw, vh, label, mobile):
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx = await b.new_context(viewport={'width':vw,'height':vh}, device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(2500)
    await pg.evaluate("""()=>{Save.P.tutorialDone=true; Save.P.towerInv={crossbow:[5,2],cannon:[4,1],ice:[3],catapult:[1],phoenix:[1]}; Save.P.trapInv={spike:2}; Save.P.coins=500; UI.goMenu();}""")
    await pg.wait_for_timeout(600)
    cdp = await ctx.new_cdp_session(pg)
    async def tap(sel):
      c = await pg.evaluate('''s=>{const e=[...document.querySelectorAll(s)].find(e=>e.getBoundingClientRect().width>0); if(!e) return null; const b=e.getBoundingClientRect(); return [b.left+b.width/2,b.top+b.height/2]}''', sel)
      if not c: return False
      if mobile:
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':c[0],'y':c[1]}]}); await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
      else: await pg.mouse.click(*c)
      await pg.wait_for_timeout(450); return True
    modal_open = "!document.querySelector('#modal').classList.contains('hidden')"
    report = {}
    async def check(name, scope='body'):
      r = await pg.evaluate(CHECK, scope); report[name]=r
      await pg.screenshot(path=f'au_{label}_{name}.png')
    await check('menu')
    for act in ['inventory','towers','shop','quests','settings','collection','achievements','share']:
      ok = await tap(f'#menu [data-act={act}], .menu [data-act={act}]') or await tap(f'[data-act={act}]')
      await check('m_'+act, '#modal')
      await tap('#modalClose')
      if await pg.evaluate(modal_open): report['m_'+act].append('!!! ✕ schließt NICHT')
    # Spiel
    await tap('[data-act=play]'); await pg.wait_for_timeout(1500)
    if await pg.evaluate(modal_open): await check('playdialog','#modal'); await tap('#modal .btn.play, #pdStart')
    await pg.wait_for_timeout(1200)
    await pg.evaluate("UI.closeModal && UI.closeModal(true)")
    await check('hud')
    if mobile: await tap('#buildToggle')
    for tab in ['towers','traps','roads','decos','tools']:
      await tap(f'#bbTabs [data-tab={tab}]'); await check('bb_'+tab, '#buildBar')
    await tap('#bbTabs [data-tab=towers]')
    await pg.evaluate("Game.setBuild({kind:'tower',id:'crossbow',plus:0}); const s=Game.bestSpot(3); Game.choose(s.x,s.z)")
    await pg.wait_for_timeout(300); await check('confirm')
    await tap('#placeConfirm .ok')
    await pg.evaluate("Game.setBuild({kind:'tower',id:'cannon',plus:0}); const s=Game.bestSpot(3); Game.choose(s.x,s.z); Game.confirmPlace(); Game.setBuild(null); Game.select(Game.towers[0])")
    await pg.wait_for_timeout(400); await check('towerpanel')
    await tap('[data-tp=close]')
    if await pg.evaluate("!!Game.selected"): report['towerpanel'].append('!!! Panel schließt NICHT')
    for act in ['settings','inventory','quests','stats','achievements']:
      await tap(f'.sbtn[data-act={act}]'); await check('g_'+act, '#modal')
      await tap('#modalClose')
      if await pg.evaluate(modal_open): report['g_'+act].append('!!! ✕ schließt NICHT')
    await tap('.sbtn[data-act=pause]'); await check('pause','#modal')
    await tap('#pmResume')
    if await pg.evaluate(modal_open): report['pause'].append('!!! Weiter schließt NICHT')
    # Welle
    await tap('#waveBtn'); await pg.wait_for_timeout(1500); await check('wave')
    for k,v in report.items():
      if v: print(label, k, '\n   ' + '\n   '.join(v[:14]) + (f'\n   … +{len(v)-14}' if len(v)>14 else ''))
    print(label, 'errs', errs)
    await b.close()
args = sys.argv[1:] or ['land']
cfg = {'land':(844,390,True),'small':(667,375,True),'port':(390,844,True),'pc':(1280,720,False),'tab':(1180,820,True)}
for a in args: asyncio.run(main(cfg[a][0], cfg[a][1], a, cfg[a][2]))
