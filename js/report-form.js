import {
  getAmbonAlertClient,
  removeReportPhoto,
  uploadReportPhoto
} from "./supabase.js";
import { getAuthErrorMessage, requireSignedInUser } from "./auth-utils.js";

const AMBON_CENTER = [-3.6954, 128.1814];
const AMBON_INDICATIVE_BOUNDS = {
  minLatitude: -3.88,
  maxLatitude: -3.48,
  minLongitude: 127.88,
  maxLongitude: 128.38
};
const INDONESIA_BOUNDS = {
  minLatitude: -11,
  maxLatitude: 6.5,
  minLongitude: 95,
  maxLongitude: 141
};

document.addEventListener("DOMContentLoaded", async function () {
  const form = document.getElementById("report-form");
  if (!form) return;

  const accessMessage = document.getElementById("report-access-message");
  const feedback = document.getElementById("form-feedback");
  const submitButton = form.querySelector('[type="submit"]');
  const latitudeInput = form.elements.latitude;
  const longitudeInput = form.elements.longitude;
  const outsideWarning = document.getElementById("location-warning");
  const outsideConfirm = document.getElementById("outside-confirm");
  const outsideConfirmWrap = document.getElementById("outside-confirm-wrap");
  const gpsFeedback = document.getElementById("gps-feedback");
  const timeInput = form.elements.waktu_kejadian;
  let client;
  let map;
  let marker;
  let selectedLocation = null;
  let submitting = false;

  function showFeedback(message, isError) {
    feedback.textContent = message;
    feedback.dataset.state = isError ? "error" : "success";
  }

  function isInAmbonIndicativeArea(latitude, longitude) {
    return latitude >= AMBON_INDICATIVE_BOUNDS.minLatitude
      && latitude <= AMBON_INDICATIVE_BOUNDS.maxLatitude
      && longitude >= AMBON_INDICATIVE_BOUNDS.minLongitude
      && longitude <= AMBON_INDICATIVE_BOUNDS.maxLongitude;
  }

  function isInIndonesiaBounds(latitude, longitude) {
    return latitude >= INDONESIA_BOUNDS.minLatitude
      && latitude <= INDONESIA_BOUNDS.maxLatitude
      && longitude >= INDONESIA_BOUNDS.minLongitude
      && longitude <= INDONESIA_BOUNDS.maxLongitude;
  }

  function updateOutsideWarning(latitude, longitude) {
    const outside = !isInAmbonIndicativeArea(latitude, longitude);
    outsideWarning.hidden = !outside;
    outsideConfirmWrap.hidden = !outside;
    outsideConfirm.required = outside;
    if (outside) {
      outsideWarning.textContent = "Titik ini berada di luar area indikatif Kota Ambon. Batas ini hanya perkiraan, bukan batas administrasi resmi; periksa lokasi sebelum mengirim.";
    } else {
      outsideWarning.textContent = "";
      outsideConfirm.checked = false;
    }
  }

  function setSelectedLocation(latitude, longitude, moveMap) {
    selectedLocation = { latitude, longitude };
    latitudeInput.value = latitude.toFixed(6);
    longitudeInput.value = longitude.toFixed(6);
    updateOutsideWarning(latitude, longitude);

    if (map) {
      const location = [latitude, longitude];
      if (!marker) {
        marker = L.marker(location, { draggable: true }).addTo(map);
        marker.on("dragend", function () {
          const point = marker.getLatLng();
          setSelectedLocation(point.lat, point.lng, false);
        });
      } else {
        marker.setLatLng(location);
      }
      if (moveMap) map.setView(location, Math.max(map.getZoom(), 14));
    }
  }

  function readCoordinateInputs() {
    const latitude = Number(latitudeInput.value);
    const longitude = Number(longitudeInput.value);
    if (!latitudeInput.value || !longitudeInput.value
      || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || !isInIndonesiaBounds(latitude, longitude)) {
      selectedLocation = null;
      if (marker && map) {
        map.removeLayer(marker);
        marker = null;
      }
      if (latitudeInput.value || longitudeInput.value) {
        outsideWarning.hidden = false;
        outsideConfirmWrap.hidden = true;
        outsideWarning.textContent = "Masukkan koordinat valid dalam kisaran Indonesia.";
      } else {
        outsideWarning.hidden = true;
        outsideWarning.textContent = "";
      }
      return;
    }
    setSelectedLocation(latitude, longitude, false);
  }

  function initMap() {
    const mapElement = document.getElementById("report-map");
    if (!window.L) {
      mapElement.innerHTML = '<p class="map-fallback">Peta tidak dapat dimuat. Anda masih dapat memasukkan koordinat secara manual.</p>';
      return;
    }

    mapElement.replaceChildren();
    map = L.map(mapElement, { center: AMBON_CENTER, zoom: 12, scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);
    map.on("click", function (event) {
      setSelectedLocation(event.latlng.lat, event.latlng.lng, false);
    });
    mapElement.addEventListener("focusin", function () { map.scrollWheelZoom.enable(); });
    mapElement.addEventListener("focusout", function () { map.scrollWheelZoom.disable(); });
  }

  function setCurrentDateMaximum() {
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    timeInput.max = localNow;
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      gpsFeedback.textContent = "Peramban ini tidak menyediakan GPS.";
      return;
    }
    gpsFeedback.textContent = "Meminta lokasi perangkat…";
    navigator.geolocation.getCurrentPosition(
      function (position) {
        setSelectedLocation(position.coords.latitude, position.coords.longitude, true);
        gpsFeedback.textContent = `Lokasi diperbarui (akurasi sekitar ${Math.round(position.coords.accuracy)} m).`;
      },
      function (error) {
        const messages = {
          1: "Izin lokasi ditolak. Pilih titik pada peta atau masukkan koordinat.",
          2: "Lokasi perangkat tidak tersedia. Coba pilih titik pada peta.",
          3: "Permintaan lokasi melewati batas waktu. Coba lagi."
        };
        gpsFeedback.textContent = messages[error.code] || "Lokasi tidak dapat diambil.";
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  try {
    client = getAmbonAlertClient();
    const user = await requireSignedInUser(client);
    if (!user) return;
    form.hidden = false;
    accessMessage.hidden = true;
    setCurrentDateMaximum();
    initMap();
  } catch (error) {
    accessMessage.textContent = getAuthErrorMessage(error);
    console.error("Gagal memeriksa akses formulir laporan:", error);
    return;
  }

  latitudeInput.addEventListener("input", readCoordinateInputs);
  longitudeInput.addEventListener("input", readCoordinateInputs);
  document.getElementById("use-current-location").addEventListener("click", requestCurrentLocation);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;

    const eventTime = new Date(timeInput.value);
    if (!Number.isFinite(eventTime.getTime()) || eventTime.getTime() > Date.now()) {
      showFeedback("Waktu kejadian harus valid dan tidak boleh di masa depan.", true);
      timeInput.focus();
      return;
    }
    if (!selectedLocation || !isInIndonesiaBounds(selectedLocation.latitude, selectedLocation.longitude)) {
      showFeedback("Pilih lokasi valid pada peta atau masukkan koordinat terlebih dahulu.", true);
      latitudeInput.focus();
      return;
    }
    if (!isInAmbonIndicativeArea(selectedLocation.latitude, selectedLocation.longitude)
      && !outsideConfirm.checked) {
      showFeedback("Periksa dan konfirmasi lokasi yang berada di luar area indikatif Kota Ambon.", true);
      outsideConfirm.focus();
      return;
    }

    submitting = true;
    submitButton.disabled = true;
    showFeedback("Mengirim laporan…", false);
    let uploadedPath = null;

    try {
      const photoFile = form.elements.foto.files[0];
      if (photoFile) {
        const upload = await uploadReportPhoto(client, photoFile);
        if (upload.error) throw upload.error;
        if (!upload.data || !upload.data.path) {
          throw new Error("Unggahan foto tidak menghasilkan path penyimpanan.");
        }
        uploadedPath = upload.data.path;
      }

      const report = {
        jenis: form.elements.jenis.value,
        judul: form.elements.judul.value.trim(),
        deskripsi: form.elements.deskripsi.value.trim(),
        waktu_kejadian: eventTime.toISOString(),
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        alamat: form.elements.alamat.value.trim() || null,
        foto: uploadedPath
      };
      const { error } = await client.from("laporan").insert(report);
      if (error) {
        if (uploadedPath) {
          const cleanup = await removeReportPhoto(client, uploadedPath);
          if (cleanup.error) {
            console.error("Gagal membersihkan foto laporan yatim:", cleanup.error);
            throw new Error(`${getAuthErrorMessage(error)} Foto gagal dibersihkan setelah pengiriman gagal; hubungi administrator.`);
          }
          uploadedPath = null;
        }
        throw error;
      }

      form.reset();
      selectedLocation = null;
      if (marker && map) {
        map.removeLayer(marker);
        marker = null;
      }
      outsideWarning.hidden = true;
      outsideConfirmWrap.hidden = true;
      gpsFeedback.textContent = "";
      showFeedback("Laporan berhasil dikirim dan berstatus menunggu verifikasi. Laporan ini bukan permintaan layanan darurat.", false);
    } catch (error) {
      showFeedback(getAuthErrorMessage(error), true);
      console.error("Pengiriman laporan Ambon Alert gagal:", error);
    } finally {
      submitting = false;
      submitButton.disabled = false;
    }
  });
});
