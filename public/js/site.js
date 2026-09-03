/* ============================================================
   UN SOLO HILO — el motor del sitio público.

   Pide los datos a /api/site y arma la página. Todo lo que se ve
   sigue saliendo del panel: si la duenia cambia un texto, un
   precio o una foto, cambia acá.

   Regla de rendimiento que ordena el resto: este archivo NO
   anima. Solo mide y escribe un número por escena (--p). Las
   transformaciones las resuelve la hoja de estilos, en el
   compositor. Por eso hay movimiento en cada pantalla sin ocupar
   el hilo principal.
   ============================================================ */
(function () {
  'use strict';

  var estado = { settings: {}, categorias: [], productos: [], abierto: null };
  var $ = function (id) { return document.getElementById(id); };
  var quieto = matchMedia('(prefers-reduced-motion: reduce)');
  var finoYconHover = matchMedia('(hover: hover) and (pointer: fine)');

  function escapar(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function nn(n) { return n < 10 ? '0' + n : String(n); }

  function precio(valor) {
    var moneda = estado.settings.moneda || 'CLP';
    try {
      return new Intl.NumberFormat('es-CL', {
        style: 'currency', currency: moneda, maximumFractionDigits: 0
      }).format(valor || 0);
    } catch (e) {
      return '$' + (valor || 0).toLocaleString('es-CL');
    }
  }

  function aviso(texto) {
    var el = $('aviso');
    el.textContent = texto;
    el.classList.add('visible');
    clearTimeout(aviso._t);
    aviso._t = setTimeout(function () { el.classList.remove('visible'); }, 3200);
  }

  function enlaceWhatsapp(mensaje) {
    var num = String(estado.settings.whatsapp || '').replace(/\D/g, '');
    if (!num) return '#contacto';
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(mensaje);
  }

  /* ---------------- Umbral ----------------
     El nombre entra letra por letra. El servidor ya lo escribió
     entero en el HTML: sin JavaScript se ve igual, solo quieto.
     La entrada nunca esconde el contenido —ver la nota sobre
     `backwards` en la hoja de estilos. */

  function armarUmbral() {
    var el = $('umbralMarca');
    if (!el || quieto.matches) return;
    var texto = (el.textContent || '').trim();
    if (!texto) return;
    el.innerHTML = texto.split('').map(function (c, i) {
      if (c === ' ') return ' ';
      return '<span class="letra" style="--i:' + i + '">' + escapar(c) + '</span>';
    }).join('');
  }

  /* ---------------- Textos ---------------- */

  function pintarTextos() {
    var s = estado.settings;
    var total = estado.productos.length;

    document.title = (s.marca || 'Tienda') + ' — ' + (s.tagline || 'Taller de crochet');
    $('marca').textContent = s.marca || 'Tienda';

    // La cuenta de la colección es un dato verdadero, no una
    // urgencia inventada: son las piezas que existen.
    $('umbralCuenta').textContent = nn(total);
    $('umbralCuentaTexto').textContent = total === 1 ? 'pieza en la colección' : 'piezas en la colección';
    $('cuentaIndice').textContent = '(' + nn(total) + ')';

    $('manifiestoTexto').textContent = s.heroTitulo || '';
    $('manifiestoNota').textContent = s.heroTexto || '';

    $('pieMarca').textContent = s.marca || '';
    $('pieTexto').textContent = s.tagline || '';
    // La Ley del Consumidor pide que el vendedor esté identificado.
    var identidad = [s.legalNombre, s.legalRut].filter(Boolean).join(' · ');
    $('pieCopy').textContent = '© ' + new Date().getFullYear() + ' ' + (s.marca || '') +
      (identidad ? '  ·  ' + identidad : '');
    $('pieFirma').textContent = s.pieDeFirma || '';

    var contacto = [];
    if (s.whatsapp) {
      contacto.push('<li><a data-cursor="pedir" href="' + enlaceWhatsapp('¡Hola! Vengo del sitio.') +
        '" target="_blank" rel="noopener">WhatsApp</a></li>');
    }
    if (s.instagram) {
      var ig = s.instagram.replace(/^@/, '');
      var url = /^https?:/.test(ig) ? ig : 'https://instagram.com/' + ig;
      contacto.push('<li><a href="' + escapar(url) + '" target="_blank" rel="noopener">Instagram</a></li>');
    }
    if (s.email) {
      contacto.push('<li><a href="mailto:' + escapar(s.email) + '">' + escapar(s.email) + '</a></li>');
    }
    $('pieContacto').innerHTML = contacto.join('') || '<li>Pronto</li>';
  }

  /* ---------------- Las láminas ----------------

     Mientras el catálogo no tenga fotos propias, cada pieza toma
     una de muestra de public/img/muestra/. Son de Unsplash, cuya
     licencia permite uso comercial sin atribución. Van marcadas
     como muestra en la esquina: el sitio está publicado, y quien
     entre tiene que poder saber que esa no es la pieza real.

     Nada de esto hay que deshacerlo después. En cuanto la duenia
     suba una foto de verdad desde el panel, `p.fotos[0]` existe y
     la muestra desaparece sola. Para quitar el aviso, borrar la
     línea de plato__falta. Para quitar las muestras del todo,
     borrar MUESTRAS y volver al tejido dibujado. */

  var MUESTRAS = ['chaleco', 'bolso', 'gorro', 'manta', 'osito'];

  // Se elige por lo que la pieza es, no por su orden: si mañana
  // hay diez productos, cada uno sigue cayendo en la muestra que
  // le corresponde.
  var PISTAS = [
    [/chaleco|sueter|su[eé]ter|polera|cardigan|chaqueta|ropa/i, 'chaleco'],
    [/bolso|cartera|mochila|morral|rafia/i, 'bolso'],
    [/gorro|beanie|sombrero|bufanda|cuello/i, 'gorro'],
    [/manta|frazada|cobija|cojin|coj[ií]n|deco/i, 'manta'],
    [/osito|amigurumi|mu[nñ]eco|peluche|juguete/i, 'osito']
  ];

  function muestraPara(p, i) {
    var texto = (p.nombre || '') + ' ' + (p.categoria || '');
    for (var k = 0; k < PISTAS.length; k++) {
      if (PISTAS[k][0].test(texto)) return PISTAS[k][1];
    }
    return MUESTRAS[i % MUESTRAS.length];
  }

  function lamina(p, prioritaria, i) {
    var carga = prioritaria
      ? 'loading="eager" fetchpriority="high" decoding="async"'
      : 'loading="lazy" decoding="async"';

    if (p.fotos && p.fotos[0]) {
      return '<img src="' + escapar(p.fotos[0]) + '" alt="' + escapar(p.nombre) + '" ' + carga + '>';
    }

    return '<img src="/img/muestra/' + muestraPara(p, i || 0) + '.webp" ' +
             'alt="Foto de muestra: ' + escapar(p.nombre) + '" ' + carga + '>' +
           '<span class="plato__falta">Foto de muestra</span>';
  }

  function estadoDe(p) {
    return p.agotado
      ? { clase: 'rareza--no', texto: 'Agotada' }
      : { clase: 'rareza--hay', texto: 'Disponible' };
  }

  /* ---------------- Las escenas ----------------

     Una pantalla fijada por pieza. El ritmo (0 a 3) hace que
     ninguna entre igual que la anterior: es la micro-dirección
     por producto que pide el encargo, sin escribir cada una a
     mano. */

  // Las destacadas primero: la colección se abre por su cara.
  function ordenadas() {
    return estado.productos.slice().sort(function (a, b) {
      return (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0);
    });
  }

  function pintarEscenas() {
    var lista = ordenadas();

    if (!lista.length) {
      $('piezas').innerHTML = '<div class="vacio"><p>El telar está vacío por ahora.</p>' +
        '<p style="margin:0"><a href="' + enlaceWhatsapp('¡Hola! Quiero encargar algo tejido.') +
        '" target="_blank" rel="noopener">Escríbeme y lo tejo para ti</a></p></div>';
      return;
    }

    var total = lista.length;
    var piezas = lista.map(function (p, i) {
      var n = i + 1;
      var est = estadoDe(p);
      var precios = precio(p.precio);
      if (p.precioAntes && p.precioAntes > p.precio) {
        precios += '<del>' + precio(p.precioAntes) + '</del>';
      }

      return '<button class="pieza" data-i="' + i + '" data-abrir="' + escapar(p.id) + '" ' +
                     'data-cursor="ver" aria-label="Ver ' + escapar(p.nombre) + '">' +
        '<span class="pieza__numeral" aria-hidden="true">' + nn(n) + '</span>' +
        '<span class="pieza__lamina">' + lamina(p, i === 0, i) + '</span>' +
        '<span class="pieza__ficha">' +
          '<span>' +
            '<span class="ficha__id">Pieza ' + nn(n) + ' / ' + nn(total) + ' · ' + escapar(p.categoria || 'Sin categoría') + '</span>' +
            '<span class="ficha__nombre">' + escapar(p.nombre) + '</span>' +
          '</span>' +
          '<span class="ficha__derecha">' +
            '<span class="ficha__precio">' + precios + '</span>' +
            '<span class="ficha__rareza ' + est.clase + '"><b>' + nn(n) + '</b><span>' + est.texto + '</span></span>' +
          '</span>' +
        '</span>' +
      '</button>';
    }).join('');

    $('piezas').innerHTML = '<div class="escenario">' + piezas + '</div>';
    medirEscenario();
  }

  /* ---------------- El recorrido ----------------

     Un solo bucle. Traduce la posición del scroll a una posición
     en la colección —un número decimal: 2.4 es "entre la tercera y
     la cuarta"— y de ahí saca los dos números de cada pieza.

     Ninguna pieza se desplaza en vertical. Por eso el scroll no se
     siente como bajar. */

  var esc = { activo: false, inicio: 0, alto: 1, n: 0, nodos: [], actual: -1 };

  // Cuánto scroll ocupa pasar de una pieza a la siguiente.
  var PASO = 0.9;   // en pantallas

  function medirEscenario() {
    var cont = $('piezas');
    esc.nodos = [].slice.call(cont.querySelectorAll('.pieza'));
    esc.n = esc.nodos.length;

    if (!esc.n || quieto.matches) {
      cont.style.height = '';
      esc.activo = false;
      return;
    }

    // Una pantalla para el escenario, más un paso por cada salto.
    cont.style.height = (window.innerHeight * (1 + (esc.n - 1) * PASO)) + 'px';

    var caja = cont.getBoundingClientRect();
    esc.inicio = caja.top + window.pageYOffset;
    esc.alto = Math.max(1, cont.offsetHeight - window.innerHeight);
    esc.activo = true;
    recorrer();
  }

  function recorrer() {
    if (!esc.activo) return;

    var avance = (window.pageYOffset - esc.inicio) / esc.alto;
    avance = Math.min(1, Math.max(0, avance));

    // Posición dentro de la colección: 0 es la primera centrada,
    // n-1 la última.
    var pos = avance * (esc.n - 1);
    var cerca = Math.round(pos);

    for (var i = 0; i < esc.n; i++) {
      var t = pos - i;                 // <0 viene llegando, >0 ya pasó
      var a = t < 0 ? -t : t;
      var nodo = esc.nodos[i];

      // Fuera del relevo no se pinta. Un elemento invisible se
      // sigue componiendo, y acá cada lámina lleva un desenfoque:
      // componer un blur que nadie ve es trabajo regalado en cada
      // cuadro.
      var fuera = a > 0.92;
      if (nodo._fuera !== fuera) {
        nodo.classList.toggle('fuera', fuera);
        nodo._fuera = fuera;
      }
      if (fuera) {
        if (nodo._t !== 9) { nodo.style.setProperty('--a', 1); nodo._t = 9; }
        continue;
      }

      if (nodo._t !== undefined && Math.abs(nodo._t - t) < 0.002) continue;
      nodo._t = t;
      nodo.style.setProperty('--t', t.toFixed(4));
      nodo.style.setProperty('--a', a.toFixed(4));
    }

    // Solo la pieza del centro recibe clics.
    if (cerca !== esc.actual) {
      if (esc.nodos[esc.actual]) esc.nodos[esc.actual].classList.remove('activa');
      if (esc.nodos[cerca]) esc.nodos[cerca].classList.add('activa');
      esc.actual = cerca;
    }
  }

  /* ---------------- Vigilancia del scroll ----------------

     Un solo oyente para toda la página, y un cuadro por evento.
     Ni el escenario ni la cabecera piden el suyo por separado. */

  function vigilarScroll() {
    var cab = document.querySelector('.cabecera');
    var pegadaAntes = false;
    var pedido = false;

    function marco() {
      pedido = false;
      var pegada = window.pageYOffset > 12;
      if (pegada !== pegadaAntes) { cab.classList.toggle('pegada', pegada); pegadaAntes = pegada; }
      recorrer();
    }

    addEventListener('scroll', function () {
      if (pedido) return;
      pedido = true;
      requestAnimationFrame(marco);
    }, { passive: true });

    var reMedir;
    addEventListener('resize', function () {
      clearTimeout(reMedir);
      reMedir = setTimeout(medirEscenario, 180);
    });

    // Las fotos entran tarde y cambian el alto de la lámina: hay
    // que volver a medir cuando terminan de cargar.
    addEventListener('load', medirEscenario);

    marco();
  }

  /* ---------------- Cursor ----------------
     Nombra la acción. Solo donde hay puntero fino. */

  var ROTULOS = { ver: 'Ver', explorar: 'Explorar', pedir: 'Pedir', ir: 'Ir',
                  cerrar: 'Cerrar', abrir: 'Asomarse' };

  function armarCursor() {
    if (!finoYconHover.matches || quieto.matches) return;
    var cursor = $('cursor');
    var texto = $('cursorTexto');
    document.body.classList.add('cursor-propio');

    var x = 0, y = 0, pedido = false;
    function pintar() {
      pedido = false;
      cursor.style.setProperty('--x', x + 'px');
      cursor.style.setProperty('--y', y + 'px');
    }

    addEventListener('pointermove', function (e) {
      x = e.clientX; y = e.clientY;
      if (!pedido) { pedido = true; requestAnimationFrame(pintar); }

      var conRotulo = e.target.closest ? e.target.closest('[data-cursor]') : null;
      var clave = conRotulo && conRotulo.dataset.cursor;
      var rotulo = clave && ROTULOS[clave];
      if (!rotulo && e.target.closest && e.target.closest('a, button')) rotulo = ROTULOS.ir;
      if (texto.textContent !== (rotulo || '')) texto.textContent = rotulo || '';
      cursor.classList.toggle('tiene-texto', !!rotulo);

      // La lámina se inclina un poco hacia el puntero.
      var plato = e.target.closest ? e.target.closest('.pieza__lamina') : null;
      if (plato) {
        var c = plato.getBoundingClientRect();
        plato.style.setProperty('--mx', (((e.clientX - c.left) / c.width) - 0.5).toFixed(3));
      }
    }, { passive: true });

    addEventListener('pointerdown', function () { cursor.classList.add('tiene-texto'); }, { passive: true });
  }

  /* ---------------- Universo ----------------

     La ficha completa. La lámina crece hasta llenar la pantalla y
     recién ahí aparece la ficha: por eso se siente que se entró
     dentro de la pieza y no que se cargó otra página. */

  function registro(p, n, total) {
    var s = estado.settings;
    var est = estadoDe(p);
    var filas = [
      ['Pieza', nn(n) + ' de ' + nn(total)],
      ['Categoría', p.categoria || '—'],
      ['Técnica', 'Crochet a mano, una hebra'],
      ['Detalles', p.detalles || '—'],
      ['Estado', est.texto],
      ['Envío', s.envioTexto || '—']
    ];
    return '<dl class="registro">' + filas.map(function (f) {
      return '<div><dt>' + escapar(f[0]) + '</dt><dd>' + escapar(f[1]) + '</dd></div>';
    }).join('') + '</dl>';
  }

  function abrirUniverso(id, desde) {
    var lista = ordenadas();
    var i = lista.findIndex(function (x) { return x.id === id; });
    if (i === -1) return;
    var p = lista[i];
    var n = i + 1, total = lista.length;
    estado.abierto = p;

    var precios = precio(p.precio);
    if (p.precioAntes && p.precioAntes > p.precio) precios += '<del>' + precio(p.precioAntes) + '</del>';

    var laminas = (p.fotos && p.fotos.length)
      ? p.fotos.map(function (f, k) {
          return '<div class="universo__lamina" data-cursor="explorar">' +
            '<img src="' + escapar(f) + '" alt="' + escapar(p.nombre) + ' — ' + (k + 1) + '" loading="lazy" decoding="async">' +
            '</div>';
        }).join('')
      : '<div class="universo__lamina">' +
          '<img src="/img/muestra/' + muestraPara(p, i) + '.webp" ' +
          'alt="Foto de muestra: ' + escapar(p.nombre) + '" loading="lazy" decoding="async">' +
          '<span class="plato__falta">Foto de muestra</span></div>';

    var mensaje = '¡Hola! Me interesa la pieza ' + nn(n) + ', "' + p.nombre + '" (' + precio(p.precio) + '). ¿Sigue disponible?';

    $('universoCaja').innerHTML =
      '<div class="universo__laminas">' + laminas + '</div>' +
      '<div class="universo__info">' +
        '<p class="universo__id">Pieza ' + nn(n) + ' / ' + nn(total) + '</p>' +
        '<h2 class="universo__nombre" id="universoNombre">' + escapar(p.nombre) + '</h2>' +
        '<div class="universo__precio">' + precios + '</div>' +
        (p.descripcion ? '<p class="universo__texto">' + escapar(p.descripcion) + '</p>' : '') +
        registro(p, n, total) +
        '<div class="universo__accion">' +
          '<a class="boton" data-cursor="pedir" href="' + enlaceWhatsapp(mensaje) + '" target="_blank" rel="noopener">' +
            (p.agotado ? 'Consultar por encargo' : 'Pedir por WhatsApp') + '</a>' +
          '<p class="universo__nota">' + escapar(estado.settings.envioTexto || '') + '</p>' +
        '</div>' +
      '</div>';

    estado.focoPrevio = document.activeElement;

    function mostrar() {
      $('universo').classList.add('abierto');
      document.body.classList.add('sin-scroll');
      $('universoCerrar').focus();
    }

    if (desde && !quieto.matches && typeof desde.animate === 'function') expandir(desde, mostrar);
    else mostrar();
  }

  // La lámina crece desde donde está hasta llenar la pantalla.
  function expandir(plato, listo) {
    var r = plato.getBoundingClientRect();
    var clon = plato.cloneNode(true);
    clon.style.cssText =
      'position:fixed;margin:0;z-index:210;transform:none;aspect-ratio:auto;pointer-events:none;' +
      'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;';
    document.body.appendChild(clon);

    var anim = clon.animate([
      { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' },
      { left: '0px', top: '0px', width: '100vw', height: '100vh' }
    ], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });

    var cerrado = false;
    function terminar() {
      if (cerrado) return;
      cerrado = true;
      listo();
      setTimeout(function () { clon.remove(); }, 240);
    }
    anim.onfinish = terminar;
    // Si la animación no llega a terminar, la ficha se abre igual.
    setTimeout(terminar, 700);
  }

  function cerrarUniverso() {
    var u = $('universo');
    if (!u.classList.contains('abierto')) return;
    u.classList.remove('abierto');
    document.body.classList.remove('sin-scroll');
    estado.abierto = null;
    if (estado.focoPrevio && estado.focoPrevio.focus) estado.focoPrevio.focus();
    estado.focoPrevio = null;
  }

  // Con la ficha abierta, el tabulador no se escapa a la página.
  function atraparFoco(e) {
    if (e.key !== 'Tab' || !$('universo').classList.contains('abierto')) return;
    var focables = $('universo').querySelectorAll('a[href], button:not([disabled])');
    if (!focables.length) return;
    var primero = focables[0], ultimo = focables[focables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  }

  /* ---------------- Aparición ---------------- */

  var observador = null;
  function observarAparicion() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.aparece').forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    if (!observador) {
      observador = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('visible'); observador.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    document.querySelectorAll('.aparece:not(.visible)').forEach(function (el) { observador.observe(el); });
  }

  /* ---------------- Eventos ---------------- */

  function conectarEventos() {
    $('piezas').addEventListener('click', function (e) {
      var b = e.target.closest('[data-abrir]');
      if (b) abrirUniverso(b.dataset.abrir, b);
    });

    $('universoCerrar').addEventListener('click', cerrarUniverso);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') cerrarUniverso();
      atraparFoco(e);
    });

    var boton = $('menuBoton');
    boton.addEventListener('click', function () {
      var abierto = $('menuMovil').classList.toggle('abierto');
      boton.setAttribute('aria-expanded', String(abierto));
    });
    $('menuMovil').addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        $('menuMovil').classList.remove('abierto');
        boton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------------- El portico ----------------

     Tres estados: el cuadro quieto, la camara saliendo por la
     ventana, y el paisaje congelado con el nombre encima.

     El disparador es invisible, y eso tiene un costo: no hay
     ninguna pista de que haya algo que tocar. Por eso hay tres
     formas de abrirlo —clic o teclado, el primer scroll, o un
     temporizador de 4,5 segundos— y no una sola. Sin la red, una
     parte de las visitas no veria nunca el nombre de la tienda.
     Para exigir el clic y nada mas, borrar la linea del setTimeout. */

  function armarPortico() {
    var caja = $('portico');
    var video = $('porticoVideo');
    if (!caja || !video) return;

    var boton = $('porticoDisparo');
    var lanzado = false, revelado = false, red = null, seguro = null;

    function revelar() {
      if (revelado) return;
      revelado = true;
      clearTimeout(red); clearInterval(seguro);
      caja.classList.remove('corriendo');
      caja.classList.add('revelado');
      document.body.classList.remove('portico-cerrado');
      document.body.classList.add('portico-abierto');
      if (boton && boton.parentNode) boton.parentNode.removeChild(boton);
    }

    function lanzar() {
      if (lanzado) return;
      lanzado = true;
      clearTimeout(red);

      if (quieto.matches) { revelar(); return; }

      caja.classList.add('corriendo');
      // Si el navegador se niega a reproducir, no se puede dejar la
      // portada trabada: se revela igual.
      var promesa = video.play();
      if (promesa && promesa.catch) promesa.catch(revelar);

      // Vigilante de progreso, no un plazo fijo. Un plazo cortaria
      // el video en una conexion lenta —o en una pestana de fondo,
      // donde el navegador estrangula la reproduccion—. Esto solo
      // se rinde cuando el video deja de avanzar de verdad.
      var ultimo = -1, quieto_desde = Date.now();
      seguro = setInterval(function () {
        if (revelado) { clearInterval(seguro); return; }
        if (video.currentTime > ultimo + 0.01) {
          ultimo = video.currentTime;
          quieto_desde = Date.now();
        } else if (Date.now() - quieto_desde > 6000) {
          clearInterval(seguro);
          revelar();
        }
      }, 500);
    }

    video.addEventListener('ended', revelar);
    if (boton) boton.addEventListener('click', lanzar);
    addEventListener('scroll', lanzar, { passive: true, once: true });

    if (quieto.matches) { revelar(); return; }
    document.body.classList.add('portico-cerrado');
    red = setTimeout(lanzar, 4500);
  }

  /* ---------------- Arranque ----------------

     La entrada se habilita solo si la página se está viendo. Si
     carga en una pestaña de fondo, las animaciones no arrancarían
     y el contenido se quedaría en su primer fotograma —invisible—
     hasta que alguien mire. Sin esta clase, no hay animación y no
     hay nada que esperar. */

  function habilitarEntrada() {
    if (document.visibilityState !== 'visible') return;
    document.documentElement.classList.add('anima');
  }

  habilitarEntrada();
  armarUmbral();
  armarPortico();
  armarCursor();

  fetch('/api/site')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      estado.settings = data.settings || {};
      estado.categorias = data.categorias || [];
      estado.productos = data.productos || [];
      pintarTextos();
      pintarEscenas();
      conectarEventos();
      vigilarScroll();
      observarAparicion();
    })
    .catch(function () {
      // Si los datos no llegan, lo fijo tiene que verse igual: si
      // no, media página se queda en opacidad 0 para siempre.
      document.querySelectorAll('.aparece').forEach(function (el) { el.classList.add('visible'); });
      $('piezas').innerHTML = '<div class="vacio"><p>No se pudo cargar la colección.</p>' +
        '<p style="margin:0">Revisa tu conexión y recarga la página.</p></div>';
      aviso('No se pudo cargar la tienda. Recarga la página.');
    });
})();
