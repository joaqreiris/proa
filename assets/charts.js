// Proa — dibujar series y perfiles, en SVG y a mano.
//
// Sin librería: Proa no carga nada de ningún CDN, y para dos formas —una línea
// en el tiempo y una recta con sus puntos— traer trescientos kilobytes sería
// pagar mucho por poco. SVG además escala solo y se imprime bien.
//
// Regla de la casa para cualquier gráfico de acá: TODA etiqueta nombra un
// valor que el dibujo alcanza. Un eje que dice 50 cuando la línea llega a 43
// es peor que no tener eje.
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Números redondos para los extremos del eje: 43.7 se lee peor que 45, y el
  // que mira un gráfico no está buscando el decimal.
  function bordes(min, max, decimales) {
    if (min === max) { const d = Math.abs(min || 1) * 0.1; min -= d; max += d; }
    const paso = Math.pow(10, Math.floor(Math.log10(max - min)) - (decimales > 0 ? 1 : 0)) || 1;
    return { lo: Math.floor(min / paso) * paso, hi: Math.ceil(max / paso) * paso };
  }

  const fmt = (v, d) => Number(v).toFixed(d);

  // ── Una serie en el tiempo ────────────────────────────────────────────────
  // puntos: [{ x (número, normalmente días), y, rotulo }]
  // El eje Y se dibuja SIEMPRE con lo alto arriba, incluso cuando menos es
  // mejor: si un sprint que mejora se dibujara bajando, habría que explicar el
  // gráfico cada vez, y un gráfico que hay que explicar no sirve.
  function serie(puntos, opts) {
    const o = opts || {};
    const dec = o.decimales != null ? o.decimales : 1;
    const masEsMejor = o.masEsMejor !== false;
    // El viewBox va en proporción parecida a la del hueco real (ancho contra
    // alto). Con uno cuadrado y preserveAspectRatio="none", la escala en X es
    // varias veces la de Y y los puntos salen ovalados.
    const W = 1000, H = 108, padL = 6, padTop = 10, padBot = 24;
    if (!puntos || puntos.length < 2) return '';

    const ys = puntos.map(p => p.y);
    const { lo, hi } = bordes(Math.min(...ys), Math.max(...ys), dec);
    const rango = (hi - lo) || 1;
    const xs = puntos.map(p => p.x);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const anchoX = (x1 - x0) || 1;

    const px = (x) => padL + ((x - x0) / anchoX) * (W - padL);
    // Con «menos es mejor» se invierte el eje, así el dibujo siempre sube
    // cuando el atleta mejora y la lectura no cambia de significado.
    const py = (y) => {
      const n = (y - lo) / rango;
      const arriba = masEsMejor ? n : 1 - n;
      return H - padBot - arriba * (H - padBot - padTop);
    };

    const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(2)},${py(p.y).toFixed(2)}`).join(' ');
    const area = `${d} L${px(x1).toFixed(2)},${H - padBot} L${px(x0).toFixed(2)},${H - padBot} Z`;

    // La referencia, cuando hay: el nivel propio del atleta, punteado.
    const base = (o.basal != null && o.basal >= lo && o.basal <= hi)
      ? `<line class="ch-base" x1="0" y1="${py(o.basal).toFixed(2)}" x2="${W}" y2="${py(o.basal).toFixed(2)}"/>` : '';

    const marcas = puntos.map((p, i) => {
      const ultimo = i === puntos.length - 1;
      return `<circle class="ch-dot${ultimo ? ' is-last' : ''}" cx="${px(p.x).toFixed(2)}" cy="${py(p.y).toFixed(2)}" r="${ultimo ? 7 : 4.5}">
        <title>${esc(p.rotulo || '')}</title></circle>`;
    }).join('');

    return `<div class="ch">
      <svg class="ch-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
           aria-label="${esc(o.titulo || '')}">
        <path class="ch-area" d="${area}"/>
        ${base}
        <path class="ch-line" d="${d}"/>
        ${marcas}
      </svg>
      <div class="ch-axis">
        <span>${esc(o.desde || '')}</span>
        <span class="ch-range">${esc(fmt(masEsMejor ? hi : lo, dec))} – ${esc(fmt(masEsMejor ? lo : hi, dec))}${o.unidad ? ' ' + esc(o.unidad) : ''}</span>
        <span>${esc(o.hasta || '')}</span>
      </div>
    </div>`;
  }

  // ── El perfil fuerza-velocidad ────────────────────────────────────────────
  // La recta que une F0 con V0, y encima los puntos del sprint modelado. Es el
  // dibujo que hace evidente de qué lado está el atleta: mucha fuerza y poco
  // techo, o al revés.
  function fuerzaVelocidad(p, opts) {
    const o = opts || {};
    if (!p || !(p.F0 > 0) || !(p.V0 > 0)) return '';
    const W = 100, H = 62, padL = 15, padBot = 13, padTop = 6;
    const masa = o.masa || 1;
    const F0r = p.F0 / masa, V0 = p.V0;

    const px = (v) => padL + (v / V0) * (W - padL - 2);
    const py = (f) => H - padBot - (f / F0r) * (H - padBot - padTop);

    // Un punto cada tanto, no los mil del cálculo: dibujarlos todos tapa la
    // recta y no agrega nada.
    const cada = Math.max(1, Math.floor(p.vs.length / 26));
    const nube = p.vs.map((v, i) => (i % cada ? '' :
      `<circle class="ch-fv-dot" cx="${px(v).toFixed(2)}" cy="${py(p.fhs[i] / masa).toFixed(2)}" r="1.1"/>`)).join('');

    return `<div class="ch">
      <svg class="ch-svg is-fv" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.titulo || '')}">
        <line class="ch-ax" x1="${padL}" y1="${padTop}" x2="${padL}" y2="${H - padBot}"/>
        <line class="ch-ax" x1="${padL}" y1="${H - padBot}" x2="${W - 1}" y2="${H - padBot}"/>
        ${nube}
        <line class="ch-line" x1="${px(0)}" y1="${py(F0r).toFixed(2)}" x2="${px(V0).toFixed(2)}" y2="${py(0)}"/>
        <circle class="ch-dot is-last" cx="${px(0)}" cy="${py(F0r).toFixed(2)}" r="2.2"/>
        <circle class="ch-dot is-last" cx="${px(V0).toFixed(2)}" cy="${py(0)}" r="2.2"/>
        <text class="ch-t" x="1" y="${(py(F0r) + 1.6).toFixed(2)}">${esc(fmt(F0r, 1))}</text>
        <text class="ch-t" x="1" y="${H - padBot + 1.6}">0</text>
        <text class="ch-t is-end" x="${(px(V0) - 1).toFixed(2)}" y="${H - 3}">${esc(fmt(V0, 1))}</text>
        <text class="ch-t" x="${padL}" y="${H - 3}">0</text>
      </svg>
      <div class="ch-axis">
        <span>${esc(o.ejeY || 'N/kg')}</span>
        <span class="ch-range">${esc(o.pie || '')}</span>
        <span>${esc(o.ejeX || 'm/s')}</span>
      </div>
    </div>`;
  }

  window.prChart = { serie, fuerzaVelocidad };
})();
