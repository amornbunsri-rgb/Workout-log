import json, threading, http.server, socketserver, functools, os, re
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__))
APP=os.environ.get('APP',os.path.dirname(HERE))   # the folder with the app files
BACKUP=os.environ.get('WORKOUT_BACKUP',os.path.join(HERE,'sample-backup.json'))  # a backup export to test against
PORT=8765
_SRV=None
_PW=None
def serve():
    global _SRV
    if _SRV: return _SRV
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory=APP)
    h.log_message=lambda *a,**k: None
    class S(socketserver.TCPServer): allow_reuse_address=True
    s=S(('127.0.0.1',PORT),h); threading.Thread(target=s.serve_forever,daemon=True).start(); _SRV=s; return s
def seed_script(seed=True):
    b=json.load(open(BACKUP))
    keys={
     'workout-log-data-v1': b['data'],
     'workout-log-lists-v3': {'categories':b['lists']['categories'],'exercises':b['lists']['exercises'],'colors':b['lists']['colors']},
     'workout-log-blocks-v1': {'blocks':b['blocks']['names'],'blockRefs':b['blocks']['refs'],'hiddenBlocks':[],'planBlocks':[]},
     'workout-log-equipment-v1': {'equipment':b['equipment']['list'],'colors':b['equipment']['colors']},
     'workout-log-bodyweight-v1': b['bodyweight'],
     'workout-log-skills-v1': b['skills'],
     'workout-log-mode-v1':'light'}
    js="if(!localStorage.getItem('__seeded')){"+";".join("localStorage.setItem(%s,%s)"%(json.dumps(k),json.dumps(json.dumps(v))) for k,v in keys.items())+";localStorage.setItem('__seeded','1');}"
    return js if seed else ""
def _pw():
    global _PW
    if not _PW: _PW=sync_playwright().start()
    return _PW
class Run:
    def __init__(s, seed=True):
        s.errors=[]; s.srv=serve(); s.pw=_pw(); s.br=s.pw.chromium.launch()
        s.ctx=s.br.new_context(viewport={'width':430,'height':900}); s.ctx.service_workers  # no SW registered on http://127.0.0.1? it is allowed; block it
        s.ctx.route(re.compile(r'https?://(?!127\.0\.0\.1).*'), lambda r: r.fulfill(status=200, body='', content_type='text/css' if r.request.url.endswith('.css') else 'application/javascript'))
        if seed: s.ctx.add_init_script(seed_script())
        s.page=s.ctx.new_page()
        s.page.on('pageerror', lambda e: s.errors.append('PAGEERROR '+str(e)))
        s.page.on('console', lambda m: s.errors.append('CONSOLE '+m.text) if m.type=='error' else None)
    def open(s, path='workout-log-standalone.html'):
        s.page.goto('http://127.0.0.1:%d/%s'%(PORT,path)); s.page.wait_for_timeout(800); return s.page
    def close(s): s.br.close()
