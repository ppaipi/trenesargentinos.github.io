let icono = null;

function obtenerIcono() {
  if (!icono) {
    icono = L.icon({
      iconUrl: "tren.png",
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -32],
    });
  }
  return icono;
}

/**
 * Crea el mapa la primera vez; en updates siguientes solo mueve el marcador
 * (no recrea el mapa ni recarga teselas, para evitar titileo/reinicio).
 */
export function actualizarMapa(estado, contenedor, lat, lon) {
  if (!estado.map) {
    estado.map = L.map(contenedor).setView([lat, lon], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(estado.map);
    estado.marker = L.marker([lat, lon], { icon: obtenerIcono() }).addTo(estado.map);
  } else {
    estado.marker.setLatLng([lat, lon]);
  }
}

export function eliminarMapa(estado) {
  if (estado.map) {
    estado.map.remove();
    estado.map = null;
    estado.marker = null;
  }
}
