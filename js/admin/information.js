import { formatDateTime, protectAdminPage, selectAllRows, showFeedback } from "./common.js";

document.addEventListener("DOMContentLoaded", async function () {
  const access = await protectAdminPage();
  if (!access) return;

  const form = document.getElementById("information-form");
  const list = document.getElementById("information-list");
  const feedback = document.getElementById("information-feedback");
  const cancelEdit = document.getElementById("cancel-information-edit");
  const saveButton = document.getElementById("save-information");
  let busy = false;

  function resetForm() {
    form.reset();
    form.elements.id.value = "";
    document.getElementById("information-form-heading").textContent = "Tambah informasi";
    saveButton.textContent = "Terbitkan informasi";
    cancelEdit.hidden = true;
  }

  function render(rows) {
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Belum ada informasi terbit.";
      list.replaceChildren(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const card = document.createElement("article");
      card.className = "admin-record glass";
      const heading = document.createElement("h3");
      heading.textContent = row.judul;
      const meta = document.createElement("p");
      meta.className = "muted";
      meta.textContent = `${row.kategori} · Diterbitkan ${formatDateTime(row.created_at)}`;
      const content = document.createElement("p");
      content.className = "report-description";
      content.textContent = row.isi;
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
      remove.addEventListener("click", () => deleteInformation(row));
      actions.append(edit, remove);
      card.append(heading, meta, content, actions);
      fragment.append(card);
    });
    list.replaceChildren(fragment);
  }

  async function loadRows() {
    try {
      const rows = await selectAllRows(access.client, "informasi", "id,judul,isi,kategori,created_at", "created_at");
      render(rows);
      showFeedback(feedback, `${rows.length} informasi dimuat.`, false);
    } catch (error) {
      showFeedback(feedback, `Informasi gagal dimuat: ${error.message}`, true);
      console.error("Gagal memuat informasi admin:", error);
    }
  }

  function beginEdit(row) {
    form.elements.id.value = row.id;
    form.elements.judul.value = row.judul;
    form.elements.kategori.value = row.kategori;
    form.elements.isi.value = row.isi;
    document.getElementById("information-form-heading").textContent = "Ubah informasi";
    saveButton.textContent = "Simpan perubahan";
    cancelEdit.hidden = false;
    document.getElementById("information-form-heading").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function deleteInformation(row) {
    if (busy || !window.confirm(`Hapus informasi "${row.judul}"?`)) return;
    busy = true;
    try {
      const { error } = await access.client.from("informasi").delete().eq("id", row.id);
      if (error) throw error;
      if (form.elements.id.value === row.id) resetForm();
      await loadRows();
    } catch (error) {
      showFeedback(feedback, `Informasi gagal dihapus: ${error.message}`, true);
      console.error("Gagal menghapus informasi:", error);
    } finally {
      busy = false;
    }
  }

  cancelEdit.addEventListener("click", resetForm);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const title = form.elements.judul.value.trim();
    const content = form.elements.isi.value.trim();
    if (!title || title.length > 200 || content.length < 5) {
      showFeedback(feedback, "Judul wajib diisi (maksimal 200 karakter) dan isi minimal 5 karakter.", true);
      return;
    }
    const payload = {
      judul: title,
      isi: content,
      kategori: form.elements.kategori.value
    };
    if (!form.elements.id.value) payload.dibuat_oleh = access.user.id;

    busy = true;
    saveButton.disabled = true;
    try {
      const result = form.elements.id.value
        ? await access.client.from("informasi").update(payload).eq("id", form.elements.id.value)
        : await access.client.from("informasi").insert(payload);
      if (result.error) throw result.error;
      resetForm();
      await loadRows();
      showFeedback(feedback, "Informasi berhasil disimpan dan tersedia untuk publik.", false);
    } catch (error) {
      showFeedback(feedback, `Informasi gagal disimpan: ${error.message}`, true);
      console.error("Gagal menyimpan informasi:", error);
    } finally {
      busy = false;
      saveButton.disabled = false;
    }
  });

  await loadRows();
});
