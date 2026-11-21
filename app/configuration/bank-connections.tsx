import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Landmark,
} from "lucide-react-native";
import { useTheme } from "../../src/components/ThemeProvider";
import { usePremium } from "../../src/components/PremiumProvider";
import { getMercuryConnection, type MercuryConnection } from "../../src/db/mercury";
import { connectMercury } from "../../src/services/mercuryConnect";
import { MercuryApiError } from "../../src/services/mercuryApi";
import { bankConnectionsGate } from "../../src/utils/premiumAccess";
import { trackEvent } from "../../src/lib/analytics";

export default function BankConnectionsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const { isPremium, isEntitlementLoaded } = usePremium();
  const [connection, setConnection] = useState<MercuryConnection | null>(() =>
    getMercuryConnection(),
  );
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState("");
  const [revealToken, setRevealToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountCount, setAccountCount] = useState<number | null>(null);

  const errorText = (connectError: unknown): string => {
    if (connectError instanceof MercuryApiError) {
      switch (connectError.kind) {
        case "invalidCredentials":
          return t("bankConnections.errors.invalidCredentials");
        case "network":
          return t("bankConnections.errors.network");
        case "timeout":
          return t("bankConnections.errors.timeout");
        case "unexpected":
          return connectError.status !== null
            ? t("bankConnections.errors.unexpected", {
                status: connectError.status,
              })
            : t("bankConnections.errors.unexpectedUnknown");
      }
    }
    return t("bankConnections.errors.generic");
  };

  const handleConnect = async () => {
    if (busy || !token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const count = await connectMercury(token);
      trackEvent("bankConnections.connect_success");
      setAccountCount(count);
      setConnection(getMercuryConnection());
      setShowForm(false);
      setToken("");
    } catch (connectError) {
      const reason =
        connectError instanceof MercuryApiError
          ? connectError.kind
          : "unexpected";
      trackEvent("bankConnections.connect_failed", { reason });
      setError(errorText(connectError));
    } finally {
      setBusy(false);
    }
  };

  const openForm = () => {
    trackEvent("bankConnections.connect_open");
    setError(null);
    setShowForm(true);
  };

  // Covers deep links; the configuration row already gates before pushing.
  const gate = bankConnectionsGate(isEntitlementLoaded, isPremium);
  if (gate === 'wait') {
    return (
      <SafeAreaView
        className={`flex-1 items-center justify-center ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"}`}
      >
        <ActivityIndicator size="large" color="#FFB800" />
      </SafeAreaView>
    );
  }
  if (gate) {
    return <Redirect href={gate} />;
  }

  const cardClass = `${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl p-5`;
  const button = (label: string, onPress: () => void, disabled?: boolean) => (
    <TouchableOpacity
      className={`flex-row items-center justify-center rounded-xl px-4 py-4 ${
        disabled ? "bg-gray-400" : "bg-cheddar-yellow"
      }`}
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className="text-base font-bold text-cheddar-dark">{label}</Text>
    </TouchableOpacity>
  );

  const form = (
    <View className="mt-4">
      <View className={cardClass}>
        <Text
          className={`text-lg font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
        >
          {t("bankConnections.pasteTitle")}
        </Text>
        <Text
          className={`mt-1 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
        >
          {t("bankConnections.pasteDesc")}
        </Text>
        <View className="mt-4 flex-row items-center">
          <TextInput
            value={token}
            onChangeText={(value) => {
              // Pasted tokens can carry stray whitespace or newlines; a
              // Mercury token never contains any, so strip them up front.
              setToken(value.replace(/\s+/g, ""));
              setError(null);
            }}
            placeholder={t("bankConnections.tokenPlaceholder")}
            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            secureTextEntry={!revealToken}
            className={`flex-1 rounded-xl border px-4 py-3 text-base ${
              isDark
                ? "border-gray-700 bg-[#1E2125] text-cheddar-light"
                : "border-gray-200 bg-white text-cheddar-dark"
            }`}
          />
          <TouchableOpacity
            accessibilityLabel={t("bankConnections.reveal")}
            className="ml-2 p-2"
            onPress={() => setRevealToken((revealed) => !revealed)}
          >
            {revealToken ? (
              <EyeOff size={22} color="#9CA3AF" />
            ) : (
              <Eye size={22} color="#9CA3AF" />
            )}
          </TouchableOpacity>
        </View>
        {error ? (
          <Text testID="bank-connections-error" className="mt-3 text-sm text-cheddar-expense">
            {error}
          </Text>
        ) : null}
        <View className="mt-4">
          {button(
            t("bankConnections.validate"),
            handleConnect,
            busy || !token.trim(),
          )}
        </View>
        {busy ? <ActivityIndicator color="#FFB800" className="mt-3" /> : null}
        <TouchableOpacity
          className="mt-3 items-center py-2"
          disabled={busy}
          onPress={() => {
            setShowForm(false);
            setToken("");
            setError(null);
          }}
        >
          <Text className="text-cheddar-yellow text-base font-medium">
            {t("bankConnections.cancel")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const connectedCard = (
    <View className={cardClass}>
      <View className="flex-row items-center">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-green-500">
          <Check size={22} color="#FFFFFF" />
        </View>
        <Text
          className={`ml-3 text-lg font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
        >
          {t("bankConnections.connected")}
        </Text>
      </View>
      {accountCount !== null ? (
        <Text
          className={`mt-3 text-base ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
        >
          {t("bankConnections.accountsReady", { count: accountCount })}
        </Text>
      ) : null}
      <Text
        className={`mt-2 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
      >
        {t("bankConnections.connectedDesc")}
      </Text>
      <View className="mt-4">
        {button(
          t("bankConnections.openMapping"),
          () => {
            trackEvent("bankConnections.mapping_open");
            router.push("/configuration/mercury-mapping");
          },
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"}`}
    >
      <View
        className={`flex-row items-center px-4 py-3 ${isDark ? "bg-[#26282D] border-gray-700" : "bg-white border-gray-200"} border-b`}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">
            {t("common.back")}
          </Text>
        </TouchableOpacity>
        <Text
          className={`text-xl font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
        >
          {t("bankConnections.title")}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {Platform.OS === "web" ? (
          <View className={cardClass}>
            <View className="flex-row items-center">
              <AlertTriangle size={22} color="#FFB800" />
              <Text
                className={`ml-3 flex-1 text-base ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              >
                {t("bankConnections.webUnavailable")}
              </Text>
            </View>
          </View>
        ) : connection?.tokenStatus === "active" && !showForm ? (
          connectedCard
        ) : showForm ? (
          form
        ) : connection?.tokenStatus === "needs_reauth" ? (
          <View className={cardClass}>
            <View className="flex-row items-center">
              <AlertTriangle size={22} color="#FFB800" />
              <Text
                className={`ml-3 text-lg font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              >
                {t("bankConnections.needsReauth")}
              </Text>
            </View>
            <Text
              className={`mt-2 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("bankConnections.needsReauthDesc")}
            </Text>
            <View className="mt-4">{button(t("bankConnections.connect"), openForm)}</View>
          </View>
        ) : (
          <View className={cardClass}>
            <View className="items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-cheddar-yellow">
                <Landmark size={30} color="#212226" />
              </View>
              <Text
                className={`mt-3 text-lg font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              >
                {t("bankConnections.emptyTitle")}
              </Text>
              <Text
                className={`mt-2 text-center text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("bankConnections.emptyDesc")}
              </Text>
            </View>
            <View className="mt-5">{button(t("bankConnections.connect"), openForm)}</View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
