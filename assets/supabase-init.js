// Proa — cliente Supabase compartido + contexto de espacio de trabajo.
// Se incluye antes de cualquier lógica de página:
//   <script src="assets/vendor/supabase-js-2.112.4.min.js"></script>
//   <script src="assets/supabase-init.js"></script>
//
// Diferencia central con ClavaMetrics: acá la unidad de tenencia NO es el club
// sino el WORKSPACE (el espacio del entrenador). Y hay dos tipos de usuario:
//   · coach   → ve todo lo de su workspace
//   · athlete → ve únicamente sus propias filas, venga de donde venga
// Cada consulta tiene que respetar una de las dos puertas. Ver db/schema.sql.

(function () {
  const SB_URL = 'https://lryftqfhztzhawplljsu.supabase.co';
  const SB_KEY = 'sb_publishable_P8xCadyfCsOPNX0b4cy1Uw_l8pomxIN';

  window.sb = supabase.createClient(SB_URL, SB_KEY);

  // ── Fechas locales ────────────────────────────────────────────────────────
  // Las fechas de la app son fechas de calendario, sin zona horaria. "Hoy" tiene
  // que ser el día LOCAL del usuario, no el de UTC: new Date().toISOString()
  // devuelve la fecha UTC, que va un día atrasada para cualquiera al este de
  // Greenwich antes del amanecer. prYMD(d) formatea local; prToday() es hoy.
  window.prYMD = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  };
  window.prToday = function () { return window.prYMD(new Date()); };

  // ── Lectura paginada ──────────────────────────────────────────────────────
  // PostgREST corta cualquier consulta en ~1000 filas sin avisar, y .limit()
  // del lado del cliente NO lo evita. Esta es la única forma robusta de leer
  // más de 1000 filas: pedir de a páginas hasta que vuelva una página corta.
  //
  // Se le pasa una FÁBRICA que arma una consulta nueva cada vez (un query
  // builder de Supabase es de un solo uso):
  //   const rows = await prFetchAll(() =>
  //     sb.from('events').select('*').eq('athlete_id', id));
  window.prFetchAll = async function (queryFactory, opts) {
    const pageSize = (opts && opts.pageSize) || 1000;
    const maxPages = (opts && opts.maxPages) || 50;
    const orderBy  = (opts && 'orderBy' in opts) ? opts.orderBy : 'id';
    const all = [];
    let page = 0;
    while (page < maxPages) {
      const from = page * pageSize, to = from + pageSize - 1;
      let qb = queryFactory();
      if (orderBy) qb = qb.order(orderBy, { ascending: true });
      const { data, error } = await qb.range(from, to);
      if (error) {
        if (page === 0) throw error;
        console.error('[prFetchAll] error en la página', page, '— devuelvo', all.length, 'filas:', error);
        break;
      }
      if (!data || !data.length) break;
      all.push(...data);
      if (data.length < pageSize) break;
      page++;
    }
    return all;
  };

  // ── Contexto en memoria ───────────────────────────────────────────────────
  let _profile = null, _profilePromise = null;
  let _workspace = null, _workspacePromise = null;
  let _tzSynced = false;

  // Guarda la zona horaria del navegador en el perfil, para que los avisos que
  // se mandan desde el servidor calculen "hoy" con el calendario del usuario.
  function syncTimezone(userId, current) {
    if (_tzSynced || !userId) return;
    _tzSynced = true;
    let tz;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return; }
    if (!tz || tz === current) return;
    window.sb.from('profiles').update({ timezone: tz }).eq('id', userId)
      .then(({ error }) => { if (error) console.warn('[supabase-init] no pude guardar la zona horaria:', error.message); },
            () => {});
  }

  // Perfil del usuario logueado. Incluye el rol: 'coach' o 'athlete'.
  window.getProfile = function () {
    if (_profile) return Promise.resolve(_profile);
    if (_profilePromise) return _profilePromise;
    _profilePromise = (async () => {
      const { data: { user } } = await window.sb.auth.getUser();
      if (!user) return null;
      const { data, error } = await window.sb.from('profiles')
        .select('id,email,full_name,role,avatar_url,language,timezone,onboarded_at')
        .eq('id', user.id).maybeSingle();
      if (error) { console.error('[getProfile]', error); return null; }
      _profile = data || null;
      if (_profile) syncTimezone(user.id, _profile.timezone);
      return _profile;
    })();
    return _profilePromise;
  };

  // Espacio de trabajo activo del entrenador. Devuelve null para un atleta.
  window.getWorkspace = function () {
    if (_workspace) return Promise.resolve(_workspace);
    if (_workspacePromise) return _workspacePromise;
    _workspacePromise = (async () => {
      const { data: { user } } = await window.sb.auth.getUser();
      if (!user) return null;
      const { data, error } = await window.sb.from('workspace_members')
        .select('role, workspaces(id,name,slug,logo_url,accent,sport,seat_limit,language,timezone,created_at)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1).maybeSingle();
      if (error) { console.error('[getWorkspace]', error); return null; }
      if (!data || !data.workspaces) return null;
      _workspace = { ...data.workspaces, myRole: data.role };
      return _workspace;
    })();
    return _workspacePromise;
  };

  window.getWorkspaceId = async function () {
    const ws = await window.getWorkspace();
    return ws ? ws.id : null;
  };

  // ── Cupos ─────────────────────────────────────────────────────────────────
  // Un atleta activo ocupa un cupo. Los pausados y archivados no.
  window.getSeatUsage = async function () {
    const wsId = await window.getWorkspaceId();
    if (!wsId) return { used: 0, limit: 0, left: 0 };
    const ws = await window.getWorkspace();
    const { count, error } = await window.sb.from('athletes')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId)
      .eq('status', 'active');
    if (error) { console.error('[getSeatUsage]', error); return { used: 0, limit: ws.seat_limit, left: ws.seat_limit }; }
    const used = count || 0;
    return { used, limit: ws.seat_limit, left: Math.max(0, ws.seat_limit - used) };
  };

  // El nombre del entrenador, para las pantallas del atleta.
  //
  // Arriba de su ficha y de su semana iba el nombre del ESPACIO de trabajo, que
  // el entrenador suele llamar como el club donde juega su atleta. Quedaba
  // pareciendo que la ficha era del club, y en Proa no hay institución: hay una
  // persona entrenando a otra.
  //
  // Va por función porque la política de profiles deja ver solo el perfil
  // propio, y está bien que así sea: esta devuelve el nombre y nada más.
  window.myCoachName = async function (fallback) {
    try {
      const { data, error } = await window.sb.rpc('my_coach_name');
      if (!error && data) return data;
    } catch (e) { /* que no se caiga una pantalla por un rótulo */ }
    return fallback || '';
  };

  // ── Marca del entrenador ──────────────────────────────────────────────────
  // Cada entrenador elige su color de la paleta de brand.js. En workspaces.accent
  // se guarda el IDENTIFICADOR ('blue'), no un código de color: cada acento son
  // cuatro valores (claro, aclarado y los dos colores de texto encima) y todos
  // viven juntos en proa.css.
  //
  // Esto pinta SOLO la marca. Los colores de los tipos de trabajo no se tocan.
  window.applyWorkspaceTheme = function (ws) {
    if (!window.prBrand) return;
    window.prBrand.applyAccent((ws && ws.accent) || window.prBrand.DEFAULT_ACCENT);
  };

  // ── Puertas de entrada ────────────────────────────────────────────────────
  // requireAuth solo verifica que haya sesión. Las dos siguientes además
  // mandan a cada usuario a la aplicación que le corresponde: un atleta no
  // tiene nada que hacer en el panel del entrenador, ni al revés.
  window.requireAuth = async function (redirectTo = 'Login.html') {
    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) { window.location.replace(redirectTo); return false; }
    return true;
  };

  window.requireCoach = async function () {
    if (!(await window.requireAuth())) return false;
    const p = await window.getProfile();
    // Sin perfil, la sesión quedó huérfana. Se cierra y se vuelve a entrar:
    // reenviar sin cerrarla hacía que la pantalla de entrada rebotara para acá
    // de nuevo, en bucle.
    if (!p) { await window.clearStaleSession(); window.location.replace('Login.html'); return false; }
    if (p.role === 'athlete') { window.location.replace('athlete/Week.html'); return false; }
    if (!p.onboarded_at) { window.location.replace('Onboarding.html'); return false; }
    return true;
  };

  window.requireAthlete = async function (opts) {
    if (!(await window.requireAuth('../Login.html'))) return false;
    const p = await window.getProfile();
    if (!p) { await window.clearStaleSession(); window.location.replace('../Login.html'); return false; }
    if (p.role !== 'athlete') { window.location.replace('../Home.html'); return false; }

    // La anamnesis es la puerta de entrada, no una tarea pendiente.
    //
    // Sin ella el entrenador no tiene con qué armar el plan: no sabe qué
    // lesiones tuvo, cuánto duerme ni a qué hora está libre. Una tarjeta que
    // dice «completa tu ficha» se posterga para siempre, así que mientras no
    // esté completa cualquier pantalla del atleta lleva ahí.
    //
    // El guard vive acá y no en cada pantalla porque en cada pantalla es una
    // pantalla nueva la que se olvida de ponerlo. La propia anamnesis pasa con
    // `saltarAnamnesis`, o esto sería un bucle.
    if (!(opts && opts.saltarAnamnesis) && !(await window.intakeDone())) {
      window.location.replace('Intake.html');
      return false;
    }
    return true;
  };

  // Si el atleta ya completó su anamnesis. Se cachea en la pestaña: una vez
  // completa no se descompleta, y así no se paga una consulta por pantalla.
  window.intakeDone = async function () {
    try {
      if (sessionStorage.getItem('pr_intake_done') === '1') return true;
    } catch (e) { /* modo privado */ }

    const { data: a } = await window.sb.from('athletes').select('id').limit(1).maybeSingle();
    if (!a) return true;   // sin ficha no hay nada que completar: que siga

    const { data: i, error } = await window.sb.from('athlete_intake')
      .select('completed_at').eq('athlete_id', a.id).maybeSingle();
    // Ante un error de red no se encierra a nadie: se deja pasar.
    if (error) return true;

    const listo = !!(i && i.completed_at);
    if (listo) { try { sessionStorage.setItem('pr_intake_done', '1'); } catch (e) {} }
    return listo;
  };

  // A dónde va cada quien después de entrar.
  // Si venía de un enlace de invitación y se desvió a entrar, vuelve al enlace:
  // perderlo significaría pedirle otro al entrenador.
  //
  // Devuelve NULL si no hay perfil. Antes devolvía 'Login.html', y eso producía
  // un bucle infinito de recargas: la pantalla de entrada se reenviaba a sí
  // misma una y otra vez. Ahora el que llama decide, y lo que corresponde es
  // cerrar la sesión.
  window.landingFor = function (profile) {
    if (!profile) return null;
    try {
      const pending = sessionStorage.getItem('pr_pending_invite');
      if (pending) {
        sessionStorage.removeItem('pr_pending_invite');
        return 'invite.html?t=' + encodeURIComponent(pending);
      }
    } catch (e) { /* navegación privada */ }
    if (profile.role === 'athlete') return 'athlete/Week.html';
    return profile.onboarded_at ? 'Home.html' : 'Onboarding.html';
  };

  // ¿Estamos parados en una pantalla de entrada? Sirve para no reenviar a
  // donde ya estamos.
  function onAuthPage() {
    return /\/(Login|Register|set-password|auth-callback|invite)\.html$|\/$/.test(location.pathname);
  }

  // Una sesión guardada puede haber quedado huérfana: el usuario ya no existe,
  // o su perfil se borró. El token sigue pareciendo válido hasta que vence, así
  // que hay que detectarlo y cerrar la sesión, no dar vueltas.
  window.clearStaleSession = async function () {
    try { await window.sb.auth.signOut(); } catch (e) { /* ya estaba cerrada */ }
    window.resetContextCache();
  };

  // Manda a cada quien a donde le toca después de entrar. Devuelve false si la
  // sesión no servía (y en ese caso ya la cerró).
  window.goAfterAuth = async function () {
    const profile = await window.getProfile();
    const to = window.landingFor(profile);
    if (!to) { await window.clearStaleSession(); return false; }
    window.location.replace(to);
    return true;
  };

  window.logout = async function (redirectTo = 'Login.html') {
    await window.sb.auth.signOut();
    _profile = null; _profilePromise = null;
    _workspace = null; _workspacePromise = null;
    window.location.replace(redirectTo);
  };

  window.resetContextCache = function () {
    _profile = null; _profilePromise = null;
    _workspace = null; _workspacePromise = null;
  };

  // ── Utilidades de presentación ────────────────────────────────────────────
  window.prEsc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  window.prInitials = function (name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : words[0].slice(0, 2).toUpperCase();
  };

  // ── Avisos flotantes ──────────────────────────────────────────────────────
  window.prToast = function (message, kind) {
    let host = document.querySelector('.pr-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'pr-toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'pr-toast' + (kind ? ' is-' + kind : '');
    el.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  };

  // Traduce los errores crudos de Supabase a algo que una persona entienda.
  window.prAuthError = function (error) {
    const m = String(error && error.message || '').toLowerCase();
    const t = (k, fallback) => (window.PR_I18N ? window.PR_I18N.t(k) : null) || fallback;
    if (m.includes('invalid login credentials')) return t('auth.err.credentials', 'El correo o la contraseña no coinciden.');
    if (m.includes('email not confirmed'))       return t('auth.err.unconfirmed', 'Todavía no confirmaste tu correo. Revisa tu bandeja de entrada.');
    if (m.includes('user already registered'))   return t('auth.err.exists', 'Ya hay una cuenta con ese correo. Prueba a entrar.');
    if (m.includes('password'))                  return t('auth.err.password', 'La contraseña tiene que tener al menos 8 caracteres.');
    if (m.includes('rate limit') || m.includes('too many')) return t('auth.err.rate', 'Demasiados intentos seguidos. Espera un minuto.');
    return (error && error.message) || t('auth.err.generic', 'Algo salió mal. Prueba de nuevo.');
  };

  window.sb.auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_OUT') return;
    window.resetContextCache();
    // Si ya estamos en una pantalla de entrada, no hay a dónde ir: reenviarse a
    // uno mismo es exactamente el bucle que se quiere evitar.
    if (onAuthPage()) return;
    const inAthleteApp = location.pathname.includes('/athlete/');
    window.location.replace(inAthleteApp ? '../Login.html' : 'Login.html');
  });
})();
