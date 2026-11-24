import { getAmbonAlertClient } from "./supabase.js";
import { getAuthErrorMessage, requireSignedInUser } from "./auth-utils.js";

document.addEventListener("DOMContentLoaded", async function () {
  const list = document.getElementById("report-history");
  const feedback = document.getElementById("history-feedback");

  try {
    const client = getAmbonAlertClient();
    const user = await requireSignedInUser(client);
    if (!user) return;
    if (!window.location.pathname.endsWith("riwayat.html") || !document.body.contains(list)) return;

    const { data, error } = await client
      .from("laporan_saya")
      .select("id,jenis,judul,waktu_kejadian,status,alasan_penolakan,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    feedback.textContent = "";

    if (!data.length) {
      list.innerHTML = '<p class="empty-state">Anda belum memiliki laporan.</p>';
      return;
    }

    const formatter = new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short"
    });
    const fragment = document.createDocumentFragment();
    data.forEach((report) => {
      const card = document.createElement("article");
      card.className = "history-card glass";

      const heading = document.createElement("div");
      heading.className = "history-card-heading";
      const title = document.createElement("h2");
      title.textContent = report.judul;
      const status = document.createElement("span");
      status.className = `status-pill status-${report.status}`;
      status.textContent = report.status;
      heading.append(title, status);

      const detail = document.createElement("p");
      detail.className = "muted";
      detail.textContent = `${report.jenis === "banjir" ? "Banjir" : "Tanah longsor"} · Kejadian ${formatter.format(new Date(report.waktu_kejadian))}`;
      card.append(heading, detail);

      if (report.status === "ditolak" && report.alasan_penolakan) {
        const reason = document.createElement("p");
        reason.className = "rejection-reason";
        const label = document.createElement("strong");
        label.textContent = "Alasan penolakan: ";
        reason.append(label, document.createTextNode(report.alasan_penolakan));
        card.append(reason);
      }
      fragment.append(card);
    });
    list.replaceChildren(fragment);
  } catch (error) {
    feedback.textContent = getAuthErrorMessage(error);
    console.error("Gagal memuat riwayat laporan:", error);
  }
});
