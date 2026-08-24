/* Panel de administracion. Sin librerias: solo fetch y DOM. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var datos = { settings: {}, categorias: [], productos: [] };
  var borrador = null;      // copia de settings/categorias mientras se edita
  var editando = null;      // producto abierto en el editor
  var sucio = false;

  /* ================= utilidades ================= */

  function aviso(texto, esError) {
    var el = $('aviso');
    el.textContent = texto;
    el.classList.toggle('error', !!esError);
    el.classList.add('visible');
    clearTimeout(aviso._t);
    aviso._t = setTimeout(function () { el.classList.remove('visible'); }, 3600);
  }

  function escapar(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function plata(v) {
    var moneda = (borrador || datos.settings).moneda || 'CLP';
    try {
      return new Intl.NumberFormat('es-CL', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(v || 0);
    } catch (e) {
      return '$' + (v || 0);
    }
  }

  function api(ruta, opciones) {
    opciones = opciones || {};
    if (opciones.body && typeof opciones.body !== 'string') {
      opciones.body = JSON.stringify(opciones.body);
      opciones.headers = { 'content-type': 'application/json' };
    }
    return fetch(ruta, opciones).then(function (r) {
      // Un 401 en el propio login es "clave incorrecta", no una sesion vencida:
      // solo las rutas del panel mandan de vuelta a la pantalla de entrada.
      if (r.status === 401 && ruta !== '/api/login') {
        mostrarEntrada();
        throw new Error('Se cerró la sesión. Entra de nuevo.');
      }
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Algo falló');
        return d;
      });
    });
  }

  function marcarSucio() {
    sucio = true;
    $('barraGuardar').classList.add('visible');
  }

  function limpiarSucio() {
    sucio = false;
    $('barraGuardar').classList.remove('visible');
  }

  /* ================= entrada ================= */

  function mostrarEntrada() {
    $('entrada').classList.remove('oculto');
    $('panel').classList.add('oculto');
  }

  function mostrarPanel() {
    $('entrada').classList.add('oculto');
    $('panel').classList.remove('oculto');
  }

  $('formEntrada').addEventListener('submit', function (e) {
    e.preventDefault();
    $('errorEntrada').textContent = '';
    api('/api/login', { method: 'POST', body: { password: $('clave').value } })
      .then(function (r) {
        $('clave').value = '';
        mostrarPanel();
        if (r.claveDefecto) $('avisoClave').classList.remove('oculto');
        return cargar();
      })
      .catch(function (err) { $('errorEntrada').textContent = err.message; });
  });

  $('salir').addEventListener('click', function () {
    if (sucio && !confirm('Tienes cambios sin guardar. ¿Salir igual?')) return;
    api('/api/logout', { method: 'POST' }).then(mostrarEntrada);
  });

  /* ================= carga ================= */

  function cargar() {
    return api('/api/admin/data').then(function (d) {
      datos = d;
      borrador = JSON.parse(JSON.stringify({ settings: d.settings, categorias: d.categorias }));
      limpiarSucio();
      pintarSettings();
      pintarCategorias();
      pintarProductos();
      $('marcaBarra').textContent = d.settings.marca || '';
    });
  }

  /* ================= pestanas ================= */

  document.querySelectorAll('.pestana').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.pestana').forEach(function (x) { x.classList.remove('activa'); });
      b.classList.add('activa');
      var mapa = {
        productos: 'vistaProductos',
        textos: 'vistaTextos',
        contacto: 'vistaContacto',
        legal: 'vistaLegal',
        ajustes: 'vistaAjustes'
      };
      Object.keys(mapa).forEach(function (k) {
        $(mapa[k]).classList.toggle('oculto', k !== b.dataset.vista);
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  /* ================= settings ================= */

  function pintarSettings() {
    document.querySelectorAll('[data-set]').forEach(function (campo) {
      campo.value = borrador.settings[campo.dataset.set] == null ? '' : borrador.settings[campo.dataset.set];
      if (!campo._conectado) {
        campo._conectado = true;
        campo.addEventListener('input', function () {
          borrador.settings[campo.dataset.set] = campo.value;
          marcarSucio();
          if (campo.dataset.set === 'whatsapp') actualizarPruebaWhatsapp();
          if (campo.dataset.set === 'marca') $('marcaBarra').textContent = campo.value;
        });
      }
    });
    pintarPasos();
    pintarImagen('heroImagen', 'fotoHero');
    actualizarPruebaWhatsapp();
  }

  function actualizarPruebaWhatsapp() {
    var num = String(borrador.settings.whatsapp || '').replace(/\D/g, '');
    var a = $('probarWhatsapp');
    if (!num) {
      a.textContent = 'Falta tu número';
      a.removeAttribute('href');
      return;
    }
    a.textContent = 'Probar el enlace (abre WhatsApp con +' + num + ')';
    a.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent('Prueba desde mi tienda');
  }

  function pintarPasos() {
    var pasos = borrador.settings.pasos || [];
    $('editorPasos').innerHTML = pasos.map(function (p, i) {
      return '<div class="campo" style="border-top:1px solid rgba(42,35,32,.07);padding-top:16px">' +
        '<label>Paso ' + (i + 1) + '</label>' +
        '<input type="text" data-paso="' + i + '" data-campo="titulo" value="' + escapar(p.titulo) + '" style="margin-bottom:8px">' +
        '<textarea data-paso="' + i + '" data-campo="texto" rows="2">' + escapar(p.texto) + '</textarea>' +
        '</div>';
    }).join('');

    $('editorPasos').querySelectorAll('[data-paso]').forEach(function (campo) {
      campo.addEventListener('input', function () {
        borrador.settings.pasos[Number(campo.dataset.paso)][campo.dataset.campo] = campo.value;
        marcarSucio();
      });
    });
  }

  function pintarImagen(clave, contenedorId) {
    var caja = $(contenedorId);
    if (!caja) return;              // la seccion pudo haberse sacado del panel
    var src = borrador.settings[clave];
    if (!src) { caja.innerHTML = ''; return; }
    caja.innerHTML = '<div class="foto"><img src="' + escapar(src) + '" alt="">' +
      '<button class="foto__quitar" type="button" aria-label="Quitar">&times;</button></div>';
    caja.querySelector('.foto__quitar').addEventListener('click', function () {
      borrador.settings[clave] = '';
      pintarImagen(clave, contenedorId);
      marcarSucio();
    });
  }

  $('guardar').addEventListener('click', function () {
    var boton = this;
    boton.disabled = true;
    api('/api/admin/settings', {
      method: 'PUT',
      body: { settings: borrador.settings, categorias: borrador.categorias }
    })
      .then(function () {
        datos.settings = JSON.parse(JSON.stringify(borrador.settings));
        datos.categorias = borrador.categorias.slice();
        limpiarSucio();
        aviso('Listo, ya esta guardado.');
      })
      .catch(function (e) { aviso(e.message, true); })
      .finally(function () { boton.disabled = false; });
  });

  $('descartar').addEventListener('click', function () {
    if (!confirm('¿Descartar los cambios que no guardaste?')) return;
    borrador = JSON.parse(JSON.stringify({ settings: datos.settings, categorias: datos.categorias }));
    pintarSettings();
    pintarCategorias();
    limpiarSucio();
  });

  window.addEventListener('beforeunload', function (e) {
    if (sucio) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ================= imagenes ================= */

  // Achica la foto antes de guardarla: sin esto una foto del telefono
  // pesa 4 MB y la tienda se pone lenta.
  function procesarImagen(archivo, maxLado) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(archivo.type)) {
        reject(new Error('Ese archivo no es una imagen'));
        return;
      }
      var lector = new FileReader();
      lector.onerror = function () { reject(new Error('No se pudo leer la imagen')); };
      lector.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('No se pudo abrir la imagen')); };
        img.onload = function () {
          var escala = Math.min(1, maxLado / Math.max(img.width, img.height));
          var w = Math.round(img.width * escala);
          var h = Math.round(img.height * escala);
          var lienzo = document.createElement('canvas');
          lienzo.width = w;
          lienzo.height = h;
          var ctx = lienzo.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(lienzo.toDataURL('image/jpeg', 0.82));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  function pedirArchivos(multiple) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = !!multiple;
      input.addEventListener('change', function () { resolve(Array.from(input.files || [])); });
      input.click();
    });
  }

  function conectarSoltar(elemento, alRecibir, multiple) {
    elemento.addEventListener('click', function () {
      pedirArchivos(multiple).then(alRecibir);
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      elemento.addEventListener(ev, function (e) {
        e.preventDefault();
        elemento.classList.add('encima');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      elemento.addEventListener(ev, function (e) {
        e.preventDefault();
        elemento.classList.remove('encima');
      });
    });
    elemento.addEventListener('drop', function (e) {
      var archivos = Array.from(e.dataTransfer.files || []).filter(function (f) { return /^image\//.test(f.type); });
      if (archivos.length) alRecibir(multiple ? archivos : archivos.slice(0, 1));
    });
  }

  document.querySelectorAll('[data-imagen]').forEach(function (zona) {
    var clave = zona.dataset.imagen;
    conectarSoltar(zona, function (archivos) {
      if (!archivos.length) return;
      aviso('Procesando la foto...');
      procesarImagen(archivos[0], 1600)
        .then(function (dataUrl) {
          borrador.settings[clave] = dataUrl;
          pintarImagen(clave, zona.dataset.contenedor || 'fotoHero');
          marcarSucio();
          aviso('Foto lista. Acuérdate de guardar.');
        })
        .catch(function (e) { aviso(e.message, true); });
    }, false);
  });

  /* ================= categorias ================= */

  function pintarCategorias() {
    $('listaCategorias').innerHTML = borrador.categorias.map(function (c, i) {
      return '<span class="etiqueta-cat">' + escapar(c) +
        '<button type="button" data-i="' + i + '" aria-label="Quitar">&times;</button></span>';
    }).join('') || '<span style="color:#6f635b;font-size:14px">Todavía no hay categorías.</span>';

    $('listaCategorias').querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        borrador.categorias.splice(Number(b.dataset.i), 1);
        pintarCategorias();
        marcarSucio();
      });
    });
  }

  function agregarCategoria() {
    var valor = $('nuevaCategoria').value.trim();
    if (!valor) return;
    if (borrador.categorias.indexOf(valor) !== -1) { aviso('Esa categoría ya existe'); return; }
    borrador.categorias.push(valor);
    $('nuevaCategoria').value = '';
    pintarCategorias();
    marcarSucio();
  }

  $('agregarCategoria').addEventListener('click', agregarCategoria);
  $('nuevaCategoria').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); agregarCategoria(); }
  });

  /* ================= productos ================= */

  function pintarProductos() {
    pintarNotaEjemplos();
    var lista = $('listaProductos');
    if (!datos.productos.length) {
      lista.innerHTML = '<div class="sin-nada"><p>Todavía no hay productos.</p>' +
        '<p style="margin:0">Aprieta <strong>Agregar producto</strong> para publicar el primero.</p></div>';
      return;
    }

    lista.innerHTML = datos.productos.map(function (p, i) {
      var insignias = '';
      if (p.visible === false) insignias += '<span class="insignia insignia--oculto">Oculto</span>';
      if (p.agotado) insignias += '<span class="insignia insignia--agotado">Agotado</span>';
      if (p.destacado) insignias += '<span class="insignia insignia--destacado">Destacado</span>';
      if (p.categoria) insignias += '<span class="insignia">' + escapar(p.categoria) + '</span>';

      var miniatura = (p.fotos && p.fotos[0])
        ? '<img src="' + escapar(p.fotos[0]) + '" alt="">'
        : 'sin foto';

      return '<article class="item' + (p.visible === false ? ' oculto-en-tienda' : '') + '">' +
        '<div class="item__foto">' + miniatura + '</div>' +
        '<div>' +
          '<div class="item__nombre">' + escapar(p.nombre) + '</div>' +
          '<div class="item__meta">' + plata(p.precio) + '</div>' +
          '<div class="item__insignias">' + insignias + '</div>' +
        '</div>' +
        '<div class="item__acciones">' +
          '<button class="mover" data-mover="-1" data-i="' + i + '" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
          '<button class="mover" data-mover="1" data-i="' + i + '" aria-label="Bajar"' + (i === datos.productos.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
          '<button class="btn btn--chico" data-editar="' + escapar(p.id) + '">Editar</button>' +
        '</div>' +
      '</article>';
    }).join('');

    lista.querySelectorAll('[data-editar]').forEach(function (b) {
      b.addEventListener('click', function () { abrirEditor(b.dataset.editar); });
    });

    lista.querySelectorAll('[data-mover]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = Number(b.dataset.i);
        var destino = i + Number(b.dataset.mover);
        if (destino < 0 || destino >= datos.productos.length) return;
        var copia = datos.productos.slice();
        var movido = copia.splice(i, 1)[0];
        copia.splice(destino, 0, movido);
        datos.productos = copia;
        pintarProductos();
        api('/api/admin/orden', {
          method: 'POST',
          body: { ids: copia.map(function (p) { return p.id; }) }
        }).catch(function (e) { aviso(e.message, true); });
      });
    });
  }

  // La tienda viene con productos de ejemplo. Este aviso explica que son
  // de mentira y ofrece sacarlos todos de una vez.
  function pintarNotaEjemplos() {
    var caja = $('notaEjemplos');
    var ejemplos = datos.productos.filter(function (p) { return p.esEjemplo; });
    if (!ejemplos.length) { caja.classList.add('oculto'); return; }

    caja.classList.remove('oculto');
    caja.innerHTML = '<strong>Los ' + ejemplos.length + ' productos de ejemplo siguen ahí</strong>' +
      'Están para que veas cómo queda la tienda. Ábrelos y cámbialos por lo tuyo, o bórralos todos de una vez. ' +
      '<button class="btn btn--chico" type="button" id="borrarEjemplos" style="margin-top:10px">Borrar los ejemplos</button>';

    $('borrarEjemplos').addEventListener('click', function () {
      if (!confirm('¿Borrar los ' + ejemplos.length + ' productos de ejemplo?')) return;
      Promise.all(ejemplos.map(function (p) {
        return api('/api/admin/productos/' + p.id, { method: 'DELETE' });
      }))
        .then(function () { return api('/api/admin/data'); })
        .then(function (d) {
          datos.productos = d.productos;
          pintarProductos();
          aviso('Listo, la tienda quedó limpia.');
        })
        .catch(function (e) { aviso(e.message, true); });
    });
  }

  function abrirEditor(id) {
    var p = id ? datos.productos.find(function (x) { return x.id === id; }) : null;
    editando = p
      ? JSON.parse(JSON.stringify(p))
      : { nombre: '', precio: '', precioAntes: '', descripcion: '', detalles: '', categoria: '', visible: true, agotado: false, destacado: false, fotos: [] };

    $('editorTitulo').textContent = p ? 'Editar producto' : 'Producto nuevo';
    $('borrarProducto').classList.toggle('oculto', !p);

    $('p_nombre').value = editando.nombre;
    $('p_precio').value = editando.precio;
    $('p_precioAntes').value = editando.precioAntes || '';
    $('p_descripcion').value = editando.descripcion;
    $('p_detalles').value = editando.detalles || '';
    $('p_visible').checked = editando.visible !== false;
    $('p_agotado').checked = !!editando.agotado;
    $('p_destacado').checked = !!editando.destacado;

    var opciones = ['<option value="">Sin categoría</option>'];
    borrador.categorias.forEach(function (c) {
      opciones.push('<option value="' + escapar(c) + '"' + (c === editando.categoria ? ' selected' : '') + '>' + escapar(c) + '</option>');
    });
    $('p_categoria').innerHTML = opciones.join('');

    pintarFotosProducto();
    pintarPistaPrecio();
    $('editor').classList.add('abierta');
    document.body.style.overflow = 'hidden';
    $('p_nombre').focus();
  }

  // Misma lectura que hace el servidor, para mostrar en vivo como va a
  // quedar el precio: "19.500" son diecinueve mil quinientos.
  function leerPrecio(texto) {
    var s = String(texto || '').replace(/[^\d.,]/g, '');
    if (!s) return 0;
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
      s = s.replace(/[.,]/g, '');
    } else {
      var ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
      if (ultimo !== -1) {
        var decimales = s.slice(ultimo + 1);
        s = decimales.length === 3
          ? s.replace(/[.,]/g, '')
          : s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + decimales;
      }
    }
    var n = Number(s);
    return isFinite(n) && n >= 0 ? Math.round(n) : 0;
  }

  function pintarPistaPrecio() {
    var valor = leerPrecio($('p_precio').value);
    $('pistaPrecio').textContent = valor ? 'En la tienda se ve: ' + plata(valor) : '';
  }

  $('p_precio').addEventListener('input', pintarPistaPrecio);

  function cerrarEditor() {
    $('editor').classList.remove('abierta');
    document.body.style.overflow = '';
    editando = null;
  }

  function pintarFotosProducto() {
    $('fotosProducto').innerHTML = editando.fotos.map(function (f, i) {
      return '<div class="foto"><img src="' + escapar(f) + '" alt="">' +
        '<button class="foto__quitar" type="button" data-quitar="' + i + '" aria-label="Quitar">&times;</button>' +
        (i === 0 ? '<span class="foto__portada">Portada</span>' : '') +
        '</div>';
    }).join('');

    $('fotosProducto').querySelectorAll('[data-quitar]').forEach(function (b) {
      b.addEventListener('click', function () {
        editando.fotos.splice(Number(b.dataset.quitar), 1);
        pintarFotosProducto();
      });
    });
  }

  conectarSoltar($('soltarProducto'), function (archivos) {
    if (!editando || !archivos.length) return;
    var libres = 6 - editando.fotos.length;
    if (libres <= 0) { aviso('Ya tienes 6 fotos en este producto', true); return; }
    var tanda = archivos.slice(0, libres);
    aviso('Procesando ' + tanda.length + (tanda.length === 1 ? ' foto...' : ' fotos...'));
    Promise.all(tanda.map(function (a) { return procesarImagen(a, 1400); }))
      .then(function (urls) {
        editando.fotos = editando.fotos.concat(urls);
        pintarFotosProducto();
        aviso('Fotos listas. Guarda el producto para publicarlas.');
      })
      .catch(function (e) { aviso(e.message, true); });
  }, true);

  $('guardarProducto').addEventListener('click', function () {
    if (!editando) return;
    var boton = this;
    var cuerpo = {
      nombre: $('p_nombre').value.trim(),
      precio: $('p_precio').value,
      precioAntes: $('p_precioAntes').value,
      descripcion: $('p_descripcion').value,
      detalles: $('p_detalles').value,
      categoria: $('p_categoria').value,
      visible: $('p_visible').checked,
      agotado: $('p_agotado').checked,
      destacado: $('p_destacado').checked,
      fotos: editando.fotos
    };
    if (!cuerpo.nombre) { aviso('Ponle un nombre al producto', true); $('p_nombre').focus(); return; }

    boton.disabled = true;
    var peticion = editando.id
      ? api('/api/admin/productos/' + editando.id, { method: 'PUT', body: cuerpo })
      : api('/api/admin/productos', { method: 'POST', body: cuerpo });

    peticion
      .then(function () { return api('/api/admin/data'); })
      .then(function (d) {
        datos.productos = d.productos;
        pintarProductos();
        cerrarEditor();
        aviso('Producto guardado.');
      })
      .catch(function (e) { aviso(e.message, true); })
      .finally(function () { boton.disabled = false; });
  });

  $('borrarProducto').addEventListener('click', function () {
    if (!editando || !editando.id) return;
    if (!confirm('¿Borrar "' + editando.nombre + '"? No se puede deshacer.')) return;
    api('/api/admin/productos/' + editando.id, { method: 'DELETE' })
      .then(function () {
        datos.productos = datos.productos.filter(function (p) { return p.id !== editando.id; });
        pintarProductos();
        cerrarEditor();
        aviso('Producto borrado.');
      })
      .catch(function (e) { aviso(e.message, true); });
  });

  $('nuevoProducto').addEventListener('click', function () { abrirEditor(null); });
  $('cerrarEditor').addEventListener('click', cerrarEditor);
  $('cancelarProducto').addEventListener('click', cerrarEditor);
  $('editor').addEventListener('click', function (e) { if (e.target === $('editor')) cerrarEditor(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('editor').classList.contains('abierta')) cerrarEditor();
  });

  /* ================= clave ================= */

  $('formClave').addEventListener('submit', function (e) {
    e.preventDefault();
    api('/api/admin/password', {
      method: 'POST',
      body: { actual: $('claveActual').value, nueva: $('claveNueva').value }
    })
      .then(function () {
        $('claveActual').value = '';
        $('claveNueva').value = '';
        $('avisoClave').classList.add('oculto');
        aviso('Clave cambiada.');
      })
      .catch(function (err) { aviso(err.message, true); });
  });

  /* ================= respaldo ================= */

  $('exportar').addEventListener('click', function () {
    api('/api/admin/export').then(function (d) {
      var blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'respaldo-tienda-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }).catch(function (e) { aviso(e.message, true); });
  });

  $('importarBoton').addEventListener('click', function () { $('importar').click(); });

  $('importar').addEventListener('change', function () {
    var archivo = this.files[0];
    if (!archivo) return;
    if (!confirm('Esto reemplaza TODO lo que hay ahora por el respaldo. ¿Seguir?')) { this.value = ''; return; }
    var lector = new FileReader();
    lector.onload = function () {
      var contenido;
      try {
        contenido = JSON.parse(lector.result);
      } catch (e) {
        aviso('Ese archivo no es un respaldo válido', true);
        return;
      }
      api('/api/admin/import', { method: 'POST', body: contenido })
        .then(cargar)
        .then(function () { aviso('Respaldo cargado.'); })
        .catch(function (e) { aviso(e.message, true); });
    };
    lector.readAsText(archivo);
    this.value = '';
  });

  /* ================= arranque ================= */

  api('/api/sesion').then(function (s) {
    if (!s.autenticado) { mostrarEntrada(); return; }
    mostrarPanel();
    if (s.claveDefecto) $('avisoClave').classList.remove('oculto');
    return cargar();
  }).catch(function () { mostrarEntrada(); });
})();
