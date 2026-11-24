import { getAmbonAlertClient } from "../supabase.js";
import { getAuthErrorMessage, requireAdminUser } from "../auth-utils.js";

export async function protectAdminPage() {
  const status = document.getElementById("admin-access-status");
  const app = document.getElementById("admin-app");

  try {
    const client = getAmbonAlertClient();
    const user = await requireAdminUser(client);
    if (!user) return null;

    app.hidden = false;
    status.hidden = true;
    return { client, user };
  } catch (error) {
    status.textContent = getAuthErrorMessage(error);
    console.error("Pemeriksaan akses admin gagal:", error);
    return null;
  }
}

export async function selectAllRows(client, table, columns, orderColumn) {
  const pageSize = 1000;
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client.from(table)
      .select(columns)
      .order(orderColumn, { ascending: false })
      .range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

export function showFeedback(element, message, isError) {
  element.textContent = message;
  element.dataset.state = isError ? "error" : "success";
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
