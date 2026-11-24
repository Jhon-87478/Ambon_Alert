export function getSafeNextPage(fallback) {
  const next = new URLSearchParams(window.location.search).get("next");
  const allowedPages = new Set([
    "laporan.html",
    "akun.html",
    "riwayat.html",
    "admin/index.html",
    "admin/laporan.html",
    "admin/titik-rawan.html",
    "admin/informasi.html"
  ]);
  return next && allowedPages.has(next) ? next : fallback;
}

export async function requireSignedInUser(client) {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;

  if (!data.user) {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const isAdminPage = segments[segments.length - 2] === "admin";
    const page = segments[segments.length - 1] || "index.html";
    const next = `${isAdminPage ? "admin/" : ""}${page}`;
    window.location.replace(`${isAdminPage ? "../" : ""}masuk.html?next=${encodeURIComponent(next)}`);
    return null;
  }
  return data.user;
}

export async function requireAdminUser(client) {
  const user = await requireSignedInUser(client);
  if (!user) return null;

  const { data: profile, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  if (profile.role !== "admin") {
    const accessStatus = document.getElementById("admin-access-status");
    if (accessStatus) accessStatus.textContent = "Akses ditolak. Halaman ini hanya untuk administrator.";
    return null;
  }
  return user;
}

export function getAuthErrorMessage(error) {
  const messages = {
    invalid_credentials: "Email atau kata sandi tidak benar.",
    email_not_confirmed: "Konfirmasi alamat email Anda sebelum masuk.",
    over_request_rate_limit: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
    user_already_exists: "Email ini sudah terdaftar. Silakan masuk.",
    weak_password: "Kata sandi terlalu lemah. Gunakan minimal 8 karakter.",
    same_password: "Gunakan kata sandi baru yang berbeda."
  };
  return messages[error.code] || `Permintaan gagal: ${error.message}`;
}
