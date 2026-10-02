import asyncio, sys, json
from playwright.async_api import async_playwright
PAGES = [('dashboard',{}),('analytics',{}),('org',{}),('zone',{'id':'CU-P03'}),('planner',{}),('wos',{}),('wo',{'id':'AUD-000140'}),('car',{}),('finding',{'id':'FND-000150'}),('action',{'id':'ACT-000140'}),('improvement',{'id':'IMP-000001'}),('reports',{}),('master',{}),('users',{}),('trail',{}),('scorecard',{'id':'AUD-000140'})]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':1400,'height':900})
        errs=[]
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
        await pg.goto('file:///home/claude/fives/test/harness.html')
        await pg.wait_for_selector('[data-act="demo-login"]', timeout=15000)
        await pg.screenshot(path='shots/login.png')
        await pg.click('[data-act="demo-login"][data-id="APS1001"]')
        await pg.wait_for_selector('#content h1', timeout=10000)
        await pg.wait_for_timeout(800)
        await pg.screenshot(path='shots/dashboard.png', full_page=True)
        for name, params in PAGES:
            await pg.evaluate(f"App.go({json.dumps(name)}, {json.dumps(params)})")
            await pg.wait_for_timeout(250)
            h = await pg.evaluate("(document.querySelector('#content h1')||{}).textContent || document.querySelector('#content').textContent.slice(0,120)")
            print(name, '->', h[:80].strip())
            await pg.screenshot(path=f'shots/{name}.png', full_page=True)
        # all tabs on tabbed pages
        for page, key, tabs in [('analytics','anTab',['heat','trend','aging','depts','auditors','duration']),('car','carTab',['findings','actions','verify','repeat','kaizen','gallery']),('master','mTab',['org','zones','checksheets','scoring','timelines','lists','workflow','notif','system']),('users','uTab',['users','roles']),('planner','plTab',['calendar','schedules']),('wos','wosTab',['mine','open','progress','review','overdue','done','cancelled','all'])]:
            for t in tabs:
                await pg.evaluate(f"App.ui[{json.dumps(key)}]={json.dumps(t)}; App.go({json.dumps(page)},{{}})")
                await pg.wait_for_timeout(150)
                if page in ('analytics','car','master'): await pg.screenshot(path=f'shots/{page}-{t}.png', full_page=True)
        for v in ['week','day','list']:
            await pg.evaluate(f"App.ui.plTab='calendar'; App.ui.calView='{v}'; App.go('planner',{{}})")
            await pg.wait_for_timeout(150)
        reps = await pg.evaluate("Object.keys(Reports.defs)")
        for r in reps:
            await pg.evaluate(f"App.go('reports',{{r:'{r}'}})")
            await pg.wait_for_timeout(120)
        print('ERRORS', len(errs)); [print(' ', e[:300]) for e in errs[:30]]
        await b.close()
asyncio.run(main())
