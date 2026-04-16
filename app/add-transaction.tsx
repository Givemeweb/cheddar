import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    Pressable,
    TextInput,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getCategories, getAccounts, addTransaction, Category, Account } from '@/src/db/storage';
import DateTimePicker from '@/src/components/DateTimePicker';
import {
    TrendingUp,
    Gift,
    Briefcase,
    Wallet,
    PiggyBank,
    Utensils,
    Car,
    ShoppingCart,
    Film,
    Receipt,
    HeartPulse,
    Laptop,
    StopCircle,
} from 'lucide-react-native';
import { useTheme } from '@/src/components/ThemeProvider';

type TransactionType = 'income' | 'expense' | 'transfer';

// Map icon names to Lucide components
const iconMap: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
    'trending-up': TrendingUp,
    'gift': Gift,
    'briefcase': Briefcase,
    'wallet': Wallet,
    'piggy-bank': PiggyBank,
    'utensils': Utensils,
    'car': Car,
    'shopping-cart': ShoppingCart,
    'film': Film,
    'receipt': Receipt,
    'heart-pulse': HeartPulse,
    'laptop': Laptop,
};

const renderIcon = (
  iconName: string,
  size: number = 16,
  color: string = "#212226",
  showIcons: boolean = true,
) => {
  if (!showIcons) return null;
  const IconComponent = iconMap[iconName];
  if (IconComponent) {
    return <IconComponent size={size} color={color} />;
  }
  return <StopCircle size={size} color={color} />;
};

export default function AddTransactionScreen() {
    const router = useRouter();
    const { isDark, showIcons } = useTheme();
    const { t } = useTranslation();
    const [type, setType] = useState<TransactionType>('expense');
    const [date, setDate] = useState(new Date());
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [fromAccountId, setFromAccountId] = useState<string | null>(null);
    const [toAccountId, setToAccountId] = useState<string | null>(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [description, setDescription] = useState('');
    const [categories, setCategories] = useState<Category[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAccountPicker, setShowAccountPicker] = useState(false);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        const cats = await getCategories();
        const accs = await getAccounts();
        setCategories(cats);
        setAccounts(accs);
        if (accs.length > 0) {
            setSelectedAccountId(accs[0].id);
            setFromAccountId(accs[0].id);
            if (accs.length > 1) {
                setToAccountId(accs[1].id);
            }
        }
        setLoading(false);
    };

    const filteredCategories = categories.filter(c =>
        type === 'income' ? c.type === 'income' : c.type === 'expense'
    );

    const handleSave = async () => {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount)) return;

        if (type === 'transfer') {
            if (!fromAccountId || !toAccountId) return;
            const fromAccount = accounts.find(a => a.id === fromAccountId);
            const toAccount = accounts.find(a => a.id === toAccountId);
            await addTransaction({
                type: 'transfer',
                accountId: fromAccountId,
                accountName: fromAccount?.name || '',
                toAccountId,
                toAccountName: toAccount?.name || '',
                note: note || null,
                description: description || null,
                amount: -Math.abs(parsedAmount),
                date,
            });
        } else {
            if (!selectedAccountId || !selectedCategoryId) return;
            const account = accounts.find(a => a.id === selectedAccountId);
            await addTransaction({
                type,
                categoryId: selectedCategoryId,
                accountId: selectedAccountId,
                accountName: account?.name || '',
                note: note || null,
                description: description || null,
                amount: type === 'expense' ? -Math.abs(parsedAmount) : Math.abs(parsedAmount),
                date,
            });
        }

        router.back();
    };

    const getAccountName = (id: string | null) => {
        if (!id) return t('transactions.selectAccount');
        const acc = accounts.find(a => a.id === id);
        return acc ? acc.name : t('transactions.selectAccount');
    };

    const getCategoryLabel = (id: string | null) => {
        if (!id) return t('transactions.selectCategory');
        const cat = categories.find(c => c.id === id);
        return cat ? cat.name : t('transactions.selectCategory');
    };

    const getCategoryIcon = (id: string | null) => {
        if (!id) return null;
        const cat = categories.find(c => c.id === id);
        return cat ? cat.icon : null;
    };

    if (loading) {
        return (
            <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
                <ActivityIndicator size="large" color="#FFB800" />
            </SafeAreaView>
        );
    }

    return (
      <SafeAreaView
        className={`flex-1 ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"}`}
      >
        <View
          className={`flex-row items-center justify-between px-4 py-3 border-b ${isDark ? "bg-[#26282D] border-gray-700" : "bg-white border-gray-200"}`}
        >
          <Pressable
            onPress={() => router.back()}
            className="w-8 items-center justify-center"
          >
            <Text
              className={`text-2xl ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            >
              ×
            </Text>
          </Pressable>
          <Text
            className={`text-xl font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
          >
            {t("transactions.newTransaction")}
          </Text>
          <View className="w-8" />
        </View>

        <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
          {/* Type Selector */}
          <View
            className={`flex-row mb-5 rounded-xl overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-200"}`}
          >
            <Pressable
              className={`flex-1 py-3 items-center ${type === "income" ? "bg-cheddar-yellow" : ""}`}
              onPress={() => {
                setType("income");
                setSelectedCategoryId(null);
              }}
            >
              <Text
                className={`font-medium ${type === "income" ? "text-cheddar-dark" : isDark ? "text-gray-400" : "text-cheddar-gray"}`}
              >
                {t("transactions.type.income")}
              </Text>
            </Pressable>
            <Pressable
              className={`flex-1 py-3 items-center ${type === "expense" ? "bg-cheddar-yellow" : ""}`}
              onPress={() => {
                setType("expense");
                setSelectedCategoryId(null);
              }}
            >
              <Text
                className={`font-medium ${type === "expense" ? "text-cheddar-dark" : isDark ? "text-gray-400" : "text-cheddar-gray"}`}
              >
                {t("transactions.type.expense")}
              </Text>
            </Pressable>
            <Pressable
              className={`flex-1 py-3 items-center ${type === "transfer" ? "bg-cheddar-yellow" : ""}`}
              onPress={() => setType("transfer")}
            >
              <Text
                className={`font-medium ${type === "transfer" ? "text-cheddar-dark" : isDark ? "text-gray-400" : "text-cheddar-gray"}`}
              >
                {t("transactions.type.transfer")}
              </Text>
            </Pressable>
          </View>

          {/* Date Picker */}
          <View
            className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          >
            <Text
              className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("transactions.date")}
            </Text>
            <DateTimePicker
              value={date}
              mode="datetime"
              onChange={(selectedDate) => setDate(selectedDate)}
            />
          </View>

          {/* Account Selector for Income/Expense */}
          {type !== "transfer" && (
            <>
              <Pressable
                className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                onPress={() => setShowAccountPicker(true)}
              >
                <Text
                  className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                >
                  {t("transactions.account")}
                </Text>
                <Text
                  className={`text-base ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                >
                  {getAccountName(selectedAccountId)}
                </Text>
              </Pressable>
              {showAccountPicker && (
                <View
                  className={`rounded-xl mb-3 overflow-hidden ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                >
                  {accounts.map((acc) => (
                    <Pressable
                      key={acc.id}
                      className={`p-4 border-b ${selectedAccountId === acc.id ? (isDark ? "bg-gray-700" : "bg-yellow-50") : ""} ${isDark ? "border-gray-700" : "border-gray-100"}`}
                      onPress={() => {
                        setSelectedAccountId(acc.id);
                        setShowAccountPicker(false);
                      }}
                    >
                      <Text
                        className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                      >
                        {acc.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Pressable
                className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                onPress={() => setShowCategoryPicker(true)}
              >
                <Text
                  className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                >
                  {t("transactions.category")}
                </Text>
                <View className="flex-row items-center">
                  {getCategoryIcon(selectedCategoryId) && showIcons && (
                    <View className="mr-2">
                      {renderIcon(
                        getCategoryIcon(selectedCategoryId)!,
                        16,
                        type === "income" ? "#10B981" : "#EF4444",
                        showIcons,
                      )}
                    </View>
                  )}
                  <Text
                    className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                  >
                    {getCategoryLabel(selectedCategoryId)}
                  </Text>
                </View>
              </Pressable>
              {showCategoryPicker && (
                <View
                  className={`rounded-xl mb-3 overflow-hidden ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                >
                  {filteredCategories.map((cat) => (
                    <Pressable
                      key={cat.id}
                      className={`p-4 border-b flex-row items-center ${selectedCategoryId === cat.id ? (isDark ? "bg-gray-700" : "bg-yellow-50") : ""} ${isDark ? "border-gray-700" : "border-gray-100"}`}
                      onPress={() => {
                        setSelectedCategoryId(cat.id);
                        setShowCategoryPicker(false);
                      }}
                    >
                      {showIcons && (
                        <View className="mr-3">
                          {renderIcon(
                            cat.icon,
                            18,
                            type === "income" ? "#10B981" : "#EF4444",
                            showIcons,
                          )}
                        </View>
                      )}
                      <Text
                        className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Transfer Account Selectors */}
          {type === "transfer" && (
            <>
              <Pressable
                className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                onPress={() => setShowFromPicker(true)}
              >
                <Text
                  className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                >
                  {t("transactions.from")}
                </Text>
                <Text
                  className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                >
                  {getAccountName(fromAccountId)}
                </Text>
              </Pressable>
              {showFromPicker && (
                <View
                  className={`rounded-xl mb-3 overflow-hidden ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                >
                  {accounts.map((acc) => (
                    <Pressable
                      key={acc.id}
                      className={`p-4 border-b ${fromAccountId === acc.id ? (isDark ? "bg-gray-700" : "bg-yellow-50") : ""} ${isDark ? "border-gray-700" : "border-gray-100"}`}
                      onPress={() => {
                        setFromAccountId(acc.id);
                        setShowFromPicker(false);
                      }}
                    >
                      <Text
                        className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                      >
                        {acc.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Pressable
                className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                onPress={() => setShowToPicker(true)}
              >
                <Text
                  className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                >
                  {t("transactions.to")}
                </Text>
                <Text
                  className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                >
                  {getAccountName(toAccountId)}
                </Text>
              </Pressable>
              {showToPicker && (
                <View
                  className={`rounded-xl mb-3 overflow-hidden ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                >
                  {accounts.map((acc) => (
                    <Pressable
                      key={acc.id}
                      className={`p-4 border-b ${toAccountId === acc.id ? (isDark ? "bg-gray-700" : "bg-yellow-50") : ""} ${isDark ? "border-gray-700" : "border-gray-100"}`}
                      onPress={() => {
                        setToAccountId(acc.id);
                        setShowToPicker(false);
                      }}
                    >
                      <Text
                        className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                      >
                        {acc.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Amount */}
          <View
            className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          >
            <Text
              className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("transactions.amount")}
            </Text>
            <TextInput
              className={`text-2xl font-semibold py-1 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            />
          </View>

          {/* Note */}
          <View
            className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          >
            <Text
              className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("transactions.note")}
            </Text>
            <TextInput
              className={`text-base py-1 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              value={note}
              onChangeText={setNote}
              placeholder={t("transactions.addNote")}
              placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            />
          </View>

          {/* Description */}
          <View
            className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          >
            <Text
              className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("transactions.description")}
            </Text>
            <TextInput
              className={`text-base py-1 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              style={{ minHeight: 80 }}
              value={description}
              onChangeText={setDescription}
              placeholder={t("transactions.addDescription")}
              placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        {/* Save Button */}
        <View className="p-4 pb-8">
          <Pressable
            className="bg-cheddar-yellow rounded-xl py-4 items-center"
            onPress={handleSave}
          >
            <Text className="text-cheddar-dark text-base font-semibold">
              {t("transactions.saveTransaction")}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
}