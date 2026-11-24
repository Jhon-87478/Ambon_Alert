import { formatDateTime, protectAdminPage, selectAllRows, showFeedback } from "./common.js";

document.addEventListener("DOMContentLoaded", async function () {
  const access = await protectAdminPage();
  if (!access) return;

  const feedback = document.getElementById("dashboard-feedback");
  try {
    const reports = await selectAllRows(
      access.client,
      "laporan_admin",
      "id,judul,jenis,status,waktu_kejadian,created_at",
      "created_at"
    );
    const statuses = ["menunggu", "terverifikasi", "ditolak"];
    statuses.forEach((status) => {
      document.getElementById(`count-${status}`).textContent =
        String(reports.filter((report) => report.status === status).length);
    });
    document.getElementById("count-banjir").textContent =
      String(reports.filter((report) => report.jenis === "banjir").length);
    document.getElementById("count-longsor").textContent =
      String(reports.filter((report) => report.jenis === "longsor").length);

    const pending = reports.filter((report) => report.status === "menunggu").slice(0, 8);
    const list = document.getElementById("recent-pending-list");
    if (!pending.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Tidak ada laporan yang menunggu verifikasi.";
      list.replaceChildren(empty);
    } else {
      const fragment = document.createDocumentFragment();
      pending.forEach((report) => {
        const card = document.createElement("article");
        card.className = "admin-record glass";
        const title = document.createElement("h3");
        title.textContent = report.judul;
        const detail = document.createElement("p");
        detail.className = "muted";
        detail.textContent = `${report.jenis === "banjir" ? "Banjir" : "Tanah longsor"} · ${formatDateTime(report.created_at)}`;
        const link = document.createElement("a");
        link.className = "text-link";
        link.href = `laporan.html?id=${encodeURIComponent(report.id)}`;
        link.textContent = "Tinjau laporan →";
        card.append(title, detail, link);
        fragment.append(card);
      });
      list.replaceChildren(fragment);
    }
    showFeedback(feedback, `${reports.length} laporan dimuat.`, false);
  } catch (error) {
    showFeedback(feedback, `Ringkasan gagal dimuat: ${error.message}`, true);
    console.error("Gagal memuat dashboard admin:", error);
  }
});
