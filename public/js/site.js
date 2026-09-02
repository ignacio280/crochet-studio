/* Sitio publico: pide los datos a /api/site y arma la pagina. */
(function () {
  'use strict';

  var estado = { settings: {}, categorias: [], productos: [], filtro: 'todo', abierto: null };

  var $ = function (id) { return document.getElementById(id); };

  var quieto = matchMedia('(prefers-reduced-motion: reduce)');

  function escapar(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function precio(valor) {
    var moneda = estado.settings.moneda || 'CLP';
    try {
      return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: moneda,
        maximumFractionDigits: 0
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

  function foto(src, alt, prioritaria) {
    if (!src) return '<div class="sin-foto"><span>foto en camino</span></div>';
    var carga = prioritaria
      ? 'loading="eager" fetchpriority="high" decoding="async"'
      : 'loading="lazy" decoding="async"';
    return '<img src="' + escapar(src) + '" alt="' + escapar(alt || '') + '" ' + carga + '>';
  }

  function enlaceWhatsapp(mensaje) {
    var num = String(estado.settings.whatsapp || '').replace(/\D/g, '');
    if (!num) return '#contacto';
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(mensaje);
  }

  /* ---------------- Portada ----------------
     El nombre llega partido en dos mitades que se juntan en el
     centro. El servidor ya escribió el nombre entero en el HTML,
     asi que sin JavaScript se ve igual, solo que quieto. */

  function partirNombre() {
    var el = $('portadaTitulo');
    if (!el) return;
    var texto = (el.textContent || '').trim();
    if (!texto || quieto.matches) return;
    var corte = Math.ceil(texto.length / 2);
    el.innerHTML =
      '<span class="mitad izq">' + escapar(texto.slice(0, corte)) + '</span>' +
      '<span class="mitad der">' + escapar(texto.slice(corte)) + '</span>';
  }

  /* ---------------- Textos ---------------- */

  function pintarTextos() {
    var s = estado.settings;
    document.title = (s.marca || 'Tienda') + ' — ' + (s.tagline || 'Taller de crochet');

    $('marca').textContent = s.marca || 'Tienda';

    $('anuncio').textContent = s.anuncio || '';
    $('anuncio').style.display = s.anuncio ? '' : 'none';

    // La foto de portada pasa a ser el fondo del telón: se ve, pero
    // no compite con el nombre.
    if (s.heroImagen) {
      $('portadaFondo').style.backgroundImage = 'url("' + s.heroImagen.replace(/"/g, '%22') + '")';
      $('portadaFondo').classList.add('tiene');
    }

    $('manifiestoTitulo').textContent = s.heroTitulo || '';
    $('manifiestoTexto').textContent = s.heroTexto || '';
    $('manifiestoCta').textContent = s.heroCta || 'Ver la tienda';

    $('bandaTitulo').textContent = s.bandaTitulo || '';
    $('bandaTexto').textContent = s.bandaTexto || '';
    $('bandaCta').textContent = s.bandaCta || 'Escríbeme';
    $('bandaCta').href = enlaceWhatsapp('¡Hola! Quiero encargar algo tejido.');

    $('pasosTitulo').textContent = s.pasosTitulo || 'Cómo encargar';
    $('pasosGrid').innerHTML = (s.pasos || []).map(function (p, i) {
      var n = i + 1;
      return '<div class="paso aparece" style="--i:' + i + '">' +
        '<div class="paso__numero">' + (n < 10 ? '0' + n : n) + '</div>' +
        '<h3 class="paso__titulo">' + escapar(p.titulo) + '</h3>' +
        '<p class="paso__texto">' + escapar(p.texto) + '</p>' +
        '</div>';
    }).join('');

    $('tiraEnvio').textContent = s.envioTexto || '';

    $('pieMarca').textContent = s.marca || '';
    $('pieTexto').textContent = s.tagline || '';
    // La Ley del Consumidor pide que el vendedor esté identificado. Si los
    // datos están cargados, van en el pie de todas las páginas.
    var identidad = [s.legalNombre, s.legalRut].filter(Boolean).join(' · ');
    $('pieCopy').textContent = '© ' + new Date().getFullYear() + ' ' + (s.marca || '') +
      (identidad ? '  ·  ' + identidad : '');
    $('pieFirma').textContent = s.pieDeFirma || '';

    var contacto = [];
    if (s.whatsapp) {
      contacto.push('<li><a href="' + enlaceWhatsapp('¡Hola! Vengo del sitio.') + '" target="_blank" rel="noopener">WhatsApp</a></li>');
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

  /* ---------------- Catálogo ---------------- */

  function pintarFiltros() {
    var usadas = {};
    estado.productos.forEach(function (p) { if (p.categoria) usadas[p.categoria] = true; });
    var cats = estado.categorias.filter(function (c) { return usadas[c]; });
    if (!cats.length) { $('filtros').innerHTML = ''; return; }

    var botones = ['<button class="filtro' + (estado.filtro === 'todo' ? ' activo' : '') + '" data-cat="todo">Todo</button>'];
    cats.forEach(function (c) {
      botones.push('<button class="filtro' + (estado.filtro === c ? ' activo' : '') +
        '" data-cat="' + escapar(c) + '">' + escapar(c) + '</button>');
    });
    $('filtros').innerHTML = botones.join('');
  }

  // Cada pieza lleva exactamente un estado, y ese estado es lo único
  // que usa color: menta si está, rosa si no. Nada más se pinta.
  function metaDe(p) {
    var partes = [];
    if (p.categoria) partes.push(escapar(p.categoria));
    var clase = p.agotado ? 'estado--no' : 'estado--hay';
    var texto = p.agotado ? 'Agotado' : 'Disponible';
    partes.push('<span class="' + clase + '">' + texto + '</span>');
    return partes.join(' · ');
  }

  function pintarGrid() {
    var lista = estado.productos.filter(function (p) {
      return estado.filtro === 'todo' || p.categoria === estado.filtro;
    });
    lista.sort(function (a, b) { return (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0); });

    if (!lista.length) {
      $('grid').innerHTML = '<div class="vacio"><p>Todavía no hay piezas publicadas aquí.</p>' +
        '<p style="margin:0"><a href="' + enlaceWhatsapp('¡Hola! Quiero encargar algo tejido.') +
        '" target="_blank" rel="noopener">Escríbeme y lo tejo para ti</a></p></div>';
      medirEscenario();
      return;
    }

    $('grid').innerHTML = lista.map(function (p, i) {
      var precios = precio(p.precio);
      if (p.precioAntes && p.precioAntes > p.precio) precios += '<del>' + precio(p.precioAntes) + '</del>';

      return '<button class="pieza" data-id="' + escapar(p.id) + '">' +
        '<span class="pieza__media">' + foto(p.fotos[0], p.nombre, i < 3) + '</span>' +
        '<span class="pieza__regla"></span>' +
        '<span class="pieza__fila">' +
          '<span class="pieza__nombre">' + escapar(p.nombre) + '</span>' +
          '<span class="pieza__precio">' + precios + '</span>' +
        '</span>' +
        '<span class="pieza__meta">' + metaDe(p) + '</span>' +
        '</button>';
    }).join('');

    medirEscenario();
  }

  /* ---------------- Galería horizontal ----------------

     El bloque exterior mide una pantalla más el recorrido de la
     fila; el escenario de dentro se queda pegado. Así el scroll
     vertical de siempre mueve la fila de lado, sin secuestrar la
     rueda ni romper el teclado.

     Si no hay ancho, o si el sistema pide menos movimiento, no se
     enciende: la fila se arrastra a mano y ya está. */

  var esc = { activo: false, inicio: 0, alto: 0, recorrido: 0 };

  // Se suman los hijos en vez de leer offsetLeft del ultimo. La
  // posicion depende del modo en que este la fila; el ancho de cada
  // tarjeta, no. Asi se puede medir sin cambiarle el modo, que era
  // lo que dejaba al navegador recalculando en bucle.
  function anchoDeFila(track) {
    var estilo = getComputedStyle(track);
    var hueco = parseFloat(estilo.columnGap || estilo.gap) || 0;
    var ancho = (parseFloat(estilo.paddingLeft) || 0) + (parseFloat(estilo.paddingRight) || 0);
    var hijos = track.children;
    for (var i = 0; i < hijos.length; i++) {
      ancho += hijos[i].offsetWidth;
      if (i) ancho += hueco;
    }
    return ancho;
  }

  function medirEscenario() {
    var gal = document.querySelector('.gal');
    var track = $('grid');
    if (!gal || !track) return;
    var ghost = gal.querySelector('.gal-ghost');

    var puedo = window.innerWidth >= 861 && !quieto.matches;

    var recorrido = puedo ? Math.max(0, anchoDeFila(track) - window.innerWidth) : 0;

    // Sin ancho que recorrer —o sin permiso— la fila vuelve a ser una
    // fila que se arrastra a mano.
    if (!puedo || recorrido < 40) {
      if (gal.classList.contains('gal--escenario')) gal.classList.remove('gal--escenario');
      if (gal.style.height) gal.style.height = '';
      track.style.transform = '';
      if (ghost) ghost.style.transform = '';
      esc.activo = false;
      return;
    }

    if (!gal.classList.contains('gal--escenario')) gal.classList.add('gal--escenario');
    var alto = (window.innerHeight + recorrido) + 'px';
    if (gal.style.height !== alto) gal.style.height = alto;

    var caja = gal.getBoundingClientRect();
    esc.inicio = caja.top + window.pageYOffset;
    esc.alto = gal.offsetHeight - window.innerHeight;
    esc.recorrido = recorrido;
    esc.activo = true;
    moverEscenario();
  }

  function moverEscenario() {
    if (!esc.activo) return;
    var track = $('grid');
    var ghost = document.querySelector('.gal-ghost');
    var avance = (window.pageYOffset - esc.inicio) / (esc.alto || 1);
    avance = Math.min(1, Math.max(0, avance));
    track.style.transform = 'translate3d(' + (-esc.recorrido * avance) + 'px,0,0)';
    // El fantasma va más lento: es lo que da fondo donde no hay sombras.
    if (ghost) ghost.style.transform = 'translate(' + (-esc.recorrido * avance * 0.35) + 'px,-50%)';
  }

  /* ---------------- Ficha ---------------- */

  function abrirFicha(id) {
    var p = estado.productos.find(function (x) { return x.id === id; });
    if (!p) return;
    estado.abierto = p;

    $('modalCategoria').innerHTML = metaDe(p);
    $('modalNombre').textContent = p.nombre;

    var html = precio(p.precio);
    if (p.precioAntes && p.precioAntes > p.precio) html += '<del>' + precio(p.precioAntes) + '</del>';
    $('modalPrecio').innerHTML = html;

    $('modalDescripcion').textContent = p.descripcion || '';
    $('modalDetalles').textContent = p.detalles || '';
    $('modalDetalles').style.display = p.detalles ? '' : 'none';

    mostrarFoto(0);
    $('modalMiniaturas').innerHTML = p.fotos.length > 1
      ? p.fotos.map(function (f, i) {
          return '<button data-i="' + i + '" class="' + (i === 0 ? 'activa' : '') + '" aria-label="Foto ' + (i + 1) + '">' +
            '<img src="' + escapar(f) + '" alt=""></button>';
        }).join('')
      : '';

    var mensaje = '¡Hola! Me interesa "' + p.nombre + '" (' + precio(p.precio) + '). ¿Sigue disponible?';
    var boton = $('modalPedir');
    boton.href = enlaceWhatsapp(mensaje);
    boton.textContent = p.agotado ? 'Consultar por encargo' : 'Pedir por WhatsApp';
    $('modalNota').textContent = estado.settings.envioTexto || '';

    estado.focoPrevio = document.activeElement;
    $('modal').classList.add('abierto');
    document.body.classList.add('sin-scroll');
    $('modal').querySelector('.modal__cerrar').focus();
  }

  function mostrarFoto(i) {
    var p = estado.abierto;
    if (!p) return;
    $('modalPrincipal').innerHTML = foto(p.fotos[i], p.nombre);
    var minis = $('modalMiniaturas').querySelectorAll('button');
    for (var k = 0; k < minis.length; k++) {
      minis[k].classList.toggle('activa', Number(minis[k].dataset.i) === i);
    }
  }

  function cerrarFicha() {
    if (!$('modal').classList.contains('abierto')) return;
    $('modal').classList.remove('abierto');
    document.body.classList.remove('sin-scroll');
    estado.abierto = null;
    // El foco vuelve a la tarjeta desde donde se abrió, no al principio.
    if (estado.focoPrevio && estado.focoPrevio.focus) estado.focoPrevio.focus();
    estado.focoPrevio = null;
  }

  // Con la ficha abierta, el tabulador no se escapa al resto de la página.
  function atraparFoco(e) {
    if (e.key !== 'Tab' || !$('modal').classList.contains('abierto')) return;
    var focables = $('modal').querySelectorAll('a[href], button:not([disabled])');
    if (!focables.length) return;
    var primero = focables[0];
    var ultimo = focables[focables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  }

  /* ---------------- Aparecer al scrollear ---------------- */

  var observador = null;
  function observarAparicion() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.aparece').forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    if (!observador) {
      observador = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observador.unobserve(e.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    document.querySelectorAll('.aparece:not(.visible)').forEach(function (el) { observador.observe(el); });
  }

  /* ---------------- Eventos ---------------- */

  function conectarEventos() {
    $('filtros').addEventListener('click', function (e) {
      var b = e.target.closest('.filtro');
      if (!b) return;
      estado.filtro = b.dataset.cat;
      pintarFiltros();
      pintarGrid();
    });

    $('grid').addEventListener('click', function (e) {
      var b = e.target.closest('.pieza');
      if (b) abrirFicha(b.dataset.id);
    });

    $('modalMiniaturas').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) mostrarFoto(Number(b.dataset.i));
    });

    $('modal').addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-cerrar')) cerrarFicha();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') cerrarFicha();
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

    var reMedir;
    addEventListener('resize', function () {
      clearTimeout(reMedir);
      reMedir = setTimeout(medirEscenario, 160);
    });

    // Las fotos entran tarde y cambian el ancho de la fila: hay que
    // volver a medir cuando terminan de cargar.
    addEventListener('load', medirEscenario);
  }

  function vigilarScroll() {
    var cab = document.querySelector('.cabecera');
    var pegadaAntes = false;
    var pedido = false;

    function marco() {
      pedido = false;
      var pegada = window.pageYOffset > 12;
      if (pegada !== pegadaAntes) { cab.classList.toggle('pegada', pegada); pegadaAntes = pegada; }
      moverEscenario();
    }

    addEventListener('scroll', function () {
      if (pedido) return;
      pedido = true;
      requestAnimationFrame(marco);
    }, { passive: true });

    marco();
  }

  /* ---------------- Arranque ---------------- */

  partirNombre();

  fetch('/api/site')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      estado.settings = data.settings || {};
      estado.categorias = data.categorias || [];
      estado.productos = data.productos || [];
      pintarTextos();
      pintarFiltros();
      pintarGrid();
      conectarEventos();
      vigilarScroll();
      observarAparicion();
    })
    .catch(function () {
      // Si los datos no llegan, igual hay que mostrar lo que es fijo:
      // de lo contrario media página se queda en opacidad 0 para siempre.
      document.querySelectorAll('.aparece').forEach(function (el) { el.classList.add('visible'); });
      var grid = $('grid');
      if (grid) {
        grid.innerHTML = '<div class="vacio"><p>No se pudo cargar el catálogo.</p>' +
          '<p style="margin:0">Revisa tu conexión y recarga la página.</p></div>';
      }
      aviso('No se pudo cargar la tienda. Recarga la página.');
    });
})();
