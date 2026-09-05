// Proa — husos horarios.
//
// El entrenador y el atleta pueden estar en cualquier parte del mundo. La
// regla que ordena todo esto es una sola:
//
//   UN EVENTO SE GUARDA CON LA HORA DE RELOJ DEL ATLETA.
//
// El entrenamiento de Ana «a las 18:00» es a las 18:00 en Montevideo. No es un
// instante universal disfrazado: es una hora de reloj, la de ella. Si el
// entrenador se muda a Camboya, la sesión de Ana sigue siendo a las 18:00. Si
// en Uruguay empieza el horario de verano, sigue siendo a las 18:00 — porque
// su rutina está atada al reloj de la pared, no al sol.
//
// Por eso `events` guarda `date` + `start_time` y NO un timestamptz, y por eso
// este archivo no convierte nada al guardar. Convierte solo al MOSTRAR, y solo
// donde le sirve a alguien: en la agenda del entrenador, para saber a qué hora
// suya le toca cada cosa.
//
// La conversión se hace con `Intl`, que ya sabe de horarios de verano y de
// husos raros (India a media hora, Nepal a 45 minutos). No hace falta ninguna
// librería.
//
//   prTz.mine()                        el huso de quien está mirando, ahora
//   prTz.valid(tz)                     ¿lo entiende este navegador?
//   prTz.offset(tz, ms)                minutos respecto de UTC en ese instante
//   prTz.toUtc(ymd, hhmm, tz)          hora de reloj de un huso → instante
//   prTz.fromUtc(ms, tz)               instante → hora de reloj de un huso
//   prTz.convert(ymd, hhmm, de, a)     { ymd, hhmm, shift }
//   prTz.nowIn(tz)                     qué hora es ahí ahora mismo
//   prTz.gmt(tz)                       'GMT-3'
//   prTz.city(tz)                      'Montevideo'
//   prTz.label(tz)                     'Montevideo · GMT-3'
//   prTz.list()                        todos los husos, para un selector

(function () {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const ymdOf = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);

  function mine() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch (e) { return 'UTC'; }
  }

  function valid(tz) {
    if (!tz) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; }
    catch (e) { return false; }
  }

  // Las piezas de un instante leídas EN un huso.
  const PARTS = {};
  function fmt(tz) {
    if (!PARTS[tz]) {
      PARTS[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    return PARTS[tz];
  }

  function partsIn(ms, tz) {
    const p = {};
    for (const x of fmt(tz).formatToParts(new Date(ms))) {
      if (x.type !== 'literal') p[x.type] = x.value;
    }
    return {
      y: +p.year, m: +p.month, d: +p.day,
      hh: +p.hour % 24, mm: +p.minute, ss: +p.second
    };
  }

  // Cuántos minutos va ese huso por delante de UTC en ese instante. El truco:
  // se formatea el instante en el huso y se vuelve a leer como si fuera UTC;
  // la diferencia entre los dos es el desfase. Sale gratis el horario de
  // verano, porque `Intl` ya lo tuvo en cuenta al formatear.
  function offset(tz, ms) {
    const p = partsIn(ms, tz);
    const asIfUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    return Math.round((asIfUtc - ms) / 60000);
  }

  const parseYmd = (ymd) => (ymd || '').split('-').map(Number);
  const parseHm  = (hhmm) => {
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    return [h || 0, m || 0];
  };

  // Hora de reloj de un huso → el instante real.
  //
  // Se resuelve en dos pasos porque el desfase depende del instante, y el
  // instante es justo lo que se está buscando: se estima con el desfase de la
  // primera lectura y se corrige si al llegar ahí el desfase era otro (es lo
  // que pasa el día que cambia el horario de verano).
  function toUtc(ymd, hhmm, tz) {
    const [y, m, d] = parseYmd(ymd);
    const [hh, mm] = parseHm(hhmm);
    const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
    const o1 = offset(tz, naive);
    let ms = naive - o1 * 60000;
    const o2 = offset(tz, ms);
    if (o2 !== o1) ms = naive - o2 * 60000;
    return ms;
  }

  function fromUtc(ms, tz) {
    const p = partsIn(ms, tz);
    return { ymd: ymdOf(p.y, p.m, p.d), hhmm: pad(p.hh) + ':' + pad(p.mm) };
  }

  // Las 18:00 del martes en Montevideo, ¿qué son en Phnom Penh?
  // `shift` dice si cae en otro día: +1 mañana, -1 ayer. Es lo que evita el
  // malentendido clásico de «te llamo el martes a las ocho».
  function convert(ymd, hhmm, from, to) {
    if (!valid(from) || !valid(to) || from === to) {
      return { ymd, hhmm: (hhmm || '').slice(0, 5), shift: 0 };
    }
    const ms = toUtc(ymd, hhmm, from);
    const r = fromUtc(ms, to);
    return { ymd: r.ymd, hhmm: r.hhmm, shift: dayDiff(ymd, r.ymd) };
  }

  function dayDiff(a, b) {
    const [ay, am, ad] = parseYmd(a), [by, bm, bd] = parseYmd(b);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  }

  function nowIn(tz) {
    if (!valid(tz)) tz = 'UTC';
    return fromUtc(Date.now(), tz);
  }

  // 'GMT-3', 'GMT+5:30'. Se escribe a mano en vez de pedirle el nombre corto a
  // `Intl` porque los nombres cortos vienen en inglés y cambian según el
  // idioma; el número no se discute.
  function gmt(tz, ms) {
    if (!valid(tz)) return '';
    const o = offset(tz, ms == null ? Date.now() : ms);
    const sign = o < 0 ? '-' : '+';
    const a = Math.abs(o);
    const h = Math.floor(a / 60), m = a % 60;
    return 'GMT' + sign + h + (m ? ':' + pad(m) : '');
  }

  // 'America/Montevideo' → 'Montevideo'. El nombre del huso es lo único que
  // hay: no existe un catálogo de ciudades traducidas.
  function city(tz) {
    if (!tz) return '';
    const last = tz.split('/').pop() || tz;
    return last.replace(/_/g, ' ');
  }

  const label = (tz) => valid(tz) ? city(tz) + ' · ' + gmt(tz) : '';

  // Todos los husos que el navegador conoce. Los que no tengan la lista
  // (navegadores viejos) reciben una selección corta con la que se puede
  // trabajar igual.
  const FALLBACK = [
    'America/Montevideo', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo',
    'America/Santiago', 'America/Bogota', 'America/Mexico_City', 'America/New_York',
    'America/Los_Angeles', 'Europe/Madrid', 'Europe/London', 'Europe/Lisbon',
    'Europe/Berlin', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Phnom_Penh',
    'Asia/Tokyo', 'Australia/Sydney', 'UTC'
  ];
  function list() {
    try {
      const all = Intl.supportedValuesOf('timeZone');
      if (all && all.length) return all;
    } catch (e) { /* navegador sin la lista */ }
    return FALLBACK.slice();
  }

  // ── El selector ────────────────────────────────────────────────────────
  //
  // `Intl` devuelve los husos ordenados por su nombre interno, y ese nombre no
  // es el que se ve: 'America/Argentina/Buenos_Aires' se muestra como «Buenos
  // Aires» pero se ordena por la A de Argentina, así que Buenos Aires aparece
  // lejísimos de Montevideo y la lista se lee como si estuviera desordenada.
  //
  // Acá se ordena por lo que el ojo lee: por continente, y adentro por ciudad.
  // Y arriba de todo, el huso de quien está mirando — que es la respuesta
  // correcta la mayor parte de las veces.
  function selectHtml(selected, extraFirst) {
    const esc = window.prEsc;
    const t = (k, fb) => (window.PR_I18N ? window.PR_I18N.t(k) : null) || fb;
    const me = mine();

    const opt = (z, sel) =>
      `<option value="${esc(z)}"${sel ? ' selected' : ''}>${esc(label(z))}</option>`;

    const groups = {};
    for (const z of list()) {
      if (z === me) continue;                    // ya está arriba
      const region = z.includes('/') ? z.split('/')[0] : 'Other';
      (groups[region] = groups[region] || []).push(z);
    }

    const order = ['America', 'Europe', 'Africa', 'Asia', 'Australia', 'Pacific',
                   'Atlantic', 'Indian', 'Antarctica', 'Arctic', 'Other'];
    const names = Object.keys(groups).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });

    return (extraFirst || '')
      + `<optgroup label="${esc(t('tz.mine', 'Tu huso'))}">${opt(me, selected === me)}</optgroup>`
      + names.map(r => {
          const zs = groups[r].sort((a, b) => city(a).localeCompare(city(b), 'es'));
          return `<optgroup label="${esc(t('tz.' + r, r))}">`
            + zs.map(z => opt(z, z === selected)).join('') + `</optgroup>`;
        }).join('');
  }

  window.prTz = { mine, valid, offset, toUtc, fromUtc, convert, dayDiff, nowIn, gmt, city, label, list, selectHtml };
})();
