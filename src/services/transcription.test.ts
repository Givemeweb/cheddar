import { transcribeAudio } from "./transcription";
import { TRANSCRIPTION_ENDPOINT } from "@/src/config/api";

// Mock expo-file-system
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation(() => ({
    exists: true,
    size: 1024,
  })),
}));

// Mock console methods to keep test output clean
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

describe("transcribeAudio", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe("success paths", () => {
    it("sends a multipart form request with the audio file to the transcription endpoint", async () => {
      const mockText = jest.fn().mockResolvedValue("Hello world");
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: mockText,
      } as unknown as Response);

      await transcribeAudio("file:///path/to/recording.m4a");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        TRANSCRIPTION_ENDPOINT,
        expect.objectContaining({
          method: "POST",
          body: expect.anything(),
        })
      );
    });

    it("uses audio/x-wav MIME type for .wav files", async () => {
      const mockText = jest.fn().mockResolvedValue("Hello world");
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: mockText,
      } as unknown as Response);

      await transcribeAudio("file:///path/to/recording.wav");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        TRANSCRIPTION_ENDPOINT,
        expect.objectContaining({
          method: "POST",
          body: expect.anything(),
        })
      );
    });

    it("uses audio/mp4 MIME type for non-wav files", async () => {
      const mockText = jest.fn().mockResolvedValue("Hello world");
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: mockText,
      } as unknown as Response);

      await transcribeAudio("file:///path/to/recording.m4a");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("returns the raw text/plain response string on 200 OK", async () => {
      const expectedTranscription = "This is the transcribed text";
      const mockText = jest.fn().mockResolvedValue(expectedTranscription);
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: mockText,
      } as unknown as Response);

      const result = await transcribeAudio("file:///path/to/recording.m4a");

      expect(result).toBe(expectedTranscription);
      expect(mockText).toHaveBeenCalledTimes(1);
    });

    it("returns an empty string when response body is empty", async () => {
      const mockText = jest.fn().mockResolvedValue("");
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: mockText,
      } as unknown as Response);

      const result = await transcribeAudio("file:///path/to/recording.m4a");

      expect(result).toBe("");
    });
  });

  describe("error paths", () => {
    it("throws with clear message on network failure", async () => {
      const networkError = new Error("Failed to connect");
      fetchSpy.mockRejectedValue(networkError);

      await expect(
        transcribeAudio("file:///path/to/recording.m4a")
      ).rejects.toThrow("Network error: Failed to connect");
    });

    it("throws with clear message on non-Error network failure", async () => {
      fetchSpy.mockRejectedValue("some string error");

      await expect(
        transcribeAudio("file:///path/to/recording.m4a")
      ).rejects.toThrow("Network error: Network request failed");
    });

    it("throws with status code and body on non-200 HTTP response", async () => {
      const mockText = jest.fn().mockResolvedValue("Bad Request");
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: mockText,
      } as unknown as Response);

      await expect(
        transcribeAudio("file:///path/to/recording.m4a")
      ).rejects.toThrow("HTTP error 400: Bad Request — Bad Request");
    });

    it("throws with status code when error body cannot be read", async () => {
      const mockText = jest.fn().mockRejectedValue(new Error("Read failed"));
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: mockText,
      } as unknown as Response);

      await expect(
        transcribeAudio("file:///path/to/recording.m4a")
      ).rejects.toThrow("HTTP error 500: Internal Server Error — ");
    });

    it("throws with descriptive message if response text cannot be read", async () => {
      const mockText = jest.fn().mockRejectedValue(new Error("Stream closed"));
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: mockText,
      } as unknown as Response);

      await expect(
        transcribeAudio("file:///path/to/recording.m4a")
      ).rejects.toThrow("Failed to read response text: Stream closed");
    });

    it("throws with generic message for non-Error text read failure", async () => {
      const mockText = jest.fn().mockRejectedValue("some failure");
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: mockText,
      } as unknown as Response);

      await expect(
        transcribeAudio("file:///path/to/recording.m4a")
      ).rejects.toThrow("Failed to read response text: Unknown read error");
    });

    it("throws when audio file does not exist", async () => {
      const { File } = require("expo-file-system");
      File.mockImplementationOnce(() => ({
        exists: false,
        size: 0,
      }));

      await expect(
        transcribeAudio("file:///path/to/nonexistent.m4a")
      ).rejects.toThrow("Audio file not found at: file:///path/to/nonexistent.m4a");
    });
  });
});
