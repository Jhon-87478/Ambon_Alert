import { getAmbonAlertClient, signInWithEmail } from "./supabase.js";
import { getAuthErrorMessage, getSafeNextPage } from "./auth-utils.js";

const THROTTLE_KEY = "ambon-alert-login-throttle";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;
let memoryThrottle = { attempts: 0, blockedUntil: 0 };

function readThrottle() {
  try {
    const saved = sessionStorage.getItem(THROTTLE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    memoryThrottle = parsed && typeof parsed === "object"
      ? parsed
      : { attempts: 0, blockedUntil: 0 };
    if (!Number.isFinite(memoryThrottle.attempts) || !Number.isFinite(memoryThrottle.blockedUntil)) {
      memoryThrottle = { attempts: 0, blockedUntil: 0 };
    }
  } catch (error) {
    console.warn("Penyimpanan pembatasan percobaan login tidak tersedia:", error);
  }
  return memoryThrottle;
}

function saveThrottle(value) {
  memoryThrottle = value;
  try {
    sessionStorage.setItem(THROTTLE_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Pembatasan login hanya berlaku selama halaman ini terbuka:", error);
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  const form = document.getElementById("login-form");
  const feedback = document.getElementById("auth-feedback");
  const submitButton = form.querySelector('[type="submit"]');
  let client;
  let countdownTimer;
  let submitting = false;

  function showMessage(message, isError) {
    feedback.textContent = message;
    feedback.dataset.state = isError ? "error" : "success";
  }
  async function getRedirectTarget(client, userId) {
    if (!userId) return getSafeNextPage("riwayat.html");
    const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

    if (profile?.role === "admin") {
      return "admin/index.html";
    }
    return getSafeNextPage("riwayat.html");
  }
  function refreshThrottleMessage() {
    const throttle = readThrottle();
    const remaining = throttle.blockedUntil - Date.now();
    if (remaining <= 0) {
      if (throttle.blockedUntil) {
        saveThrottle({ attempts: 0, blockedUntil: 0 });
        if (feedback.textContent.startsWith("Terlalu banyak percobaan.")) {
          showMessage("", false);
        }
      }
      submitButton.disabled = submitting;
      if (countdownTimer) window.clearInterval(countdownTimer);
      countdownTimer = null;
      return;
    }
    submitButton.disabled = true;
    showMessage(`Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(remaining / 1000)} detik.`, true);
    if (!countdownTimer) countdownTimer = window.setInterval(refreshThrottleMessage, 1000);
  }

  try {
    client = getAmbonAlertClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) {
      const target = await getRedirectTarget(client, data.session.user?.id);
      window.location.replace(target);
      return;
    }
  } catch (error) {
    showMessage(getAuthErrorMessage(error), true);
    submitButton.disabled = true;
    return;
  }

  refreshThrottleMessage();

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const throttle = readThrottle();
    if (throttle.blockedUntil > Date.now()) {
      refreshThrottleMessage();
      return;
    }

    submitButton.disabled = true;
    submitting = true;
    showMessage("Memeriksa akun…", false);
    try {
      const { data, error } = await signInWithEmail(client, {
        email: form.elements.email.value.trim(),
        password: form.elements.password.value
      });
      if (error) {
        const isCredentialFailure = ["invalid_credentials", "email_not_confirmed"].includes(error.code);
        const failures = isCredentialFailure ? throttle.attempts + 1 : throttle.attempts;
        const shouldLock = failures >= MAX_FAILED_ATTEMPTS;
        saveThrottle({
          attempts: shouldLock ? 0 : failures,
          blockedUntil: shouldLock ? Date.now() + LOCKOUT_MS : 0
        });
        showMessage(getAuthErrorMessage(error), true);
        if (shouldLock) refreshThrottleMessage();
        return;
      }

      saveThrottle({ attempts: 0, blockedUntil: 0 });
      const target = await getRedirectTarget(client, data?.user?.id);
      window.location.assign(target);
    } catch (error) {
      showMessage(getAuthErrorMessage(error), true);
      console.error("Login Ambon Alert gagal:", error);
    } finally {
      submitting = false;
      refreshThrottleMessage();
    }
  });
});
