import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  Alert,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Mic, X } from "lucide-react-native";
import { File } from "expo-file-system";
import { Linking } from "react-native";
import {
  requestMicrophonePermission,
  startRecording,
  stopRecording,
  cancelRecording,
} from "@/src/utils/audioRecording";
import {
  extractTransaction,
  ExtractionResponse,
} from "@/src/services/voiceExtraction";
import { transcribeAudio } from "@/src/services/transcription";
import { getCategories, getAccounts, getTransactions } from "@/src/db/storage";

export interface AddTransactionParams {
  type?: string;
  amount?: string;
  note?: string;
  description?: string;
  date?: string;
  accountId?: string;
  categoryId?: string;
  subcategoryId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  imagePath?: string;
}

interface VoiceRecorderModalProps {
  visible: boolean;
  onResult: (params: AddTransactionParams | null) => void;
  onClose: () => void;
}

type Phase = "idle" | "recording" | "loading" | "transcribed" | "error";

const BAR_COUNT = 7;

export function VoiceRecorderModal({
  visible,
  onResult,
  onClose,
}: VoiceRecorderModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [loadingStatus, setLoadingStatus] = useState<
    "transcribing" | "extracting"
  >("transcribing");
  const [transcriptionText, setTranscriptionText] = useState<string>("");

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const micScaleAnim = useRef(new Animated.Value(0.8)).current;
  const ringScaleAnim = useRef(new Animated.Value(1)).current;
  const ringOpacityAnim = useRef(new Animated.Value(0.6)).current;
  const barAnims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3)),
  ).current;

  // Ref to hold the latest stop handler for auto-stop timer
  const stopRecordingRef = useRef<() => Promise<void>>(async () => {});
  const ringAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const barAnimationsRef = useRef<Animated.CompositeAnimation[]>([]);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupAnimations = useCallback(() => {
    if (ringAnimationRef.current) {
      ringAnimationRef.current.stop();
      ringAnimationRef.current = null;
    }
    barAnimationsRef.current.forEach((anim) => anim.stop());
    barAnimationsRef.current = [];
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    setPhase("idle");
    setLoadingStatus("transcribing");
    setTranscriptionText("");
    micScaleAnim.setValue(0.8);
    ringScaleAnim.setValue(1);
    ringOpacityAnim.setValue(0.6);
    barAnims.forEach((anim) => anim.setValue(0.3));
    cleanupAnimations();
  }, [
    cleanupAnimations,
    micScaleAnim,
    ringScaleAnim,
    ringOpacityAnim,
    barAnims,
  ]);

  // Fade in/out on visibility change
  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim]);

  // Check permission when modal opens
  useEffect(() => {
    if (!visible) return;

    const checkPermission = async () => {
      const granted = await requestMicrophonePermission();
      if (!granted) {
        Alert.alert(t("voice.microphonePermissionRequired"), "", [
          {
            text: t("common.cancel"),
            style: "cancel",
            onPress: onClose,
          },
          {
            text: t("voice.openSettings"),
            onPress: () => {
              if (Platform.OS === "ios") {
                Linking.openURL("app-settings:");
              } else {
                Linking.openSettings();
              }
              onClose();
            },
          },
        ]);
      }
    };

    checkPermission();
  }, [visible, t, onClose]);

  // Start recording animation
  const startRecordingAnimation = useCallback(() => {
    // Spring mic button
    Animated.spring(micScaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();

    // Pulsing ring
    const ringAnim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScaleAnim, {
            toValue: 1.4,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacityAnim, {
            toValue: 0.2,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ringScaleAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacityAnim, {
            toValue: 0.6,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    ringAnim.start();
    ringAnimationRef.current = ringAnim;

    // Waveform bars
    barAnims.forEach((anim, index) => {
      const barAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: Math.random() * 0.7 + 0.3,
            duration: 300 + Math.random() * 200,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: Math.random() * 0.5 + 0.2,
            duration: 300 + Math.random() * 200,
            useNativeDriver: true,
          }),
        ]),
      );
      // Stagger start times
      setTimeout(() => {
        barAnim.start();
      }, index * 80);
      barAnimationsRef.current.push(barAnim);
    });
  }, [micScaleAnim, ringScaleAnim, ringOpacityAnim, barAnims]);

  const handleStartRecording = useCallback(async () => {
    try {
      await startRecording();
      setPhase("recording");
      startRecordingAnimation();

      // Set up UI auto-stop timer to match the native auto-stop
      autoStopTimerRef.current = setTimeout(() => {
        stopRecordingRef.current();
      }, 30000);
    } catch (error) {
      console.error("Failed to start recording:", error);
      Alert.alert(t("transactions.error"), t("voice.processingError"), [
        { text: t("common.cancel"), onPress: onClose },
      ]);
    }
  }, [startRecordingAnimation, t, onClose]);

  const deleteAudioFile = useCallback(async (uri: string) => {
    try {
      const file = new File(uri);
      if (file.exists) {
        await file.delete();
      }
    } catch {
      // Ignore deletion errors
    }
  }, []);

  const processAudio = useCallback(
    async (uri: string) => {
      console.log("[VoiceRecorder] Starting processing, uri:", uri);

      // Step 1: Transcribe audio
      setPhase("loading");
      setLoadingStatus("transcribing");

      let transcription: string;
      try {
        console.log("[VoiceRecorder] Step 1: Transcribing audio...");
        transcription = await transcribeAudio(uri);
        console.log("[VoiceRecorder] Transcription:", transcription);

        // Delete audio file immediately after successful transcription
        await deleteAudioFile(uri);
      } catch (error) {
        console.error("[VoiceRecorder] Transcription error:", error);
        await deleteAudioFile(uri);

        const errorMessage =
          error instanceof Error ? error.message : t("voice.processingError");

        if (Platform.OS === "web") {
          const confirmed = window.confirm(
            `${t("voice.transcriptionFailed")}\n\n${errorMessage}\n\n${t("voice.retry")}?`,
          );
          if (confirmed) {
            setPhase("idle");
          } else {
            resetState();
            onClose();
          }
        } else {
          Alert.alert(
            t("transactions.error"),
            `${t("voice.transcriptionFailed")}\n\n${errorMessage}`,
            [
              {
                text: t("common.cancel"),
                style: "cancel",
                onPress: () => {
                  resetState();
                  onClose();
                },
              },
              {
                text: t("voice.retry"),
                onPress: () => {
                  setPhase("idle");
                },
              },
            ],
          );
        }
        return;
      }

      if (!transcription.trim()) {
        if (Platform.OS === "web") {
          window.alert(t("voice.noTransactionDetected"));
          onResult(null);
          resetState();
          onClose();
        } else {
          Alert.alert("", t("voice.noTransactionDetected"), [
            {
              text: "OK",
              onPress: () => {
                onResult(null);
                resetState();
                onClose();
              },
            },
          ]);
        }
        return;
      }

      // Show transcription text and begin extraction
      setTranscriptionText(transcription);
      setPhase("transcribed");

      // Step 2: Extract transaction
      try {
        console.log("[VoiceRecorder] Step 2: Fetching context data...");
        const [categories, accounts, transactions] = await Promise.all([
          getCategories(),
          getAccounts(),
          getTransactions(),
        ]);
        console.log("[VoiceRecorder] Context fetched:", {
          categoriesCount: categories.length,
          accountsCount: accounts.length,
          transactionsCount: transactions.length,
        });

        const recentNotes = transactions
          .slice(0, 20)
          .map((tx) => ({ id: tx.id, text: tx.note || "" }))
          .filter((n) => n.text.length > 0);

        console.log("[VoiceRecorder] Calling extractTransaction...");
        const response = await extractTransaction({
          transcription,
          accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
          categories: categories.map((c) => ({ id: c.id, name: c.name })),
          recentNotes,
          recordedAt: new Date(),
        });
        console.log(
          "[VoiceRecorder] Extraction response:",
          JSON.stringify(response, null, 2),
        );

        if (response.transaction.type === "unknown") {
          if (Platform.OS === "web") {
            window.alert(t("voice.noTransactionDetected"));
            onResult(null);
            resetState();
            onClose();
          } else {
            Alert.alert("", t("voice.noTransactionDetected"), [
              {
                text: "OK",
                onPress: () => {
                  onResult(null);
                  resetState();
                  onClose();
                },
              },
            ]);
          }
          return;
        }

        const params = mapExtractionToParams(response, accounts, categories);
        console.log(
          "[VoiceRecorder] Mapped params:",
          JSON.stringify(params, null, 2),
        );

        onResult(params);
        resetState();
        onClose();
      } catch (error) {
        console.error("[VoiceRecorder] Extraction error:", error);

        const errorMessage =
          error instanceof Error ? error.message : t("voice.processingError");

        if (Platform.OS === "web") {
          const confirmed = window.confirm(
            `${t("voice.extractionFailed")}\n\n${errorMessage}\n\n${t("voice.retry")}?`,
          );
          if (confirmed) {
            setPhase("idle");
          } else {
            resetState();
            onClose();
          }
        } else {
          Alert.alert(
            t("transactions.error"),
            `${t("voice.extractionFailed")}\n\n${errorMessage}`,
            [
              {
                text: t("common.cancel"),
                style: "cancel",
                onPress: () => {
                  resetState();
                  onClose();
                },
              },
              {
                text: t("voice.retry"),
                onPress: () => {
                  setPhase("idle");
                },
              },
            ],
          );
        }
      }
    },
    [t, onResult, onClose, resetState, deleteAudioFile],
  );

  const handleStopRecording = useCallback(async () => {
    try {
      const { uri } = await stopRecording();
      cleanupAnimations();
      await processAudio(uri);
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setPhase("idle");
    }
  }, [cleanupAnimations, processAudio]);

  // Keep ref updated with latest handleStopRecording for auto-stop timer
  useEffect(() => {
    stopRecordingRef.current = handleStopRecording;
  }, [handleStopRecording]);

  const handleCancel = useCallback(async () => {
    if (phase === "recording") {
      try {
        await cancelRecording();
      } catch {
        // Ignore
      }
    }
    cleanupAnimations();
    resetState();
    onClose();
  }, [phase, cleanupAnimations, resetState, onClose]);

  // Auto-stop is handled by audioRecording.ts, but we need to catch it
  // The stopRecording promise resolves when auto-stop fires
  // We handle this via the audioRecording module's auto-stop which calls stopRecording

  const renderWaveformBars = () => {
    return (
      <View style={styles.waveformContainer}>
        {barAnims.map((anim, index) => (
          <Animated.View
            key={index}
            style={[
              styles.bar,
              {
                transform: [
                  {
                    scaleY: anim,
                  },
                ],
                opacity: 0.8,
                height: 32,
              },
            ]}
          />
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <SafeAreaView style={styles.container}>
          {/* Cancel button */}
          <Pressable
            onPress={handleCancel}
            style={[
              styles.cancelButton,
              { top: 16 + insets.top, right: 16 + insets.right },
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={24} color="#9CA3AF" />
          </Pressable>

          {/* Content */}
          <View style={styles.content}>
            {phase === "idle" && (
              <View style={styles.idleContainer}>
                {/* Radial glow background */}
                <View style={styles.glowContainer}>
                  <View style={styles.glow} />
                </View>

                {/* Mic button */}
                <Pressable
                  testID="mic-button"
                  onPress={handleStartRecording}
                  style={styles.micButtonContainer}
                >
                  <View style={styles.micButton}>
                    <Mic size={40} color="#212226" />
                  </View>
                </Pressable>

                <Text style={styles.statusText}>{t("voice.tapToRecord")}</Text>
              </View>
            )}

            {phase === "recording" && (
              <View style={styles.recordingContainer}>
                {/* Radial glow background */}
                <View style={styles.glowContainer}>
                  <View style={[styles.glow, styles.glowActive]} />
                </View>

                {/* Waveform bars */}
                {renderWaveformBars()}

                {/* Pulsing ring + Mic button */}
                <View style={styles.micWrapper}>
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      {
                        transform: [{ scale: ringScaleAnim }],
                        opacity: ringOpacityAnim,
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.micButton,
                      { transform: [{ scale: micScaleAnim }] },
                    ]}
                  >
                    <Pressable
                      testID="stop-mic-button"
                      style={{ padding: 40 }}
                      onPress={handleStopRecording}
                    >
                      <Mic size={40} color="#212226" />
                    </Pressable>
                  </Animated.View>
                </View>

                <Text style={styles.statusText}>{t("voice.listening")}</Text>
              </View>
            )}

            {phase === "loading" && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFB800" />
                <Text style={styles.loadingText}>
                  {loadingStatus === "transcribing"
                    ? t("voice.transcribing")
                    : t("voice.extracting")}
                </Text>
              </View>
            )}

            {phase === "transcribed" && (
              <View style={styles.transcribedContainer}>
                <Text style={styles.transcriptionText}>
                  "{transcriptionText}"
                </Text>
                <View style={styles.extractingRow}>
                  <ActivityIndicator size="small" color="#FFB800" />
                  <Text style={styles.extractingText}>
                    {t("voice.extracting")}
                  </Text>
                </View>
              </View>
            )}

            {phase === "error" && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#EF4444" />
                <Text style={[styles.loadingText, { color: "#EF4444" }]}>
                  {t("voice.processingError")}
                </Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

function mapExtractionToParams(
  response: ExtractionResponse,
  accounts: Array<{ id: string; name: string }>,
  categories: Array<{ id: string; name: string }>,
): AddTransactionParams {
  const { transaction } = response;
  const params: AddTransactionParams = {
    type: transaction.type,
    categoryId: transaction.category,
    accountId: transaction.account,
    fromAccountId: transaction.from,
    toAccountId: transaction.to,
    amount: transaction.amount > 0 ? transaction.amount.toString() : "",
    note: transaction.note || "",
    description: "",
    date: transaction.date || new Date().toISOString(),
  };

  // Map account name to ID
  if (transaction.account) {
    const account = accounts.find(
      (a) => a.name.toLowerCase() === transaction.account.toLowerCase(),
    );
    if (account) {
      params.accountId = account.id;
    }
  }

  // Map category name to ID
  if (transaction.category) {
    const category = categories.find(
      (c) => c.name.toLowerCase() === transaction.category.toLowerCase(),
    );
    if (category) {
      params.categoryId = category.id;
    }
  }

  // Map transfer accounts
  if (transaction.type === "transfer") {
    if (transaction.from) {
      const fromAccount = accounts.find(
        (a) => a.name.toLowerCase() === transaction.from.toLowerCase(),
      );
      if (fromAccount) {
        params.fromAccountId = fromAccount.id;
      }
    }
    if (transaction.to) {
      const toAccount = accounts.find(
        (a) => a.name.toLowerCase() === transaction.to.toLowerCase(),
      );
      if (toAccount) {
        params.toAccountId = toAccount.id;
      }
    }
  }

  return params;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
  },
  container: {
    flex: 1,
  },
  cancelButton: {
    position: "absolute",
    zIndex: 10,
    padding: 8,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  idleContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  recordingContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  glowContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255, 184, 0, 0.08)",
  },
  glowActive: {
    backgroundColor: "rgba(255, 184, 0, 0.15)",
  },
  micWrapper: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#FFB800",
  },
  micButtonContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  micButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#FFB800",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FFB800",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    height: 40,
    gap: 6,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: "#FFB800",
  },
  statusText: {
    marginTop: 24,
    fontSize: 16,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  transcribedContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    maxWidth: 400,
  },
  transcriptionText: {
    fontSize: 18,
    color: "#F9FAFB",
    fontWeight: "400",
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 28,
    marginBottom: 24,
  },
  extractingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  extractingText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
  },
});
