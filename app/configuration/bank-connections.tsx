import { useCallback, useState } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
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
import {
  getMercuryConnection,
  getMercuryLinkedAccounts,
  type MercuryConnection,
  type MercuryLinkedAccount,
} from "../../src/db/mercury";
import { getAccounts } from "../../src/db/storage";
import { connectMercury } from "../../src/services/mercuryConnect";
import { MercuryBatchBusyError, writeMercuryLinkedAccount } from "../../src/services/mercuryImport";
import {
  syncMercuryAccounts,
  type MercurySyncFailure,
} from "../../src/services/mercurySync";
import {
  unlinkMercury,
  type MercuryUnlinkRowPolicy,
} from "../../src/services/mercuryUnlink";
import { MercuryApiError } from "../../src/services/mercuryApi";
import { bankConnectionsGate } from "../../src/utils/premiumAccess";
import { ToggleSwitch } from "../../src/components/ToggleSwitch";
import { trackEvent } from "../../src/lib/analytics";

const failureReason = (error: unknown): string =>
  error instanceof MercuryApiError ? error.kind : "unexpected";

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
  // The manage surface (ticket 07): linked-account rows and their actions.
  const [linkedAccounts, setLinkedAccounts] = useState<MercuryLinkedAccount[]>([]);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [unlinkPrompt, setUnlinkPrompt] = useState(false);
  const [unliking, setUnliking] = useState(false);
  // Neutral (non-error) status line, e.g. the single-flight busy notice.
  const [notice, setNotice] = useState<string | null>(null);

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

  const failureLine = (name: string, failureError: unknown): string =>
    `${name}: ${errorText(failureError)}`;

  /** Local account name for a Mercury id; falls back to the raw id. */
  const displayName = (mercuryAccountId: string): string => {
    const linked = linkedAccounts.find((a) => a.id === mercuryAccountId);
    return (linked && accountNames[linked.localAccountId]) || mercuryAccountId;
  };

  const reloadAccounts = async () => {
    setLinkedAccounts(getMercuryLinkedAccounts());
    const accounts = await getAccounts();
    setAccountNames(
      Object.fromEntries(accounts.map((account) => [account.id, account.name])),
    );
  };

  useFocusEffect(
    useCallback(() => {
      setConnection(getMercuryConnection());
      setUnlinkPrompt(false);
      setError(null);
      setNotice(null);
      reloadAccounts();
    }, []),
  );

  /**
   * Which silent no-op gate the last forced sync hit, for an explicit user
   * action that would otherwise look dead (F6). Mirrors the service's gate
   * order: premium, connection status, enabled accounts; anything else (a
   * missing token, a filtered single account) falls back to the generic
   * string.
   */
  const gateNotice = (mercuryAccountId?: string): string => {
    if (!isPremium) return t("premium.limit.bankConnections");
    const status = getMercuryConnection()?.tokenStatus;
    if (status === "needs_reauth") return t("bankConnections.needsReauthDesc");
    const linked = getMercuryLinkedAccounts();
    const targetEnabled = mercuryAccountId !== undefined
      ? linked.some((account) => account.id === mercuryAccountId && account.enabled)
      : linked.some((account) => account.enabled);
    if (!targetEnabled) return t("bankConnections.syncGateNothingEnabled");
    return t("bankConnections.syncNothing");
  };

  /**
   * The shared forced-sync runner: the manual "Sync now" press and the
   * reconnect's resume both come through here, so both get the same
   * progress, outcome reporting, and event names, and a sync failure can
   * never be re-labeled as a reconnect failure (F4). Forced, so it bypasses
   * the debounce and the backoff; a held single-flight slot shows the busy
   * notice instead of starting a second run.
   */
  const runForcedSync = async () => {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const outcome = await syncMercuryAccounts({ force: true });
      setConnection(getMercuryConnection());
      // The run may have flipped the connection (needs_reauth) or cleared it;
      // a stale confirm card must not survive a status transition (F2).
      setUnlinkPrompt(false);
      await reloadAccounts();
      if (outcome.busy) {
        setNotice(t("bankConnections.busy"));
      } else if (outcome.failed.length > 0) {
        trackEvent("bankConnections.sync_failed", {
          reason: failureReason(outcome.failed[0].error),
        });
        setError(
          outcome.failed
            .map((failure: MercurySyncFailure) =>
              failureLine(displayName(failure.mercuryAccountId), failure.error),
            )
            .join("\n"),
        );
      } else if (outcome.ran) {
        trackEvent("bankConnections.sync_success", {
          accounts: outcome.succeeded.length,
        });
        setNotice(
          t("bankConnections.syncDone", { count: outcome.succeeded.length }),
        );
      } else {
        setNotice(gateNotice());
      }
    } catch (syncError) {
      trackEvent("bankConnections.sync_failed", {
        reason: failureReason(syncError),
      });
      setError(errorText(syncError));
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncNow = () => {
    if (syncing || unlinkPrompt) return;
    runForcedSync();
  };

  /**
   * Retry one account's sync only: the service syncs just this account and
   * leaves every other account's cursor, rows, and state untouched.
   */
  const handleRetryAccount = async (account: MercuryLinkedAccount) => {
    if (retryingId !== null || syncing) return;
    setRetryingId(account.id);
    setError(null);
    setNotice(null);
    try {
      const outcome = await syncMercuryAccounts({
        force: true,
        mercuryAccountId: account.id,
      });
      setConnection(getMercuryConnection());
      setUnlinkPrompt(false);
      await reloadAccounts();
      const name = accountNames[account.localAccountId] ?? account.id;
      if (outcome.busy) {
        setNotice(t("bankConnections.busy"));
      } else if (outcome.failed.length > 0) {
        trackEvent("bankConnections.account_retry", {
          ok: false,
          reason: failureReason(outcome.failed[0].error),
        });
        setError(failureLine(name, outcome.failed[0].error));
      } else if (outcome.ran) {
        trackEvent("bankConnections.account_retry", { ok: true });
        setNotice(t("bankConnections.retryDone", { name }));
      } else {
        setNotice(gateNotice(account.id));
      }
    } catch (retryError) {
      trackEvent("bankConnections.account_retry", {
        ok: false,
        reason: failureReason(retryError),
      });
      setError(errorText(retryError));
    } finally {
      setRetryingId(null);
    }
  };

  /**
   * The per-account enable toggle: turning an account off stops its future
   * syncs (the sync gate filters disabled accounts) without touching its
   * rows or its link. Turning it back on resumes them.
   */
  const handleToggleAccount = async (account: MercuryLinkedAccount) => {
    if (togglingId !== null || unliking) return;
    setTogglingId(account.id);
    setError(null);
    setNotice(null);
    try {
      const enabled = !account.enabled;
      await writeMercuryLinkedAccount(account.id, { enabled });
      trackEvent("bankConnections.account_toggled", { enabled });
      await reloadAccounts();
    } catch (toggleError) {
      setError(errorText(toggleError));
    } finally {
      setTogglingId(null);
    }
  };

  const handleUnlinkChoice = async (policy: MercuryUnlinkRowPolicy) => {
    if (unliking) return;
    setUnliking(true);
    setError(null);
    setNotice(null);
    try {
      await unlinkMercury(policy);
      trackEvent(
        policy === "keep"
          ? "bankConnections.unlink_keep"
          : "bankConnections.unlink_delete",
      );
      setUnlinkPrompt(false);
      setConnection(getMercuryConnection());
      setAccountCount(null);
      await reloadAccounts();
      setNotice(
        t(
          policy === "keep"
            ? "bankConnections.unlinkDoneKeep"
            : "bankConnections.unlinkDoneDelete",
        ),
      );
    } catch (unlinkError) {
      if (unlinkError instanceof MercuryBatchBusyError) {
        setNotice(t("bankConnections.busy"));
      } else {
        setError(errorText(unlinkError));
      }
    } finally {
      setUnliking(false);
    }
  };

  const handleConnect = async () => {
    if (busy || !token.trim()) return;
    const reconnecting = connection?.tokenStatus === "needs_reauth";
    setBusy(true);
    setError(null);
    try {
      const count = await connectMercury(token);
      trackEvent(
        reconnecting
          ? "bankConnections.reconnect_success"
          : "bankConnections.connect_success",
      );
      setAccountCount(count);
      setConnection(getMercuryConnection());
      setUnlinkPrompt(false);
      setShowForm(false);
      setToken("");
      // A reconnect resumes syncing right away; after a fresh connect there
      // is nothing linked yet and the forced sync is a silent no-op. The
      // shared runner reports the sync's own outcome, so a failed resume is
      // never re-labeled as a reconnect failure (F4).
      if (reconnecting) {
        await runForcedSync();
      }
    } catch (connectError) {
      const reason =
        connectError instanceof MercuryApiError
          ? connectError.kind
          : "unexpected";
      trackEvent(
        reconnecting
          ? "bankConnections.reconnect_failed"
          : "bankConnections.connect_failed",
        { reason },
      );
      setError(errorText(connectError));
    } finally {
      setBusy(false);
    }
  };

  const openForm = () => {
    trackEvent(
      connection?.tokenStatus === "needs_reauth"
        ? "bankConnections.reconnect_open"
        : "bankConnections.connect_open",
    );
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
  const headingColor = isDark ? "text-cheddar-light" : "text-cheddar-dark";
  const subTextColor = isDark ? "text-gray-400" : "text-gray-500";
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
          className={`text-lg font-semibold ${headingColor}`}
        >
          {t("bankConnections.pasteTitle")}
        </Text>
        <Text
          className={`mt-1 text-sm ${subTextColor}`}
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
            connection?.tokenStatus === "needs_reauth"
              ? t("bankConnections.reconnect")
              : t("bankConnections.validate"),
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

  const needsReauthCard = (
    <View className={cardClass}>
      <View className="flex-row items-center">
        <AlertTriangle size={22} color="#FFB800" />
        <Text
          className={`ml-3 text-lg font-semibold ${headingColor}`}
        >
          {t("bankConnections.needsReauth")}
        </Text>
      </View>
      <Text
        className={`mt-2 text-sm ${subTextColor}`}
      >
        {t("bankConnections.needsReauthDesc")}
      </Text>
      <View className="mt-4">{button(t("bankConnections.reconnect"), openForm)}</View>
      {/* Unlink needs no working token: it only tears down local state, so it
          stays available while the token is rejected (F5). Reconnect stays
          the primary action above. */}
      <View className="mt-2">
        <TouchableOpacity
          testID="bank-connections-unlink"
          className={`flex-row items-center justify-center rounded-xl px-4 py-4 ${
            unliking || unlinkPrompt ? "bg-gray-400" : isDark ? "bg-[#1E2125]" : "bg-cheddar-light"
          }`}
          activeOpacity={0.8}
          disabled={unliking || unlinkPrompt}
          onPress={() => {
            setError(null);
            setNotice(null);
            setUnlinkPrompt(true);
          }}
        >
          <Text className={`text-base font-bold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}>
            {t("bankConnections.unlink")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const unlinkConfirmCard = (
    <View testID="bank-connections-unlink-confirm" className={`mt-3 ${cardClass}`}>
      <Text className={`text-lg font-semibold ${headingColor}`}>
        {t("bankConnections.unlinkTitle")}
      </Text>
      <Text className={`mt-2 text-sm ${subTextColor}`}>
        {t("bankConnections.unlinkDesc")}
      </Text>
      <View className="mt-4">
        {button(t("bankConnections.unlinkKeep"), () => handleUnlinkChoice("keep"), unliking)}
      </View>
      <View className="mt-2">
        <TouchableOpacity
          testID="bank-connections-unlink-delete"
          className={`flex-row items-center justify-center rounded-xl px-4 py-4 ${
            unliking ? "bg-gray-400" : "bg-red-500"
          }`}
          activeOpacity={0.8}
          disabled={unliking}
          onPress={() => handleUnlinkChoice("delete")}
        >
          <Text className="text-base font-bold text-white">
            {t("bankConnections.unlinkDelete")}
          </Text>
        </TouchableOpacity>
      </View>
      {unliking ? <ActivityIndicator color="#FFB800" className="mt-3" /> : null}
      <TouchableOpacity
        className="mt-3 items-center py-2"
        disabled={unliking}
        onPress={() => setUnlinkPrompt(false)}
      >
        <Text className="text-cheddar-yellow text-base font-medium">
          {t("bankConnections.unlinkCancel")}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const linkedAccountRow = (account: MercuryLinkedAccount, index: number) => {
    const name = accountNames[account.localAccountId] ?? account.id;
    const hasError = account.stale || account.lastError !== null;
    return (
      <View
        key={account.id}
        testID={`bank-connections-account-${account.id}`}
        className={`px-4 py-4 ${
          index > 0
            ? isDark
              ? "border-t border-gray-700"
              : "border-t border-gray-100"
            : ""
        }`}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className={`text-base font-semibold ${headingColor}`}>
              {name}
            </Text>
            <Text className={`text-sm ${subTextColor}`}>
              {t("bankConnections.accountMeta", {
                currency: account.currency,
                window: account.cursorWindowDays === null
                  ? t("bankConnections.windowAll")
                  : t("bankConnections.windowDays", {
                      count: account.cursorWindowDays,
                    }),
                sync: account.lastSyncedAt === null
                  ? t("bankConnections.neverSynced")
                  : t("bankConnections.lastSync", {
                      date: new Date(account.lastSyncedAt).toLocaleString(),
                    }),
              })}
            </Text>
            {hasError ? (
              <Text className="mt-1 text-sm text-cheddar-expense">
                {t("bankConnections.stale")}
                {account.lastError ? `: ${account.lastError}` : ""}
              </Text>
            ) : null}
          </View>
          <View testID={`bank-connections-toggle-${account.id}`}>
            <ToggleSwitch
              value={account.enabled}
              onValueChange={() => handleToggleAccount(account)}
              accessibilityLabel={t("bankConnections.accountToggle", { name })}
              disabled={togglingId !== null || syncing || unliking}
            />
          </View>
        </View>
        {account.enabled && hasError ? (
          <View className="mt-3">
            {button(
              retryingId === account.id
                ? t("bankConnections.syncing")
                : t("bankConnections.retryAccount"),
              () => handleRetryAccount(account),
              retryingId !== null || syncing,
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const manageSurface = (
    <View>
      <View className={cardClass}>
        <View className="flex-row items-center">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-green-500">
            <Check size={22} color="#FFFFFF" />
          </View>
          <Text
            className={`ml-3 text-lg font-semibold ${headingColor}`}
          >
            {t("bankConnections.connected")}
          </Text>
        </View>
        {accountCount !== null ? (
          <Text
            className={`mt-3 text-base ${headingColor}`}
          >
            {t("bankConnections.accountsReady", { count: accountCount })}
          </Text>
        ) : null}
        <Text
          className={`mt-2 text-sm ${subTextColor}`}
        >
          {t("bankConnections.connectedDesc")}
        </Text>
        {notice ? (
          <Text testID="bank-connections-notice" className={`mt-3 text-sm ${subTextColor}`}>
            {notice}
          </Text>
        ) : null}
        {error ? (
          <Text testID="bank-connections-error" className="mt-3 text-sm text-cheddar-expense">
            {error}
          </Text>
        ) : null}
        <View className="mt-4">
          {button(
            t("bankConnections.openMapping"),
            () => {
              trackEvent("bankConnections.mapping_open");
              router.push("/configuration/mercury-mapping");
            },
          )}
        </View>
        <View className="mt-2 flex-row">
          <View className="flex-1 mr-2">
            <TouchableOpacity
              testID="bank-connections-sync-now"
              className={`flex-row items-center justify-center rounded-xl px-4 py-4 ${
                syncing || unlinkPrompt ? "bg-gray-400" : "bg-cheddar-yellow"
              }`}
              activeOpacity={0.8}
              disabled={syncing || unliking || unlinkPrompt}
              onPress={handleSyncNow}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#212226" />
              ) : null}
              <Text className="ml-2 text-base font-bold text-cheddar-dark">
                {syncing
                  ? t("bankConnections.syncing")
                  : t("bankConnections.syncNow")}
              </Text>
            </TouchableOpacity>
          </View>
          <View className="flex-1 ml-2">
            <TouchableOpacity
              testID="bank-connections-unlink"
              className={`flex-row items-center justify-center rounded-xl px-4 py-4 ${
                unliking || unlinkPrompt ? "bg-gray-400" : isDark ? "bg-[#1E2125]" : "bg-cheddar-light"
              }`}
              activeOpacity={0.8}
              disabled={unliking || unlinkPrompt || syncing}
              onPress={() => {
                setError(null);
                setNotice(null);
                setUnlinkPrompt(true);
              }}
            >
              <Text className={`text-base font-bold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}>
                {t("bankConnections.unlink")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {unlinkPrompt ? (
        unlinkConfirmCard
      ) : linkedAccounts.length > 0 ? (
        <View
          className={`mt-3 overflow-hidden rounded-xl ${isDark ? "bg-[#26282D]" : "bg-white"}`}
        >
          <View className="p-5 pb-0">
            <Text className={`text-lg font-semibold ${headingColor}`}>
              {t("bankConnections.manageAccountsTitle")}
            </Text>
          </View>
          {linkedAccounts.map(linkedAccountRow)}
        </View>
      ) : null}
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
          className={`text-xl font-semibold ${headingColor}`}
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
                className={`ml-3 flex-1 text-base ${headingColor}`}
              >
                {t("bankConnections.webUnavailable")}
              </Text>
            </View>
          </View>
        ) : showForm ? (
          form
        ) : connection?.tokenStatus === "needs_reauth" ? (
          <View>
            {needsReauthCard}
            {unlinkPrompt ? unlinkConfirmCard : null}
            {notice ? (
              <Text testID="bank-connections-notice" className={`mt-3 text-sm ${subTextColor}`}>
                {notice}
              </Text>
            ) : null}
            {error ? (
              <Text testID="bank-connections-error" className="mt-3 text-sm text-cheddar-expense">
                {error}
              </Text>
            ) : null}
          </View>
        ) : connection?.tokenStatus === "active" ? (
          manageSurface
        ) : (
          <View className={cardClass}>
            <View className="items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-cheddar-yellow">
                <Landmark size={30} color="#212226" />
              </View>
              <Text
                className={`mt-3 text-lg font-semibold ${headingColor}`}
              >
                {t("bankConnections.emptyTitle")}
              </Text>
              <Text
                className={`mt-2 text-center text-sm ${subTextColor}`}
              >
                {t("bankConnections.emptyDesc")}
              </Text>
            </View>
            <View className="mt-5">{button(t("bankConnections.connect"), openForm)}</View>
            {/* The post-unlink confirmation lands here: the connection is
                gone, so this empty card is what the user sees, and it must
                name which row policy ran (F1). */}
            {notice ? (
              <Text testID="bank-connections-notice" className={`mt-3 text-sm ${subTextColor}`}>
                {notice}
              </Text>
            ) : null}
            {error ? (
              <Text testID="bank-connections-error" className="mt-3 text-sm text-cheddar-expense">
                {error}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
