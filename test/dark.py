import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, vp in [('dark-desk',{'width':1300,'height':900}),('dark-mob',{'width':400,'height':850})]:
            pg = await b.new_page(viewport=vp, color_scheme='dark'); errs=[]
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
            await pg.goto('file:///home/claude/fives/test/harness.html'); await pg.wait_for_selector('[data-act="demo-login"]')
            await pg.click('[data-act="demo-login"][data-id="APS1002"]'); await pg.wait_for_selector('#content h1'); await pg.wait_for_timeout(600)
            await pg.screenshot(path=f'test/shots/{name}.png', full_page=False)
            sw = await pg.evaluate("document.documentElement.scrollWidth > window.innerWidth")
            print(name, 'hscroll', sw, errs)
            for pgname in ['org','car','analytics','planner','reports']:
                await pg.evaluate(f"App.go('{pgname}',{{}})"); await pg.wait_for_timeout(200)
                print(' ', pgname, 'hscroll', await pg.evaluate("document.documentElement.scrollWidth > window.innerWidth"))
            await pg.close()
        await b.close()
asyncio.run(main())
