import { getAmbonAlertClient, updatePassword } from "./supabase.js";
import { getAuthErrorMessage, requireSignedInUser } from "./auth-utils.js";

document.addEventListener("DOMContentLoaded", async function () {
  const form = document.getElementById("password-form");
  const feedback = document.getElementById("account-feedback");
  const submitButton = form.querySelector('[type="submit"]');

  function showMessage(message, isError) {
    feedback.textContent = message;
    feedback.dataset.state = isError ? "error" : "success";
  }

  try {
    const client = getAmbonAlertClient();
    const user = await requireSignedInUser(client);
    if (!user) return;

    const { data, error } = await client
      .from("profiles")
      .select("nama,email,role,created_at")
      .eq("id", user.id)
      .single();
    if (error) throw error;

    document.getElementById("account-name").textContent = data.nama;
    document.getElementById("account-email").textContent = data.email;
    document.getElementById("account-role").textContent = data.role;
    document.getElementById("account-summary").hidden = false;
    form.hidden = false;
    showMessage("", false);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const password = form.elements.password.value;
      if (password.length < 8) {
        showMessage("Kata sandi baru harus terdiri dari minimal 8 karakter.", true);
        return;
      }
      if (password !== form.elements.confirmPassword.value) {
        showMessage("Konfirmasi kata sandi belum sama.", true);
        return;
      }

      submitButton.disabled = true;
      showMessage("Memperbarui kata sandi…", false);
      try {
        const { error: updateError } = await updatePassword(client, password);
        if (updateError) {
          showMessage(getAuthErrorMessage(updateError), true);
          return;
        }
        form.reset();
        showMessage("Kata sandi berhasil diperbarui.", false);
      } catch (updateError) {
        showMessage(getAuthErrorMessage(updateError), true);
        console.error("Perubahan kata sandi Ambon Alert gagal:", updateError);
      } finally {
        submitButton.disabled = false;
      }
    });
  } catch (error) {
    showMessage(getAuthErrorMessage(error), true);
    console.error("Gagal memuat akun Ambon Alert:", error);
  }
});
