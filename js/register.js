import { getAmbonAlertClient, registerWithEmail } from "./supabase.js";
import { getAuthErrorMessage, getSafeNextPage } from "./auth-utils.js";

document.addEventListener("DOMContentLoaded", async function () {
  const form = document.getElementById("register-form");
  const feedback = document.getElementById("auth-feedback");
  const submitButton = form.querySelector('[type="submit"]');
  let client;

  function showMessage(message, isError) {
    feedback.textContent = message;
    feedback.dataset.state = isError ? "error" : "success";
  }

  try {
    client = getAmbonAlertClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) {
      window.location.replace(getSafeNextPage("riwayat.html"));
      return;
    }
  } catch (error) {
    showMessage(getAuthErrorMessage(error), true);
    submitButton.disabled = true;
    return;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const password = form.elements.password.value;
    if (password.length < 8) {
      showMessage("Kata sandi harus terdiri dari minimal 8 karakter.", true);
      form.elements.password.focus();
      return;
    }
    if (password !== form.elements.confirmPassword.value) {
      showMessage("Konfirmasi kata sandi belum sama.", true);
      form.elements.confirmPassword.focus();
      return;
    }

    submitButton.disabled = true;
    showMessage("Membuat akun…", false);
    try {
      const { data, error } = await registerWithEmail(client, {
        nama: form.elements.nama.value,
        email: form.elements.email.value.trim(),
        password
      });
      if (error) {
        showMessage(getAuthErrorMessage(error), true);
        return;
      }

      if (data.session) {
        window.location.assign(getSafeNextPage("riwayat.html"));
        return;
      }
      showMessage("Registrasi berhasil. Periksa email untuk konfirmasi, lalu masuk ke akun Anda.", false);
      form.reset();
    } catch (error) {
      showMessage(error.message || "Registrasi gagal. Coba lagi.", true);
      console.error("Registrasi Ambon Alert gagal:", error);
    } finally {
      submitButton.disabled = false;
    }
  });
});
