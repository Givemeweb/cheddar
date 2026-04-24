import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View,
    Text,
    Pressable,
    TextInput,
    ScrollView,
    ActivityIndicator,
    Alert,
    Platform,
    Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getCategories, getAccounts, getTransactions, addTransaction, updateTransaction, getTransactionById, deleteTransaction, Category, Account } from '@/src/db/storage';
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
    ChevronDown,
    ChevronUp,
} from 'lucide-react-native';
import { useTheme } from '@/src/components/ThemeProvider';

type TransactionType = 'income' | 'expense' | 'transfer';
type SelectionMode = 'none' | 'account' | 'category' | 'subcategory' | 'fromAccount' | 'toAccount';

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
    const [selectionMode, setSelectionMode] = useState<SelectionMode>('none');
    const [previousNotes, setPreviousNotes] = useState<string[]>([]);
    const [showNoteSuggestions, setShowNoteSuggestions] = useState(false);

    // Refs for auto-focus
    const amountRef = useRef<TextInput>(null);
    const noteRef = useRef<TextInput>(null);
    const descRef = useRef<TextInput>(null);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        const cats = await getCategories();
        const accs = await getAccounts();
        const subEnabled = await getSubcategoriesEnabled();
        const allTransactions = await getTransactions();

        // Extract unique non-empty notes from transactions
        const uniqueNotes = [...new Set(allTransactions.map(tx => tx.note).filter((note): note is string => !!note))];
        setPreviousNotes(uniqueNotes);

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
        setSelectionMode('none');

        // Load subcategories for the selected category
        if (subcategoriesEnabled && categoryId) {
            const subs = await getSubcategories(categoryId);
            setSubcategories(subs);
            // Auto-focus to subcategory if available
            if (subs.length > 0) {
                setSelectionMode('subcategory');
            } else {
                // Focus on amount input
                amountRef.current?.focus();
            }
        } else {
            setSubcategories([]);
            // Focus on amount input
            amountRef.current?.focus();
        }
    };

    const handleAccountSelect = (accountId: string) => {
        setSelectedAccountId(accountId);
        setSelectionMode('none');
        // Focus on category if not selected
        if (!selectedCategoryId) {
            setSelectionMode('category');
        } else if (subcategoriesEnabled && subcategories.length > 0 && !selectedSubcategoryId) {
            setSelectionMode('subcategory');
        } else {
            amountRef.current?.focus();
        }
    };

    const handleSubcategorySelect = (subcatId: string) => {
        setSelectedSubcategoryId(subcatId);
        setSelectionMode('none');
        // Focus on amount input
        amountRef.current?.focus();
    };

    const handleFromAccountSelect = (accountId: string) => {
        setFromAccountId(accountId);
        setSelectionMode('none');
        // Focus on "to account" if not selected
        if (!toAccountId) {
            setSelectionMode('toAccount');
        } else {
            amountRef.current?.focus();
        }
    };

    const handleToAccountSelect = (accountId: string) => {
        setToAccountId(accountId);
        setSelectionMode('none');
        // Focus on amount input
        amountRef.current?.focus();
    };

    const handleTypeChange = (newType: TransactionType) => {
        setType(newType);
        setSelectedCategoryId(null);
        setSelectedSubcategoryId(null);
        setSubcategories([]);
        setSelectionMode('none');
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

    const getMatchingNotes = (searchText: string): string[] => {
        if (!searchText.trim()) return [];
        const lowerSearch = searchText.toLowerCase();
        return previousNotes
            .filter(note => note.toLowerCase().includes(lowerSearch) && note.toLowerCase() !== lowerSearch)
            .slice(0, 5); // Limit to 5 suggestions
    };

    const renderHighlightedNote = (note: string, searchText: string) => {
        const lowerNote = note.toLowerCase();
        const lowerSearch = searchText.toLowerCase();
        const startIndex = lowerNote.indexOf(lowerSearch);

        if (startIndex === -1) {
            return <Text className={isDark ? "text-cheddar-light" : "text-cheddar-dark"}>{note}</Text>;
        }

        const beforeMatch = note.slice(0, startIndex);
        const match = note.slice(startIndex, startIndex + searchText.length);
        const afterMatch = note.slice(startIndex + searchText.length);

        return (
            <Text>
                {beforeMatch && <Text className={isDark ? "text-cheddar-light" : "text-cheddar-dark"}>{beforeMatch}</Text>}
                <Text className="text-cheddar-expense font-semibold">{match}</Text>
                {afterMatch && <Text className={isDark ? "text-cheddar-light" : "text-cheddar-dark"}>{afterMatch}</Text>}
            </Text>
        );
    };

    if (loading) {
        return (
            <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
                <ActivityIndicator size="large" color="#FFB800" />
            </SafeAreaView>
        );
    }

    const showBottomMenu = selectionMode !== 'none';

    return (
      <SafeAreaView
        className={`flex-1 ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"}`}
      >
        {/* Header */}
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

        {/* Main Content Area - Scrollable */}
        <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

          {/* Account Selector for Income/Expense - Tap to open bottom menu */}
          {type !== "transfer" && (
            <>
              <Pressable
                className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"} ${selectionMode === 'account' ? 'border-2 border-cheddar-yellow' : ''}`}
                onPress={() => {
                  Keyboard.dismiss();
                  setSelectionMode(selectionMode === 'account' ? 'none' : 'account');
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text
                      className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                    >
                      {t("transactions.account")}
                    </Text>
                    <View className="flex-row items-center">
                      <Text
                        className={`text-base ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                      >
                        {getAccountName(selectedAccountId)}
                      </Text>
                    </View>
                  </View>
                  <View className="ml-2">
                    {selectionMode === 'account' ? (
                      <ChevronUp size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                    ) : (
                      <ChevronDown size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                    )}
                  </View>
                </View>
              </Pressable>

              {/* Category Selector */}
              <View className={`rounded-xl mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"} ${selectionMode === 'category' ? 'border-2 border-cheddar-yellow' : ''}`}>
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
                  className="px-4 pb-4 flex-row items-center justify-between"
                  onPress={() => {
                    Keyboard.dismiss();
                    setSelectionMode(selectionMode === 'category' ? 'none' : 'category');
                  }}
                >
                  <View className="flex-row items-center flex-1">
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
                  <View className="ml-2">
                    {selectionMode === 'category' ? (
                      <ChevronUp size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                    ) : (
                      <ChevronDown size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                    )}
                  </View>
                </Pressable>
              </View>

              {/* Subcategory Selector */}
              {subcategoriesEnabled && selectedCategoryId && subcategories.length > 0 && (
                <Pressable
                  className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"} ${selectionMode === 'subcategory' ? 'border-2 border-cheddar-yellow' : ''}`}
                  onPress={() => {
                    Keyboard.dismiss();
                    setSelectionMode(selectionMode === 'subcategory' ? 'none' : 'subcategory');
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
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
                    </View>
                    <View className="ml-2">
                      {selectionMode === 'subcategory' ? (
                        <ChevronUp size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                      ) : (
                        <ChevronDown size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                      )}
                    </View>
                  </View>
                </Pressable>
              )}
            </>
          )}

          {/* Transfer Account Selectors */}
          {type === "transfer" && (
            <>
              <Pressable
                className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"} ${selectionMode === 'fromAccount' ? 'border-2 border-cheddar-yellow' : ''}`}
                onPress={() => {
                  Keyboard.dismiss();
                  setSelectionMode(selectionMode === 'fromAccount' ? 'none' : 'fromAccount');
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
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
                  </View>
                  <View className="ml-2">
                    {selectionMode === 'fromAccount' ? (
                      <ChevronUp size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                    ) : (
                      <ChevronDown size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                    )}
                  </View>
                </View>
              </Pressable>

              <Pressable
                className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"} ${selectionMode === 'toAccount' ? 'border-2 border-cheddar-yellow' : ''}`}
                onPress={() => {
                  Keyboard.dismiss();
                  setSelectionMode(selectionMode === 'toAccount' ? 'none' : 'toAccount');
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
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
                  </View>
                  <View className="ml-2">
                    {selectionMode === 'toAccount' ? (
                      <ChevronUp size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                    ) : (
                      <ChevronDown size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                    )}
                  </View>
                </View>
              </Pressable>
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
              ref={amountRef}
              className={`text-2xl font-semibold py-1 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
              onFocus={() => setSelectionMode('none')}
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
              ref={noteRef}
              className={`text-base py-1 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              value={note}
              onChangeText={(text) => {
                setNote(text);
                setShowNoteSuggestions(text.trim().length > 0 && getMatchingNotes(text).length > 0);
              }}
              onBlur={() => {
                // Delay hiding to allow selecting suggestions
                setTimeout(() => setShowNoteSuggestions(false), 200);
              }}
              onFocus={() => {
                setSelectionMode('none');
                if (note.trim().length > 0 && getMatchingNotes(note).length > 0) {
                    setShowNoteSuggestions(true);
                }
              }}
              placeholder={t("transactions.addNote")}
              placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            />
            {/* Autocomplete Dropdown */}
            {showNoteSuggestions && getMatchingNotes(note).length > 0 && (
              <View
                className={`mt-2 rounded-xl overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-100"}`}
              >
                {getMatchingNotes(note).map((suggestion, index) => (
                  <Pressable
                    key={index}
                    className={`p-3 border-b ${isDark ? "border-gray-600" : "border-gray-200"}`}
                    onPress={() => {
                      setNote(suggestion);
                      setShowNoteSuggestions(false);
                    }}
                  >
                    {renderHighlightedNote(suggestion, note)}
                  </Pressable>
                ))}
              </View>
            )}
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
              ref={descRef}
              className={`text-base py-1 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              style={{ minHeight: 80 }}
              value={description}
              onChangeText={setDescription}
              placeholder={t("transactions.addDescription")}
              placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
              multiline
              textAlignVertical="top"
              onFocus={() => setSelectionMode('none')}
            />
          </View>

          {/* Spacer for bottom menu */}
          <View className="h-4" />
        </ScrollView>

        {/* Bottom Selection Menu */}
        {showBottomMenu && (
          <View
            className={`${isDark ? "bg-[#1a1b1e]" : "bg-gray-50"} border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}
            style={{ maxHeight: '50%' }}
          >
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-700">
              <Text className={`font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}>
                {selectionMode === 'account' && t("transactions.selectAccount")}
                {selectionMode === 'category' && t("transactions.selectCategory")}
                {selectionMode === 'subcategory' && (t('transactions.subcategory') || 'Select subcategory')}
                {selectionMode === 'fromAccount' && t("transactions.from")}
                {selectionMode === 'toAccount' && t("transactions.to")}
              </Text>
              <Pressable
                onPress={() => setSelectionMode('none')}
                className="p-1"
              >
                <Text className="text-cheddar-yellow text-sm">{t('common.cancel') || 'Cancel'}</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 8 }}>
              <View className="flex-row flex-wrap">
                {selectionMode === 'account' && accounts.map((acc) => (
                  <Pressable
                    key={acc.id}
                    className={`w-1/3 p-2`}
                    onPress={() => handleAccountSelect(acc.id)}
                  >
                    <View
                      className={`rounded-xl p-3 items-center justify-center min-h-[60px] ${selectedAccountId === acc.id ? "bg-cheddar-yellow" : (isDark ? "bg-[#26282D]" : "bg-white")}`}
                    >
                      <Text
                        className={`text-center text-sm ${selectedAccountId === acc.id ? "text-cheddar-dark font-semibold" : (isDark ? "text-cheddar-light" : "text-cheddar-dark")}`}
                        numberOfLines={2}
                      >
                        {acc.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}

                {selectionMode === 'category' && filteredCategories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    className={`w-1/3 p-2`}
                    onPress={() => handleCategorySelect(cat.id)}
                  >
                    <View
                      className={`rounded-xl p-3 items-center justify-center min-h-[70px] ${selectedCategoryId === cat.id ? "bg-cheddar-yellow" : (isDark ? "bg-[#26282D]" : "bg-white")}`}
                    >
                      {showIcons && (
                        <View className="mb-1">
                          {renderIcon(
                            cat.icon,
                            22,
                            selectedCategoryId === cat.id ? "#212226" : (type === "income" ? "#10B981" : "#EF4444"),
                            showIcons,
                          )}
                        </View>
                      )}
                      <Text
                        className={`text-center text-sm ${selectedCategoryId === cat.id ? "text-cheddar-dark font-semibold" : (isDark ? "text-cheddar-light" : "text-cheddar-dark")}`}
                        numberOfLines={2}
                      >
                        {cat.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}

                {selectionMode === 'subcategory' && subcategories.map((sub) => (
                  <Pressable
                    key={sub.id}
                    className={`w-1/3 p-2`}
                    onPress={() => handleSubcategorySelect(sub.id)}
                  >
                    <View
                      className={`rounded-xl p-3 items-center justify-center min-h-[60px] ${selectedSubcategoryId === sub.id ? "bg-cheddar-yellow" : (isDark ? "bg-[#26282D]" : "bg-white")}`}
                    >
                      <Text
                        className={`text-center text-sm ${selectedSubcategoryId === sub.id ? "text-cheddar-dark font-semibold" : (isDark ? "text-cheddar-light" : "text-cheddar-dark")}`}
                        numberOfLines={2}
                      >
                        {sub.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}

                {selectionMode === 'fromAccount' && accounts.map((acc) => (
                  <Pressable
                    key={acc.id}
                    className={`w-1/3 p-2`}
                    onPress={() => handleFromAccountSelect(acc.id)}
                  >
                    <View
                      className={`rounded-xl p-3 items-center justify-center min-h-[60px] ${fromAccountId === acc.id ? "bg-cheddar-yellow" : (isDark ? "bg-[#26282D]" : "bg-white")}`}
                    >
                      <Text
                        className={`text-center text-sm ${fromAccountId === acc.id ? "text-cheddar-dark font-semibold" : (isDark ? "text-cheddar-light" : "text-cheddar-dark")}`}
                        numberOfLines={2}
                      >
                        {acc.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}

                {selectionMode === 'toAccount' && accounts.map((acc) => (
                  <Pressable
                    key={acc.id}
                    className={`w-1/3 p-2`}
                    onPress={() => handleToAccountSelect(acc.id)}
                  >
                    <View
                      className={`rounded-xl p-3 items-center justify-center min-h-[60px] ${toAccountId === acc.id ? "bg-cheddar-yellow" : (isDark ? "bg-[#26282D]" : "bg-white")}`}
                    >
                      <Text
                        className={`text-center text-sm ${toAccountId === acc.id ? "text-cheddar-dark font-semibold" : (isDark ? "text-cheddar-light" : "text-cheddar-dark")}`}
                        numberOfLines={2}
                      >
                        {acc.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Save Button */}
        <View className={`p-4 ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"} ${showBottomMenu ? 'pb-4' : 'pb-8'}`}>
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