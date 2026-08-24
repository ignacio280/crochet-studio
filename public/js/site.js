/* Sitio publico: pide los datos a /api/site y arma la pagina. */
(function () {
  'use strict';

  var estado = { settings: {}, categorias: [], productos: [], filtro: 'todo', abierto: null };

  var $ = function (id) { return document.getElementById(id); };

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

  // `prioritaria` es para la foto de portada: va arriba del pliegue, así que
  // cargarla en lazy retrasa justo lo primero que ve la visita.
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

  /* ---------------- Textos ---------------- */

  function pintarTextos() {
    var s = estado.settings;
    document.title = (s.marca || 'Tienda') + ' — ' + (s.tagline || 'Taller de crochet');

    var marca = escapar(s.marca || 'Tienda');
    $('marca').textContent = s.marca || 'Tienda';

    $('anuncio').textContent = s.anuncio || '';
    $('anuncio').style.display = s.anuncio ? '' : 'none';

    $('portadaEtiqueta').textContent = s.tagline || '';
    $('portadaTitulo').textContent = s.heroTitulo || '';
    $('portadaBajada').textContent = s.heroTexto || '';
    $('portadaCta').textContent = s.heroCta || 'Ver la tienda';
    $('portadaFoto').innerHTML = foto(s.heroImagen, s.marca, true);

    $('bandaTitulo').textContent = s.bandaTitulo || '';
    $('bandaTexto').textContent = s.bandaTexto || '';
    $('bandaCta').textContent = s.bandaCta || 'Escríbeme';
    $('bandaCta').href = enlaceWhatsapp('¡Hola! Quiero encargar algo tejido.');

    $('pasosTitulo').textContent = s.pasosTitulo || 'Cómo encargar';
    $('pasosGrid').innerHTML = (s.pasos || []).map(function (p, i) {
      return '<div class="paso aparece" style="--i:' + i + '">' +
        '<div class="paso__numero">' + (i + 1) + '</div>' +
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

  function pintarGrid() {
    var lista = estado.productos.filter(function (p) {
      return estado.filtro === 'todo' || p.categoria === estado.filtro;
    });
    lista.sort(function (a, b) { return (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0); });

    if (!lista.length) {
      $('grid').innerHTML = '<div class="vacio"><p>Todavía no hay piezas publicadas aquí.</p>' +
        '<p style="margin:0"><a href="' + enlaceWhatsapp('¡Hola! Quiero encargar algo tejido.') +
        '" target="_blank" rel="noopener">Escríbeme y lo tejo para ti</a></p></div>';
      return;
    }

    $('grid').innerHTML = lista.map(function (p, i) {
      var cinta = '';
      if (p.agotado) cinta = '<span class="producto__cinta producto__cinta--agotado">Agotado</span>';
      else if (p.destacado) cinta = '<span class="producto__cinta">Favorito</span>';

      var precios = precio(p.precio);
      if (p.precioAntes && p.precioAntes > p.precio) precios += '<del>' + precio(p.precioAntes) + '</del>';

      return '<button class="producto aparece" style="--i:' + (i % 8) + '" data-id="' + escapar(p.id) + '">' +
        '<div class="producto__foto">' + foto(p.fotos[0], p.nombre) + cinta + '</div>' +
        '<div class="producto__nombre">' + escapar(p.nombre) + '</div>' +
        '<div class="producto__precio">' + precios + '</div>' +
        '</button>';
    }).join('');

    observarAparicion();
  }

  /* ---------------- Ficha ---------------- */

  function abrirFicha(id) {
    var p = estado.productos.find(function (x) { return x.id === id; });
    if (!p) return;
    estado.abierto = p;

    $('modalCategoria').textContent = p.categoria || '';
    $('modalNombre').textContent = p.nombre;

    var html = precio(p.precio);
    if (p.precioAntes && p.precioAntes > p.precio) html += '<del>' + precio(p.precioAntes) + '</del>';
    if (p.agotado) html += ' <span style="font-size:12px;letter-spacing:.16em;text-transform:uppercase">— agotado</span>';
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
      var b = e.target.closest('.producto');
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
  }

  function vigilarCabecera() {
    var cab = document.querySelector('.cabecera');
    var ultimo = false;
    addEventListener('scroll', function () {
      var pegada = scrollY > 12;
      if (pegada !== ultimo) { cab.classList.toggle('pegada', pegada); ultimo = pegada; }
    }, { passive: true });
  }

  /* ---------------- Arranque ---------------- */

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
      vigilarCabecera();
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
