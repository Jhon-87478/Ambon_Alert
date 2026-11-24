import { getAmbonAlertClient, signOut } from "./supabase.js";

document.addEventListener("DOMContentLoaded", function () {
  const guestLinks = document.querySelectorAll("[data-auth-guest]");
  const userLinks = document.querySelectorAll("[data-auth-user]");
  const logoutButton = document.getElementById("logout-button");
  const status = document.getElementById("auth-ui-status");
  let client;

  function renderAuthState(isSignedIn) {
    guestLinks.forEach((element) => { element.hidden = isSignedIn; });
    userLinks.forEach((element) => { element.hidden = !isSignedIn; });
    if (logoutButton) logoutButton.hidden = !isSignedIn;
  }

  try {
    client = getAmbonAlertClient();
  } catch (error) {
    if (status) status.textContent = "";
    renderAuthState(false);
    return;
  }

  client.auth.getSession().then(({ data, error }) => {
    if (error) {
      if (status) status.textContent = "Status akun tidak tersedia.";
      console.error("Gagal memuat sesi Ambon Alert:", error);
      return;
    }
    renderAuthState(Boolean(data.session));
  });

  client.auth.onAuthStateChange((_event, session) => {
    renderAuthState(Boolean(session));
  });

  if (logoutButton) {
    logoutButton.addEventListener("click", async function () {
      logoutButton.disabled = true;
      try {
        const { error } = await signOut(client);
        if (error) throw error;
        window.location.assign(document.body.dataset.homeUrl || "index.html");
      } catch (error) {
        logoutButton.disabled = false;
        if (status) status.textContent = "Logout gagal. Coba lagi.";
        console.error("Gagal logout Ambon Alert:", error);
      }
    });
  }
});
