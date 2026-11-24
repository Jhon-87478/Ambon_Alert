import { createReportPhotoUrls, getAmbonAlertClient } from "./supabase.js";

const AMBON_CENTER = [-3.6954, 128.1814];
const REPORT_COLORS = Object.freeze({ banjir: "#1477d4", longsor: "#8b5a2b" });
const HAZARD_COLORS = Object.freeze({ rendah: "low", sedang: "medium", tinggi: "high" });
const PUBLIC_REPORT_STATUSES = new Set(["terverifikasi", "menunggu"]);
const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short"
});

document.addEventListener("DOMContentLoaded", function () {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;

  const dataStatus = document.getElementById("map-data-status");
  const typeFilter = document.getElementById("filter-type");
  const statusFilter = document.getElementById("filter-status");
  const riskToggle = document.getElementById("toggle-risk-layer");
  const statTotal = document.getElementById("stat-total");
  const statVerified = document.getElementById("stat-verified");
  const statPending = document.getElementById("stat-pending");

  if (!window.L) {
    mapElement.innerHTML = '<p class="map-fallback">Peta tidak dapat dimuat. Periksa koneksi internet atau coba lagi nanti.</p>';
    dataStatus.textContent = "Pustaka peta Leaflet tidak tersedia.";
    statTotal.textContent = statVerified.textContent = statPending.textContent = "—";
    return;
  }

  mapElement.replaceChildren();
  const map = L.map(mapElement, {
    center: AMBON_CENTER,
    zoom: 12,
    scrollWheelZoom: false
  });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
  }).addTo(map);

  const verifiedLayer = L.layerGroup().addTo(map);
  const pendingLayer = L.layerGroup().addTo(map);
  const hazardLayer = L.layerGroup().addTo(map);
  let reports = [];
  let hazards = [];
  let photoUrls = new Map();

  mapElement.addEventListener("focusin", function () { map.scrollWheelZoom.enable(); });
  mapElement.addEventListener("focusout", function () { map.scrollWheelZoom.disable(); });

  function addPopupDetail(container, label, value) {
    if (value === null || value === undefined || String(value).trim() === "") return;
    const row = document.createElement("p");
    row.className = "popup-detail";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    row.append(strong, document.createTextNode(String(value)));
    container.append(row);
  }

  function formatDate(value, dateOnly) {
    const date = new Date(dateOnly ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? "Waktu tidak tersedia" : dateTimeFormatter.format(date);
  }

  function createReportPopup(report) {
    const popup = document.createElement("article");
    popup.className = "map-popup";
    const heading = document.createElement("h3");
    heading.textContent = report.judul || "Laporan warga";
    popup.append(heading);

    const status = document.createElement("span");
    status.className = `status-pill status-${report.status}`;
    status.textContent = report.status === "menunggu" ? "Menunggu verifikasi" : "Terverifikasi";
    popup.append(status);

    addPopupDetail(popup, "Jenis", report.jenis === "banjir" ? "Banjir" : "Tanah longsor");
    addPopupDetail(popup, "Status", report.status === "menunggu" ? "Menunggu verifikasi" : "Terverifikasi");
    addPopupDetail(popup, "Waktu kejadian", formatDate(report.waktu_kejadian, false));
    addPopupDetail(popup, "Deskripsi", report.deskripsi);
    addPopupDetail(popup, "Alamat", report.alamat);

    const signedUrl = report.foto ? photoUrls.get(report.foto) : null;
    if (signedUrl) {
      const link = document.createElement("a");
      link.href = signedUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "popup-photo-link";
      link.textContent = "Buka foto bukti";
      const image = document.createElement("img");
      image.className = "popup-photo";
      image.src = signedUrl;
      image.alt = "Foto bukti laporan warga";
      image.loading = "lazy";
      link.prepend(image);
      popup.append(link);
    } else if (report.foto) {
      addPopupDetail(popup, "Foto", "Foto tidak dapat dimuat.");
    }

    return popup;
  }

  function renderReports() {
    verifiedLayer.clearLayers();
    pendingLayer.clearLayers();

    const chosenType = typeFilter.value;
    const chosenStatus = statusFilter.value;
    reports.forEach((report) => {
      if (!PUBLIC_REPORT_STATUSES.has(report.status)) return;
      if (chosenType !== "semua" && report.jenis !== chosenType) return;
      if (chosenStatus !== "semua" && report.status !== chosenStatus) return;
      if (!Number.isFinite(Number(report.latitude)) || !Number.isFinite(Number(report.longitude))) return;

      const isPending = report.status === "menunggu";
      const color = REPORT_COLORS[report.jenis];
      if (!color) return;
      const circleStyle = {
        radius: 9,
        color,
        fillColor: color,
        fillOpacity: isPending ? 0.3 : 0.92,
        opacity: isPending ? 0.76 : 1,
        weight: 3
      };
      if (isPending) circleStyle.dashArray = "5 5";
      const marker = L.circleMarker([Number(report.latitude), Number(report.longitude)], circleStyle)
        .bindPopup(createReportPopup(report), { maxWidth: 320 });

      (isPending ? pendingLayer : verifiedLayer).addLayer(marker);
    });
  }

  function createHazardPopup(hazard) {
    const popup = document.createElement("article");
    popup.className = "map-popup";
    const heading = document.createElement("h3");
    heading.textContent = hazard.nama;
    popup.append(heading);
    addPopupDetail(popup, "Jenis", hazard.jenis === "banjir" ? "Banjir" : "Tanah longsor");
    addPopupDetail(popup, "Tingkat", hazard.tingkat);
    addPopupDetail(popup, "Keterangan", hazard.keterangan);
    addPopupDetail(popup, "Sumber", hazard.sumber);
    addPopupDetail(popup, "Tanggal data", formatDate(hazard.tanggal_data, true));
    return popup;
  }

  function renderHazards() {
    hazardLayer.clearLayers();
    hazards.forEach((hazard) => {
      const severity = HAZARD_COLORS[hazard.tingkat];
      if (!severity || !Number.isFinite(Number(hazard.latitude)) || !Number.isFinite(Number(hazard.longitude))) return;
      const icon = L.divIcon({
        className: `hazard-diamond hazard-${severity}`,
        html: "◆",
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      L.marker([Number(hazard.latitude), Number(hazard.longitude)], { icon })
        .bindPopup(createHazardPopup(hazard), { maxWidth: 300 })
        .addTo(hazardLayer);
    });
  }

  typeFilter.addEventListener("change", renderReports);
  statusFilter.addEventListener("change", renderReports);
  riskToggle.addEventListener("click", function () {
    const willShow = riskToggle.getAttribute("aria-pressed") !== "true";
    if (willShow) hazardLayer.addTo(map);
    else map.removeLayer(hazardLayer);
    riskToggle.setAttribute("aria-pressed", String(willShow));
    riskToggle.textContent = willShow ? "Sembunyikan titik rawan" : "Tampilkan titik rawan";
  });

  async function loadPublicData() {
    try {
      const client = getAmbonAlertClient();
      async function loadAllRows(table, columns, orderColumn) {
        const pageSize = 1000;
        const rows = [];
        for (let start = 0; ; start += pageSize) {
          const { data, error } = await client.from(table)
            .select(columns)
            .order(orderColumn, { ascending: false })
            .range(start, start + pageSize - 1);
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < pageSize) return rows;
        }
      }

      const [reportRows, hazardRows] = await Promise.all([
        loadAllRows(
          "laporan_publik",
          "id,jenis,judul,deskripsi,waktu_kejadian,latitude,longitude,alamat,foto,status,created_at",
          "created_at"
        ),
        loadAllRows(
          "titik_rawan",
          "id,nama,jenis,tingkat,latitude,longitude,keterangan,sumber,tanggal_data",
          "tanggal_data"
        )
      ]);

      reports = reportRows.filter((report) => PUBLIC_REPORT_STATUSES.has(report.status));
      hazards = hazardRows;
      statTotal.textContent = String(reports.length);
      statVerified.textContent = String(reports.filter((report) => report.status === "terverifikasi").length);
      statPending.textContent = String(reports.filter((report) => report.status === "menunggu").length);

      const photoPaths = [...new Set(reports.map((report) => report.foto).filter(Boolean))];
      if (photoPaths.length) {
        const signedResult = await createReportPhotoUrls(client, photoPaths, 300);
        if (signedResult.error) {
          console.warn("Sebagian foto laporan publik tidak dapat ditandatangani:", signedResult.error);
        }
        (signedResult.data || []).forEach((item) => {
          if (item.path && item.signedUrl && !item.error) photoUrls.set(item.path, item.signedUrl);
        });
      }

      renderReports();
      renderHazards();
      dataStatus.textContent = `${reports.length} laporan publik dan ${hazards.length} titik rawan dimuat.`;
    } catch (error) {
      statTotal.textContent = statVerified.textContent = statPending.textContent = "—";
      dataStatus.textContent = `Data peta gagal dimuat: ${error.message}`;
      console.error("Gagal memuat data peta Ambon Alert:", error);
    }
  }

  loadPublicData();
});
