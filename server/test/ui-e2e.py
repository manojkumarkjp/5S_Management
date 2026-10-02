import asyncio, json
from playwright.async_api import async_playwright
H='http://localhost:3100/'
async def login(pg, uid):
    if pg.url.startswith('http://localhost') and await pg.query_selector('#content'):
        await pg.evaluate("Acts.logout()"); await pg.wait_for_timeout(500)
    else:
        await pg.goto(H)
    await pg.wait_for_selector('#login-id')
    await pg.fill('#login-id', uid); await pg.fill('#login-pw', 'Demo@123'); await pg.click('#loginForm button[type=submit]'); await pg.wait_for_selector('#content h1'); await pg.wait_for_timeout(400)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width':420,'height':860}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs=[]
        await pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)
        await login(pg, 'APS1020')
        await pg.screenshot(path='server/test/shots/m-myaudits.png', full_page=True)
        wo = await pg.evaluate("Domain.wos().filter(w=>w.auditor==='APS1020' && FS.WO_OPEN.includes(w.status)).sort((a,b)=>a.plannedDate.localeCompare(b.plannedDate)).map(w=>[w.id,w.zone,w.checksheetId,w.status])")
        print('open WOs', wo)
        wid = wo[0][0]
        await pg.click(f'[data-act="exec-open"][data-id="{wid}"]'); await pg.wait_for_selector('.qcard')
        await pg.screenshot(path='server/test/shots/m-exec.png', full_page=False)
        for si in range(5):
            qids = await pg.evaluate("[...document.querySelectorAll('.qcard')].map(e=>e.dataset.qid)")
            for i,q in enumerate(qids):
                v = '2' if (si==1 and i==0) else ('4' if i%2==0 else '5')
                await pg.click(f'#q-{q} [data-act="ex-rate"][data-v="{v}"]')
                if v=='2':
                    await pg.fill(f'#q-{q} [data-fbox] textarea[name="desc"]', 'Labels missing on bins 3-4 (e2e test)')
                    await pg.fill(f'#q-{q} [data-fbox] input[name="action"]', 'Relabel bins with laminated labels')
                    await pg.screenshot(path='server/test/shots/m-finding.png', full_page=False)
                need = await pg.evaluate(f"(Domain.questionsOf(Exec.wo()).find(x=>x.qid==='{q}')||{{}}).photo")
                if need:
                    async with pg.expect_file_chooser() as fc:
                        await pg.click(f'#q-{q} [data-act="ex-photo"]:not([data-cap])')
                    ch = await fc.value; await ch.set_files('test/photo.jpg'); await pg.wait_for_timeout(700)
            nxt = await pg.query_selector('.exec-foot .btn.primary')
            await nxt.click(); await pg.wait_for_timeout(300)
        await pg.screenshot(path='server/test/shots/m-review.png', full_page=False)
        iss = await pg.evaluate("Exec.issues(Exec.wo())"); print('issues', iss)
        await pg.click('.modal [data-mi="1"]'); await pg.wait_for_timeout(1500)
        w = await pg.evaluate(f"(w=>({{s:w.status,score:w.score&&w.score.overall.pct,locked:w.locked,dur:w.duration}}))(Store.get('workorders','{wid}'))"); print('after submit', w)
        fs = await pg.evaluate(f"Store.all('findings').filter(f=>f.woId==='{wid}').map(f=>[f.id,f.no,f.severity,f.responsible])"); print('findings', fs)
        acts = await pg.evaluate(f"Store.all('actions').filter(a=>a.woId==='{wid}').map(a=>[a.id,a.no,a.responsible,a.status])"); print('actions', acts)
        await pg.screenshot(path='server/test/shots/m-wo-after.png', full_page=True)
        # approvals
        lead = await pg.evaluate(f"Store.get('workorders','{wid}').leader"); apu = await pg.evaluate(f"Store.get('workorders','{wid}').apu")
        fac = await pg.evaluate(f"Domain.facilitatorOf('{apu}')")
        await pg.set_viewport_size({'width':1300,'height':900})
        for who in [lead, fac]:
            await login(pg, who); await pg.evaluate(f"App.go('wo',{{id:'{wid}'}})"); await pg.wait_for_timeout(300)
            btn = await pg.query_selector('[data-act="wo-approve"]'); print('approve btn for', who, bool(btn))
            if btn: await btn.click(); await pg.click('.modal [data-mi="1"]'); await pg.wait_for_timeout(500)
        print('status', await pg.evaluate(f"Store.get('workorders','{wid}').status"))
        # action workflow by responsible
        aid, ano, resp, _ = acts[0]
        await login(pg, resp); await pg.evaluate(f"App.go('action',{{id:'{aid}'}})"); await pg.wait_for_timeout(300)
        async with pg.expect_file_chooser() as fc:
            await pg.click('[data-act="act-evidence"]')
        ch = await fc.value; await ch.set_files('test/photo.jpg'); await pg.wait_for_timeout(800)
        await pg.click('[data-act="act-update"]'); await pg.wait_for_selector('.modal')
        await pg.fill('.modal textarea[name="ca"]', 'Relabelled all bins'); await pg.fill('.modal textarea[name="rootCause"]', 'Paper labels faded')
        await pg.check('.modal input[name="submit"]'); await pg.click('.modal [data-mi="1"]'); await pg.wait_for_timeout(600)
        print('action after submit', await pg.evaluate(f"Store.get('actions','{aid}').status"))
        # verify: reject then resubmit then accept
        await login(pg, fac); await pg.evaluate(f"App.go('action',{{id:'{aid}'}})"); await pg.wait_for_timeout(300)
        await pg.screenshot(path='server/test/shots/verify.png', full_page=True)
        await pg.click('[data-act="act-reject"]'); await pg.fill('.modal textarea[name="reason"]', 'Use standard laminated labels'); await pg.click('.modal [data-mi="1"]'); await pg.wait_for_timeout(500)
        print('after reject', await pg.evaluate(f"(a=>[a.status,a.revisedTarget])(Store.get('actions','{aid}'))"))
        await login(pg, resp); await pg.evaluate(f"App.go('action',{{id:'{aid}'}})"); await pg.wait_for_timeout(300)
        await pg.click('[data-act="act-update"]'); await pg.check('.modal input[name="submit"]'); await pg.click('.modal [data-mi="1"]'); await pg.wait_for_timeout(600)
        await login(pg, fac); await pg.evaluate(f"App.go('action',{{id:'{aid}'}})"); await pg.wait_for_timeout(300)
        await pg.click('[data-act="act-accept"]'); await pg.click('.modal [data-mi="1"]'); await pg.wait_for_timeout(600)
        print('final action', await pg.evaluate(f"Store.get('actions','{aid}').status"), 'finding', await pg.evaluate(f"Domain.findSt(Store.get('findings','{fs[0][0]}'))"))
        # reports (browser downloads)
        import os
        os.makedirs('server/test/out', exist_ok=True); got=[]
        async def grab(js=None, click=None):
            async with pg.expect_download(timeout=20000) as dl:
                if js: await pg.evaluate(js)
                else: await pg.click(click)
            d = await dl.value; path='server/test/out/'+d.suggested_filename; await d.save_as(path); got.append((d.suggested_filename, os.path.getsize(path)))
        await grab(f"Reports.auditPDF(Store.get('workorders','{wid}'))"); await grab(f"Reports.auditXLSX(Store.get('workorders','{wid}'))"); await grab(f"Reports.scorecardPDF(Store.get('workorders','{wid}'))")
        await pg.evaluate("App.ui.repKey='mgmt'; App.go('reports',{})"); await pg.wait_for_selector('[data-act="rep-pdf"]')
        await grab(click='[data-act="rep-pdf"]'); await grab(click='[data-act="rep-xlsx"]'); await grab(click='[data-act="rep-csv"]')
        print('downloads', got); assert all(sz>60 for _,sz in got)
        # session survives a reload (httpOnly cookie) and data is the server copy
        await pg.reload(); await pg.wait_for_selector('#content h1'); print('after reload user', await pg.evaluate("App.user && App.user.id"), 'wo status', await pg.evaluate(f"Store.get('workorders','{wid}').status"))
        logs = await pg.evaluate("Pages.trail.rows().slice(0,12).map(e=>e.user+' | '+e.module+' | '+e.record+' | '+e.action)"); print('\n'.join(logs))
        print('notifs', await pg.evaluate("Store.all('notifications').length"))
        print('ERRORS', errs[:20])
        assert not errs, errs
        await b.close()
asyncio.run(main())
