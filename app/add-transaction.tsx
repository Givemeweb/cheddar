import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    Pressable,
    TextInput,
    ScrollView,
    ActivityIndicator,
    Alert,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getCategories, getAccounts, addTransaction, updateTransaction, getTransactionById, deleteTransaction, Category, Account } from '@/src/db/storage';
import { getSubcategoriesEnabled, getSubcategories, type Subcategory } from '@/src/db';
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
    Pencil,
    Trash2,
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
    const params = useLocalSearchParams<{ transactionId?: string }>();
    const transactionId = params.transactionId;
    const isEditing = !!transactionId;

    const { isDark, showIcons } = useTheme();
    const { t } = useTranslation();
    const [type, setType] = useState<TransactionType>('expense');
    const [date, setDate] = useState(new Date());
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null);
    const [fromAccountId, setFromAccountId] = useState<string | null>(null);
    const [toAccountId, setToAccountId] = useState<string | null>(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [description, setDescription] = useState('');
    const [categories, setCategories] = useState<Category[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
    const [subcategoriesEnabled, setSubcategoriesEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showAccountPicker, setShowAccountPicker] = useState(false);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showSubcategoryPicker, setShowSubcategoryPicker] = useState(false);
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
        const subEnabled = await getSubcategoriesEnabled();
        setCategories(cats);
        setAccounts(accs);
        setSubcategoriesEnabled(subEnabled);

        if (isEditing && transactionId) {
            // Load existing transaction for editing
            const existingTx = await getTransactionById(transactionId);
            if (existingTx) {
                setType(existingTx.type);
                setDate(existingTx.date);
                setNote(existingTx.note || '');
                setDescription(existingTx.description || '');
                setAmount(Math.abs(existingTx.amount).toString());

                if (existingTx.type === 'transfer') {
                    setFromAccountId(existingTx.accountId);
                    setToAccountId(existingTx.toAccountId);
                } else {
                    setSelectedAccountId(existingTx.accountId);
                    setSelectedCategoryId(existingTx.categoryId);
                    setSelectedSubcategoryId(existingTx.subcategoryId);

                    // Load subcategories for the category
                    if (subEnabled && existingTx.categoryId) {
                        const subs = await getSubcategories(existingTx.categoryId);
                        setSubcategories(subs);
                    }
                }
            }
        } else {
            // Default account selections for new transaction
            if (accs.length > 0) {
                setSelectedAccountId(accs[0].id);
                setFromAccountId(accs[0].id);
                if (accs.length > 1) {
                    setToAccountId(accs[1].id);
                }
            }
        }
        setLoading(false);
    };

    const filteredCategories = categories.filter(c =>
        type === 'income' ? c.type === 'income' : c.type === 'expense'
    );

    const handleSave = async () => {
        const validationError = validateForm();
        if (validationError) {
            if (Platform.OS === 'web') {
                window.alert(validationError);
            } else {
                Alert.alert(t('transactions.error'), validationError);
            }
            return;
        }

        const parsedAmount = parseFloat(amount);

        if (type === 'transfer') {
            if (!fromAccountId || !toAccountId) return;
            const fromAccount = accounts.find(a => a.id === fromAccountId);
            const toAccount = accounts.find(a => a.id === toAccountId);

            if (isEditing && transactionId) {
                await updateTransaction(transactionId, {
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
            }
        } else {
            const account = accounts.find(a => a.id === selectedAccountId!);
            const category = categories.find(c => c.id === selectedCategoryId!);
            const subcategory = subcategories.find(s => s.id === selectedSubcategoryId);

            if (isEditing && transactionId) {
                await updateTransaction(transactionId, {
                    type,
                    categoryId: selectedCategoryId,
                    subcategoryId: selectedSubcategoryId,
                    subcategoryName: subcategory?.name || null,
                    categoryName: category?.name || null,
                    categoryIcon: category?.icon || null,
                    categoryType: category?.type || null,
                    accountId: selectedAccountId!,
                    accountName: account?.name || '',
                    note: note || null,
                    description: description || null,
                    amount: type === 'expense' ? -Math.abs(parsedAmount) : Math.abs(parsedAmount),
                    date,
                });
            } else {
                await addTransaction({
                    type,
                    categoryId: selectedCategoryId,
                    subcategoryId: selectedSubcategoryId,
                    subcategoryName: subcategory?.name || null,
                    categoryName: category?.name || null,
                    categoryIcon: category?.icon || null,
                    categoryType: category?.type || null,
                    accountId: selectedAccountId!,
                    accountName: account?.name || '',
                    note: note || null,
                    description: description || null,
                    amount: type === 'expense' ? -Math.abs(parsedAmount) : Math.abs(parsedAmount),
                    date,
                });
            }
        }

        router.back();
    };

    const handleDelete = () => {
        if (!isEditing || !transactionId) return;

        const performDelete = async () => {
            await deleteTransaction(transactionId);
            router.back();
        };

        if (Platform.OS === 'web') {
            // Use browser confirm on web
            const confirmed = window.confirm(t('transactions.deleteConfirm'));
            if (confirmed) {
                performDelete();
            }
        } else {
            Alert.alert(
                t('transactions.deleteTransaction'),
                t('transactions.deleteConfirm'),
                [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                        text: t('common.delete'),
                        style: 'destructive',
                        onPress: performDelete,
                    },
                ]
            );
        }
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

    const getSubcategoryLabel = (id: string | null) => {
        if (!id) return t('transactions.selectSubcategory') || 'Select subcategory';
        const sub = subcategories.find(s => s.id === id);
        return sub ? sub.name : (t('transactions.selectSubcategory') || 'Select subcategory');
    };

    const handleCategorySelect = async (categoryId: string) => {
        setSelectedCategoryId(categoryId);
        setSelectedSubcategoryId(null);
        setShowCategoryPicker(false);

        // Load subcategories for the selected category
        if (subcategoriesEnabled && categoryId) {
            const subs = await getSubcategories(categoryId);
            setSubcategories(subs);
        } else {
            setSubcategories([]);
        }
    };

    const handleTypeChange = (newType: TransactionType) => {
        setType(newType);
        setSelectedCategoryId(null);
        setSelectedSubcategoryId(null);
        setSubcategories([]);
    };

    const validateForm = (): string | null => {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return t('transactions.invalidAmount');
        }
        if (type !== 'transfer') {
            if (!selectedCategoryId) {
                return t('transactions.categoryRequired');
            }
        }
        return null;
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
            {isEditing ? t("transactions.editTransaction") : t("transactions.newTransaction")}
          </Text>
          {isEditing ? (
            <Pressable
              onPress={handleDelete}
              className="w-8 items-center justify-center"
            >
              <Trash2 size={22} color="#EF4444" />
            </Pressable>
          ) : (
            <View className="w-8" />
          )}
        </View>

        <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
          {/* Type Selector */}
          <View
            className={`flex-row mb-5 rounded-xl overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-200"}`}
          >
            <Pressable
              className={`flex-1 py-3 items-center ${type === "income" ? "bg-cheddar-yellow" : ""}`}
              onPress={() => handleTypeChange("income")}
            >
              <Text
                className={`font-medium ${type === "income" ? "text-cheddar-dark" : isDark ? "text-gray-400" : "text-cheddar-gray"}`}
              >
                {t("transactions.type.income")}
              </Text>
            </Pressable>
            <Pressable
              className={`flex-1 py-3 items-center ${type === "expense" ? "bg-cheddar-yellow" : ""}`}
              onPress={() => handleTypeChange("expense")}
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

              <View className={`rounded-xl mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}>
                <View className="flex-row items-center justify-between px-4 pt-4 pb-1">
                  <Text
                    className={`text-xs font-medium uppercase ${isDark ? "text-gray-400" : "text-gray-500"}`}
                  >
                    {t("transactions.category")}
                  </Text>
                  <Pressable
                    onPress={() => router.push(type === 'income' ? '/configuration/income-categories' as never : '/configuration/expense-categories' as never)}
                    className="p-1"
                  >
                    <Pencil size={16} color="#FFB800" />
                  </Pressable>
                </View>
                <Pressable
                  className="px-4 pb-4"
                  onPress={() => setShowCategoryPicker(true)}
                >
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
              </View>
              {showCategoryPicker && (
                <View
                  className={`rounded-xl mb-3 overflow-hidden ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                >
                  {filteredCategories.map((cat) => (
                    <Pressable
                      key={cat.id}
                      className={`p-4 border-b flex-row items-center ${selectedCategoryId === cat.id ? (isDark ? "bg-gray-700" : "bg-yellow-50") : ""} ${isDark ? "border-gray-700" : "border-gray-100"}`}
                      onPress={() => handleCategorySelect(cat.id)}
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

              {/* Subcategory Selector - shown when subcategories are enabled and a category is selected */}
              {subcategoriesEnabled && selectedCategoryId && subcategories.length > 0 && (
                <Pressable
                  className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                  onPress={() => setShowSubcategoryPicker(!showSubcategoryPicker)}
                >
                  <Text
                    className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                  >
                    {t('transactions.subcategory') || 'Subcategory'}
                  </Text>
                  <Text
                    className={`text-base ${isDark ? "text-cheddar-light" : "text-cheddar-dark"} ${!selectedSubcategoryId ? "opacity-60" : ""}`}
                  >
                    {getSubcategoryLabel(selectedSubcategoryId)}
                  </Text>
                </Pressable>
              )}
              {showSubcategoryPicker && subcategories.length > 0 && (
                <View
                  className={`rounded-xl mb-3 overflow-hidden ${isDark ? "bg-[#26282D]" : "bg-white"}`}
                >
                  {subcategories.map((sub) => (
                    <Pressable
                      key={sub.id}
                      className={`p-4 border-b ${selectedSubcategoryId === sub.id ? (isDark ? "bg-gray-700" : "bg-yellow-50") : ""} ${isDark ? "border-gray-700" : "border-gray-100"}`}
                      onPress={() => {
                        setSelectedSubcategoryId(sub.id);
                        setShowSubcategoryPicker(false);
                      }}
                    >
                      <Text
                        className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                      >
                        {sub.name}
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