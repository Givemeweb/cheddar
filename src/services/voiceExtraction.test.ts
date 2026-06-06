import { extractTransaction, ExtractionRequest } from "./voiceExtraction";
import { EXTRACTION_ENDPOINT } from "@/src/config/api";

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

describe("extractTransaction", () => {
  let fetchSpy: jest.SpyInstance;
  let formDataAppendSpy: jest.SpyInstance;

  const baseRequest: ExtractionRequest = {
    transcription: "I spent 50 dollars on groceries at Walmart",
    accounts: [
      { id: "acc1", name: "Checking" },
      { id: "acc2", name: "Savings" },
    ],
    categories: [
      { id: "cat1", name: "Groceries" },
      { id: "cat2", name: "Transport" },
    ],
    recentNotes: [
      { id: "note1", text: "Coffee at Starbucks" },
    ],
    recordedAt: new Date("2024-01-15T10:30:00Z"),
  };

  const validResponseBody = {
    transcription: "I spent 50 dollars on groceries at Walmart",
    transaction: {
      type: "expense",
      amount: 50,
      account: "Checking",
      from: "",
      to: "",
      category: "Groceries",
      note: "Walmart",
      date: "2024-01-15T10:30:00Z",
    },
  };

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
    formDataAppendSpy = jest.spyOn(FormData.prototype, "append");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    formDataAppendSpy.mockRestore();
  });

  describe("success paths", () => {
    it("sends transcription as a plain string form field", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: jest.fn().mockResolvedValue(validResponseBody),
      } as unknown as Response);

      await extractTransaction(baseRequest);

      expect(formDataAppendSpy).toHaveBeenCalledWith(
        "transcription",
        baseRequest.transcription
      );
    });

    it("does not include a file field in the multipart request", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: jest.fn().mockResolvedValue(validResponseBody),
      } as unknown as Response);

      await extractTransaction(baseRequest);

      const fileCalls = formDataAppendSpy.mock.calls.filter(
        ([key]) => key === "file"
      );
      expect(fileCalls).toHaveLength(0);
    });

    it("sends accounts, categories, recentNotes, and recordedAt unchanged", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: jest.fn().mockResolvedValue(validResponseBody),
      } as unknown as Response);

      await extractTransaction(baseRequest);

      expect(formDataAppendSpy).toHaveBeenCalledWith(
        "accounts",
        JSON.stringify(baseRequest.accounts)
      );
      expect(formDataAppendSpy).toHaveBeenCalledWith(
        "categories",
        JSON.stringify(baseRequest.categories)
      );
      expect(formDataAppendSpy).toHaveBeenCalledWith(
        "recentNotes",
        JSON.stringify(baseRequest.recentNotes)
      );
      expect(formDataAppendSpy).toHaveBeenCalledWith(
        "recordedAt",
        baseRequest.recordedAt.toISOString()
      );
    });

    it("returns parsed ExtractionResponse on 200 OK", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: jest.fn().mockResolvedValue(validResponseBody),
      } as unknown as Response);

      const result = await extractTransaction(baseRequest);

      expect(result.transcription).toBe(validResponseBody.transcription);
      expect(result.transaction).toEqual(validResponseBody.transaction);
    });

    it("sends POST request to the extraction endpoint", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: jest.fn().mockResolvedValue(validResponseBody),
      } as unknown as Response);

      await extractTransaction(baseRequest);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        EXTRACTION_ENDPOINT,
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData),
        })
      );
    });
  });

  describe("error paths", () => {
    it("throws clear error on network failure", async () => {
      const networkError = new Error("Failed to connect");
      fetchSpy.mockRejectedValue(networkError);

      await expect(extractTransaction(baseRequest)).rejects.toThrow(
        "Network error: Failed to connect"
      );
    });

    it("throws clear error on non-Error network failure", async () => {
      fetchSpy.mockRejectedValue("some string error");

      await expect(extractTransaction(baseRequest)).rejects.toThrow(
        "Network error: Network request failed"
      );
    });

    it("throws clear error on non-200 HTTP response", async () => {
      const mockText = jest.fn().mockResolvedValue("Bad Request");
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: mockText,
      } as unknown as Response);

      await expect(extractTransaction(baseRequest)).rejects.toThrow(
        "HTTP error 400: Bad Request — Bad Request"
      );
    });

    it("throws with status code when error body cannot be read", async () => {
      const mockText = jest.fn().mockRejectedValue(new Error("Read failed"));
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: mockText,
      } as unknown as Response);

      await expect(extractTransaction(baseRequest)).rejects.toThrow(
        "HTTP error 500: Internal Server Error — "
      );
    });

    it("throws clear error on malformed JSON response", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: jest.fn().mockRejectedValue(new Error("Unexpected token")),
      } as unknown as Response);

      await expect(extractTransaction(baseRequest)).rejects.toThrow(
        "Failed to parse JSON response: Unexpected token"
      );
    });

    it("throws clear error on non-Error JSON parse failure", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: jest.fn().mockRejectedValue("parse failure"),
      } as unknown as Response);

      await expect(extractTransaction(baseRequest)).rejects.toThrow(
        "Failed to parse JSON response: Unknown parse error"
      );
    });

    it("throws clear error when response is not a JSON object", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: jest.fn().mockResolvedValue("not an object"),
      } as unknown as Response);

      await expect(extractTransaction(baseRequest)).rejects.toThrow(
        "Invalid response: expected JSON object"
      );
    });

    it("throws clear error when response JSON is null", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: jest.fn().mockResolvedValue(null),
      } as unknown as Response);

      await expect(extractTransaction(baseRequest)).rejects.toThrow(
        "Invalid response: expected JSON object"
      );
    });
  });
});
