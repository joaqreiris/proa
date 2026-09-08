// Proa — la imagen de un ejercicio.
//
// Se reconoce un ejercicio por cómo se ve mucho antes que por su nombre, y
// entre veinte variantes de sentadilla el nombre directamente no alcanza.
//
// La miniatura sale del propio YouTube: no hay nada que subir, nada que
// guardar y nada que se quede viejo. Si el video se borra, la miniatura se
// borra con él — y por eso hay que atender el error de carga, o queda el icono
// roto del navegador, que es peor que no tener nada.
//
// Vive acá y no en cada pantalla porque el buscador de la sesión y la
// biblioteca dibujan lo mismo: dos copias es la garantía de que un día una
// deje de reconocer un formato de enlace que la otra sí.
(function () {
  'use strict';

  // Las cinco formas en que se pega un enlace de YouTube: el largo, el corto,
  // el de incrustar, el de shorts y el de directo.
  function ytId(url) {
    const m = String(url || '').match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  const thumb = (url) => {
    const id = ytId(url);
    return id ? 'https://img.youtube.com/vi/' + id + '/mqdefault.jpg' : null;
  };

  const embed = (url) => {
    const id = ytId(url);
    return id ? 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0' : null;
  };

  // Un icono por familia: sin video, decir de qué tipo de trabajo se trata es
  // más que dejar un hueco gris.
  const CAT_ICON = {
    strength: 'barbell', power: 'bolt', speed: 'run', endurance: 'heartbeat',
    mobility: 'stretching', core: 'body-scan', balance: 'yoga', prevention: 'shield-heart',
  };
  const icon = (cat) => CAT_ICON[cat] || 'barbell';

  // El video borrado: YouTube responde con una imagen que no carga. Se escucha
  // en captura porque el error de un <img> no burbujea.
  function watchBroken(root) {
    (root || document).addEventListener('error', (e) => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG' || !img.closest('[data-thumb]')) return;
      const hueco = img.closest('[data-thumb]');
      hueco.innerHTML = '<i class="ti ti-' + icon(hueco.dataset.cat) + '"></i>';
    }, true);
  }

  window.prExMedia = { ytId, thumb, embed, icon, watchBroken };
})();
