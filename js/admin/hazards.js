import { protectAdminPage, selectAllRows, showFeedback } from "./common.js";

const AMBON_CENTER = [-3.6954, 128.1814];
const INDONESIA_BOUNDS = { minLat: -11, maxLat: 6.5, minLng: 95, maxLng: 141 };
const AMBON_INDICATIVE_BOUNDS = { minLat: -3.88, maxLat: -3.48, minLng: 127.88, maxLng: 128.38 };

document.addEventListener("DOMContentLoaded", async function () {
  const access = await protectAdminPage();
  if (!access) return;

  const client = access.client;
  const form = document.getElementById("hazard-form");
  const list = document.getElementById("hazards-list");
  const feedback = document.getElementById("hazard-feedback");
  const cancelEdit = document.getElementById("cancel-hazard-edit");
  const saveButton = document.getElementById("save-hazard");
  const latitude = form.elements.latitude;
  const longitude = form.elements.longitude;
  let map;
  let marker;
  let busy = false;

  function placeMarker(lat, lng, centerMap) {
    if (!map || !window.L) return;
    const position = [Number(lat), Number(lng)];
    if (!marker) {
      marker = L.marker(position, { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const point = marker.getLatLng();
        setLocation(point.lat, point.lng, false);
      });
    } else marker.setLatLng(position);
    if (centerMap) map.setView(position, Math.max(map.getZoom(), 14));
  }

  function setLocation(lat, lng, centerMap) {
    latitude.value = Number(lat).toFixed(6);
    longitude.value = Number(lng).toFixed(6);
    updateAmbonWarning(lat, lng);
    placeMarker(lat, lng, centerMap);
  }

  function updateAmbonWarning(lat, lng) {
    const warning = document.getElementById("hazard-location-warning");
    const outsideAmbon = Number(lat) < AMBON_INDICATIVE_BOUNDS.minLat
      || Number(lat) > AMBON_INDICATIVE_BOUNDS.maxLat
      || Number(lng) < AMBON_INDICATIVE_BOUNDS.minLng
      || Number(lng) > AMBON_INDICATIVE_BOUNDS.maxLng;
    warning.hidden = !outsideAmbon;
  }

  function initMap() {
    const element = document.getElementById("hazard-map");
    if (!window.L) {
      element.innerHTML = '<p class="map-fallback">Leaflet gagal dimuat. Masukkan koordinat secara manual.</p>';
      showFeedback(feedback, "Pustaka Leaflet tidak tersedia; koordinat manual tetap dapat digunakan.", true);
      return;
    }
    map = L.map(element, { center: AMBON_CENTER, zoom: 12, scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);
    map.on("click", (event) => setLocation(event.latlng.lat, event.latlng.lng, false));
    element.addEventListener("focusin", () => map.scrollWheelZoom.enable());
    element.addEventListener("focusout", () => map.scrollWheelZoom.disable());
  }

  function resetForm() {
    form.reset();
    form.elements.id.value = "";
    form.elements.tingkat.value = "sedang";
    document.getElementById("hazard-form-heading").textContent = "Tambah titik rawan";
    saveButton.textContent = "Simpan titik";
    cancelEdit.hidden = true;
    if (marker && map) map.removeLayer(marker);
    marker = null;
    latitude.value = "";
    longitude.value = "";
    document.getElementById("hazard-location-warning").hidden = true;
  }

  function render(rows) {
    if (!rows.length) {
      list.replaceChildren(Object.assign(document.createElement("p"), {
        className: "empty-state",
        textContent: "Belum ada titik rawan."
      }));
      return;
    }
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const card = document.createElement("article");
      card.className = "admin-record glass";
      const heading = document.createElement("h3");
      heading.textContent = row.nama;
      const details = document.createElement("p");
      details.className = "muted";
      details.textContent = `${row.jenis === "banjir" ? "Banjir" : "Tanah longsor"} · Tingkat ${row.tingkat} · Data ${row.tanggal_data}`;
      const source = document.createElement("p");
      source.textContent = `Sumber: ${row.sumber}`;
      const coordinates = document.createElement("p");
      coordinates.className = "muted small";
      coordinates.textContent = `Koordinat ${row.latitude}, ${row.longitude}${row.keterangan ? ` · ${row.keterangan}` : ""}`;
      const actions = document.createElement("div");
      actions.className = "form-actions admin-record-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "button button-secondary";
      edit.textContent = "Ubah";
      edit.addEventListener("click", () => beginEdit(row));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button-danger";
      remove.textContent = "Hapus";
      remove.addEventListener("click", () => deleteHazard(row));
      actions.append(edit, remove);
      card.append(heading, details, source, coordinates, actions);
      fragment.append(card);
    });
    list.replaceChildren(fragment);
  }

  async function loadRows() {
    try {
      const rows = await selectAllRows(client, "titik_rawan", "id,nama,jenis,tingkat,latitude,longitude,keterangan,sumber,tanggal_data,updated_at", "updated_at");
      render(rows);
      showFeedback(feedback, `${rows.length} titik rawan dimuat.`, false);
    } catch (error) {
      showFeedback(feedback, `Titik rawan gagal dimuat: ${error.message}`, true);
      console.error("Gagal memuat titik rawan:", error);
    }
  }

  function beginEdit(row) {
    form.elements.id.value = row.id;
    form.elements.nama.value = row.nama;
    form.elements.jenis.value = row.jenis;
    form.elements.tingkat.value = row.tingkat;
    form.elements.sumber.value = row.sumber;
    form.elements.tanggal_data.value = row.tanggal_data;
    form.elements.keterangan.value = row.keterangan || "";
    setLocation(row.latitude, row.longitude, true);
    document.getElementById("hazard-form-heading").textContent = "Ubah titik rawan";
    saveButton.textContent = "Simpan perubahan";
    cancelEdit.hidden = false;
    document.getElementById("hazard-form-heading").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function deleteHazard(row) {
    if (busy || !window.confirm(`Hapus titik rawan "${row.nama}"?`)) return;
    busy = true;
    try {
      const { error } = await client.from("titik_rawan").delete().eq("id", row.id);
      if (error) throw error;
      if (form.elements.id.value === row.id) resetForm();
      await loadRows();
    } catch (error) {
      showFeedback(feedback, `Titik rawan gagal dihapus: ${error.message}`, true);
      console.error("Gagal menghapus titik rawan:", error);
    } finally {
      busy = false;
    }
  }

  initMap();
  latitude.addEventListener("input", syncMarker);
  longitude.addEventListener("input", syncMarker);
  function syncMarker() {
    if (latitude.value === "" || longitude.value === "") {
      document.getElementById("hazard-location-warning").hidden = true;
      return;
    }
    const lat = Number(latitude.value);
    const lng = Number(longitude.value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      updateAmbonWarning(lat, lng);
      if (lat >= INDONESIA_BOUNDS.minLat && lat <= INDONESIA_BOUNDS.maxLat
        && lng >= INDONESIA_BOUNDS.minLng && lng <= INDONESIA_BOUNDS.maxLng) {
        placeMarker(lat, lng, false);
      }
    }
  }
  cancelEdit.addEventListener("click", resetForm);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const lat = Number(latitude.value);
    const lng = Number(longitude.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < INDONESIA_BOUNDS.minLat || lat > INDONESIA_BOUNDS.maxLat
      || lng < INDONESIA_BOUNDS.minLng || lng > INDONESIA_BOUNDS.maxLng) {
      showFeedback(feedback, "Koordinat harus berada dalam kisaran wilayah Indonesia.", true);
      latitude.focus();
      return;
    }
    const payload = {
      nama: form.elements.nama.value.trim(),
      jenis: form.elements.jenis.value,
      tingkat: form.elements.tingkat.value,
      latitude: lat,
      longitude: lng,
      keterangan: form.elements.keterangan.value.trim() || null,
      sumber: form.elements.sumber.value.trim(),
      tanggal_data: form.elements.tanggal_data.value
    };
    const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(payload.tanggal_data)
      && !Number.isNaN(new Date(`${payload.tanggal_data}T00:00:00Z`).getTime())
      && new Date(`${payload.tanggal_data}T00:00:00Z`).toISOString().slice(0, 10) === payload.tanggal_data;
    if (!payload.nama || payload.nama.length > 150 || !payload.sumber || !dateIsValid) {
      showFeedback(feedback, "Nama, sumber, tanggal data YYYY-MM-DD, dan koordinat valid wajib diisi.", true);
      return;
    }
    busy = true;
    saveButton.disabled = true;
    try {
      let result;
      if (form.elements.id.value) {
        result = await client.from("titik_rawan").update(payload).eq("id", form.elements.id.value);
      } else {
        result = await client.from("titik_rawan").insert(payload);
      }
      if (result.error) throw result.error;
      resetForm();
      await loadRows();
      showFeedback(feedback, "Titik rawan berhasil disimpan.", false);
    } catch (error) {
      showFeedback(feedback, `Titik rawan gagal disimpan: ${error.message}`, true);
      console.error("Gagal menyimpan titik rawan:", error);
    } finally {
      busy = false;
      saveButton.disabled = false;
    }
  });
  await loadRows();
});
