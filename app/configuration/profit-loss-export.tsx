import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Square,
  SquareCheck,
  XCircle,
} from "lucide-react-native";
import { useTheme } from "../../src/components/ThemeProvider";
import { renderAccountIcon } from "../../src/components/accountIcons";
import { getAccounts, getTransactions } from "../../src/db/storage";
import {
  exportProfitLossWorkbook,
  ProfitLossRatesUnavailableError,
} from "../../src/utils/plExport";
import type {
  SaveOutcome,
  SaveProfitLossWorkbook,
} from "../../src/utils/plSave";
import { trackEvent } from "../../src/lib/analytics";

const profitLossFileName = (year: number): string => `Profit & Loss ${year}.xlsx`;

export default function ProfitLossExportScreen() {
  const router = useRouter();
  const { isDark, showIcons, currencySymbol } = useTheme();
  const { t } = useTranslation();

  const [accounts, setAccounts] = useState<
    { id: string; name: string; icon: string }[]
  >([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [year, setYear] = useState(new Date().getFullYear());
  const [minYear, setMinYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  // 'saved': file written into a chosen folder (Android); 'offered': handed
  // to the share sheet (iOS). The outcome names the copy the banner shows.
  const [result, setResult] = useState<'saved' | 'offered' | 'error' | null>(
    null,
  );
  const [errorKey, setErrorKey] = useState<
    'plExport.error' | 'plExport.ratesUnavailable'
  >('plExport.error');
  // The year whose workbook was actually exported; the success banner keeps
  // naming it even after the picker state moves on.
  const [exportedYear, setExportedYear] = useState<number | null>(null);

  useEffect(() => {
    trackEvent("plExport.opened");
    let active = true;
    (async () => {
      try {
        const [accountList, transactions] = await Promise.all([
          getAccounts(),
          getTransactions(),
        ]);
        if (!active) return;
        setAccounts(accountList);
        const currentYear = new Date().getFullYear();
        // The picker cannot go before the store's first transaction year;
        // future-dated rows never push the floor past the current year.
        const earliest = transactions.reduce(
          (min, tx) => Math.min(min, tx.date.getFullYear()),
          currentYear,
        );
        setMinYear(earliest);
        setYear(currentYear);
      } catch (error) {
        console.error("Profit & Loss export screen failed to load:", error);
        if (!active) return;
        trackEvent("plExport.failed");
        setErrorKey("plExport.error");
        setResult("error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // note: reads the full transaction table just for the earliest year and
    // the exporter re-reads it on Create; fine at app scale, a smallest-date
    // read can replace it if the table grows.
  }, []);

  const toggleAccount = (accountId: string) => {
    if (exporting) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    if (selected.size === 0 || exporting) return;
    setExporting(true);
    setResult(null);
    try {
      const { bytes } = await exportProfitLossWorkbook({
        year,
        accountIds: [...selected],
      });
      // Platform split lives behind require so each bundle loads only its own
      // delivery: the native SAF/sharing modules vs the web download helper
      // (same pattern as backup-mmbak.tsx).
      const saver: SaveProfitLossWorkbook =
        Platform.OS === "web"
          ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- runtime platform require keeps the other platform's module out of the Metro bundle
            require("../../src/utils/plSave.web").saveProfitLossWorkbook
          : // eslint-disable-next-line @typescript-eslint/no-require-imports -- runtime platform require keeps the other platform's module out of the Metro bundle
            require("../../src/utils/plSave.native").saveProfitLossWorkbook;
      const outcome: SaveOutcome = await saver(bytes, profitLossFileName(year));
      if (outcome.status === "cancelled") {
        // Dismissed folder picker: an abort, no file, no event.
        return;
      }
      trackEvent("plExport.succeeded", {
        year,
        accounts: selected.size,
      });
      setExportedYear(year);
      setResult(outcome.status);
    } catch (error) {
      console.error("Profit & Loss export failed:", error);
      trackEvent("plExport.failed", { year });
      setErrorKey(
        error instanceof ProfitLossRatesUnavailableError
          ? "plExport.ratesUnavailable"
          : "plExport.error",
      );
      setResult("error");
    } finally {
      setExporting(false);
    }
  };

  const successColor = "#10B981";
  const errorColor = "#EF4444";

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
          {t("plExport.title")}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View
          className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl p-4 flex-row items-center`}
        >
          <FileSpreadsheet size={22} color="#FFB800" />
          <Text
            className={`flex-1 ml-3 text-base ${isDark ? "text-gray-300" : "text-gray-600"} leading-6`}
          >
            {t("plExport.description")}
          </Text>
        </View>

        <Text
          className={`text-sm font-medium uppercase mb-2 mt-6 px-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}
        >
          {t("plExport.accounts")}
        </Text>
        <View
          className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl overflow-hidden`}
        >
          {loading ? (
            <View className="p-4 items-center">
              <ActivityIndicator size="small" color="#FFB800" />
            </View>
          ) : accounts.length === 0 && result !== "error" ? (
            <View className="p-4">
              <Text
                className={`text-base ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("accounts.noAccounts")}
              </Text>
            </View>
          ) : (
            accounts.map((account, index) => {
              const checked = selected.has(account.id);
              return (
                <TouchableOpacity
                  key={account.id}
                  className={`flex-row items-center p-4 ${
                    index > 0
                      ? isDark
                        ? "border-t border-gray-700"
                        : "border-t border-gray-100"
                      : ""
                  }`}
                  activeOpacity={0.7}
                  disabled={exporting}
                  accessibilityRole="checkbox"
                  accessibilityLabel={account.name}
                  accessibilityState={{ checked }}
                  onPress={() => toggleAccount(account.id)}
                >
                  <View className="flex-1 flex-row items-center">
                    {showIcons && (
                      <View className="mr-2">
                        {renderAccountIcon(
                          account.icon,
                          18,
                          isDark ? "#9CA3AF" : "#6B7280",
                          showIcons,
                        )}
                      </View>
                    )}
                    <Text
                      className={`text-lg ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                    >
                      {account.name}
                    </Text>
                  </View>
                  {checked ? (
                    <SquareCheck size={22} color="#FFB800" />
                  ) : (
                    <Square size={22} color={isDark ? "#9CA3AF" : "#6B7280"} />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <Text
          className={`text-sm font-medium uppercase mb-2 mt-6 px-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}
        >
          {t("plExport.year")}
        </Text>
        <View
          className={`flex-row items-center justify-between p-4 ${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl`}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("plExport.previousYear")}
            accessibilityState={{ disabled: exporting || year <= minYear }}
            onPress={() => setYear((y) => Math.max(minYear, y - 1))}
            disabled={exporting || year <= minYear}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft
              size={22}
              color={
                year <= minYear
                  ? "#4B5563"
                  : isDark
                    ? "#F9FAFB"
                    : "#212226"
              }
            />
          </TouchableOpacity>
          <Text
            className={`text-lg font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
          >
            {year}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("plExport.nextYear")}
            accessibilityState={{
              disabled: exporting || year >= new Date().getFullYear(),
            }}
            onPress={() => setYear((y) => Math.min(new Date().getFullYear(), y + 1))}
            disabled={exporting || year >= new Date().getFullYear()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronRight
              size={22}
              color={
                year >= new Date().getFullYear()
                  ? "#4B5563"
                  : isDark
                    ? "#F9FAFB"
                    : "#212226"
              }
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          className={`flex-row items-center justify-center p-4 mt-6 rounded-xl ${
            exporting || selected.size === 0 ? "bg-cheddar-yellow/50" : "bg-cheddar-yellow"
          }`}
          activeOpacity={0.7}
          onPress={handleCreate}
          disabled={exporting || selected.size === 0}
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#212226" />
          ) : (
            <Text className="text-cheddar-dark text-lg font-semibold">
              {t("plExport.create")}
            </Text>
          )}
        </TouchableOpacity>

        {(result === "saved" || result === "offered") && (
          <View
            className={`flex-row items-center mt-4 p-4 rounded-xl ${isDark ? "bg-green-900/30" : "bg-green-50"}`}
          >
            <CheckCircle size={22} color={successColor} />
            <Text className={`ml-3 flex-1 text-base ${isDark ? "text-green-400" : "text-green-700"}`}>
              {result === "saved"
                ? t("plExport.success", { year: exportedYear })
                : t("plExport.readyToShare", { year: exportedYear })}
            </Text>
          </View>
        )}

        {result === "error" && (
          <View
            className={`flex-row items-start mt-4 p-4 rounded-xl ${isDark ? "bg-red-900/30" : "bg-red-50"}`}
          >
            <XCircle size={22} color={errorColor} />
            <Text className={`ml-3 flex-1 text-base ${isDark ? "text-red-400" : "text-red-700"}`}>
              {t(errorKey)}
            </Text>
          </View>
        )}

        <Text
          className={`text-center text-xs mt-4 px-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}
        >
          {t("plExport.currencyNote", { symbol: currencySymbol })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
