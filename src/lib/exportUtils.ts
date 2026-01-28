// Utility for exporting tabular data to an Excel-compatible file.
// Currently implemented as a CSV download which opens in Excel.

type Row = Record<string, unknown>;

function convertToCsv(data: Row[]): string {
  if (!data.length) return "";

  const headers = Object.keys(data[0]);

  const escapeValue = (value: unknown): string => {
    if (value == null) return "";
    const str = String(value);
    // Escape double quotes by doubling them and wrap in quotes if needed
    const needsQuotes = /[",\n]/.test(str);
    const escaped = str.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const headerLine = headers.map(escapeValue).join(",");
  const lines = data.map((row) =>
    headers.map((key) => escapeValue(row[key])).join(",")
  );

  return [headerLine, ...lines].join("\r\n");
}

export function exportToExcel(data: Row[], fileName: string) {
  if (!Array.isArray(data) || data.length === 0) {
    console.warn("[exportToExcel] No data provided for export.");
    return;
  }

  try {
    const csv = convertToCsv(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const safeFileName =
      (fileName || "export")
        .replace(/[^a-z0-9_\-]+/gi, "_")
        .replace(/_{2,}/g, "_")
        .toLowerCase() + ".csv";

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeFileName;

    // Append to DOM to support Firefox
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("[exportToExcel] Failed to export data:", error);
  }
}

