import { getAmbonAlertClient } from "./supabase.js";

document.addEventListener("DOMContentLoaded", async function () {
  const list = document.getElementById("information-list");
  const status = document.getElementById("information-status");
  const categoryFilter = document.getElementById("information-category");
  let items = [];

  function renderInformation() {
    const category = categoryFilter.value;
    const visibleItems = category === "semua"
      ? items
      : items.filter((item) => item.kategori === category);

    if (!visibleItems.length) {
      list.innerHTML = '<p class="empty-state">Belum ada informasi pada kategori ini.</p>';
      return;
    }

    const formatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "long" });
    const fragment = document.createDocumentFragment();
    visibleItems.forEach((item) => {
      const card = document.createElement("article");
      card.className = "information-card glass";
      const heading = document.createElement("h2");
      heading.textContent = item.judul;
      const body = document.createElement("p");
      body.textContent = item.isi;
      const metadata = document.createElement("div");
      metadata.className = "information-meta";
      const categoryLabel = document.createElement("span");
      categoryLabel.className = "category-pill";
      categoryLabel.textContent = item.kategori;
      const date = document.createElement("time");
      date.dateTime = item.created_at;
      const parsedDate = new Date(item.created_at);
      date.textContent = Number.isNaN(parsedDate.getTime())
        ? "Tanggal tidak tersedia"
        : formatter.format(parsedDate);
      metadata.append(categoryLabel, date);
      card.append(heading, body, metadata);
      fragment.append(card);
    });
    list.replaceChildren(fragment);
  }

  categoryFilter.addEventListener("change", renderInformation);

  try {
    const client = getAmbonAlertClient();
    const { data, error } = await client
      .from("informasi")
      .select("id,judul,isi,kategori,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    items = data || [];
    status.textContent = `${items.length} informasi dimuat.`;
    if (!items.length) status.textContent = "Belum ada informasi yang diterbitkan.";
    renderInformation();
  } catch (error) {
    status.textContent = `Informasi belum dapat dimuat: ${error.message}`;
    list.replaceChildren();
    console.error("Gagal memuat informasi publik:", error);
  }
});
