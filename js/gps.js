import { cargarEstaciones, crearBuscadorEstacion, compartenRuta, login } from "./buscador.js";
import { actualizarMapa, eliminarMapa } from "./mapa.js";

let token = "";
let buscandoHorarios = false;
let intervalId;
let origenSeleccionado = null;
let destinoSeleccionado = null;

const originInput = document.getElementById("origin-input");
const destinationInput = document.getElementById("destination-input");
const buscarBtn = document.getElementById("buscarBtn");
const resultDiv = document.getElementById("result");

// tarjetas activas, indexadas por id de formacion: se reutilizan entre
// sondeos para que el mapa solo mueva el marcador en vez de recrearse
// (eso era lo que causaba el titileo y el reinicio del mapa).
const tarjetas = new Map();
let mensajeVacio = null;

function actualizarBotonBuscar() {
  buscarBtn.disabled = !(origenSeleccionado && destinoSeleccionado);
}

function limpiarCampo(input) {
  input.value = "";
  delete input.dataset.id;
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

  limpiarTarjetas();
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
          actualizarTarjetas(response.results || [], destination);
        } catch (error) {
          console.error("Error al parsear JSON:", error);
        }
      } else {
        mostrarErrorCarga(xhr.status);
      }
    }
  };

  xhr.send();
}

function crearTarjeta(idFormacion) {
  const div = document.createElement("div");
  div.className = "horario";
  div.innerHTML = `
    <h3 class="horarioH3 campo-servicio"></h3>
    <p class="campo-arribo"></p>
    <p class="campo-destino"></p>
    <h3 class="campo-viaje"></h3>
    <h2 class="campo-restante"></h2>
    <div id="mapa-${idFormacion}" class="mapa ocultar"></div>
  `;
  return {
    div,
    campos: {
      servicio: div.querySelector(".campo-servicio"),
      arribo: div.querySelector(".campo-arribo"),
      destino: div.querySelector(".campo-destino"),
      viaje: div.querySelector(".campo-viaje"),
      restante: div.querySelector(".campo-restante"),
      mapaDiv: div.querySelector(".mapa"),
    },
    estadoMapa: { map: null, marker: null },
  };
}

function actualizarTarjetas(results, destination) {
  const vistos = new Set();

  results.forEach((horarios) => {
    const servicioNombre = horarios.servicio?.ramal?.nombre || "No disponible";
    const arribo = horarios.arribo;
    const claveTarjeta = arribo?.equipo?.id ?? `${servicioNombre}-${arribo?.nombre}`;
    const estacionArribo = arribo?.nombre || "No disponible";
    const llegadaArribo = new Date(arribo?.llegada?.estimada || arribo?.salida?.programada);
    const ubicacion = horarios.servicio?.location;

    horarios.servicio?.estaciones?.forEach((estacion) => {
      if (estacion.idElemento != destination) return;
      vistos.add(claveTarjeta);

      const nombreEstacion = estacion?.nombre || "No disponible";
      const llegadaDestino = new Date(estacion?.llegada?.estimada || estacion?.llegada?.programada);
      const tiempoDeViaje = calcularTiempoDeViaje(llegadaArribo, llegadaDestino);
      const tiempoRestante = calcularTiempoRestante(llegadaArribo);

      let tarjeta = tarjetas.get(claveTarjeta);
      if (!tarjeta) {
        tarjeta = crearTarjeta(claveTarjeta);
        tarjetas.set(claveTarjeta, tarjeta);
        resultDiv.appendChild(tarjeta.div);
      }

      tarjeta.campos.servicio.textContent = `Servicio: ${servicioNombre}`;
      tarjeta.campos.arribo.innerHTML = `Arribo en: <b>${estacionArribo}</b> (Hora: ${llegadaArribo.toLocaleTimeString()})`;
      tarjeta.campos.destino.innerHTML =
        nombreEstacion !== "No disponible"
          ? `Destino: <b>${nombreEstacion}</b> (Hora: ${llegadaDestino.toLocaleTimeString()})`
          : "";
      tarjeta.campos.viaje.textContent = tiempoDeViaje ? `Tiempo de viaje: ${tiempoDeViaje}` : "";
      tarjeta.campos.restante.textContent = `Llegando en: ${tiempoRestante}`;

      if (ubicacion?.lat && ubicacion?.long) {
        tarjeta.campos.mapaDiv.classList.remove("ocultar");
        actualizarMapa(tarjeta.estadoMapa, tarjeta.campos.mapaDiv, ubicacion.lat, ubicacion.long);
      }
    });
  });

  for (const [clave, tarjeta] of tarjetas) {
    if (!vistos.has(clave)) {
      eliminarMapa(tarjeta.estadoMapa);
      tarjeta.div.remove();
      tarjetas.delete(clave);
    }
  }

  actualizarMensajeVacio();
}

function actualizarMensajeVacio() {
  if (tarjetas.size === 0) {
    if (!mensajeVacio) {
      mensajeVacio = document.createElement("p");
      mensajeVacio.className = "mensaje-vacio";
      mensajeVacio.textContent = "No encontramos formaciones programadas para estas estaciones.";
      resultDiv.appendChild(mensajeVacio);
    }
  } else if (mensajeVacio) {
    mensajeVacio.remove();
    mensajeVacio = null;
  }
}

function limpiarTarjetas() {
  for (const tarjeta of tarjetas.values()) {
    eliminarMapa(tarjeta.estadoMapa);
    tarjeta.div.remove();
  }
  tarjetas.clear();
  if (mensajeVacio) {
    mensajeVacio.remove();
    mensajeVacio = null;
  }
}

function mostrarErrorCarga(status) {
  limpiarTarjetas();
  const p = document.createElement("p");
  p.className = "mensaje-vacio";
  p.textContent = `Error al obtener horarios (${status})`;
  resultDiv.appendChild(p);
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

  crearBuscadorEstacion({
    input: originInput,
    panel: document.getElementById("origin-panel"),
    chips: document.getElementById("origin-chips"),
    lista: document.getElementById("origin-list"),
    obtenerOtra: () => destinoSeleccionado,
    onSeleccionar: (estacion) => {
      origenSeleccionado = estacion;
      if (estacion && destinoSeleccionado && !compartenRuta(estacion, destinoSeleccionado)) {
        limpiarCampo(destinationInput);
        destinoSeleccionado = null;
      }
      actualizarBotonBuscar();
    },
  });

  crearBuscadorEstacion({
    input: destinationInput,
    panel: document.getElementById("destination-panel"),
    chips: document.getElementById("destination-chips"),
    lista: document.getElementById("destination-list"),
    obtenerOtra: () => origenSeleccionado,
    onSeleccionar: (estacion) => {
      destinoSeleccionado = estacion;
      if (estacion && origenSeleccionado && !compartenRuta(estacion, origenSeleccionado)) {
        limpiarCampo(originInput);
        origenSeleccionado = null;
      }
      actualizarBotonBuscar();
    },
  });

  document.getElementById("botonEspecial").addEventListener("click", botonEspecial);

  buscarBtn.addEventListener("click", () => {
    detenerBusqueda();
    iniciarBusqueda();
  });

  login({
    onOk: (tok) => {
      token = tok;
    },
  });
}

iniciar();
