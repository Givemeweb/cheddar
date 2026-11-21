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
import {
  linkMercuryAccounts,
  MercuryBatchBusyError,
  MERCURY_BACKFILL_DAYS,
  MERCURY_BACKFILL_WINDOW_CHOICES,
} from "@/src/services/mercuryImport";
import { syncMercuryAccounts } from "@/src/services/mercurySync";
import { ToggleSwitch } from "@/src/components/ToggleSwitch";
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
  // Selection for the next confirm; linked accounts are never in here.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Backfill window for the next confirm, in days; null means all history.
  const [windowDays, setWindowDays] = useState<number | null>(MERCURY_BACKFILL_DAYS);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The retry affordance for accounts whose last sync failed (ticket 06);
  // it reuses the forced-sync path, which bypasses debounce and backoff.
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Neutral (non-error) status line, e.g. the single-flight busy notice.
  const [notice, setNotice] = useState<string | null>(null);
  const [linkedSummaries, setLinkedSummaries] = useState<
    { id: string; name: string; imported: number }[]
  >([]);
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

  const loadAccounts = async ({
    preserveState = false,
  }: { preserveState?: boolean } = {}) => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    // preserveState keeps the messages and the selection the caller just
    // established (the retry-sync path): clearing them here, synchronously
    // before the first await, would erase the failure list before it renders.
    if (!preserveState) setError(null);
    try {
      const token = await getStoredMercuryToken();
      if (!token) throw new MercuryApiError("invalidCredentials", null, "No stored token.");
      const list = await fetchMercuryAccounts(token);
      if (sequence !== loadSequence.current) return;
      const linked = getMercuryLinkedAccounts().map((account) => account.id);
      setAccounts(list);
      setLinkedIds(linked);
      // Fresh mapping session: every not-yet-linked account starts enabled.
      if (!preserveState) {
        setSelectedIds(
          list.filter((account) => !linked.includes(account.id)).map((account) => account.id),
        );
      }
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
      setLinkedSummaries([]);
      setError(null);
      setNotice(null);
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

  const toggleAccount = (accountId: string) => {
    if (confirming) return;
    setSelectedIds((current) =>
      current.includes(accountId)
        ? current.filter((id) => id !== accountId)
        : [...current, accountId],
    );
  };

  const chooseWindow = (days: number | null) => {
    if (confirming) return;
    setWindowDays(days);
  };

  /**
   * The confirm path: link every selected account and run its initial sync,
   * sequentially (the service awaits each account in turn). A failed account
   * keeps its rows and its lastSyncedAt; the rest still complete.
   */
  const handleConfirm = async () => {
    if (confirming || !accounts) return;
    const selected = accounts.filter(
      (account) => selectedIds.includes(account.id) && !linkedIds.includes(account.id),
    );
    if (selected.length === 0) return;
    setConfirming(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getStoredMercuryToken();
      if (!token) throw new MercuryApiError("invalidCredentials", null, "No stored token.");
      const outcomes = await linkMercuryAccounts(token, selected, windowDays);
      const isBusy = (outcome: (typeof outcomes)[number]) =>
        outcome.error instanceof MercuryBatchBusyError;
      const succeededIds = outcomes
        .filter((outcome) => outcome.ok)
        .map((outcome) => outcome.mercuryAccountId);
      // Busy outcomes mean this call did nothing (a batch is already
      // running elsewhere): an ordinary state, not an error.
      const busy = outcomes.filter(isBusy);
      const failures = outcomes.filter((outcome) => !outcome.ok && !isBusy(outcome));
      // Only successful links refresh the marker: a failed account keeps its
      // toggle so the same confirm can retry it. The stale/lastError retry
      // affordance across screen visits is ticket 06's refresh flow.
      setLinkedIds((current) => [...current, ...succeededIds]);
      setLinkedSummaries(
        outcomes
          .filter((outcome) => outcome.ok)
          .map((outcome) => ({
            id: outcome.mercuryAccountId,
            name: selected.find(
              (account) => account.id === outcome.mercuryAccountId,
            )?.name ?? "",
            imported: outcome.summary?.imported ?? 0,
          })),
      );
      for (const outcome of outcomes) {
        if (outcome.ok) {
          trackEvent("bankConnections.account_linked", {
            imported: outcome.summary?.imported ?? 0,
          });
        } else if (!isBusy(outcome)) {
          trackEvent("bankConnections.account_link_failed", {
            reason: outcome.error instanceof MercuryApiError ? outcome.error.kind : "unexpected",
          });
        }
      }
      if (failures.length > 0) {
        // Name each line so the user knows which account to retry.
        setError(
          failures
            .map((outcome) => {
              const name = selected.find(
                (account) => account.id === outcome.mercuryAccountId,
              )?.name ?? outcome.mercuryAccountId;
              return `${name}: ${errorText(outcome.error)}`;
            })
            .join("\n"),
        );
      } else if (busy.length > 0) {
        setNotice(t("mercuryMapping.busy"));
      }
      if (
        failures.some(
          (outcome) =>
            outcome.error instanceof MercuryApiError &&
            outcome.error.kind === "invalidCredentials",
        )
      ) {
        await handleRejectedToken();
      }
    } catch (confirmError) {
      if (
        confirmError instanceof MercuryApiError &&
        confirmError.kind === "invalidCredentials"
      ) {
        await handleRejectedToken();
      }
      setError(errorText(confirmError));
    } finally {
      setConfirming(false);
    }
  };

  /**
   * Retry the accounts whose last sync failed: the same forced-sync path the
   * home pull-to-refresh uses. The service collects per-account outcomes, so
   * nothing throws except its own persistence writes; those are caught here
   * and surfaced like any other failure.
   */
  const handleRetrySync = async () => {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const outcome = await syncMercuryAccounts({ force: true });
      // A rejected token was already recorded by the service; pick the new
      // state up so the reconnect card takes over.
      setConnection(getMercuryConnection());
      // Refresh the linked markers without wiping the messages: the reload
      // clears error state synchronously at the top in its default mode, so
      // the failure list is applied only after this awaited reload.
      await loadAccounts({ preserveState: true });
      if (outcome.busy) {
        setNotice(t("mercuryMapping.busy"));
      } else if (outcome.failed.length > 0) {
        setError(
          outcome.failed
            .map((failure) => {
              const name =
                accounts?.find((account) => account.id === failure.mercuryAccountId)?.name ??
                failure.mercuryAccountId;
              return `${name}: ${errorText(failure.error)}`;
            })
            .join("\n"),
        );
      }
    } catch (retryError) {
      setError(errorText(retryError));
    } finally {
      setSyncing(false);
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

  const unlinkedAccounts = (accounts ?? []).filter(
    (account) => !linkedIds.includes(account.id),
  );
  const selectedCount = unlinkedAccounts.filter((account) =>
    selectedIds.includes(account.id),
  ).length;

  // Linked accounts whose last sync failed (stale/lastError): the retry
  // affordance deferred from ticket 04's review, driven by the forced sync.
  // Enabled only: the sync never runs disabled accounts, so a disabled stale
  // row (e.g. from a restored backup) could never clear its card.
  const staleLinked = getMercuryLinkedAccounts().filter(
    (account) => account.enabled && (account.stale || account.lastError),
  );

  // Linked accounts carry a fixed marker and no control: they cannot be
  // linked twice. Everything else shows the enable toggle.
  const rowControl = (account: MercuryApiAccount) => {
    if (linkedIds.includes(account.id)) {
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
      <View testID={`mercury-mapping-toggle-${account.id}`}>
        <ToggleSwitch
          value={selectedIds.includes(account.id)}
          onValueChange={() => toggleAccount(account.id)}
          accessibilityLabel={t("mercuryMapping.enableAccount", { name: account.name })}
          disabled={confirming}
        />
      </View>
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
              {linkedSummaries.length > 0 ? (
                <View testID="mercury-mapping-linked-summary" className="mt-3">
                  {linkedSummaries.map((summary) => (
                    <Text
                      key={summary.id}
                      className={`mt-1 text-sm ${subTextColor}`}
                    >
                      {t("mercuryMapping.linkedSummary", {
                        count: summary.imported,
                        name: summary.name,
                      })}
                    </Text>
                  ))}
                </View>
              ) : null}
              {notice ? (
                <Text testID="mercury-mapping-notice" className={`mt-3 text-sm ${subTextColor}`}>
                  {notice}
                </Text>
              ) : null}
              {error ? (
                <Text testID="mercury-mapping-error" className="mt-3 text-sm text-cheddar-expense">
                  {error}
                </Text>
              ) : null}
              {staleLinked.length > 0 ? (
                <View testID="mercury-mapping-stale" className={`mt-3 ${cardClass}`}>
                  <View className="flex-row items-center">
                    <AlertTriangle size={20} color="#FFB800" />
                    <Text className={`ml-2 flex-1 text-sm ${subTextColor}`}>
                      {t("mercuryMapping.staleSyncTitle", { count: staleLinked.length })}
                    </Text>
                  </View>
                  <View className="mt-3">
                    <TouchableOpacity
                      className={`flex-row items-center justify-center rounded-xl px-4 py-3 ${
                        syncing ? "bg-gray-400" : "bg-cheddar-yellow"
                      }`}
                      activeOpacity={0.8}
                      disabled={syncing}
                      onPress={handleRetrySync}
                    >
                      {syncing ? (
                        <View className="flex-row items-center">
                          <ActivityIndicator size="small" color="#212226" />
                          <Text className="ml-2 text-base font-bold text-cheddar-dark">
                            {t("mercuryMapping.syncing")}
                          </Text>
                        </View>
                      ) : (
                        <Text className="text-base font-bold text-cheddar-dark">
                          {t("mercuryMapping.retrySync")}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
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
                    {rowControl(account)}
                  </View>
                ))}
              </View>
              {unlinkedAccounts.length > 0 ? (
                <View className={`mt-3 ${cardClass}`}>
                  <Text className={`text-lg font-semibold ${headingColor}`}>
                    {t("mercuryMapping.windowTitle")}
                  </Text>
                  <Text className={`mt-1 text-sm ${subTextColor}`}>
                    {t("mercuryMapping.windowDesc")}
                  </Text>
                  <View className="mt-3 flex-row flex-wrap">
                    {MERCURY_BACKFILL_WINDOW_CHOICES.map((days) => {
                      const active = windowDays === days;
                      return (
                        <TouchableOpacity
                          key={`window-${days === null ? "all" : days}`}
                          testID={`mercury-mapping-window-${days === null ? "all" : days}`}
                          className={`mr-2 mb-2 rounded-full border px-3 py-2 ${
                            active
                              ? "border-cheddar-yellow bg-cheddar-yellow"
                              : isDark
                                ? "border-gray-600 bg-[#26282D]"
                                : "border-gray-200 bg-white"
                          }`}
                          disabled={confirming}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => chooseWindow(days)}
                        >
                          <Text
                            className={`text-sm font-medium ${
                              active
                                ? "text-cheddar-dark"
                                : isDark
                                  ? "text-gray-300"
                                  : "text-cheddar-gray"
                            }`}
                          >
                            {days === null
                              ? t("mercuryMapping.windowAll")
                              : t("mercuryMapping.windowDays", { count: days })}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {selectedCount > 0 ? (
                    <TouchableOpacity
                      testID="mercury-mapping-confirm"
                      className={`mt-2 items-center justify-center rounded-xl px-4 py-4 ${
                        confirming ? "bg-gray-400" : "bg-cheddar-yellow"
                      }`}
                      activeOpacity={0.8}
                      disabled={confirming}
                      onPress={handleConfirm}
                    >
                      {confirming ? (
                        <View className="flex-row items-center">
                          <ActivityIndicator size="small" color="#212226" />
                          <Text className="ml-2 text-base font-bold text-cheddar-dark">
                            {t("mercuryMapping.linking")}
                          </Text>
                        </View>
                      ) : (
                        <Text className="text-base font-bold text-cheddar-dark">
                          {t("mercuryMapping.confirm", { count: selectedCount })}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
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
