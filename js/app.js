import { cargarEstaciones, buscarEstacionPorId, crearBuscadorEstacion, compartenRuta, login } from "./buscador.js";
import { actualizarMapa, eliminarMapa } from "./mapa.js";

const STORAGE_KEY = "trenesArgentinos.ultimaBusqueda";

let token = "";
let buscandoHorarios = false;
let intervalId;
let origenSeleccionado = null; // estacion completa {id, nombre, rutas}
let destinoSeleccionado = null;

const originInput = document.getElementById("origin-input");
const destinationInput = document.getElementById("destination-input");
const buscarBtn = document.getElementById("buscarBtn");
const resultDiv = document.getElementById("result");
const ultimaBusquedaDiv = document.getElementById("ultimaBusqueda");
const modoChips = document.querySelectorAll(".modo-chip");
const fechaHoraDiv = document.getElementById("fechaHora");
const fechaInput = document.getElementById("fecha-input");
const horaInput = document.getElementById("hora-input");

let modoBusqueda = "vivo"; // "vivo" | "programada"

// tarjetas activas indexadas por id de formacion: se reutilizan entre
// sondeos para no reconstruir el DOM ni el mapa cada segundo (eso causaba
// el titileo y que la animacion de aparicion se repitiera).
const tarjetas = new Map();
let mensajeVacio = null;

function actualizarBotonBuscar() {
  buscarBtn.disabled = !(origenSeleccionado && destinoSeleccionado);
}

function limpiarCampo(input) {
  input.value = "";
  delete input.dataset.id;
}

function guardarUltimaBusqueda() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ origenId: origenSeleccionado.id, destinoId: destinoSeleccionado.id })
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

  const origen = buscarEstacionPorId(datos.origenId);
  const destino = buscarEstacionPorId(datos.destinoId);
  if (!origen || !destino) return;

  ultimaBusquedaDiv.innerHTML = `
    <p>Última búsqueda: <span class="trayecto">${origen.nombre} → ${destino.nombre}</span></p>
    <div class="acciones">
      <button id="buscarDeNuevoBtn" type="button">Buscar de nuevo</button>
      <button id="cambiarEstacionesBtn" type="button">Cambiar estaciones</button>
    </div>
  `;
  ultimaBusquedaDiv.classList.remove("ocultar");

  document.getElementById("buscarDeNuevoBtn").addEventListener("click", () => {
    aplicarSeleccion(originInput, origen, (v) => (origenSeleccionado = v));
    aplicarSeleccion(destinationInput, destino, (v) => (destinoSeleccionado = v));
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
  setear(estacion);
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

function valorActual(input) {
  const ahora = new Date();
  if (input === fechaInput) {
    return ahora.toISOString().slice(0, 10);
  }
  return `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
}

function cambiarModo(modo) {
  modoBusqueda = modo;
  modoChips.forEach((chip) => chip.classList.toggle("activo", chip.dataset.modo === modo));

  detenerBusqueda();
  limpiarTarjetas();
  resultDiv.classList.add("ocultar");
  ultimaBusquedaDiv.classList.add("ocultar");

  if (modo === "programada") {
    fechaHoraDiv.classList.remove("ocultar");
    if (!fechaInput.value) fechaInput.value = valorActual(fechaInput);
    if (!horaInput.value) horaInput.value = valorActual(horaInput);
  } else {
    fechaHoraDiv.classList.add("ocultar");
  }
}

function iniciarBusqueda() {
  if (!origenSeleccionado || !destinoSeleccionado) return;

  ultimaBusquedaDiv.classList.add("ocultar");
  guardarUltimaBusqueda();

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

function crearTarjeta() {
  const div = document.createElement("div");
  div.className = "horario";
  div.innerHTML = `
    <h3 class="horarioH3 campo-servicio"></h3>
    <p class="campo-desde"></p>
    <p class="campo-hasta"></p>
    <h4 class="andenH4 campo-anden ocultar"></h4>
    <h3 class="campo-viaje"></h3>
    <h2 class="campo-restante"></h2>
    <button type="button" class="boton-mapa ocultar">Ver mapa</button>
    <div class="mapa ocultar"></div>
  `;

  const campos = {
    servicio: div.querySelector(".campo-servicio"),
    desde: div.querySelector(".campo-desde"),
    hasta: div.querySelector(".campo-hasta"),
    anden: div.querySelector(".campo-anden"),
    viaje: div.querySelector(".campo-viaje"),
    restante: div.querySelector(".campo-restante"),
    botonMapa: div.querySelector(".boton-mapa"),
    mapaDiv: div.querySelector(".mapa"),
  };

  const tarjeta = { div, campos, estadoMapa: { map: null, marker: null }, ubicacion: null };

  campos.botonMapa.addEventListener("click", () => {
    const oculto = campos.mapaDiv.classList.contains("ocultar");
    if (oculto) {
      campos.mapaDiv.classList.remove("ocultar");
      campos.botonMapa.textContent = "Ocultar mapa";
      if (tarjeta.ubicacion) {
        actualizarMapa(tarjeta.estadoMapa, campos.mapaDiv, tarjeta.ubicacion.lat, tarjeta.ubicacion.lon);
      }
    } else {
      campos.mapaDiv.classList.add("ocultar");
      campos.botonMapa.textContent = "Ver mapa";
    }
  });

  return tarjeta;
}

function actualizarTarjetas(results, destination) {
  const vistos = new Set();

  results.forEach((horarios) => {
    const servicioNombre = horarios.servicio?.ramal?.nombre || "No disponible";
    const arribo = horarios.arribo;
    const claveTarjeta = arribo?.equipo?.id ?? `${servicioNombre}-${arribo?.nombre}`;
    const estacionArribo = arribo?.nombre || "No disponible";
    const llegadaArribo = new Date(arribo?.llegada?.estimada || arribo?.llegada?.programada);
    const salidaArribo = new Date(arribo?.salida?.programada || "No disponible");
    const andenSalida = arribo?.anden?.nombre || false;
    const llegadaBool = llegadaArribo.toString() !== "Invalid Date";
    const ubicacion = horarios.servicio?.location;

    horarios.servicio?.estaciones.forEach((estacion) => {
      const idElemento = estacion?.idElemento;
      if (idElemento != destination) return;

      vistos.add(claveTarjeta);

      const nombreEstacion = estacion?.nombre || "No disponible";
      const llegadaDestino = new Date(
        estacion?.llegada?.estimada || estacion?.llegada?.programada || "No disponible"
      );
      const referencia = llegadaBool ? llegadaArribo : salidaArribo;
      const tiempoRestante = calcularTiempoRestante(referencia);
      const tiempoDeViaje = calcularTiempoDeViaje(referencia, llegadaDestino);

      let tarjeta = tarjetas.get(claveTarjeta);
      if (!tarjeta) {
        tarjeta = crearTarjeta();
        tarjetas.set(claveTarjeta, tarjeta);
        resultDiv.appendChild(tarjeta.div);
      }

      tarjeta.campos.servicio.textContent = `Servicio: ${servicioNombre}`;
      tarjeta.campos.desde.innerHTML = llegadaBool
        ? `Desde: <b>${estacionArribo}</b> (Hora: ${llegadaArribo.toLocaleTimeString()})`
        : `Desde: <b>${estacionArribo}</b> (Hora: ${salidaArribo.toLocaleTimeString()})`;
      tarjeta.campos.hasta.innerHTML =
        nombreEstacion !== "No disponible"
          ? `Hasta: <b>${nombreEstacion}</b> (Hora: ${llegadaDestino.toLocaleTimeString()})`
          : "";

      if (!llegadaBool && andenSalida !== false) {
        tarjeta.campos.anden.textContent = `Andén: ${andenSalida}`;
        tarjeta.campos.anden.classList.remove("ocultar");
      } else {
        tarjeta.campos.anden.classList.add("ocultar");
      }

      tarjeta.campos.viaje.textContent = tiempoDeViaje ? `Tiempo de viaje: ${tiempoDeViaje}` : "";
      tarjeta.campos.restante.textContent = llegadaBool
        ? `Llegando en: ${tiempoRestante}`
        : `Saliendo en: ${tiempoRestante}`;

      if (ubicacion?.lat && ubicacion?.long) {
        tarjeta.ubicacion = { lat: ubicacion.lat, lon: ubicacion.long };
        tarjeta.campos.botonMapa.classList.remove("ocultar");
        if (tarjeta.estadoMapa.map) {
          actualizarMapa(tarjeta.estadoMapa, tarjeta.campos.mapaDiv, ubicacion.lat, ubicacion.long);
        }
      } else {
        tarjeta.ubicacion = null;
        tarjeta.campos.botonMapa.classList.add("ocultar");
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

function buscarProgramado() {
  if (!origenSeleccionado || !destinoSeleccionado) return;

  ultimaBusquedaDiv.classList.add("ocultar");
  limpiarTarjetas();
  resultDiv.classList.remove("ocultar");
  resultDiv.scrollIntoView({ behavior: "smooth" });

  if (!fechaInput.value || !horaInput.value) {
    resultDiv.innerHTML = '<p class="mensaje-vacio">Elegí una fecha y una hora para buscar.</p>';
    return;
  }

  resultDiv.innerHTML = '<p class="mensaje-vacio"><span class="spinner"></span> Buscando...</p>';

  const origin = origenSeleccionado.id;
  const destination = destinoSeleccionado.id;

  const xhr = new XMLHttpRequest();
  xhr.open(
    "GET",
    `https://api-servicios.sofse.gob.ar/v1/arribos/estacion/${origin}?hasta=${destination}&fecha=${fechaInput.value}&hora=${horaInput.value}&tipoBusqueda=partida`,
    true
  );
  xhr.setRequestHeader("Authorization", `${token}`);

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          mostrarHorariosProgramados(response.results || [], destination);
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

function mostrarHorariosProgramados(results, destination) {
  resultDiv.innerHTML = "";
  let encontrados = 0;

  results.slice(0, 10).forEach((horarios) => {
    const estacionDestino = horarios.servicio?.estaciones?.find((e) => e.idElemento == destination);
    if (!estacionDestino) return;

    encontrados++;
    const servicioNombre = horarios.servicio?.ramal?.nombre || "No disponible";
    const arribo = horarios.arribo;
    const estacionOrigen = arribo?.nombre || "No disponible";
    const andenSalida = arribo?.anden?.nombre || false;
    const salida = new Date(arribo?.salida?.programada);
    const llegada = new Date(estacionDestino.llegada?.programada);
    const tiempoDeViaje = calcularTiempoDeViaje(salida, llegada);

    const div = document.createElement("div");
    div.className = "horario";
    div.innerHTML = `
      <h3 class="horarioH3">Servicio: ${servicioNombre}</h3>
      <p>Sale de <b>${estacionOrigen}</b> a las ${salida.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
      <p>Llega a <b>${estacionDestino.nombre}</b> a las ${llegada.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
      ${andenSalida ? `<h4 class="andenH4">Andén: ${andenSalida}</h4>` : ""}
      ${tiempoDeViaje ? `<h3>Tiempo de viaje: ${tiempoDeViaje}</h3>` : ""}
    `;
    resultDiv.appendChild(div);
  });

  if (encontrados === 0) {
    resultDiv.innerHTML = '<p class="mensaje-vacio">No encontramos formaciones programadas para estas estaciones.</p>';
  }
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

  modoChips.forEach((chip) => {
    chip.addEventListener("click", () => cambiarModo(chip.dataset.modo));
  });

  buscarBtn.addEventListener("click", () => {
    if (modoBusqueda === "vivo") {
      detenerBusqueda();
      iniciarBusqueda();
    } else {
      buscarProgramado();
    }
  });

  login({
    onOk: (tok) => {
      token = tok;
      cargarUltimaBusqueda();
    },
  });
}

iniciar();
