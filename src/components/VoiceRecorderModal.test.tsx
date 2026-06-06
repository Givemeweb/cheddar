import React from "react";
import { render, waitFor, act, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";
import { VoiceRecorderModal } from "./VoiceRecorderModal";
import { transcribeAudio } from "@/src/services/transcription";
import { extractTransaction } from "@/src/services/voiceExtraction";

// Mocks

jest.mock("lucide-react-native", () => ({
  Mic: () => null,
  X: () => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation(() => ({
    exists: true,
    size: 1024,
  })),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "voice.tapToRecord": "Tap to record",
        "voice.listening": "Listening...",
        "voice.transcribing": "Transcribing...",
        "voice.extracting": "Extracting...",
        "voice.transcriptionFailed":
          "Failed to transcribe audio. Please try again.",
        "voice.extractionFailed":
          "Failed to extract transaction. Please try again.",
        "voice.processingError": "Something went wrong. Please try again.",
        "voice.noTransactionDetected": "No transaction detected",
        "voice.retry": "Retry",
        "voice.microphonePermissionRequired":
          "Microphone permission is required to record audio.",
        "voice.openSettings": "Open Settings",
        "transactions.error": "Error",
        "common.cancel": "Cancel",
      };
      return translations[key] || key;
    },
  }),
}));

jest.mock("@/src/services/transcription", () => ({
  transcribeAudio: jest.fn(),
}));

jest.mock("@/src/services/voiceExtraction", () => ({
  extractTransaction: jest.fn(),
}));

jest.mock("@/src/utils/audioRecording", () => ({
  requestMicrophonePermission: jest.fn().mockResolvedValue(true),
  startRecording: jest.fn().mockResolvedValue(undefined),
  stopRecording: jest
    .fn()
    .mockResolvedValue({ uri: "file:///test/recording.m4a" }),
  cancelRecording: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/src/db/storage", () => ({
  getCategories: jest.fn().mockResolvedValue([]),
  getAccounts: jest.fn().mockResolvedValue([]),
  getTransactions: jest.fn().mockResolvedValue([]),
}));

// Console spies

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

// Tests

describe("VoiceRecorderModal", () => {
  const mockOnResult = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("transcription failures", () => {
    it("shows transcriptionFailed message and resets to idle on transcription error", async () => {
      const transcriptionError = new Error("Network error: Failed to connect");
      (transcribeAudio as jest.Mock).mockRejectedValueOnce(transcriptionError);

      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

      const { getByTestId } = render(
        <VoiceRecorderModal
          visible={true}
          onResult={mockOnResult}
          onClose={mockOnClose}
        />,
      );

      // Tap mic to start recording
      await act(async () => {
        fireEvent.press(getByTestId("mic-button"));
      });

      // Stop recording to trigger transcription
      await act(async () => {
        fireEvent.press(getByTestId("stop-mic-button"));
      });

      // Wait for the async transcription error to be handled
      await waitFor(() => {
        expect(transcribeAudio).toHaveBeenCalledTimes(1);
      });

      // Verify the transcription error was logged
      expect(console.error).toHaveBeenCalledWith(
        "[VoiceRecorder] Transcription error:",
        transcriptionError,
      );

      // Verify Alert.alert was called with the transcriptionFailed message
      expect(alertSpy).toHaveBeenCalledWith(
        "Error",
        expect.stringContaining(
          "Failed to transcribe audio. Please try again.",
        ),
        expect.any(Array),
      );

      // Verify the retry option sets phase back to idle
      const alertCalls = alertSpy.mock.calls;
      const lastAlertCall = alertCalls[alertCalls.length - 1];
      const retryButton = lastAlertCall[2].find(
        (btn: any) => btn.text === "Retry",
      );
      expect(retryButton).toBeDefined();

      // Simulate pressing retry
      await act(async () => {
        retryButton.onPress();
      });

      // After retry, the modal should be back to idle (mic button visible)
      await waitFor(() => {
        expect(getByTestId("mic-button")).toBeTruthy();
      });

      alertSpy.mockRestore();
    });
  });

  describe("extraction failures", () => {
    it("shows extractionFailed message and resets to idle on extraction error", async () => {
      const extractionError = new Error("Network error: Failed to connect");
      (transcribeAudio as jest.Mock).mockResolvedValueOnce(
        "I spent 50 dollars on groceries",
      );
      (extractTransaction as jest.Mock).mockRejectedValueOnce(extractionError);

      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

      const { getByTestId } = render(
        <VoiceRecorderModal
          visible={true}
          onResult={mockOnResult}
          onClose={mockOnClose}
        />,
      );

      // Tap mic to start recording
      await act(async () => {
        fireEvent.press(getByTestId("mic-button"));
      });

      // Stop recording to trigger transcription then extraction
      await act(async () => {
        fireEvent.press(getByTestId("stop-mic-button"));
      });

      // Wait for both async calls to complete
      await waitFor(() => {
        expect(extractTransaction).toHaveBeenCalledTimes(1);
      });

      // Verify the extraction error was logged
      expect(console.error).toHaveBeenCalledWith(
        "[VoiceRecorder] Extraction error:",
        extractionError,
      );

      // Verify Alert.alert was called with the extractionFailed message
      expect(alertSpy).toHaveBeenCalledWith(
        "Error",
        expect.stringContaining(
          "Failed to extract transaction. Please try again.",
        ),
        expect.any(Array),
      );

      // Verify the retry option sets phase back to idle
      const alertCalls = alertSpy.mock.calls;
      const lastAlertCall = alertCalls[alertCalls.length - 1];
      const retryButton = lastAlertCall[2].find(
        (btn: any) => btn.text === "Retry",
      );
      expect(retryButton).toBeDefined();

      // Simulate pressing retry
      await act(async () => {
        retryButton.onPress();
      });

      // After retry, the modal should be back to idle (mic button visible)
      await waitFor(() => {
        expect(getByTestId("mic-button")).toBeTruthy();
      });

      alertSpy.mockRestore();
    });
  });

  describe("console logging", () => {
    it("logs distinct messages for transcription vs extraction errors", async () => {
      // First test: transcription error
      const transcriptionError = new Error("Network timeout");
      (transcribeAudio as jest.Mock).mockRejectedValueOnce(transcriptionError);

      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

      const { getByTestId: getByTestId1 } = render(
        <VoiceRecorderModal
          visible={true}
          onResult={mockOnResult}
          onClose={mockOnClose}
        />,
      );

      await act(async () => {
        fireEvent.press(getByTestId1("mic-button"));
      });
      await act(async () => {
        fireEvent.press(getByTestId1("stop-mic-button"));
      });

      await waitFor(() => {
        expect(transcribeAudio).toHaveBeenCalledTimes(1);
      });

      // Verify transcription-specific error log
      expect(console.error).toHaveBeenCalledWith(
        "[VoiceRecorder] Transcription error:",
        transcriptionError,
      );

      alertSpy.mockRestore();
      jest.clearAllMocks();

      // Second test: extraction error
      const extractionError = new Error("Server error");
      (transcribeAudio as jest.Mock).mockResolvedValueOnce(
        "Test transcription",
      );
      (extractTransaction as jest.Mock).mockRejectedValueOnce(extractionError);

      const alertSpy2 = jest.spyOn(Alert, "alert").mockImplementation(() => {});

      const { getByTestId: getByTestId2 } = render(
        <VoiceRecorderModal
          visible={true}
          onResult={mockOnResult}
          onClose={mockOnClose}
        />,
      );

      await act(async () => {
        fireEvent.press(getByTestId2("mic-button"));
      });
      await act(async () => {
        fireEvent.press(getByTestId2("stop-mic-button"));
      });

      await waitFor(() => {
        expect(extractTransaction).toHaveBeenCalledTimes(1);
      });

      // Verify extraction-specific error log
      expect(console.error).toHaveBeenCalledWith(
        "[VoiceRecorder] Extraction error:",
        extractionError,
      );

      alertSpy2.mockRestore();
    });
  });
});
