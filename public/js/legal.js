/* Página legal: los textos salen del panel, igual que el resto del sitio. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function escapar(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  fetch('/api/site')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var s = data.settings || {};

      document.title = 'Información legal — ' + (s.marca || 'Tienda');
      $('marca').textContent = s.marca || 'Tienda';
      $('pieCopy').textContent = '© ' + new Date().getFullYear() + ' ' + (s.marca || '');

      // Identificación del vendedor: solo se muestran las filas que estén
      // completas, para no dejar campos vacíos a la vista.
      var filas = [];
      if (s.legalNombre) filas.push(['Vendedor', s.legalNombre]);
      if (s.legalRut) filas.push(['RUT', s.legalRut]);
      if (s.legalComuna) filas.push(['Comuna', s.legalComuna]);
      if (s.email) filas.push(['Correo', s.email]);

      if (filas.length) {
        $('vendedor').innerHTML = '<dl>' + filas.map(function (f) {
          return '<dt>' + escapar(f[0]) + '</dt><dd>' + escapar(f[1]) + '</dd>';
        }).join('') + '</dl>';
      } else {
        // Sin estos datos la tienda no cumple con la Ley del Consumidor,
        // así que el aviso apunta a quien administra, no a la clienta.
        $('vendedor').innerHTML = '<strong>Falta completar la identificación del vendedor.</strong>' +
          '<br>Se llena en el panel, en la pestaña Legal: nombre o razón social y RUT. Es obligatorio.';
      }

      $('textoTerminos').textContent = s.terminos || '';
      $('textoDevoluciones').textContent = s.devoluciones || '';
      $('textoPrivacidad').textContent = s.privacidad || '';

      if (s.whatsapp) {
        var num = String(s.whatsapp).replace(/\D/g, '');
        $('pieContacto').innerHTML = '<a href="https://wa.me/' + num +
          '" target="_blank" rel="noopener" style="color:inherit">WhatsApp</a>';
      }
    })
    .catch(function () {
      $('vendedor').textContent = 'No se pudo cargar la información. Recarga la página.';
    });
})();
