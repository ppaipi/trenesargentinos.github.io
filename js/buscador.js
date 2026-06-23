export const COLOR_LINEA = {
  "Mitre": "var(--linea-mitre)",
  "Sarmiento": "var(--linea-sarmiento)",
  "Roca": "var(--linea-roca)",
  "San Martín": "var(--linea-sanmartin)",
  "Belgrano Sur": "var(--linea-belgranosur)",
  "Tren de la Costa": "var(--linea-trendelacosta)",
  "Belgrano Norte": "var(--linea-belgranonorte)",
  "Regionales": "var(--linea-regionales)",
  "Trenes de Terceros": "var(--linea-trenesterceros)",
};

export const LINEAS_PRINCIPALES = ["Mitre", "San Martín", "Sarmiento", "Roca", "Tren de la Costa", "Belgrano Sur"];

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => console.error("Error registrando service worker:", error));
  });
}

let estaciones = [];
let rutaIndice = new Map(); // "linea|||ramal" -> estaciones[]

export function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function cargarEstaciones() {
  const response = await fetch("estaciones.json");
  if (!response.ok) {
    throw new Error("Error al cargar estaciones: " + response.statusText);
  }
  estaciones = await response.json();

  rutaIndice = new Map();
  estaciones.forEach((estacion) => {
    estacion.rutas.forEach((ruta) => {
      const key = `${ruta.linea}|||${ruta.ramal}`;
      if (!rutaIndice.has(key)) rutaIndice.set(key, []);
      rutaIndice.get(key).push(estacion);
    });
  });

  return estaciones;
}

export function buscarEstacionPorId(id) {
  return estaciones.find((e) => e.id === id);
}

export function ramalesDeLinea(linea) {
  const ramales = new Set();
  estaciones.forEach((e) =>
    e.rutas.forEach((r) => {
      if (r.linea === linea) ramales.add(r.ramal);
    })
  );
  return [...ramales].sort((a, b) => a.localeCompare(b, "es"));
}

export function estacionesDeRuta(linea, ramal) {
  return (rutaIndice.get(`${linea}|||${ramal}`) || [])
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function compartenRuta(a, b) {
  return a.rutas.some((ra) => b.rutas.some((rb) => ra.linea === rb.linea && ra.ramal === rb.ramal));
}

export function estacionesAlcanzables(estacion) {
  const vistos = new Set([estacion.id]);
  const resultado = [];
  estacion.rutas.forEach((ruta) => {
    estacionesDeRuta(ruta.linea, ruta.ramal).forEach((e) => {
      if (!vistos.has(e.id)) {
        vistos.add(e.id);
        resultado.push(e);
      }
    });
  });
  return resultado.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function colorDeEstacion(estacion) {
  return COLOR_LINEA[estacion.rutas[0].linea] || "#999";
}

export function lineasDeEstacion(estacion) {
  return [...new Set(estacion.rutas.map((r) => r.linea))].join(", ");
}

/**
 * Buscador de estaciones combinado: texto libre + navegación por línea/ramal.
 * Si la otra estación (origen/destino) ya está elegida, restringe la navegación
 * por chips a estaciones que comparten un ramal real con ella.
 */
export function crearBuscadorEstacion({ input, panel, chips, lista, obtenerOtra, onSeleccionar }) {
  let activo = -1;
  let pila = []; // historial de vistas para el boton "volver"

  function abrirPanel() {
    panel.classList.remove("ocultar");
  }

  function cerrarPanel() {
    panel.classList.add("ocultar");
  }

  function limpiarLista() {
    lista.innerHTML = "";
    activo = -1;
  }

  function renderEstaciones(items, { volver } = {}) {
    limpiarLista();
    chips.innerHTML = "";

    if (volver) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip chip-volver";
      chip.textContent = "← Volver";
      chip.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        volver();
      });
      chips.appendChild(chip);
    }

    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "sin-resultados";
      li.textContent = "No se encontraron estaciones";
      lista.appendChild(li);
      abrirPanel();
      return;
    }

    items.slice(0, 30).forEach((estacion) => {
      const li = document.createElement("li");

      const badge = document.createElement("span");
      badge.className = "badge-linea";
      badge.style.background = colorDeEstacion(estacion);
      badge.title = lineasDeEstacion(estacion);

      const nombre = document.createElement("span");
      nombre.className = "nombre-estacion";
      nombre.textContent = estacion.nombre;

      li.appendChild(badge);
      li.appendChild(nombre);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        seleccionar(estacion);
      });

      lista.appendChild(li);
    });

    abrirPanel();
  }

  function renderChips(opciones, { etiqueta, onElegir, volver }) {
    limpiarLista();
    chips.innerHTML = "";

    if (volver) {
      const chipVolver = document.createElement("button");
      chipVolver.type = "button";
      chipVolver.className = "chip chip-volver";
      chipVolver.textContent = "← Volver";
      chipVolver.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        volver();
      });
      chips.appendChild(chipVolver);
    }

    opciones.forEach((opcion) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = etiqueta(opcion);
      chip.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onElegir(opcion);
      });
      chips.appendChild(chip);
    });

    abrirPanel();
  }

  function mostrarVistaInicial() {
    pila = [];
    const otra = obtenerOtra();

    if (otra) {
      mostrarRamalesDeEstacion(otra);
    } else {
      mostrarLineas();
    }
  }

  function mostrarLineas() {
    renderChips(LINEAS_PRINCIPALES, {
      etiqueta: (linea) => linea,
      onElegir: (linea) => {
        pila.push(mostrarLineas);
        mostrarRamales(linea);
      },
    });
  }

  function mostrarRamales(linea) {
    const ramales = ramalesDeLinea(linea);
    renderChips(ramales, {
      etiqueta: (ramal) => ramal,
      onElegir: (ramal) => {
        pila.push(() => mostrarRamales(linea));
        mostrarEstacionesDeRamal(linea, ramal);
      },
      volver: pila.length ? () => volver() : null,
    });
  }

  function mostrarRamalesDeEstacion(otra) {
    if (otra.rutas.length === 1) {
      mostrarEstacionesDeRamal(otra.rutas[0].linea, otra.rutas[0].ramal);
      return;
    }
    renderChips(otra.rutas, {
      etiqueta: (ruta) => `${ruta.ramal} (${ruta.linea})`,
      onElegir: (ruta) => {
        pila.push(() => mostrarRamalesDeEstacion(otra));
        mostrarEstacionesDeRamal(ruta.linea, ruta.ramal);
      },
    });
  }

  function mostrarEstacionesDeRamal(linea, ramal) {
    const otra = obtenerOtra();
    let items = estacionesDeRuta(linea, ramal);
    if (otra) items = items.filter((e) => e.id !== otra.id);

    renderEstaciones(items, { volver: pila.length ? () => volver() : null });
  }

  function volver() {
    const anterior = pila.pop();
    if (anterior) anterior();
    else mostrarVistaInicial();
  }

  function buscarPorTexto(texto) {
    const objetivo = normalizar(texto);
    const items = estaciones.filter((e) => normalizar(e.nombre).includes(objetivo));
    renderEstaciones(items);
  }

  function seleccionar(estacion) {
    input.value = estacion.nombre;
    input.dataset.id = estacion.id;
    cerrarPanel();
    onSeleccionar(estacion);
  }

  input.addEventListener("input", () => {
    delete input.dataset.id;
    onSeleccionar(null);
    const texto = input.value.trim();
    if (texto.length === 0) mostrarVistaInicial();
    else buscarPorTexto(texto);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length === 0) mostrarVistaInicial();
    else buscarPorTexto(input.value.trim());
  });

  input.addEventListener("keydown", (e) => {
    const items = lista.querySelectorAll("li:not(.sin-resultados)");
    if (panel.classList.contains("ocultar") || items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activo = (activo + 1) % items.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activo = (activo - 1 + items.length) % items.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activo >= 0) items[activo].dispatchEvent(new Event("mousedown"));
      return;
    } else if (e.key === "Escape") {
      cerrarPanel();
      return;
    } else {
      return;
    }

    items.forEach((li) => li.classList.remove("activo"));
    items[activo].classList.add("activo");
  });

  document.addEventListener("mousedown", (e) => {
    if (!input.contains(e.target) && !panel.contains(e.target)) {
      cerrarPanel();
    }
  });
}

function obtenerCredenciales() {
  const fecha = new Date();
  const yyyymmdd =
    fecha.getFullYear() +
    String(fecha.getMonth() + 1).padStart(2, "0") +
    String(fecha.getDate()).padStart(2, "0");
  const baseString = yyyymmdd + "sofse";

  const user = btoa(baseString);

  let pass = btoa(user);
  const reemplazosPrimeraCapa = {
    a: "#t", e: "#x", i: "#f", o: "#l", u: "#7", "=": "#g",
  };
  for (const [key, value] of Object.entries(reemplazosPrimeraCapa)) {
    pass = pass.replaceAll(key, value);
  }
  pass = pass.split("").reverse().join("");
  pass = btoa(pass);

  const reemplazosSegundaCapa = {
    a: "32%j", e: "32%p", i: "32%w", o: "32%8", u: "#0", "=": "32%v",
  };
  for (const [key, value] of Object.entries(reemplazosSegundaCapa)) {
    pass = pass.replaceAll(key, value);
  }
  pass = pass.split("").reverse().join("");

  return { user, pass };
}

/**
 * Login compartido entre paginas: espera #loginStatus y #menu en el HTML.
 * callbacks.onOk(token) se llama al autenticar; el boton "Reintentar" reintenta solo.
 */
export function login(callbacks) {
  const loginStatus = document.getElementById("loginStatus");
  const menu = document.getElementById("menu");

  function mostrarEstadoLogin(estado) {
    if (estado === "cargando") {
      loginStatus.innerHTML = `<span class="spinner"></span> Autenticando...`;
    } else if (estado === "ok") {
      loginStatus.classList.add("ocultar");
      menu.style.display = "block";
    } else {
      loginStatus.innerHTML = `
        <div>
          <p>No se pudo conectar con el servicio de Trenes Argentinos.</p>
          <button id="reintentarBtn" type="button">Reintentar</button>
        </div>
      `;
      document.getElementById("reintentarBtn").addEventListener("click", () => login(callbacks));
    }
  }

  mostrarEstadoLogin("cargando");
  const { user, pass } = obtenerCredenciales();

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "https://api-servicios.sofse.gob.ar/v1/auth/authorize", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.timeout = 10000;

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        mostrarEstadoLogin("ok");
        callbacks.onOk(response.token);
      } else {
        mostrarEstadoLogin("error");
      }
    }
  };
  xhr.ontimeout = () => mostrarEstadoLogin("error");
  xhr.onerror = () => mostrarEstadoLogin("error");

  xhr.send(JSON.stringify({ username: user, password: pass }));
}
