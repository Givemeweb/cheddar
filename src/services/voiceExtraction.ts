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

  console.log("[voiceExtraction] Starting extraction, uri:", audioUri);
  console.log("[voiceExtraction] Endpoint:", EXTRACTION_ENDPOINT);

  const file = new File(audioUri);
  console.log("[voiceExtraction] File exists:", file.exists, "size:", file.size);
  if (!file.exists) {
    throw new Error(`Audio file not found at: ${audioUri}`);
  }

  const formData = new FormData();

  // Attach audio file — React Native FormData expects { uri, name, type }
  // Use audio/x-wav instead of audio/wav because some servers detect WAV as audio/vnd.wave
  // which isn't in their allowlist, but audio/x-wav is.
  const mimeType = audioUri.endsWith(".wav") ? "audio/x-wav" : "audio/mp4";
  formData.append("file", {
    uri: audioUri,
    name: mimeType === "audio/x-wav" ? "recording.wav" : "recording.m4a",
    type: mimeType,
  } as unknown as Blob);

  // Attach JSON context fields
  formData.append("accounts", JSON.stringify(accounts));
  formData.append("categories", JSON.stringify(categories));
  formData.append("recentNotes", JSON.stringify(recentNotes));
  formData.append("recordedAt", recordedAt.toISOString());

  // Log what we're sending
  console.log("[voiceExtraction] FormData fields:");
  console.log("  - file:", audioUri);
  console.log("  - accounts:", JSON.stringify(accounts));
  console.log("  - categories:", JSON.stringify(categories));
  console.log("  - recentNotes:", JSON.stringify(recentNotes));
  console.log("  - recordedAt:", recordedAt.toISOString());

  console.log("[voiceExtraction] Sending POST request...");

  let response: Response;
  try {
    response = await fetch(EXTRACTION_ENDPOINT, {
      method: "POST",
      body: formData,
    });
  } catch (networkError) {
    console.error("[voiceExtraction] Network error:", networkError);
    const message =
      networkError instanceof Error
        ? networkError.message
        : "Network request failed";
    throw new Error(`Network error: ${message}`);
  }

  console.log(
    "[voiceExtraction] Response status:",
    response.status,
    response.statusText
  );

  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      // ignore
    }
    console.error("[voiceExtraction] HTTP error body:", errorBody);
    throw new Error(
      `HTTP error ${response.status}: ${response.statusText} — ${errorBody}`
    );
  }

  let rawJson: unknown;
  try {
    rawJson = await response.json();
  } catch (parseError) {
    console.error("[voiceExtraction] JSON parse error:", parseError);
    const message =
      parseError instanceof Error ? parseError.message : "Unknown parse error";
    throw new Error(`Failed to parse JSON response: ${message}`);
  }

  console.log("[voiceExtraction] Raw response:", JSON.stringify(rawJson, null, 2));

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

  console.log(
    "[voiceExtraction] Parsed transaction:",
    JSON.stringify(transaction, null, 2)
  );

  return { transcription, transaction };
}
