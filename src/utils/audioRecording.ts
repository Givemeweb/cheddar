import {
  AudioModule,
  IOSOutputFormat,
  AudioQuality,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import type { AudioRecorder, RecordingOptions } from "expo-audio";
import { AppState, AppStateStatus } from "react-native";

const MAX_RECORDING_DURATION_S = 30;

/**
 * WAV (Linear PCM) recording options for maximum STT API compatibility.
 * iOS uses native AVAudioRecorder with Linear PCM.
 * Android falls back to AAC/M4A since MediaRecorder doesn't support WAV natively.
 */
const WAV_RecordingOptions: RecordingOptions = {
  extension: ".wav",
  sampleRate: 16000, // 16kHz is optimal for speech recognition
  numberOfChannels: 1, // Mono is sufficient for voice
  bitRate: 256000,
  ios: {
    extension: ".wav",
    sampleRate: 16000,
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};

let recorder: AudioRecorder | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let startTime = 0;

function removeAppStateListener(): void {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

async function cleanupRecorder(): Promise<void> {
  if (recorder) {
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch {
      // Ignore errors during cleanup
    }
    recorder = null;
  }
}

async function handleAppStateChange(nextAppState: AppStateStatus): Promise<void> {
  if (
    (nextAppState === "background" || nextAppState === "inactive") &&
    recorder?.isRecording
  ) {
    try {
      await stopRecording();
    } catch {
      removeAppStateListener();
      await cleanupRecorder();
    }
  }
}

export async function requestMicrophonePermission(): Promise<boolean> {
  const { status } = await requestRecordingPermissionsAsync();
  return status === "granted";
}

export async function startRecording(): Promise<void> {
  // Clean up any existing recording first to prevent orphaned instances
  if (recorder) {
    removeAppStateListener();
    await cleanupRecorder();
  }

  // Configure audio session for recording
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: "doNotMix",
    shouldRouteThroughEarpiece: false,
  });

  recorder = new AudioModule.AudioRecorder(WAV_RecordingOptions);
  await recorder.prepareToRecordAsync();

  // Start recording with auto-stop after max duration
  recorder.record({ forDuration: MAX_RECORDING_DURATION_S });

  startTime = Date.now();

  // Listen for app backgrounding
  appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
    handleAppStateChange(nextAppState);
  });
}

export async function stopRecording(): Promise<{ uri: string; duration: number }> {
  if (!recorder) {
    throw new Error("No active recording to stop");
  }

  removeAppStateListener();

  const currentRecorder = recorder;
  recorder = null;

  await currentRecorder.stop();

  const uri = currentRecorder.uri ?? "";
  const duration = Date.now() - startTime;

  return { uri, duration };
}

export async function cancelRecording(): Promise<void> {
  if (!recorder) {
    return;
  }

  removeAppStateListener();

  const currentRecorder = recorder;
  recorder = null;

  try {
    await currentRecorder.stop();
  } catch {
    // Ignore errors during cancellation — file is discarded anyway
  }
}
