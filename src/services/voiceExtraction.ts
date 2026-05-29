import { File } from "expo-file-system";
import { EXTRACTION_ENDPOINT } from "@/src/config/api";

export interface ExtractionRequest {
  audioUri: string;
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  recentNotes: Array<{ id: string; text: string }>;
  recordedAt: Date;
}

export interface ExtractionResponse {
  transcription: string;
  transaction: {
    type: string;
    amount: number;
    account: string;
    from: string;
    to: string;
    category: string;
    note: string;
    date: string;
  };
}

export async function extractTransaction(
  request: ExtractionRequest
): Promise<ExtractionResponse> {
  const { audioUri, accounts, categories, recentNotes, recordedAt } = request;

  const file = new File(audioUri);
  if (!file.exists) {
    throw new Error(`Audio file not found at: ${audioUri}`);
  }

  const formData = new FormData();

  // Attach audio file (File implements Blob, so FormData accepts it directly)
  formData.append("audio", file);

  // Attach JSON context fields
  formData.append("accounts", JSON.stringify(accounts));
  formData.append("categories", JSON.stringify(categories));
  formData.append("recentNotes", JSON.stringify(recentNotes));
  formData.append("recordedAt", recordedAt.toISOString());

  let response: Response;
  try {
    response = await fetch(EXTRACTION_ENDPOINT, {
      method: "POST",
      body: formData,
    });
  } catch (networkError) {
    const message =
      networkError instanceof Error
        ? networkError.message
        : "Network request failed";
    throw new Error(`Network error: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  let rawJson: unknown;
  try {
    rawJson = await response.json();
  } catch (parseError) {
    const message =
      parseError instanceof Error ? parseError.message : "Unknown parse error";
    throw new Error(`Failed to parse JSON response: ${message}`);
  }

  if (typeof rawJson !== "object" || rawJson === null) {
    throw new Error("Invalid response: expected JSON object");
  }

  const data = rawJson as Record<string, unknown>;

  const transcription =
    typeof data.transcription === "string" ? data.transcription : "";

  const rawTransaction =
    typeof data.transaction === "object" && data.transaction !== null
      ? (data.transaction as Record<string, unknown>)
      : {};

  const transaction: ExtractionResponse["transaction"] = {
    type: typeof rawTransaction.type === "string" ? rawTransaction.type : "",
    amount:
      typeof rawTransaction.amount === "number" ? rawTransaction.amount : 0,
    account:
      typeof rawTransaction.account === "string" ? rawTransaction.account : "",
    from: typeof rawTransaction.from === "string" ? rawTransaction.from : "",
    to: typeof rawTransaction.to === "string" ? rawTransaction.to : "",
    category:
      typeof rawTransaction.category === "string" ? rawTransaction.category : "",
    note: typeof rawTransaction.note === "string" ? rawTransaction.note : "",
    date: typeof rawTransaction.date === "string" ? rawTransaction.date : "",
  };

  return { transcription, transaction };
}
