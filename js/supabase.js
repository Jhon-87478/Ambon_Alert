import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const REPORT_PHOTO_BUCKET = "laporan-foto";
export const MAX_REPORT_PHOTO_BYTES = 3 * 1024 * 1024;
let sharedClient;

const PHOTO_TYPES = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
});

export function createAmbonAlertClient(config = window.AMBON_ALERT_CONFIG) {
  if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Isi supabaseUrl dan supabaseAnonKey di js/config.js terlebih dahulu.");
  }

  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export function getAmbonAlertClient() {
  if (!sharedClient) sharedClient = createAmbonAlertClient();
  return sharedClient;
}

export function registerWithEmail(client, { email, password, nama }) {
  const cleanName = typeof nama === "string" ? nama.trim() : "";
  if (!cleanName || cleanName.length > 100) {
    throw new TypeError("Nama wajib diisi dan maksimal 100 karakter.");
  }

  return client.auth.signUp({
    email,
    password,
    options: { data: { nama: cleanName } }
  });
}

export function signInWithEmail(client, { email, password }) {
  return client.auth.signInWithPassword({ email, password });
}

export function getCurrentSession(client) {
  return client.auth.getSession();
}

export function getCurrentUser(client) {
  return client.auth.getUser();
}

export function signOut(client) {
  return client.auth.signOut();
}

export function updatePassword(client, password) {
  return client.auth.updateUser({ password });
}

async function matchesImageContent(file) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const startsWith = (signature) => signature.every((byte, index) => bytes[index] === byte);

  if (file.type === "image/jpeg") return startsWith([0xff, 0xd8, 0xff]);
  if (file.type === "image/png") {
    return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (file.type === "image/webp") {
    return bytes.length >= 12
      && startsWith([0x52, 0x49, 0x46, 0x46])
      && bytes[8] === 0x57 && bytes[9] === 0x45
      && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}

export async function uploadReportPhoto(client, file) {
  if (!(file instanceof File)) {
    throw new TypeError("Pilih file foto yang valid.");
  }
  if (!Object.prototype.hasOwnProperty.call(PHOTO_TYPES, file.type)) {
    throw new TypeError("Foto harus berformat JPG, PNG, atau WebP.");
  }
  if (file.size <= 0 || file.size > MAX_REPORT_PHOTO_BYTES) {
    throw new RangeError("Ukuran foto harus lebih dari 0 dan maksimal 3 MB.");
  }
  if (!(await matchesImageContent(file))) {
    throw new TypeError("Isi file tidak cocok dengan MIME JPG, PNG, atau WebP yang dipilih.");
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) return { data: null, error: userError };
  if (!userData.user) {
    return { data: null, error: new Error("Masuk sebelum mengunggah foto.") };
  }
  if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
    throw new Error("Unggahan foto memerlukan peramban modern pada koneksi aman (HTTPS).");
  }

  const path = `${window.crypto.randomUUID()}.${PHOTO_TYPES[file.type]}`;
  const result = await client.storage
    .from(REPORT_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  return {
    data: result.data ? { ...result.data, path } : null,
    error: result.error
  };
}

export function removeReportPhoto(client, path) {
  if (typeof path !== "string" || !path) {
    throw new TypeError("Path foto wajib diisi.");
  }
  return client.storage.from(REPORT_PHOTO_BUCKET).remove([path]);
}

export function createReportPhotoUrl(client, path, expiresInSeconds = 300) {
  if (typeof path !== "string" || !path) {
    throw new TypeError("Path foto wajib diisi.");
  }
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
    throw new RangeError("Masa berlaku URL harus antara 1 dan 3600 detik.");
  }

  return client.storage
    .from(REPORT_PHOTO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
}

export function createReportPhotoUrls(client, paths, expiresInSeconds = 300) {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string" || !path)) {
    throw new TypeError("Daftar path foto tidak valid.");
  }
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
    throw new RangeError("Masa berlaku URL harus antara 1 dan 3600 detik.");
  }
  if (!paths.length) return Promise.resolve({ data: [], error: null });

  return client.storage
    .from(REPORT_PHOTO_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);
}
