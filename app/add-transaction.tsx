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
    Image,
    ActionSheetIOS,
    Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { getCategories, getAccounts, getTransactions, addTransaction, updateTransaction, getTransactionById, deleteTransaction, Category, Account } from '@/src/db/storage';
import { getSubcategoriesEnabled, getSubcategories, type Subcategory } from '@/src/db';
import { saveImage, deleteImage, getImageUri } from '@/src/utils/imageStorage';
import DateTimePicker from '@/src/components/DateTimePicker';
import { categoryIconMap } from '@/src/components/categoryIcons';
import {
    StopCircle,
    Pencil,
    Trash2,
    ChevronDown,
    ChevronUp,
    Camera,
    Image as ImageIcon,
    X,
    Check,
} from 'lucide-react-native';
import { useTheme } from '@/src/components/ThemeProvider';
import { CURRENCIES, getCurrencySymbol, resolveAccountCurrency, convertAmountWithRates } from '@/src/db/currency';
import { formatNumber } from '@/src/utils/formatNumber';

type TransactionType = 'income' | 'expense' | 'transfer';
type SelectionMode = 'none' | 'account' | 'category' | 'subcategory' | 'fromAccount' | 'toAccount';

const renderIcon = (
  iconName: string,
  size: number = 16,
  color: string = "#212226",
  showIcons: boolean = true,
) => {
  if (!showIcons) return null;
  const IconComponent = categoryIconMap[iconName];
  if (IconComponent) {
    return <IconComponent size={size} color={color} />;
  }
  return <StopCircle size={size} color={color} />;
};

export default function AddTransactionScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        transactionId?: string;
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
    }>();
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
    const [currency, setCurrency] = useState<string | null>(null);
    const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
    const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
    const [rateError, setRateError] = useState<string | null>(null);
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
    const [imagePath, setImagePath] = useState<string | null>(null);
    const [displayImageUri, setDisplayImageUri] = useState<string | null>(null);
    const [imageLoading, setImageLoading] = useState(false);

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
                setCurrency(existingTx.currency || null);
                setImagePath(existingTx.imagePath || null);
                if (existingTx.imagePath) {
                    setDisplayImageUri(getImageUri(existingTx.imagePath));
                }

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
                setSelectedAccountId(params.accountId || accs[0].id);
                setFromAccountId(params.fromAccountId || accs[0].id);
                if (accs.length > 1) {
                    setToAccountId(params.toAccountId || accs[1].id);
                } else {
                    setToAccountId(params.toAccountId || null);
                }
            }

            // Apply search params for new transactions
            if (params.type === 'income' || params.type === 'expense' || params.type === 'transfer') {
                setType(params.type);
            }
            if (params.amount) {
                setAmount(params.amount);
            }
            if (params.note) {
                setNote(params.note);
            }
            if (params.description) {
                setDescription(params.description);
            }
            if (params.date) {
                const parsedDate = new Date(params.date);
                if (!isNaN(parsedDate.getTime())) {
                    setDate(parsedDate);
                }
            }
            if (params.categoryId) {
                setSelectedCategoryId(params.categoryId);
                // Load subcategories if needed
                if (subEnabled) {
                    const subs = await getSubcategories(params.categoryId);
                    setSubcategories(subs);
                }
            }
            if (params.subcategoryId) {
                setSelectedSubcategoryId(params.subcategoryId);
            }
            if (params.imagePath) {
                setImagePath(params.imagePath);
                setDisplayImageUri(getImageUri(params.imagePath));
            }
        }
        setLoading(false);

        // Auto-focus account selection for new transactions only if no relevant params provided
        const hasPreselectedValues = params.type || params.accountId || params.fromAccountId || params.categoryId || params.amount;
        if (!isEditing && accs.length > 0 && (!hasPreselectedValues || params.type === 'transfer')) {
            // Small delay to ensure UI is ready
            setTimeout(() => {
                // `type` state may be stale inside this closure — check params too
                if (type === 'transfer' || params.type === 'transfer') {
                    setSelectionMode('fromAccount');
                } else {
                    setSelectionMode('account');
                }
            }, 100);
        }
    };

    const filteredCategories = categories.filter(c =>
        type === 'income' ? c.type === 'income' : c.type === 'expense'
    );

    // Currency the user is entering the amount in. null means "the account's
    // currency", which is the default and needs no conversion.
    const amountAccount = accounts.find(a => a.id === (type === 'transfer' ? fromAccountId : selectedAccountId));
    const accountCurrency = resolveAccountCurrency(amountAccount?.currency);
    const effectiveCurrency = currency ?? accountCurrency;

    // Live preview: convert the typed amount into the account currency so the
    // balance change is visible before saving.
    useEffect(() => {
        const parsed = parseFloat(amount.replace(',', '.'));
        if (!parsed || parsed <= 0 || effectiveCurrency === accountCurrency) {
            setConvertedAmount(null);
            setRateError(null);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const value = await convertAmountWithRates(parsed, effectiveCurrency, accountCurrency);
                if (!cancelled) {
                    setConvertedAmount(value);
                    setRateError(null);
                }
            } catch {
                if (!cancelled) {
                    setConvertedAmount(null);
                    setRateError(t('transactions.rateUnavailable', { from: effectiveCurrency, to: accountCurrency }));
                }
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [amount, effectiveCurrency, accountCurrency, t]);

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

        const parsedAmount = parseFloat(amount.replace(',', '.'));

        // Convert into the account currency, because account balances are kept
        // in that currency. Same-currency entries skip the network entirely.
        const targetCurrency = accountCurrency;
        let savingAmount = parsedAmount;
        if (effectiveCurrency !== targetCurrency) {
            try {
                savingAmount = await convertAmountWithRates(parsedAmount, effectiveCurrency, targetCurrency);
            } catch {
                Alert.alert(
                    t('transactions.error'),
                    t('transactions.rateUnavailable', { from: effectiveCurrency, to: targetCurrency })
                );
                return;
            }
        }

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
                    amount: -Math.abs(savingAmount),
                    date,
                    imagePath: imagePath,
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
                    amount: -Math.abs(savingAmount),
                    date,
                    imagePath: imagePath,
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
                    amount: type === 'expense' ? -Math.abs(savingAmount) : Math.abs(savingAmount),
                    date,
                    imagePath: imagePath,
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
                    amount: type === 'expense' ? -Math.abs(savingAmount) : Math.abs(savingAmount),
                    date,
                    imagePath: imagePath,
                });
            }
        }

        router.back();
    };

    const handleDelete = () => {
        if (!isEditing || !transactionId) return;

        const performDelete = async () => {
            // Delete associated image if exists
            if (imagePath) {
                await deleteImage(imagePath);
            }
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

    const pickImage = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                if (Platform.OS === 'web') {
                    window.alert(t('transactions.imagePermissionRequired') || 'Permission required to access photos');
                } else {
                    Alert.alert(
                        t('transactions.permissionRequired') || 'Permission Required',
                        t('transactions.imagePermissionRequired') || 'Please grant photo library access to attach images'
                    );
                }
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                setImageLoading(true);
                // Delete old image if exists
                if (imagePath) {
                    await deleteImage(imagePath);
                }
                const savedPath = await saveImage(result.assets[0].uri);
                if (savedPath) {
                    setImagePath(savedPath);
                    // For display, use the constructed path for saved images
                    setDisplayImageUri(getImageUri(savedPath));
                }
                setImageLoading(false);
            }
        } catch (error) {
            console.error('Error picking image:', error);
            setImageLoading(false);
        }
    };

    const takePhoto = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                if (Platform.OS === 'web') {
                    window.alert(t('transactions.cameraPermissionRequired') || 'Permission required to access camera');
                } else {
                    Alert.alert(
                        t('transactions.permissionRequired') || 'Permission Required',
                        t('transactions.cameraPermissionRequired') || 'Please grant camera access to take photos'
                    );
                }
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                setImageLoading(true);
                // Delete old image if exists
                if (imagePath) {
                    await deleteImage(imagePath);
                }
                const savedPath = await saveImage(result.assets[0].uri);
                if (savedPath) {
                    setImagePath(savedPath);
                    // For display, use the constructed path for saved images
                    setDisplayImageUri(getImageUri(savedPath));
                }
                setImageLoading(false);
            }
        } catch (error) {
            console.error('Error taking photo:', error);
            setImageLoading(false);
        }
    };

    const showImagePicker = () => {
        Keyboard.dismiss();

        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: [
                        t('transactions.takePhoto') || 'Take Photo',
                        t('transactions.chooseFromLibrary') || 'Choose from Library',
                        t('common.cancel') || 'Cancel'
                    ],
                    cancelButtonIndex: 2,
                },
                (buttonIndex) => {
                    if (buttonIndex === 0) {
                        takePhoto();
                    } else if (buttonIndex === 1) {
                        pickImage();
                    }
                }
            );
        } else if (Platform.OS === 'web') {
            // On web, go directly to image library (no camera prompt)
            pickImage();
        } else {
            // Android: show alert with camera + library options
            Alert.alert(
                t('transactions.image') || 'Image',
                '',
                [
                    {
                        text: t('transactions.takePhoto') || 'Take Photo',
                        onPress: takePhoto,
                    },
                    {
                        text: t('transactions.chooseFromLibrary') || 'Choose from Library',
                        onPress: pickImage,
                    },
                    {
                        text: t('common.cancel') || 'Cancel',
                        style: 'cancel',
                    },
                ]
            );
        }
    };

    const removeImage = async () => {
        if (imagePath) {
            await deleteImage(imagePath);
            setImagePath(null);
            setDisplayImageUri(null);
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
        setCurrency(null);
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
        setCurrency(null);
        setSelectionMode('toAccount');
    };

    const handleToAccountSelect = (accountId: string) => {
        setToAccountId(accountId);
        setSelectionMode('none');
        // Focus on amount input
        amountRef.current?.focus();
    };

    const handleTypeChange = (newType: TransactionType) => {
        setType(newType);
        setCurrency(null);
        setSelectedCategoryId(null);
        setSelectedSubcategoryId(null);
        setSubcategories([]);
        if (newType === 'transfer') {
            setSelectionMode('fromAccount');
        } else {
            setSelectionMode('account');
        }
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
              onPress={() => handleTypeChange("transfer")}
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
            <Pressable
              onPress={() => amountRef.current?.focus()}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 24 }}
            >
              <Text
                className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("transactions.amount")}
              </Text>
            </Pressable>
            <View className="flex-row items-center">
              <TextInput
                ref={amountRef}
                className={`flex-1 text-2xl font-semibold py-1 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                onFocus={() => setSelectionMode('none')}
              />
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setShowCurrencyPicker(true);
                }}
                className={`flex-row items-center ml-2 px-3 py-1.5 rounded-full ${
                  isDark ? "bg-[#33353B]" : "bg-gray-100"
                }`}
              >
                <Text className={`text-sm font-semibold mr-1 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}>
                  {getCurrencySymbol(effectiveCurrency)} {effectiveCurrency}
                </Text>
                <ChevronDown size={14} color={isDark ? "#9CA3AF" : "#6B7280"} />
              </Pressable>
            </View>
            {effectiveCurrency !== accountCurrency && convertedAmount !== null && (
              <Text className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {t("transactions.convertedTo", {
                  amount: formatNumber(convertedAmount),
                  currency: accountCurrency,
                  account: amountAccount?.name || '',
                })}
              </Text>
            )}
            {rateError && (
              <Text className="text-xs mt-1 text-red-500">{rateError}</Text>
            )}
          </View>

          {/* Note */}
          <View
            className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          >
            <Pressable
              onPress={() => noteRef.current?.focus()}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 24 }}
            >
              <Text
                className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("transactions.note")}
              </Text>
            </Pressable>
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
                      Keyboard.dismiss();
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
            <Pressable
              onPress={() => descRef.current?.focus()}
              hitSlop={{ top: 8, bottom: 8, left: 0, right: 24 }}
            >
              <Text
                className={`text-xs font-medium uppercase mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("transactions.description")}
              </Text>
            </Pressable>
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

          {/* Image Attachment */}
          <View
            className={`rounded-xl p-4 mb-3 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          >
            <Text
              className={`text-xs font-medium uppercase mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("transactions.image") || "Image (Optional)"}
            </Text>

            {imageLoading ? (
              <View className="items-center justify-center py-6">
                <ActivityIndicator size="large" color="#FFB800" />
              </View>
            ) : displayImageUri ? (
              <View className="relative">
                <Image
                  source={{ uri: displayImageUri }}
                  className="w-full h-48 rounded-lg"
                  resizeMode="cover"
                />
                <Pressable
                  onPress={removeImage}
                  className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                >
                  <X size={18} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={showImagePicker}
                className={`flex-row items-center justify-center py-6 rounded-lg border-2 border-dashed ${isDark ? "border-gray-600" : "border-gray-300"}`}
              >
                <View className="items-center">
                  <ImageIcon size={28} color={isDark ? "#9CA3AF" : "#6B7280"} />
                  <Text className={`mt-2 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {t("transactions.addImage") || "Add Image"}
                  </Text>
                </View>
              </Pressable>
            )}
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

                {selectionMode === 'toAccount' && accounts.map((acc) => {
                  const isDisabled = acc.id === fromAccountId;
                  return (
                    <Pressable
                      key={acc.id}
                      className={`w-1/3 p-2`}
                      disabled={isDisabled}
                      onPress={() => handleToAccountSelect(acc.id)}
                    >
                      <View
                        className={`rounded-xl p-3 items-center justify-center min-h-[60px] ${toAccountId === acc.id ? "bg-cheddar-yellow" : isDisabled ? "bg-gray-500/20" : (isDark ? "bg-[#26282D]" : "bg-white")}`}
                      >
                        <Text
                          className={`text-center text-sm ${toAccountId === acc.id ? "text-cheddar-dark font-semibold" : isDisabled ? "text-gray-500" : (isDark ? "text-cheddar-light" : "text-cheddar-dark")}`}
                          numberOfLines={2}
                        >
                          {acc.name}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
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

        {/* Currency Picker */}
        <Modal
          visible={showCurrencyPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCurrencyPicker(false)}
        >
          <View className="flex-1 bg-black/50 justify-end">
            <Pressable className="absolute inset-0" onPress={() => setShowCurrencyPicker(false)} />
            <View className={`rounded-t-2xl max-h-[75%] ${isDark ? "bg-[#26282D]" : "bg-white"}`}>
              <View className={`flex-row items-center justify-between px-4 py-3 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                <Text className={`text-lg font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}>
                  {t("transactions.selectCurrency")}
                </Text>
                <Pressable onPress={() => setShowCurrencyPicker(false)} className="p-2">
                  <X size={22} color={isDark ? "#9CA3AF" : "#6B7280"} />
                </Pressable>
              </View>
              <ScrollView>
                {CURRENCIES.map((c) => {
                  const selected = c.code === effectiveCurrency;
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => {
                        setCurrency(c.code === accountCurrency ? null : c.code);
                        setShowCurrencyPicker(false);
                      }}
                      className={`flex-row items-center px-4 py-3 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}
                    >
                      <Text className={`text-xl w-10 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}>
                        {c.symbol}
                      </Text>
                      <View className="flex-1">
                        <Text className={`text-base ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}>
                          {c.name}
                        </Text>
                        <Text className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                          {c.code}
                        </Text>
                      </View>
                      {selected && <Check size={20} color="#FFB800" />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
}