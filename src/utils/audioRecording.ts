import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { AppState, AppStateStatus } from "react-native";

const MAX_RECORDING_DURATION_MS = 30000;

let recording: Audio.Recording | null = null;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let startTime = 0;

function clearAutoStopTimer(): void {
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
}

function removeAppStateListener(): void {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

async function unloadRecording(): Promise<void> {
  if (recording) {
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // Ignore errors during cleanup — recording may already be stopped
    }
  }
}

async function handleAppStateChange(nextAppState: AppStateStatus): Promise<void> {
  if ((nextAppState === "background" || nextAppState === "inactive") && recording) {
    try {
      await stopRecording();
    } catch {
      // Force cleanup if graceful stop fails
      clearAutoStopTimer();
      removeAppStateListener();
      await unloadRecording();
      recording = null;
    }
  }
}

export async function requestMicrophonePermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === "granted";
}

export async function startRecording(): Promise<void> {
  // Clean up any existing recording first to prevent orphaned instances
  if (recording) {
    clearAutoStopTimer();
    removeAppStateListener();
    await unloadRecording();
    recording = null;
  }

  // Configure audio session for recording
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });

  const { recording: newRecording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );

  recording = newRecording;
  startTime = Date.now();

  // Set up auto-stop timer
  autoStopTimer = setTimeout(() => {
    stopRecording().catch(() => {
      // Force cleanup if auto-stop fails
      clearAutoStopTimer();
      removeAppStateListener();
      unloadRecording().finally(() => {
        recording = null;
      });
    });
  }, MAX_RECORDING_DURATION_MS);

  // Listen for app backgrounding
  appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
    handleAppStateChange(nextAppState);
  });
}

export async function stopRecording(): Promise<{ uri: string; duration: number }> {
  if (!recording) {
    throw new Error("No active recording to stop");
  }

  clearAutoStopTimer();
  removeAppStateListener();

  const currentRecording = recording;
  recording = null;

  await currentRecording.stopAndUnloadAsync();

  const uri = currentRecording.getURI() ?? "";
  const duration = Date.now() - startTime;

  return { uri, duration };
}

export async function cancelRecording(): Promise<void> {
  if (!recording) {
    return;
  }

  clearAutoStopTimer();
  removeAppStateListener();

  const currentRecording = recording;
  recording = null;

  try {
    await currentRecording.stopAndUnloadAsync();
  } catch {
    // Ignore errors during cancellation — file is discarded anyway
  }
}
