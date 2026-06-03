import { apiRequest, triggerBlobDownload } from "@/lib/api/client";
import type { ApiFleetActivityReport } from "@/lib/api/types";

interface ExportPayload {
  filename: string;
  mimeType: string;
  base64: string;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export type FleetActivityExportFormat = "xlsx" | "pdf";

export interface FleetActivityQuery {
  from?: string;
  to?: string;
  siteIds?: string[];
}

function buildQueryString(params: FleetActivityQuery & { format?: string }): string {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.siteIds && params.siteIds.length > 0) {
    search.set("siteIds", params.siteIds.join(","));
  }
  if (params.format) search.set("format", params.format);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function getFleetActivityReport(
  params: FleetActivityQuery = {},
): Promise<ApiFleetActivityReport> {
  return apiRequest<ApiFleetActivityReport>(
    `/reports/fleet-activity${buildQueryString(params)}`,
  );
}

export async function downloadFleetActivityExport(
  params: FleetActivityQuery,
  format: FleetActivityExportFormat,
): Promise<void> {
  // The server returns the file base64-encoded inside a JSON envelope so the
  // request stays application/json and download managers (IDM, etc.) don't
  // intercept it. We decode and trigger the real download in the browser.
  const payload = await apiRequest<ExportPayload>(
    `/reports/fleet-activity/export${buildQueryString({ ...params, format })}`,
  );
  const fallbackFrom = params.from ?? "report";
  const fallbackTo = params.to ?? "export";
  const blob = base64ToBlob(payload.base64, payload.mimeType);
  triggerBlobDownload(
    blob,
    payload.filename || `fleet-activity-${fallbackFrom}_${fallbackTo}.${format}`,
  );
}
