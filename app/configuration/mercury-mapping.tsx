import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Landmark } from "lucide-react-native";
import { useTheme } from "@/src/components/ThemeProvider";
import { usePremium } from "@/src/components/PremiumProvider";
import {
  getMercuryConnection,
  getMercuryLinkedAccounts,
  markConnectionNeedsReauthentication,
  type MercuryConnection,
} from "@/src/db/mercury";
import { getCurrencySymbol } from "@/src/db/currency";
import { getStoredMercuryToken } from "@/src/services/mercuryConnect";
import {
  fetchMercuryAccounts,
  MercuryApiError,
  type MercuryApiAccount,
} from "@/src/services/mercuryApi";
import { linkMercuryAccount } from "@/src/services/mercuryImport";
import { bankConnectionsGate } from "@/src/utils/premiumAccess";
import { formatNumber } from "@/src/utils/formatNumber";
import { trackEvent } from "@/src/lib/analytics";

export default function MercuryMappingScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const { isPremium, isEntitlementLoaded } = usePremium();
  const [connection, setConnection] = useState<MercuryConnection | null>(() =>
    getMercuryConnection(),
  );
  // null until the first fetch resolves; an empty list renders its own state.
  const [accounts, setAccounts] = useState<MercuryApiAccount[] | null>(null);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkedSummary, setLinkedSummary] = useState<{
    name: string;
    imported: number;
  } | null>(null);
  // Cancellation guard for the focus load: a blur/refocus while a fetch is
  // in flight must not apply a stale result last.
  const loadSequence = useRef(0);

  const errorText = (mapError: unknown): string => {
    if (mapError instanceof MercuryApiError) {
      switch (mapError.kind) {
        case "invalidCredentials":
          return t("mercuryMapping.errors.reconnect");
        case "network":
          return t("mercuryMapping.errors.network");
        case "timeout":
          return t("mercuryMapping.errors.timeout");
        case "unexpected":
          return mapError.status !== null
            ? t("mercuryMapping.errors.unexpected", { status: mapError.status })
            : t("mercuryMapping.errors.unexpectedUnknown");
      }
    }
    return t("mercuryMapping.errors.generic");
  };

  /**
   * A rejected token during mapping is definitive (the token was valid at
   * connect time): mark the connection so the reconnect card takes over
   * instead of leaving a retry dead end.
   */
  const handleRejectedToken = async () => {
    await markConnectionNeedsReauthentication();
    setConnection(getMercuryConnection());
  };

  const loadAccounts = async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const token = await getStoredMercuryToken();
      if (!token) throw new MercuryApiError("invalidCredentials", null, "No stored token.");
      const list = await fetchMercuryAccounts(token);
      if (sequence !== loadSequence.current) return;
      setAccounts(list);
      setLinkedIds(
        getMercuryLinkedAccounts().map((account) => account.id),
      );
    } catch (loadError) {
      if (sequence !== loadSequence.current) return;
      setAccounts(null);
      setError(errorText(loadError));
      if (loadError instanceof MercuryApiError && loadError.kind === "invalidCredentials") {
        await handleRejectedToken();
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const current = getMercuryConnection();
      setConnection(current);
      setLinkedSummary(null);
      if (current?.tokenStatus === "active") {
        loadAccounts();
      } else {
        setAccounts(null);
        setError(null);
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- read the live connection and reload on every focus; the closure intentionally reads current state helpers
    }, []),
  );

  const handleLink = async (account: MercuryApiAccount) => {
    if (busyId) return;
    setBusyId(account.id);
    setError(null);
    try {
      const token = await getStoredMercuryToken();
      if (!token) throw new MercuryApiError("invalidCredentials", null, "No stored token.");
      const summary = await linkMercuryAccount(token, account);
      trackEvent("bankConnections.account_linked", { imported: summary.imported });
      setLinkedSummary({ name: account.name, imported: summary.imported });
      setLinkedIds(
        getMercuryLinkedAccounts().map((linked) => linked.id),
      );
    } catch (linkError) {
      const reason =
        linkError instanceof MercuryApiError ? linkError.kind : "unexpected";
      trackEvent("bankConnections.account_link_failed", { reason });
      setError(errorText(linkError));
      if (linkError instanceof MercuryApiError && linkError.kind === "invalidCredentials") {
        await handleRejectedToken();
      }
      // The linked-account row is already on disk, but linkedIds is only
      // refreshed on success so the Link action stays available for a
      // retry. The stale/lastError retry affordance is ticket 06's refresh
      // flow.
    } finally {
      setBusyId(null);
    }
  };

  const gate = bankConnectionsGate(isEntitlementLoaded, isPremium);
  if (gate === "wait") {
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
  const headingColor = isDark ? "text-cheddar-light" : "text-cheddar-dark";
  const subTextColor = isDark ? "text-gray-400" : "text-gray-500";

  const linkButton = (account: MercuryApiAccount) => {
    const linked = linkedIds.includes(account.id);
    if (linked) {
      return (
        <View className="flex-row items-center">
          <Check size={18} color="#10B981" />
          <Text className={`ml-1 text-sm font-semibold ${headingColor}`}>
            {t("mercuryMapping.linked")}
          </Text>
        </View>
      );
    }
    return (
      <TouchableOpacity
        testID={`mercury-mapping-link-${account.id}`}
        className={`rounded-xl px-4 py-2 ${busyId ? "bg-gray-400" : "bg-cheddar-yellow"}`}
        disabled={!!busyId}
        onPress={() => handleLink(account)}
      >
        <Text className="text-sm font-bold text-cheddar-dark">
          {busyId === account.id
            ? t("mercuryMapping.linking")
            : t("mercuryMapping.link")}
        </Text>
      </TouchableOpacity>
    );
  };

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
        <Text className={`text-xl font-semibold ${headingColor}`}>
          {t("mercuryMapping.title")}
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
                className={`ml-3 flex-1 text-base ${headingColor}`}
              >
                {t("bankConnections.webUnavailable")}
              </Text>
            </View>
          </View>
        ) : connection?.tokenStatus === "needs_reauth" ? (
          <View className={cardClass}>
            <View className="flex-row items-center">
              <AlertTriangle size={22} color="#FFB800" />
              <Text className={`ml-3 text-lg font-semibold ${headingColor}`}>
                {t("mercuryMapping.needsReauth")}
              </Text>
            </View>
            <Text className={`mt-2 text-sm ${subTextColor}`}>
              {t("mercuryMapping.needsReauthDesc")}
            </Text>
            <View className="mt-4">
              <TouchableOpacity
                className="items-center justify-center rounded-xl bg-cheddar-yellow px-4 py-4"
                activeOpacity={0.8}
                onPress={() => router.push("/configuration/bank-connections")}
              >
                <Text className="text-base font-bold text-cheddar-dark">
                  {t("mercuryMapping.reconnect")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : connection ? (
          loading ? (
            <View className="flex-1 items-center justify-center py-20">
              <ActivityIndicator size="large" color="#FFB800" />
            </View>
          ) : error && !accounts ? (
            <View className={cardClass}>
              <View className="flex-row items-center">
                <AlertTriangle size={22} color="#FFB800" />
                <Text className={`ml-3 flex-1 text-base ${headingColor}`}>
                  {error}
                </Text>
              </View>
              <View className="mt-4">
                <TouchableOpacity
                  className="items-center justify-center rounded-xl bg-cheddar-yellow px-4 py-4"
                  activeOpacity={0.8}
                  onPress={() => loadAccounts()}
                >
                  <Text className="text-base font-bold text-cheddar-dark">
                    {t("mercuryMapping.retry")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : accounts && accounts.length === 0 ? (
            <View className={cardClass}>
              <View className="items-center">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-cheddar-yellow">
                  <Landmark size={30} color="#212226" />
                </View>
                <Text className={`mt-3 text-lg font-semibold ${headingColor}`}>
                  {t("mercuryMapping.noAccountsTitle")}
                </Text>
              </View>
            </View>
          ) : accounts ? (
            <View>
              <View className={cardClass}>
                <Text className={`text-lg font-semibold ${headingColor}`}>
                  {t("mercuryMapping.listTitle")}
                </Text>
                <Text className={`mt-1 text-sm ${subTextColor}`}>
                  {t("mercuryMapping.listDesc")}
                </Text>
              </View>
              {linkedSummary ? (
                <Text
                  testID="mercury-mapping-linked-summary"
                  className={`mt-3 text-sm ${subTextColor}`}
                >
                  {t("mercuryMapping.linkedSummary", {
                    count: linkedSummary.imported,
                    name: linkedSummary.name,
                  })}
                </Text>
              ) : null}
              {error ? (
                <Text testID="mercury-mapping-error" className="mt-3 text-sm text-cheddar-expense">
                  {error}
                </Text>
              ) : null}
              <View
                className={`mt-3 overflow-hidden rounded-xl ${isDark ? "bg-[#26282D]" : "bg-white"}`}
              >
                {accounts.map((account, index) => (
                  <View
                    key={account.id}
                    className={`flex-row items-center justify-between p-4 ${
                      index > 0
                        ? isDark
                          ? "border-t border-gray-700"
                          : "border-t border-gray-100"
                        : ""
                    }`}
                  >
                    <View className="flex-1 pr-3">
                      <Text className={`text-base font-semibold ${headingColor}`}>
                        {account.name}
                      </Text>
                      <Text className={`text-sm ${subTextColor}`}>
                        {account.currentBalance === null
                          ? t("mercuryMapping.balanceUnknown")
                          : t("mercuryMapping.balance", {
                            balance: `${getCurrencySymbol("USD")} ${formatNumber(account.currentBalance)}`,
                          })}
                      </Text>
                    </View>
                    {linkButton(account)}
                  </View>
                ))}
              </View>
            </View>
          ) : null
        ) : (
          <View className={cardClass}>
            <View className="items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-cheddar-yellow">
                <Landmark size={30} color="#212226" />
              </View>
              <Text className={`mt-3 text-lg font-semibold ${headingColor}`}>
                {t("mercuryMapping.noConnectionTitle")}
              </Text>
              <Text className={`mt-2 text-center text-sm ${subTextColor}`}>
                {t("mercuryMapping.noConnectionDesc")}
              </Text>
            </View>
            <View className="mt-5">
              <TouchableOpacity
                className="items-center justify-center rounded-xl bg-cheddar-yellow px-4 py-4"
                activeOpacity={0.8}
                onPress={() => router.push("/configuration/bank-connections")}
              >
                <Text className="text-base font-bold text-cheddar-dark">
                  {t("mercuryMapping.connectFirst")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
