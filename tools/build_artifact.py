#!/usr/bin/env python3
"""claude.ai 아티팩트용 한 파일 만들기.
사용: python3 tools/build_artifact.py <출력 경로>
index.html의 <!--BODY--> ... <!--/BODY--> 사이를 꺼내고, style.css와 js/*.js를 안에 넣는다.
(아티팩트는 doctype/html/head/body를 자동으로 씌우므로 넣지 않는다)"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
body = html.split('<!--BODY-->')[1].split('<!--/BODY-->')[0]
css = (root / 'style.css').read_text(encoding='utf-8')
css += '\nhtml, body { height: 100%; background: #8fcff5; }\n'

def inline(m):
    src = m.group(1)
    # 아티팩트에선 Supabase 친구 기능 대신 아티팩트 자체 같이 달리기를 씀
    if src.startswith('http') or src in ('js/net-config.js',):
        return ''
    code = (root / src).read_text(encoding='utf-8').replace('</script', '<\\/script')
    return f'<script>\n/* {src} */\n{code}\n</script>'
body = re.sub(r'<script src="([^"]+)"></script>', inline, body)
body = '<script>window.BB = window.BB || {}; window.BB.ARTIFACT = true;</script>\n' + body

out = f'''<title>입으로 하는 운전, 붕붕</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">
<style>
{css}
</style>
{body}
'''
dest = pathlib.Path(sys.argv[1])
dest.write_text(out, encoding='utf-8')
print(dest, len(out.encode('utf-8')), 'bytes')
