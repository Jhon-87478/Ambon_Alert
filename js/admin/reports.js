import { createReportPhotoUrls, removeReportPhoto } from "../supabase.js";
import { formatDateTime, protectAdminPage, selectAllRows, showFeedback } from "./common.js";

document.addEventListener("DOMContentLoaded", async function () {
  const access = await protectAdminPage();
  if (!access) return;

  const client = access.client;
  const list = document.getElementById("reports-list");
  const feedback = document.getElementById("reports-feedback");
  const statusFilter = document.getElementById("filter-status");
  const typeFilter = document.getElementById("filter-type");
  const dialog = document.getElementById("reject-dialog");
  const rejectForm = document.getElementById("reject-form");
  const reasonInput = rejectForm.elements.alasan_penolakan;
  const rejectFeedback = document.getElementById("reject-feedback");
  const reasonCount = document.getElementById("reason-count");
  let reports = [];
  let rejectingId = null;
  let busy = false;

  function makeText(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    return element;
  }

  function actionButton(label, action, reportId, style) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button ${style || "button-secondary"}`;
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.reportId = reportId;
    return button;
  }

  function createReportCard(report, photoUrl) {
    const card = document.createElement("article");
    card.className = "admin-record glass report-admin-card";
    card.dataset.reportId = report.id;
    const header = document.createElement("div");
    header.className = "history-card-heading";
    const title = makeText("h2", "", report.judul);
    const pill = makeText("span", `status-pill status-${report.status}`, report.status === "menunggu" ? "Menunggu verifikasi" : report.status);
    header.append(title, pill);

    const detail = makeText("p", "muted", `${report.jenis === "banjir" ? "Banjir" : "Tanah longsor"} · Kejadian ${formatDateTime(report.waktu_kejadian)} · Dikirim ${formatDateTime(report.created_at)}`);
    const description = makeText("p", "report-description", report.deskripsi);
    const location = makeText("p", "muted small", `Koordinat: ${report.latitude}, ${report.longitude}${report.alamat ? ` · ${report.alamat}` : ""}`);
    card.append(header, detail, description, location);

    if (photoUrl) {
      const photoLink = document.createElement("a");
      photoLink.className = "text-link";
      photoLink.href = photoUrl;
      photoLink.target = "_blank";
      photoLink.rel = "noopener noreferrer";
      photoLink.textContent = "Buka foto bukti (tautan sementara)";
      card.append(photoLink);
    } else if (report.foto) {
      card.append(makeText("p", "muted small", "Foto bukti belum dapat dimuat."));
    }

    if (report.status === "ditolak" && report.alasan_penolakan) {
      card.append(makeText("p", "rejection-reason", `Alasan penolakan: ${report.alasan_penolakan}`));
    }
    const actions = document.createElement("div");
    actions.className = "form-actions admin-record-actions";
    if (report.status === "menunggu") {
      actions.append(
        actionButton("Verifikasi", "verify", report.id, "button-primary"),
        actionButton("Tolak", "reject", report.id),
      );
    } else {
      actions.append(actionButton("Kembalikan ke menunggu", "reset", report.id));
    }
    actions.append(actionButton("Hapus laporan", "delete", report.id, "button-danger"));
    card.append(actions);
    return card;
  }

  async function loadReports() {
    showFeedback(feedback, "Memuat laporan…", false);
    try {
      reports = await selectAllRows(
        client,
        "laporan_admin",
        "id,jenis,judul,deskripsi,waktu_kejadian,latitude,longitude,alamat,foto,status,alasan_penolakan,created_at",
        "created_at"
      );
      renderReports();
      showFeedback(feedback, `${reports.length} laporan dimuat.`, false);
    } catch (error) {
      showFeedback(feedback, `Laporan gagal dimuat: ${error.message}`, true);
      console.error("Gagal memuat laporan untuk moderasi:", error);
    }
  }

  async function renderReports() {
    const filtered = reports.filter((report) =>
      (statusFilter.value === "semua" || report.status === statusFilter.value)
      && (typeFilter.value === "semua" || report.jenis === typeFilter.value)
    );
    if (!filtered.length) {
      list.replaceChildren(makeText("p", "empty-state", "Tidak ada laporan yang sesuai filter."));
      return;
    }
    try {
      const paths = [...new Set(filtered.map((report) => report.foto).filter(Boolean))];
      const photoResult = paths.length ? await createReportPhotoUrls(client, paths, 300) : { data: [], error: null };
      if (photoResult.error) console.warn("Sebagian tautan foto admin gagal dibuat:", photoResult.error);
      const urls = new Map((photoResult.data || [])
        .filter((item) => item.path && item.signedUrl && !item.error)
        .map((item) => [item.path, item.signedUrl]));
      const fragment = document.createDocumentFragment();
      filtered.forEach((report) => fragment.append(createReportCard(report, urls.get(report.foto))));
      list.replaceChildren(fragment);
    } catch (error) {
      showFeedback(feedback, `Daftar tampil tanpa sebagian foto: ${error.message}`, true);
      const fragment = document.createDocumentFragment();
      filtered.forEach((report) => fragment.append(createReportCard(report, null)));
      list.replaceChildren(fragment);
    }
  }

  async function updateStatus(report, status, reason) {
    const update = { status };
    if (status === "ditolak") update.alasan_penolakan = reason;
    const { error } = await client.from("laporan").update(update).eq("id", report.id);
    if (error) throw error;
    await loadReports();
  }

  async function handleAction(button) {
    if (busy) return;
    const report = reports.find((item) => item.id === button.dataset.reportId);
    if (!report) return;
    const action = button.dataset.action;

    if (action === "reject") {
      rejectingId = report.id;
      reasonInput.value = "";
      rejectFeedback.textContent = "";
      reasonCount.textContent = "0/255 karakter";
      dialog.showModal();
      reasonInput.focus();
      return;
    }
    if (action === "delete" && !window.confirm(`Hapus laporan "${report.judul}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    if (action === "reset" && !window.confirm("Kembalikan laporan ke status menunggu verifikasi?")) return;

    busy = true;
    list.querySelectorAll("button").forEach((item) => { item.disabled = true; });
    try {
      if (action === "verify") await updateStatus(report, "terverifikasi");
      else if (action === "reset") await updateStatus(report, "menunggu");
      else if (action === "delete") {
        if (report.foto) {
          const removal = await removeReportPhoto(client, report.foto);
          if (removal.error) {
            throw new Error(`Foto gagal dihapus; laporan dipertahankan. ${removal.error.message}`);
          }
        }
        const { error } = await client.from("laporan").delete().eq("id", report.id);
        if (error) {
          const detail = report.foto ? "Foto sudah dihapus tetapi laporan masih tersimpan." : "Laporan masih tersimpan.";
          throw new Error(`${detail} ${error.message}`);
        }
        await loadReports();
      }
    } catch (error) {
      showFeedback(feedback, `Aksi gagal: ${error.message}`, true);
      console.error(`Aksi moderasi ${action} gagal:`, error);
    } finally {
      busy = false;
      list.querySelectorAll("button").forEach((item) => { item.disabled = false; });
    }
  }

  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) handleAction(button);
  });
  statusFilter.addEventListener("change", renderReports);
  typeFilter.addEventListener("change", renderReports);
  reasonInput.addEventListener("input", () => { reasonCount.textContent = `${reasonInput.value.length}/255 karakter`; });
  document.getElementById("cancel-reject").addEventListener("click", () => dialog.close());
  rejectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reason = reasonInput.value.trim();
    if (!reason || reason.length > 255) {
      showFeedback(rejectFeedback, "Alasan wajib diisi dan maksimal 255 karakter.", true);
      reasonInput.focus();
      return;
    }
    const report = reports.find((item) => item.id === rejectingId);
    if (!report || busy) return;
    busy = true;
    const submit = rejectForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await updateStatus(report, "ditolak", reason);
      dialog.close();
      rejectForm.reset();
    } catch (error) {
      showFeedback(rejectFeedback, `Penolakan gagal disimpan: ${error.message}`, true);
      console.error("Gagal menolak laporan:", error);
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });

  await loadReports();
  const requestedId = new URLSearchParams(window.location.search).get("id");
  if (requestedId) {
    statusFilter.value = "semua";
    typeFilter.value = "semua";
    await renderReports();
    const target = [...list.querySelectorAll(".report-admin-card")]
      .find((card) => card.dataset.reportId === requestedId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.setAttribute("tabindex", "-1");
      target.focus();
    }
  }
});
