import { SvgRejectedError, looksLikeSvg, sanitizeSvg, svgSize } from './svg-sanitize';

describe('sanitizeSvg', () => {
  it('keeps drawings, gradients, styles and local references', () => {
    const svg = '<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
      + '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24">'
      + '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient>'
      + '<style><![CDATA[.a{fill:url(#g)} .b > .c{stroke:#000}]]></style></defs>'
      + '<path class="a" d="M0 0h24v24H0z" fill="url(#g)"/><use xlink:href="#p"/><text x="1">A &amp; B</text></svg>';
    expect(sanitizeSvg(svg)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24">'
      + '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"></stop></linearGradient>'
      + '<style>.a{fill:url(#g)} .b &gt; .c{stroke:#000}</style></defs>'
      + '<path class="a" d="M0 0h24v24H0z" fill="url(#g)"></path><use xlink:href="#p"></use><text x="1">A &amp; B</text></svg>',
    );
  });

  it('removes scripts, handlers, outside references and editor metadata', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" onload="alert(1)">'
      + '<script>alert(1)</script><foreignObject><div>x</div></foreignObject>'
      + '<a href="javascript:alert(1)"><circle r="1" onclick="alert(1)"/></a>'
      + '<image href="https://evil.test/x.png"/><image href="data:image/png;base64,AAAA"/>'
      + '<use href="https://evil.test/s.svg#x"/><rect style="fill:url(https://evil.test/t)" fill="url( https://evil.test )"/>'
      + '<animate attributeName="href" to="javascript:alert(1)"/><set attributeName="onload"/>'
      + '<style>@import url(https://evil.test/a.css); .x{background:url("https://evil.test/b")}</style>'
      + '<g xmlns="http://www.w3.org/1999/xhtml" inkscape:label="layer"><rect width="java&#x09;script:1"/></g>'
      + '<sodipodi:namedview/></svg>',
    );
    expect(out).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"></circle>'
      + '<image></image><image href="data:image/png;base64,AAAA"></image><use></use><rect></rect>'
      + '<style> .x{background:none}</style><g><rect></rect></g></svg>',
    );
  });

  it('refuses entity declarations and files that are not SVG', () => {
    expect(() => sanitizeSvg('<!DOCTYPE svg [<!ENTITY a "x">]><svg>&a;</svg>')).toThrow(SvgRejectedError);
    expect(() => sanitizeSvg('<html><svg/></html>')).toThrow(/root element/);
    expect(() => sanitizeSvg('<svg><g></svg>')).toThrow(SvgRejectedError);
  });
});

describe('looksLikeSvg / svgSize', () => {
  it('recognises SVG documents', () => {
    expect(looksLikeSvg('﻿<?xml version="1.0"?>\n<!-- Generator: Illustrator -->\n<!DOCTYPE svg PUBLIC "a" "b">\n<svg viewBox="0 0 1 1">')).toBe(true);
    expect(looksLikeSvg(Buffer.from('<svg>'))).toBe(true);
    expect(looksLikeSvg('<html><svg>')).toBe(false);
    expect(looksLikeSvg('<svgfoo>')).toBe(false);
  });

  it('reads the size from width/height or the viewBox', () => {
    expect(svgSize('<svg xmlns="x" width="48px" height="32">')).toEqual({ width: 48, height: 32 });
    expect(svgSize('<svg viewBox="0 0 120.4 60">')).toEqual({ width: 120, height: 60 });
    expect(svgSize('<svg width="100%">')).toEqual({ width: undefined, height: undefined });
  });
});
