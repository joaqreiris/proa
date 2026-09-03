// Proa — riel lateral compartido.
// Uso en cualquier página del entrenador:
//   <aside class="pr-shell-side" id="pr-side-root"></aside>
//   <script src="assets/sidebar.js" defer></script>
//   prSidebar.mount('home');
//
// El riel es siempre oscuro (agua profunda), en tema claro y en oscuro. Es la
// firma visual de Proa: el casco a la izquierda.

(function () {
  'use strict';

  // La marca y el tema viven en assets/brand.js, que se carga antes en el <head>.
  const LOGO = (window.prBrand && window.prBrand.LOGO) || '';

  // Una sola fuente para el menú. Al sumar una página, se agrega acá y se le
  // saca el `soon`: mientras esté marcada así se dibuja apagada y sin enlace,
  // para no mandar a nadie a una página que todavía no existe.
  const ITEMS = [
    { key: 'home',      href: 'Home.html',      icon: 'ti-home',          label: 'nav.home' },
    { key: 'athletes',  href: 'Athletes.html',  icon: 'ti-users',         label: 'nav.athletes' },
    { key: 'week',      href: 'Week.html',      icon: 'ti-calendar-week', label: 'nav.week' },
    { key: 'exercises', href: 'Exercises.html', icon: 'ti-barbell',       label: 'nav.exercises', soon: true }
  ];

  const t = (k, fb) => (window.PR_I18N ? window.PR_I18N.t(k) : null) || fb || k;
  const esc = (s) => window.prEsc ? window.prEsc(s) : String(s == null ? '' : s);

  const currentTheme = () => (window.prBrand ? window.prBrand.currentTheme() : 'light');
  const toggleTheme  = () => (window.prBrand ? window.prBrand.toggleTheme() : 'light');

  async function mount(activeKey) {
    const root = document.getElementById('pr-side-root');
    if (!root) return;

    const [ws, profile, seats] = await Promise.all([
      window.getWorkspace ? window.getWorkspace() : null,
      window.getProfile ? window.getProfile() : null,
      window.getSeatUsage ? window.getSeatUsage() : null
    ]);

    if (ws && window.applyWorkspaceTheme) window.applyWorkspaceTheme(ws);

    const items = ITEMS.map((it) => {
      const active = it.key === activeKey ? ' is-active' : '';
      const label = `<i class="ti ${it.icon}"></i><span data-i18n="${it.label}">${esc(t(it.label))}</span>`;

      if (it.soon) {
        return `<span class="pr-side-item is-soon" data-key="${it.key}" aria-disabled="true">`
          + `${label}<span class="pr-side-count">${esc(t('nav.soon'))}</span></span>`;
      }
      const count = (it.key === 'athletes' && seats)
        ? `<span class="pr-side-count">${seats.used}/${seats.limit}</span>` : '';
      return `<a class="pr-side-item${active}" href="${it.href}" data-key="${it.key}">${label}${count}</a>`;
    }).join('');

    const name = (ws && ws.name) || t('brand.name', 'Proa');
    const who = (profile && profile.full_name) || (profile && profile.email) || '';

    root.innerHTML = `
      <div class="pr-side-brand">
        <span class="pr-logo-mark">${LOGO}</span>
        <span>
          <span class="pr-side-brand-name">${esc(name)}</span>
          <span class="pr-side-brand-meta">${esc(t('brand.tagline'))}</span>
        </span>
      </div>

      <nav class="pr-side-group" aria-label="${esc(t('nav.section.work'))}">
        <div class="pr-side-group-label" data-i18n="nav.section.work">${esc(t('nav.section.work'))}</div>
        ${items}
      </nav>

      <div class="pr-side-foot">
        <a class="pr-side-item${activeKey === 'settings' ? ' is-active' : ''}" href="Settings.html" data-key="settings">
          <i class="ti ti-settings"></i>
          <span data-i18n="nav.settings">${esc(t('nav.settings'))}</span>
        </a>
        <button class="pr-side-item is-button" type="button" id="pr-theme-toggle">
          <i class="ti ti-moon"></i><span>${esc(currentTheme() === 'dark' ? 'Claro' : 'Oscuro')}</span>
        </button>
        <button class="pr-side-item is-button" type="button" id="pr-logout">
          <i class="ti ti-logout"></i><span data-i18n="nav.logout">${esc(t('nav.logout'))}</span>
        </button>
        ${who ? `<div class="pr-side-brand-meta" style="padding:8px 10px 0">${esc(who)}</div>` : ''}
      </div>`;

    const toggle = root.querySelector('#pr-theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = toggleTheme();
        const label = toggle.querySelector('span');
        if (label) label.textContent = next === 'dark' ? 'Claro' : 'Oscuro';
      });
    }

    const out = root.querySelector('#pr-logout');
    if (out) out.addEventListener('click', () => window.logout && window.logout());

    if (window.PR_I18N && window.PR_I18N.applyTo) window.PR_I18N.applyTo(root);
  }

  window.prSidebar = { mount };
})();
