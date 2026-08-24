/* =============================================================
   La bienvenida.

   Solo corre si el script del <head> puso la clase .con-intro: ese
   script ya descartó los casos de "reducir movimiento" y de "esta
   sesión ya la vio".

   Tiempos:
     0.06  el nombre se escribe letra por letra, el espaciado se
           cierra y la regla se dibuja
     ~1.7  el nombre suelta el aire y se apaga
     ~2.1  la pantalla se parte en dos y se abre sobre el sitio
     ~3.3  se retira el telón y se libera el scroll

   Cualquier clic, tecla, rueda o toque la salta.
   ============================================================= */
(function () {
  'use strict';

  const raiz = document.documentElement;
  if (!raiz.classList.contains('con-intro')) return;

  const intro = document.querySelector('[data-intro]');
  if (!intro) { raiz.classList.remove('con-intro'); return; }

  const CLAVE = 'sd.intro';
  const marca = document.querySelector('[data-intro-marca]');

  /* Tiempos, en milisegundos. ESCRITURA tiene que cubrir la última
     letra: su retraso (100 + (n-1) x ESCALON) más lo que dura su
     transición (850 ms en intro.css). Si se cambia uno, revisar el otro. */
  const ESCALON   = 45;
  const ESCRITURA = 1250;
  const REPOSO    = 400;

  /* La página siempre empieza arriba, aunque el navegador quiera
     restaurar la posición de un scroll anterior. */
  try { history.scrollRestoration = 'manual'; } catch (e) {}
  window.scrollTo(0, 0);

  /* --- El nombre, letra por letra --- */
  if (marca) {
    const texto = marca.textContent.trim();
    marca.textContent = '';
    Array.from(texto).forEach(function (c, i) {
      const span = document.createElement('span');
      span.className = 'intro__letra';
      span.textContent = c;
      span.style.transitionDelay = (100 + i * ESCALON) + 'ms';
      marca.appendChild(span);
    });
    marca.setAttribute('aria-label', texto);
  }

  let terminada = false;
  const relojes = [];
  const luego = (ms, fn) => relojes.push(setTimeout(fn, ms));

  function limpiar() {
    relojes.forEach(clearTimeout);
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
      removeEventListener(ev, saltar);
    });
  }

  function retirar() {
    if (terminada) return;
    terminada = true;
    limpiar();
    raiz.classList.remove('con-intro');
    intro.remove();
    try { sessionStorage.setItem(CLAVE, 'visto'); } catch (e) {}
  }

  function saltar() {
    if (terminada) return;
    limpiar();
    intro.classList.add('sale', 'abre');
    setTimeout(retirar, 700);
  }

  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
    addEventListener(ev, saltar, { passive: true });
  });

  function abrirTelon() {
    intro.classList.add('sale');
    luego(400, function () { intro.classList.add('abre'); });
    luego(1500, retirar);
  }

  function escribir() {
    intro.classList.add('escribe');
    /* Se abre cuando el nombre terminó de escribirse y descansó un
       momento. La portada se dibuja sola, así que no hay ningún
       archivo que esperar. */
    const transcurrido = performance.now() - inicio;
    luego(Math.max(0, ESCRITURA + REPOSO - transcurrido), abrirTelon);
  }

  /* Se espera la tipografía para que el nombre no aparezca primero con
     la fuente de reserva. Si ya está cargada (lo normal en la segunda
     visita) se arranca de inmediato, y en cualquier caso hay un tope
     corto: la bienvenida no puede quedarse esperando. */
  const inicio = performance.now();
  const arrancar = () => luego(60, escribir);
  const fuentes = document.fonts;

  if (!fuentes || !fuentes.ready || fuentes.status === 'loaded') {
    arrancar();
  } else {
    let partio = false;
    const unaVez = function () { if (!partio) { partio = true; arrancar(); } };
    fuentes.ready.then(unaVez);
    setTimeout(unaVez, 500);
  }
})();
