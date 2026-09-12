/* ============================================================
   LA BOLA — el primer scroll no baja, pinta

   La portada termina de entrar —la foto tejida, el nombre letra
   por letra, la mancha que se presenta sola— y queda una promesa
   sin cobrar: que debajo hay una coleccion. El primer gesto de
   bajar es el momento de cobrarla, y bajar sin mas lo desperdicia.

   Asi que ese gesto, una sola vez, no baja la pagina: entra
   rodando un ovillo blanco desde la izquierda, al llegar al centro
   el blanco crece desde el hasta cubrir la pantalla, y con todo
   blanco —y sin que nadie lo vea— el scroll salta al recorrido de
   piezas. Despues el blanco se cierra sobre si mismo y lo que
   queda debajo es la primera pieza, plantada en el centro.

   Tiempos:
     0.00  el ovillo entra y rueda hasta el centro
     0.95  el blanco crece desde el hasta tapar la pantalla
     1.56  pantalla blanca: el scroll se va al recorrido
     1.72  el blanco se cierra y la pieza aparece
     2.62  se borra la escena y se devuelve el scroll

   Tres cosas que conviene saber antes de tocar nada:

   Se frena el gesto, no el documento. Nada de overflow:hidden: el
   salto al recorrido tiene que poder ocurrir por detras del
   blanco, y con el documento bloqueado no se puede mover. Lo que
   se cancela es la rueda y el toque, con oyentes no pasivos.

   No se agranda el ovillo. El blanco es una capa a pantalla
   completa con un recorte circular que crece desde el diametro del
   ovillo: misma imagen, coste plano. Ampliar el ovillo mismo
   quince veces, con su sombra y su desenfoque, es una textura de
   varios megapixeles que en un equipo modesto se nota.

   Y manda siempre la persona: un clic o Escape la remata en el
   acto, y si la pestania se va a segundo plano tambien —ahi el
   navegador congela las animaciones, y al volver la bola se
   quedaria pegada a medio camino—.

   Pasa una sola vez por sesion. Sin JavaScript, con movimiento
   reducido, sin Web Animations, o si la pagina ya viene con scroll
   hecho, no pasa nunca y el sitio se recorre como siempre.
   ============================================================ */
(function () {
  'use strict';

  var raiz = document.documentElement;
  var CLAVE = 'sdb.bola';

  /* Portones: cualquiera de estos y no hay bola. */
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (sessionStorage.getItem(CLAVE) === 'visto') return;
  } catch (e) {}
  if (!document.documentElement.animate) return;

  /* El aterrizaje es la envoltura del recorrido: su borde de
     arriba es justo el punto en que la escena se pega y la primera
     pieza queda centrada. */
  var destino = document.getElementById('piezasVista') || document.getElementById('piezas');
  if (!destino) return;

  var VIAJE = 950;     // rodar hasta el centro
  var PINTAR = 610;    // el blanco crece hasta tapar
  var REPOSO = 160;    // el blanco respira
  var SALIDA = 900;    // el blanco se cierra
  var ESCALON = 110;   // entre pieza y pieza, al abrirse

  /* Antes de esto el gesto no cuenta: la portada esta entrando y
     quien mueve la rueda sin querer no deberia gastarse la bola.
     Mientras no este armada el scroll es el normal. */
  var ESPERA = 1200;

  var gastada = false;
  var corriendo = false;
  var listaDesde = 0;
  var tactoY = null;
  var escena = null;
  var seguro = null;

  /* El reloj empieza cuando la pagina se ve, no al cargar: en una
     pestania de fondo no hay cuadros, y la bola no tiene sentido
     para quien no esta mirando. Misma regla que la entrada de la
     portada en site.js. */
  function armar() {
    if (document.visibilityState !== 'visible') return;
    listaDesde = Date.now() + ESPERA;
    document.removeEventListener('visibilitychange', armar);
  }
  armar();
  document.addEventListener('visibilitychange', armar);

  /* ---------------- El primer gesto ---------------- */

  var TECLAS = [' ', 'Spacebar', 'ArrowDown', 'PageDown', 'End'];

  function intento() {
    if (gastada || corriendo || !listaDesde || Date.now() < listaDesde) return false;
    if (document.hidden) return false;
    /* Si la pagina ya viene abajo —posicion restaurada, un enlace
       con ancla, alguien que bajo antes de que estuviera armada— la
       bola llega tarde: mejor no interrumpir a media pagina. */
    if (window.pageYOffset > 240) { gastada = true; desescuchar(); return false; }
    correr();
    return true;
  }

  function enRueda(e) { if (e.deltaY > 0 && intento()) e.preventDefault(); }
  function enTecla(e) { if (TECLAS.indexOf(e.key) !== -1 && intento()) e.preventDefault(); }
  function enTactoInicio(e) { tactoY = e.touches[0] ? e.touches[0].clientY : null; }
  function enTactoMueve(e) {
    if (tactoY === null || !e.touches[0]) return;
    if (tactoY - e.touches[0].clientY > 14 && intento()) e.preventDefault();
  }
  // Arrastrar la barra de scroll no emite rueda ni toque.
  function enScroll() { if (window.pageYOffset > 4) intento(); }

  function escuchar() {
    addEventListener('wheel', enRueda, { passive: false });
    addEventListener('keydown', enTecla);
    addEventListener('touchstart', enTactoInicio, { passive: true });
    addEventListener('touchmove', enTactoMueve, { passive: false });
    addEventListener('scroll', enScroll, { passive: true });
  }

  function desescuchar() {
    removeEventListener('wheel', enRueda);
    removeEventListener('keydown', enTecla);
    removeEventListener('touchstart', enTactoInicio);
    removeEventListener('touchmove', enTactoMueve);
    removeEventListener('scroll', enScroll);
  }

  escuchar();

  /* ---------------- Mientras dura ---------------- */

  function frenar(e) { e.preventDefault(); }

  function frenarTecla(e) {
    if (e.key === 'Escape') { rematar(); return; }
    if (TECLAS.indexOf(e.key) !== -1 || e.key === 'ArrowUp' ||
        e.key === 'PageUp' || e.key === 'Home') e.preventDefault();
  }

  function enOculta() { if (document.hidden) rematar(); }

  function bloquear() {
    addEventListener('wheel', frenar, { passive: false });
    addEventListener('touchmove', frenar, { passive: false });
    addEventListener('keydown', frenarTecla);
    addEventListener('pointerdown', rematar);
    document.addEventListener('visibilitychange', enOculta);
  }

  function desbloquear() {
    removeEventListener('wheel', frenar);
    removeEventListener('touchmove', frenar);
    removeEventListener('keydown', frenarTecla);
    removeEventListener('pointerdown', rematar);
    document.removeEventListener('visibilitychange', enOculta);
  }

  /* ---------------- La escena ---------------- */

  function construir(diametro) {
    var caja = document.createElement('div');
    caja.className = 'bola-escena';
    caja.setAttribute('aria-hidden', 'true');
    caja.style.setProperty('--bola-d', diametro + 'px');
    caja.innerHTML =
      '<div class="bola__rastro"></div>' +
      '<div class="bola"><span class="bola__hebra"></span></div>' +
      '<div class="bola-pintura"></div>';
    return caja;
  }

  /* El salto ocurre con la pantalla ya blanca, asi que va sin
     transicion: el sitio lleva scroll-behavior suave y aqui se
     apaga para este movimiento. */
  function saltar() {
    var y = destino.getBoundingClientRect().top + window.pageYOffset;
    var antes = raiz.style.scrollBehavior;
    raiz.style.scrollBehavior = 'auto';
    window.scrollTo(0, Math.max(0, Math.round(y)));
    raiz.style.scrollBehavior = antes;
  }

  /* Las piezas que quedan en pantalla despues del salto se cierran
     y se vuelven a abrir con el blanco. Solo esas: las demas las
     sigue trayendo el observador de site.js cuando les toca.

     Si la aparicion no esta montada —movimiento reducido, sin
     IntersectionObserver— no hay nada que cerrar y las piezas
     estan puestas. */
  function enPantalla() {
    var tira = document.getElementById('piezas');
    if (!tira || tira.className.indexOf('observando') === -1) return [];
    var nodos = [].slice.call(tira.querySelectorAll('.pieza'));
    var alto = window.innerHeight || 1;
    return nodos.filter(function (el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < alto && r.right > 0 && r.left < (window.innerWidth || 1);
    });
  }

  function cerrarPiezas(piezas) {
    for (var i = 0; i < piezas.length; i++) {
      piezas[i].classList.remove('dentro');
      piezas[i].style.transitionDelay = '0ms';
    }
  }

  function abrirPiezas(piezas) {
    for (var i = 0; i < piezas.length; i++) {
      piezas[i].style.transitionDelay = (i * ESCALON) + 'ms';
      piezas[i].classList.add('dentro');
    }
  }

  /* ---------------- El remate ----------------

     Un clic, Escape, la pestania que se va, o un imprevisto: se
     deja todo donde tenia que quedar. Lo que se pierde es el
     efecto, nunca el contenido ni el sitio donde aterriza. */
  function rematar() {
    if (!corriendo) return;
    corriendo = false;
    clearTimeout(seguro);
    desbloquear();
    saltar();
    var tira = document.getElementById('piezas');
    if (tira) {
      var nodos = tira.querySelectorAll('.pieza');
      for (var i = 0; i < nodos.length; i++) {
        var r = nodos[i].getBoundingClientRect();
        if (r.bottom > 0 && r.top < (window.innerHeight || 1)) {
          nodos[i].style.transitionDelay = '0ms';
          nodos[i].classList.add('dentro');
        }
      }
    }
    if (escena) { escena.remove(); escena = null; }
  }

  /* ---------------- La corrida ---------------- */

  function correr() {
    gastada = true;
    corriendo = true;
    desescuchar();
    try { sessionStorage.setItem(CLAVE, 'visto'); } catch (e) {}

    var ancho = window.innerWidth || 1;
    var d = Math.round(Math.min(Math.max(ancho * 0.13, 96), 190));
    var entrada = -(ancho / 2 + d);

    escena = construir(d);
    document.body.appendChild(escena);

    var bola = escena.querySelector('.bola');
    var hebra = escena.querySelector('.bola__hebra');
    var rastro = escena.querySelector('.bola__rastro');
    var pintura = escena.querySelector('.bola-pintura');

    bloquear();
    // Por si una animacion no llega a terminar nunca.
    seguro = setTimeout(rematar, 6000);

    var viaje = bola.animate([
      { transform: 'translate3d(' + entrada + 'px, 7vh, 0) scale(0.62) rotate(-30deg)',
        easing: 'cubic-bezier(0.26, 0.04, 0.2, 1)' },
      { offset: 0.62,
        transform: 'translate3d(' + (ancho * 0.07) + 'px, -2.5vh, 0) scale(1) rotate(330deg)',
        easing: 'cubic-bezier(0.38, 0.06, 0.3, 1)' },
      { transform: 'translate3d(0px, 0px, 0) scale(1) rotate(430deg)' }
    ], { duration: VIAJE, fill: 'forwards' });

    rastro.animate([
      { transform: 'translate3d(' + entrada + 'px, 7vh, 0) scaleX(0.2)', opacity: 0 },
      { offset: 0.45,
        transform: 'translate3d(' + (ancho * 0.18) + 'px, 1vh, 0) scaleX(1)', opacity: 0.85 },
      { transform: 'translate3d(0px, 0px, 0) scaleX(0.3)', opacity: 0 }
    ], { duration: VIAJE, easing: 'cubic-bezier(0.3, 0.05, 0.3, 1)', fill: 'forwards' });

    var piezas = [];

    viaje.finished.then(function () {
      if (!corriendo) return;

      /* El blanco crece desde el ovillo. La hebra se apaga: a este
         tamanio ya no dice ovillo, dice aro. */
      hebra.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
      rastro.remove();
      pintura.style.opacity = '1';
      bola.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: 240, delay: 110, fill: 'forwards' });

      return pintura.animate([
        { clipPath: 'circle(' + (d / 2) + 'px at 50% 50%)' },
        { clipPath: 'circle(150% at 50% 50%)' }
      ], { duration: PINTAR, easing: 'cubic-bezier(0.45, 0.02, 0.4, 1)', fill: 'forwards' }).finished;
    }).then(function () {
      if (!corriendo) return;

      // Pantalla blanca. Por detras, el scroll se va al recorrido.
      bola.remove();
      saltar();
      piezas = enPantalla();
      cerrarPiezas(piezas);

      return new Promise(function (listo) { setTimeout(listo, REPOSO); });
    }).then(function () {
      if (!corriendo) return;

      var salida = pintura.animate([
        { clipPath: 'circle(150% at 50% 50%)' },
        { clipPath: 'circle(0% at 50% 50%)' }
      ], { duration: SALIDA, easing: 'cubic-bezier(0.58, 0.02, 0.28, 1)', fill: 'forwards' });
      abrirPiezas(piezas);
      return salida.finished;
    }).then(function () {
      if (!corriendo) return;
      corriendo = false;
      clearTimeout(seguro);
      desbloquear();
      escena.remove();
      escena = null;
    })['catch'](rematar);
  }
})();
