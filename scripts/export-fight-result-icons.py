"""Export the original loader.fla result icons to SVG for the React HUD.

Reads the committed XFL shapes; no bitmap tracing or hand-drawn replacements.
Run from the repository root with python3 scripts/export-fight-result-icons.py.
"""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

SOURCE = Path('assets/sources/fla/LIBRARY')
DEST = Path('apps/electrobun/public/themes/classic/assets/fight/result')
NS = {'x': 'http://ns.adobe.com/xfl/2008/'}

def matrix(node):
    m = node.find('x:matrix/x:Matrix', NS)
    attrs = m.attrib if m is not None else {}
    return 'matrix(' + ' '.join(attrs.get(k, default) for k, default in
        [('a','1'),('b','0'),('c','0'),('d','1'),('tx','0'),('ty','0')]) + ')'

def export(symbol, viewbox):
    defs = []
    def paint(style):
        solid = style.find('.//x:SolidColor', NS)
        if solid is not None:
            return solid.get('color', '#000000'), solid.get('alpha', '1')
        grad = style.find('x:LinearGradient', NS)
        if grad is None:
            raise ValueError('Unsupported fill')
        name = 'g' + str(len(defs))
        stops = ''.join(f'<stop offset="{e.get("ratio")}" stop-color="{e.get("color")}" stop-opacity="{e.get("alpha", "1")}"/>' for e in grad.findall('x:GradientEntry', NS))
        defs.append(f'<linearGradient id="{name}" gradientUnits="userSpaceOnUse" x1="-819.2" x2="819.2" gradientTransform="{matrix(grad)}">{stops}</linearGradient>')
        return f'url(#{name})', '1'
    def render(number):
        root = ET.parse(SOURCE / f'Symbol {number}.xml').getroot()
        output = []
        for layer in reversed(root.findall('x:timeline/x:DOMTimeline/x:layers/x:DOMLayer', NS)):
            for el in layer.findall('x:frames/x:DOMFrame[@index="0"]/x:elements/*', NS):
                if el.tag.endswith('DOMSymbolInstance'):
                    output.append(f'<g transform="{matrix(el)}">{render(el.get("libraryItemName").split()[-1])}</g>')
                elif el.tag.endswith('DOMShape'):
                    fills = {f.get('index'): paint(f) for f in el.findall('x:fills/x:FillStyle', NS)}
                    strokes = {s.get('index'): (paint(s), s.find('x:SolidStroke', NS).get('weight', '1')) for s in el.findall('x:strokes/x:StrokeStyle', NS)}
                    for edge in el.findall('x:edges/x:Edge', NS):
                        raw = edge.get('edges')
                        tokens = re.findall(r'[!|\[]|-?\d+(?:\.\d+)?', raw)
                        commands = {'!':'M', '|':'L', '[':'Q'}
                        d = ' '.join(commands[t] if t in commands else str(float(t)/20) for t in tokens)
                        fill, alpha = fills.get(edge.get('fillStyle1'), fills.get(edge.get('fillStyle0'), ('none','1')))
                        (stroke, sa), width = strokes.get(edge.get('strokeStyle'), (('none','1'),'0'))
                        output.append(f'<path d="{d}" fill="{fill}" fill-opacity="{alpha}" stroke="{stroke}" stroke-opacity="{sa}" stroke-width="{width}" stroke-linejoin="round"/>')
                else:
                    raise ValueError(el.tag)
        return ''.join(output)
    body = render(symbol)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}"><!-- Original loader.fla Symbol {symbol}. See scripts/export-fight-result-icons.py. --><defs>{"".join(defs)}</defs>{body}</svg>\n'

DEST.mkdir(parents=True, exist_ok=True)
for name, symbol, box in [('all-drops',1617,'-125 -115 250 270'), ('dead',1840,'-260 -300 240 310'), ('challenge-failed',2161,'0 0 38.7 38.7'), ('challenge-succeeded',2159,'0 0 38.7 38.7')]:
    (DEST / f'{name}.svg').write_text(export(symbol, box))
