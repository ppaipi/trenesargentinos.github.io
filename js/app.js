const COLOR_LINEA = {
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

const STORAGE_KEY = "trenesArgentinos.ultimaBusqueda";

let estaciones = [];
let token = "";
let buscandoHorarios = false;
let intervalId;
let origenSeleccionado = null; // { id, nombre }
let destinoSeleccionado = null;

const loginStatus = document.getElementById("loginStatus");
const menu = document.getElementById("menu");
const originInput = document.getElementById("origin-input");
const destinationInput = document.getElementById("destination-input");
const originList = document.getElementById("origin-list");
const destinationList = document.getElementById("destination-list");
const buscarBtn = document.getElementById("buscarBtn");
const resultDiv = document.getElementById("result");
const ultimaBusquedaDiv = document.getElementById("ultimaBusqueda");

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function cargarEstaciones() {
  const response = await fetch("estaciones.json");
  if (!response.ok) {
    throw new Error("Error al cargar estaciones: " + response.statusText);
  }
  estaciones = await response.json();
}

function crearAutocomplete(input, lista, alSeleccionar) {
  let activo = -1;

  function renderSugerencias(coincidencias) {
    lista.innerHTML = "";
    activo = -1;

    if (coincidencias.length === 0) {
      const li = document.createElement("li");
      li.className = "sin-resultados";
      li.textContent = "No se encontraron estaciones";
      lista.appendChild(li);
      lista.classList.remove("ocultar");
      return;
    }

    coincidencias.slice(0, 8).forEach((estacion) => {
      const li = document.createElement("li");
      const colorLinea = COLOR_LINEA[estacion.lineas[0]] || "#999";

      const badge = document.createElement("span");
      badge.className = "badge-linea";
      badge.style.background = colorLinea;
      badge.title = estacion.lineas.join(", ");

      const nombre = document.createElement("span");
      nombre.className = "nombre-estacion";
      nombre.textContent = estacion.nombre;

      li.appendChild(badge);
      li.appendChild(nombre);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        seleccionarEstacion(estacion);
      });

      lista.appendChild(li);
    });

    lista.classList.remove("ocultar");
  }

  function seleccionarEstacion(estacion) {
    input.value = estacion.nombre;
    input.dataset.id = estacion.id;
    lista.classList.add("ocultar");
    alSeleccionar({ id: estacion.id, nombre: estacion.nombre });
  }

  function buscar() {
    const texto = normalizar(input.value.trim());
    delete input.dataset.id;
    alSeleccionar(null);

    if (texto.length === 0) {
      lista.classList.add("ocultar");
      return;
    }

    const coincidencias = estaciones.filter((e) =>
      normalizar(e.nombre).includes(texto)
    );
    renderSugerencias(coincidencias);
  }

  input.addEventListener("input", buscar);

  input.addEventListener("focus", () => {
    if (input.value.trim().length > 0 && !input.dataset.id) buscar();
  });

  input.addEventListener("keydown", (e) => {
    const items = lista.querySelectorAll("li:not(.sin-resultados)");
    if (lista.classList.contains("ocultar") || items.length === 0) return;

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
      lista.classList.add("ocultar");
      return;
    } else {
      return;
    }

    items.forEach((li) => li.classList.remove("activo"));
    items[activo].classList.add("activo");
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !lista.contains(e.target)) {
      lista.classList.add("ocultar");
    }
  });
}

function actualizarBotonBuscar() {
  buscarBtn.disabled = !(origenSeleccionado && destinoSeleccionado);
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
    document.getElementById("reintentarBtn").addEventListener("click", login);
  }
}

function login() {
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
        token = response.token;
        mostrarEstadoLogin("ok");
        cargarUltimaBusqueda();
      } else {
        mostrarEstadoLogin("error");
      }
    }
  };
  xhr.ontimeout = () => mostrarEstadoLogin("error");
  xhr.onerror = () => mostrarEstadoLogin("error");

  xhr.send(JSON.stringify({ username: user, password: pass }));
}

function guardarUltimaBusqueda() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ origen: origenSeleccionado, destino: destinoSeleccionado })
  );
}

function cargarUltimaBusqueda() {
  const guardada = localStorage.getItem(STORAGE_KEY);
  if (!guardada) return;

  let datos;
  try {
    datos = JSON.parse(guardada);
  } catch {
    return;
  }
  if (!datos?.origen || !datos?.destino) return;

  ultimaBusquedaDiv.innerHTML = `
    <p>Última búsqueda: <span class="trayecto">${datos.origen.nombre} → ${datos.destino.nombre}</span></p>
    <div class="acciones">
      <button id="buscarDeNuevoBtn" type="button">Buscar de nuevo</button>
      <button id="cambiarEstacionesBtn" type="button">Cambiar estaciones</button>
    </div>
  `;
  ultimaBusquedaDiv.classList.remove("ocultar");

  document.getElementById("buscarDeNuevoBtn").addEventListener("click", () => {
    aplicarSeleccion(originInput, datos.origen, (v) => (origenSeleccionado = v));
    aplicarSeleccion(destinationInput, datos.destino, (v) => (destinoSeleccionado = v));
    actualizarBotonBuscar();
    iniciarBusqueda();
  });

  document.getElementById("cambiarEstacionesBtn").addEventListener("click", () => {
    ultimaBusquedaDiv.classList.add("ocultar");
    originInput.focus();
  });
}

function aplicarSeleccion(input, estacion, setear) {
  input.value = estacion.nombre;
  input.dataset.id = estacion.id;
  setear({ id: estacion.id, nombre: estacion.nombre });
}

function botonEspecial() {
  const origenInputVal = originInput.value;
  const origenId = originInput.dataset.id;
  const destinoInputVal = destinationInput.value;
  const destinoId = destinationInput.dataset.id;

  originInput.value = destinoInputVal;
  destinationInput.value = origenInputVal;
  if (destinoId) originInput.dataset.id = destinoId;
  else delete originInput.dataset.id;
  if (origenId) destinationInput.dataset.id = origenId;
  else delete destinationInput.dataset.id;

  const tmp = origenSeleccionado;
  origenSeleccionado = destinoSeleccionado;
  destinoSeleccionado = tmp;
  actualizarBotonBuscar();

  if (buscandoHorarios) iniciarBusqueda();
}

function iniciarBusqueda() {
  if (!origenSeleccionado || !destinoSeleccionado) return;

  ultimaBusquedaDiv.classList.add("ocultar");
  guardarUltimaBusqueda();

  resultDiv.classList.remove("ocultar");
  resultDiv.scrollIntoView({ behavior: "smooth" });

  if (intervalId) clearInterval(intervalId);
  buscandoHorarios = true;

  obtenerHorarios();
  intervalId = setInterval(obtenerHorarios, 1000);
}

function detenerBusqueda() {
  buscandoHorarios = false;
  if (intervalId) clearInterval(intervalId);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (intervalId) clearInterval(intervalId);
  } else if (buscandoHorarios) {
    intervalId = setInterval(obtenerHorarios, 1000);
  }
});

function obtenerHorarios() {
  if (!buscandoHorarios || !origenSeleccionado || !destinoSeleccionado) return;

  const origin = origenSeleccionado.id;
  const destination = destinoSeleccionado.id;

  const xhr = new XMLHttpRequest();
  xhr.open(
    "GET",
    `https://api-servicios.sofse.gob.ar/v1/arribos/estacion/${origin}?hasta=${destination}`,
    true
  );
  xhr.setRequestHeader("Authorization", `${token}`);

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.results && response.results.length > 0) {
            mostrarHorarios(response.results, destination);
          } else {
            mostrarNoHorarios();
          }
        } catch (error) {
          console.error("Error al parsear JSON:", error);
          mostrarNoHorarios();
        }
      } else {
        resultDiv.innerHTML = `<p class="mensaje-vacio">Error al obtener horarios (${xhr.status})</p>`;
      }
    }
  };

  xhr.send();
}

function mostrarHorarios(results, destination) {
  resultDiv.innerHTML = "";
  let horariosEncontrados = false;

  results.forEach((horarios) => {
    const servicioNombre = horarios.servicio?.ramal?.nombre || "No disponible";
    const arribo = horarios.arribo;
    const estacionArribo = arribo?.nombre || "No disponible";
    const llegadaArribo = new Date(arribo?.llegada?.estimada || arribo?.llegada?.programada);
    const salidaArribo = new Date(arribo?.salida?.programada || "No disponible");
    const andenSalida = arribo?.anden?.nombre || false;
    const llegadaBool = llegadaArribo.toString() !== "Invalid Date";

    horarios.servicio?.estaciones.forEach((estacion) => {
      const nombreEstacion = estacion?.nombre || "No disponible";
      const llegadaDestino = new Date(
        estacion?.llegada?.estimada || estacion?.llegada?.programada || "No disponible"
      );
      const idElemento = estacion?.idElemento;

      if (idElemento == destination) {
        horariosEncontrados = true;
        const referencia = llegadaBool ? llegadaArribo : salidaArribo;
        const tiempoRestanteSalida = calcularTiempoRestante(referencia);
        const tiempoDeViaje = calcularTiempoDeViaje(referencia, llegadaDestino);

        const div = document.createElement("div");
        div.className = "horario";
        div.innerHTML = `
          <h3 class="horarioH3">Servicio: ${servicioNombre}</h3>
          ${llegadaBool
            ? `<p>Desde: <b>${estacionArribo}</b> (Hora: ${llegadaArribo.toLocaleTimeString()})</p>`
            : `<p>Desde: <b>${estacionArribo}</b> (Hora: ${salidaArribo.toLocaleTimeString()})</p>`}
          ${nombreEstacion !== "No disponible"
            ? `<p>Hasta: <b>${nombreEstacion}</b> (Hora: ${llegadaDestino.toLocaleTimeString()})</p>`
            : ""}
          ${!llegadaBool && andenSalida !== false ? `<h4 class="andenH4">Andén: ${andenSalida}</h4>` : ""}
          ${tiempoDeViaje ? `<h3>Tiempo de viaje: ${tiempoDeViaje}</h3>` : ""}
          ${llegadaBool
            ? `<h2>Llegando en: ${tiempoRestanteSalida}</h2>`
            : `<h2>Saliendo en: ${tiempoRestanteSalida}</h2>`}
        `;
        resultDiv.appendChild(div);
      }
    });
  });

  if (!horariosEncontrados) mostrarNoHorarios();
}

function mostrarNoHorarios() {
  resultDiv.innerHTML = '<p class="mensaje-vacio">No encontramos formaciones programadas para estas estaciones.</p>';
}

function calcularTiempoDeViaje(arribo, llegadaDestino) {
  const diferencia = llegadaDestino - arribo;
  const minutos = Math.floor(diferencia / 60000);
  const segundos = Math.floor((diferencia % 60000) / 1000);
  return `${minutos}m ${segundos}s`;
}

function calcularTiempoRestante(llegada) {
  const ahora = new Date();
  const diferencia = llegada - ahora;
  if (diferencia <= 0) return "Tren en andén.";
  const minutos = Math.floor(diferencia / 60000);
  const segundos = Math.floor((diferencia % 60000) / 1000);
  return `${minutos}m ${segundos}s`;
}

async function iniciar() {
  scroll(0, 0);
  await cargarEstaciones();

  crearAutocomplete(originInput, originList, (estacion) => {
    origenSeleccionado = estacion;
    actualizarBotonBuscar();
  });
  crearAutocomplete(destinationInput, destinationList, (estacion) => {
    destinoSeleccionado = estacion;
    actualizarBotonBuscar();
  });

  document.getElementById("botonEspecial").addEventListener("click", botonEspecial);
  buscarBtn.addEventListener("click", () => {
    detenerBusqueda();
    iniciarBusqueda();
  });

  login();
}

iniciar();
