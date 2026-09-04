/* ============================================================
   LA MANCHA QUE TEJE — la entrada del sitio

   Una mancha sigue al cursor y hace de mascara: por ella se ve la
   foto de abajo —la pieza terminada— a traves de la de arriba —los
   ovillos—. Cuanto mas rapido va el cursor, mas se estira la mancha
   y mas cola arrastra.

   Dos cosas conviene saberlas antes de tocar nada:

   El revelado es una <mask> de SVG, no un recorte ni un lienzo. Las
   manchas son circulos normales pasados por un desenfoque y un
   contraste de alfa, y eso es justo lo que hace que circulos
   sueltos se fundan en una sola forma organica.

   Nada de esto pasa por el estado de la pagina. Las posiciones se
   escriben directas en los atributos del SVG dentro del bucle, asi
   que el cursor no espera a ningun repintado.

   El texto va dos veces: una en su color y otra forzada a claro
   detras de la misma mascara. Asi el nombre se aclara solo en la
   parte que la mancha esta tapando de verdad, en lugar de cambiar
   entero en cuanto la mancha roza su recuadro — que a este tamanio
   de letra se ve mal.

   Del componente original se conservan los numeros y el
   comportamiento. Lo que cambia es el envoltorio: aqui no hay React
   ni Tailwind, y la politica de seguridad del sitio no deja cargar
   nada de fuera, asi que las clases de valor arbitrario estan
   portadas a CSS de verdad y el bucle es una funcion suelta.

   La letra tampoco es la del ejemplo: el sitio ya tiene su familia
   —Fraunces para titular— y meter una segunda serif solo para la
   portada seria una fuente mas que descargar para decir lo mismo.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var quieto = matchMedia('(prefers-reduced-motion: reduce)');

  var RADIO = 210;         // px en reposo
  var COLA = 5;            // cuantas manchas van detras
  var SUAVIZADO = 0.16;    // 0 a 1; mas bajo, mas suelta
  var RESPUESTA_VEL = 1;   // cuanto se estira con la velocidad
  var PARALAJE = 14;       // px de deriva del texto, en contra del cursor
  var MUESTRAS_ONDA = 28;

  /* El recorrido de presentacion.

     Al cargar, la mancha hace sola una pasada por la portada y
     vuelve a irse. No es adorno: sin ella, quien llega no tiene
     forma de saber que hay una segunda foto debajo ni que el cursor
     la destapa. La pasada lo ensenia en dos segundos y medio y
     luego se aparta.

     Va de abajo a la izquierda hasta arriba a la derecha, pasando
     por el centro, que es donde esta el nombre: asi lo tejido
     aparece justo detras del titulo, que es el momento que se
     quiere que se vea.

     Y manda siempre la persona: al primer movimiento de raton real
     la presentacion se corta en seco. Nada peor que una animacion
     que sigue haciendo lo suyo mientras alguien intenta usar la
     pagina. */
  var INTRO_ESPERA = 900;    // ms antes de empezar; deja entrar la foto
  var INTRO_DURA = 2500;

  /* El tejido de la foto.

     La foto no aparece de un fundido: se teje. Filas que crecen de
     lado a lado, alternando el sentido en cada una —una vuelta, se
     gira, y de vuelta—, empezando por abajo, que es como se empieza
     una prenda.

     Las barras se ponen desde aqui y no en el HTML por dos motivos.
     Uno, son catorce y dependen de un numero que conviene tener en
     un sitio. Y dos, y este es el que importa: una mascara SVG que
     no existe no deja el elemento sin recortar, lo deja INVISIBLE.
     Si esto se declarara en el HTML y el JS fallara, la portada se
     quedaria en blanco. Poniendolo aqui, sin JS no hay mascara y la
     foto se ve entera. */
  var FILAS = 14;
  var FILA_DURA = 620;
  var FILA_PASO = 55;

  /* La copia en claro del texto se quito.

     El efecto la usa para que la letra siga legible sobre la foto
     de abajo, dando por hecho que esa foto es oscura. Las de aqui
     son las dos claras —madera y lino—, asi que la copia blanca
     tenia entre 1,12 y 1,38 de contraste sobre lo revelado: era
     ella la que hacia desaparecer el texto al pasar la mancha.

     El gancho se mantiene por si vuelve, y para no romper la
     llamada del otro archivo. */
  function clonarClaro() {}

  function armar() {
    var caja = $('umbral');
    var grupo = $('umbralManchas');
    var capa = $('umbralCapa');
    if (!caja || !grupo) return;

    var ondas = [].slice.call(caja.querySelectorAll('.umbral__ondas path'));

    /* Con movimiento reducido la mancha se pega al cursor sin
       retraso, y se van la cola, la deriva y el ondeo. Un solo
       guarda, como manda el efecto. */
    var reducido = quieto.matches;
    var seguir = reducido ? 1 : Math.min(Math.max(SUAVIZADO, 0.02), 1);
    var largoCola = reducido ? 0 : Math.max(0, COLA);
    var deriva = reducido ? 0 : PARALAJE;
    var estira = reducido ? 0 : RESPUESTA_VEL;

    // Nacen fuera de pantalla, para que nada parpadee en el origen.
    var cadena = [], circulos = [];
    for (var i = 0; i <= largoCola; i++) {
      cadena.push({ x: -9999, y: -9999, r: RADIO });
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', -9999);
      c.setAttribute('cy', -9999);
      c.setAttribute('r', RADIO);
      c.setAttribute('fill', 'white');
      grupo.appendChild(c);
      circulos.push(c);
    }

    var puntero = { x: -9999, y: -9999, dentro: false };
    var velocidad = 0, presencia = 0, aLaVista = true, t0 = 0;

    /* La presentacion espera a que la pagina se vea.

       En una pestania de fondo no hay cuadros: si el reloj arrancara
       igual, alguien que abre el sitio en segundo plano y vuelve un
       minuto despues se encontraria la pasada ya terminada, o a
       medias. Asi que el reloj no empieza al cargar, empieza cuando
       la pagina esta delante. */
    var intro = !reducido;
    var introT0 = null;

    function arrancarIntro() {
      if (introT0 === null && document.visibilityState === 'visible') {
        introT0 = performance.now();
      }
    }
    arrancarIntro();
    document.addEventListener('visibilitychange', arrancarIntro);

    function tejerFoto() {
      var foto = caja.querySelector('.umbral__foto');
      var mascara = document.getElementById('umbralTejer');
      if (!foto || !mascara || reducido || mascara.childNodes.length) return;
      if (document.visibilityState !== 'visible') return;

      var alto = (100 / FILAS);
      for (var f = 0; f < FILAS; f++) {
        var b = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        b.setAttribute('x', '0');
        // +0.6 de solape: sin el, entre fila y fila queda una linea
        // de un pixel sin cubrir y la foto sale a rayas.
        b.setAttribute('y', (f * alto) + '%');
        b.setAttribute('width', '100%');
        b.setAttribute('height', (alto + 0.6) + '%');
        b.setAttribute('fill', 'white');
        // Se alternan los lados, y se empieza por la fila de abajo.
        b.style.transformOrigin = (f % 2 ? '100%' : '0%') + ' 50%';
        b.style.animationDelay = ((FILAS - 1 - f) * FILA_PASO) + 'ms';
        mascara.appendChild(b);
      }

      foto.classList.add('tejida');
      document.documentElement.classList.add('tejiendo');

      /* Al terminar se quita el recorte. Una mascara viva cuesta
         composicion en cada cuadro y esta solo tiene sentido
         mientras dura la entrada. */
      setTimeout(function () {
        foto.classList.remove('tejida');
        document.documentElement.classList.remove('tejiendo');
        while (mascara.firstChild) mascara.removeChild(mascara.firstChild);
      }, FILA_DURA + FILAS * FILA_PASO + 400);
    }

    tejerFoto();
    document.addEventListener('visibilitychange', tejerFoto);

    caja.addEventListener('pointermove', function (e) {
      intro = false;   // manda la persona
      var r = caja.getBoundingClientRect();
      puntero.x = e.clientX - r.left;
      puntero.y = e.clientY - r.top;
      puntero.dentro = true;
    }, { passive: true });

    caja.addEventListener('pointerleave', function () { puntero.dentro = false; });

    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(function (e) { aLaVista = e[0].isIntersecting; },
        { rootMargin: '10%' }).observe(caja);
    }

    function marcha(t) {
      requestAnimationFrame(marcha);
      if (!aLaVista) return;

      var r = caja.getBoundingClientRect();
      var ancho = r.width, alto = r.height;
      var cabeza = cadena[0];

      /* La pasada de presentacion conduce al puntero como si hubiera
         una mano. Un arco: entra abajo a la izquierda, sube por el
         centro —donde esta el nombre— y sale arriba a la derecha.

         La curva de tiempo es suave por los dos extremos, para que
         no arranque ni termine de golpe. */
      if (intro && introT0 !== null) {
        var e = (t - introT0 - INTRO_ESPERA) / INTRO_DURA;
        if (e >= 0 && e <= 1) {
          var s = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
          /* Sube todo el rato, con un hinchazon en el medio. Un arco
             simetrico volvia a bajar al final y se leia como un ida y
             vuelta; asi se lee como que la lana se va tejiendo hacia
             arriba y sale por la esquina. */
          puntero.x = ancho * (0.10 + 0.80 * s);
          puntero.y = alto * (0.78 - 0.46 * s - 0.14 * Math.sin(s * Math.PI));
          puntero.dentro = true;
        } else if (e > 1) {
          intro = false;
          puntero.dentro = false;
        }
      }

      /* La presencia funde la mascara entera al entrar y salir el
         cursor, para que la mancha no aparezca de golpe. */
      presencia += ((puntero.dentro ? 1 : 0) - presencia) * 0.12;
      grupo.style.opacity = presencia;

      if (puntero.dentro) {
        if (cabeza.x < -1000) { cabeza.x = puntero.x; cabeza.y = puntero.y; }
        var dx = puntero.x - cabeza.x, dy = puntero.y - cabeza.y;
        cabeza.x += dx * seguir;
        cabeza.y += dy * seguir;
        // La velocidad manda el tamanio y cuanto se abre la cola.
        velocidad += (Math.sqrt(dx * dx + dy * dy) - velocidad) * 0.15;
      } else {
        velocidad *= 0.9;
      }

      var fv = Math.min(velocidad / 60, 1) * estira;
      cabeza.r = RADIO * (1 + fv * 0.35);

      for (var i = 1; i < cadena.length; i++) {
        var b = cadena[i], antes = cadena[i - 1];
        // Cada una se retrasa un poco mas que la anterior: por eso
        // la cola se estira al correr y se recoge al parar.
        var retraso = seguir * (1 - i / (cadena.length + 1));
        if (b.x < -1000) { b.x = antes.x; b.y = antes.y; }
        b.x += (antes.x - b.x) * retraso;
        b.y += (antes.y - b.y) * retraso;
        b.r = RADIO * (1 - i / (cadena.length + 0.6)) * (0.45 + fv);
      }

      for (var k = 0; k < cadena.length; k++) {
        var cc = circulos[k], bb = cadena[k];
        cc.setAttribute('cx', bb.x.toFixed(1));
        cc.setAttribute('cy', bb.y.toFixed(1));
        cc.setAttribute('r', Math.max(bb.r, 0).toFixed(1));
        if (k > 0) {
          cc.setAttribute('fill-opacity',
            ((1 - k / cadena.length) * (0.35 + fv * 0.65)).toFixed(3));
        }
      }

      /* El texto deriva en contra del cursor, para dar fondo. No se
         toca hasta que la mancha tiene posicion de verdad: aparcada
         fuera de pantalla el desplazamiento normalizado es enorme, y
         mandaria la capa entera lejisimos. */
      if (capa && deriva > 0 && ancho > 0 && alto > 0 && cabeza.x > -1000) {
        var nx = Math.min(Math.max((cabeza.x / ancho - 0.5) * -2, -1), 1);
        var ny = Math.min(Math.max((cabeza.y / alto - 0.5) * -2, -1), 1);
        capa.style.transform = 'translate3d(' + (nx * deriva).toFixed(2) + 'px, ' +
          (ny * deriva).toFixed(2) + 'px, 0)';
      }

      // Las lineas del fondo: un seno que viaja despacio, empujado
      // por el cursor.
      if (ondas.length && ancho > 0) {
        var seg = reducido ? 0 : (t - t0) / 1000;
        var sesgo = puntero.dentro ? cabeza.x / ancho - 0.5 : 0;
        for (var l = 0; l < ondas.length; l++) {
          var baseY = alto * (0.3 + l * 0.2);
          var amp = 16 + l * 9 + fv * 14;
          var frec = 1.6 + l * 0.4;
          var fase = seg * (0.35 + l * 0.12) + sesgo * 1.4;
          var d = '';
          for (var m = 0; m <= MUESTRAS_ONDA; m++) {
            var u = m / MUESTRAS_ONDA;
            var x = u * ancho;
            var y = baseY +
              Math.sin(u * Math.PI * frec + fase) * amp +
              Math.sin(u * Math.PI * frec * 2.3 + fase * 1.7) * amp * 0.25;
            d += (m === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
          }
          ondas[l].setAttribute('d', d);
        }
      }
    }

    requestAnimationFrame(function (t) { t0 = t; marcha(t); });
  }

  // El otro archivo avisa cuando ya escribio el nombre y la cuenta.
  window.SDBUmbral = { clonarClaro: clonarClaro };
  armar();
})();
