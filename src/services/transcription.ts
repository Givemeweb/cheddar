import { File } from "expo-file-system";
import { TRANSCRIPTION_ENDPOINT } from "@/src/config/api";

export async function transcribeAudio(audioUri: string): Promise<string> {
  console.log("[transcription] Starting transcription, uri:", audioUri);
  console.log("[transcription] Endpoint:", TRANSCRIPTION_ENDPOINT);

  const file = new File(audioUri);
  console.log("[transcription] File exists:", file.exists, "size:", file.size);
  if (!file.exists) {
    throw new Error(`Audio file not found at: ${audioUri}`);
  }

  const formData = new FormData();

  const mimeType = audioUri.endsWith(".wav") ? "audio/x-wav" : "audio/mp4";
  formData.append("file", {
    uri: audioUri,
    name: mimeType === "audio/x-wav" ? "recording.wav" : "recording.m4a",
    type: mimeType,
  } as unknown as Blob);

  console.log("[transcription] Sending POST request...");

  let response: Response;
  try {
    response = await fetch(TRANSCRIPTION_ENDPOINT, {
      method: "POST",
      body: formData,
    });
  } catch (networkError) {
    console.error("[transcription] Network error:", networkError);
    const message =
      networkError instanceof Error
        ? networkError.message
        : "Network request failed";
    throw new Error(`Network error: ${message}`);
  }

  console.log(
    "[transcription] Response status:",
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
    console.error("[transcription] HTTP error body:", errorBody);
    throw new Error(
      `HTTP error ${response.status}: ${response.statusText} — ${errorBody}`
    );
  }

  let transcription: string;
  try {
    transcription = await response.text();
  } catch (readError) {
    console.error("[transcription] Text read error:", readError);
    const message =
      readError instanceof Error ? readError.message : "Unknown read error";
    throw new Error(`Failed to read response text: ${message}`);
  }

  console.log("[transcription] Raw transcription:", transcription);

  return transcription;
}
