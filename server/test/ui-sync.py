# Two browsers + offline: live sync between users, offline queue, flush on reconnect.
import asyncio, subprocess
from playwright.async_api import async_playwright
H='http://localhost:3100/'
async def login(pg, uid):
    await pg.goto(H); await pg.wait_for_selector('#login-id'); await pg.fill('#login-id', uid); await pg.fill('#login-pw', 'Demo@123'); await pg.click('#loginForm button[type=submit]'); await pg.wait_for_selector('#content h1'); await pg.wait_for_timeout(500)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs=[]
        ca = await b.new_context(viewport={'width':420,'height':860}, is_mobile=True, has_touch=True); cb = await b.new_context(viewport={'width':1300,'height':900})
        A = await ca.new_page(); B = await cb.new_page()
        for pg in (A,B):
            await pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text and 'ERR_' not in m.text else None)
        await login(A, 'APS1020'); await login(B, 'APS1010')
        wid = await A.evaluate("Domain.wos().filter(w=>w.auditor==='APS1020' && ['Assigned','Accepted','In Progress'].includes(w.status)).sort((a,b)=>a.plannedDate.localeCompare(b.plannedDate))[0].id")
        print('work order', wid)
        await A.click(f'[data-act="exec-open"][data-id="{wid}"]'); await A.wait_for_selector('.qcard')
        q = await A.evaluate("document.querySelector('.qcard').dataset.qid")
        await ca.set_offline(True); await A.wait_for_timeout(300)
        await A.click(f'#q-{q} [data-act="ex-rate"][data-v="4"]'); await A.wait_for_timeout(2500)
        print('offline: pending writes', await A.evaluate("Store.outbox.length"), '| chrome says', (await A.inner_text('.top, header, body'))[:0] or 'n/a')
        await ca.set_offline(False); await A.evaluate("window.dispatchEvent(new Event('online'))"); await A.wait_for_timeout(500); await A.evaluate("Store.flush()"); await A.wait_for_timeout(3000)
        print('after reconnect: pending writes', await A.evaluate("Store.outbox.length"))
        row = subprocess.run(['psql','postgres://fives:fives@localhost/fives','-Atc',f"select value from audit_responses where work_order_id='{wid}' and qid='{q}'"],capture_output=True,text=True).stdout.strip(); print('database has response', repr(row))
        assert row == '4'
        await B.wait_for_timeout(7000)
        seen = await B.evaluate(f"((Store.get('workorders','{wid}')||{{}}).responses||{{}})['{q}']&&Store.get('workorders','{wid}').responses['{q}'].v"); print('facilitator browser sees', seen); assert str(seen)=='4'
        # facilitator edit shows up for the auditor
        await B.evaluate("Store.patch('zones','CU-P01',{desc:'Edited by facilitator in browser B'})"); await A.wait_for_timeout(8000)
        print('auditor browser sees', await A.evaluate("Store.get('zones','CU-P01').desc"))
        assert 'browser B' in await A.evaluate("Store.get('zones','CU-P01').desc")
        # server refusal reverts the optimistic change (auditor may not edit zones)
        await A.evaluate("Store.patch('zones','CU-P01',{desc:'Hacked by auditor'})"); await A.wait_for_timeout(1500)
        print('after refusal local copy =', await A.evaluate("Store.get('zones','CU-P01').desc"))
        assert 'Hacked' not in await A.evaluate("Store.get('zones','CU-P01').desc")
        print('ERRORS', errs); assert not errs
        await b.close()
asyncio.run(main())
