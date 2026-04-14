import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Pressable,
    TextInput,
    ScrollView,
    Platform,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getCategories, getAccounts, addTransaction, Category, Account } from '@/src/db/storage';

type TransactionType = 'income' | 'expense' | 'transfer';

export default function AddTransactionScreen() {
    const router = useRouter();
    const [type, setType] = useState<TransactionType>('expense');
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
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

    useEffect(() => {
        loadData();
    }, []);

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

    const formatDate = (d: Date) => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        const dayName = days[d.getDay()];
        const hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${day}/${month}/${year} (${dayName}) ${ hour12}:${minutes} ${ampm}`;
    };

    const handleSave = async () => {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount)) return;

        if (type === 'transfer') {
            if (!fromAccountId || !toAccountId) return;
            await addTransaction({
                type: 'transfer',
                accountId: fromAccountId,
                toAccountId,
                note: note || null,
                description: description || null,
                amount: -Math.abs(parsedAmount),
                date,
            });
        } else {
            if (!selectedAccountId || !selectedCategoryId) return;
            await addTransaction({
                type,
                categoryId: selectedCategoryId,
                accountId: selectedAccountId,
                note: note || null,
                description: description || null,
                amount: type === 'expense' ? -Math.abs(parsedAmount) : Math.abs(parsedAmount),
                date,
            });
        }

        router.back();
    };

    const getAccountName = (id: string | null) => {
        if (!id) return 'Select account';
        const acc = accounts.find(a => a.id === id);
        return acc ? acc.name : 'Select account';
    };

    const getCategoryName = (id: string | null) => {
        if (!id) return 'Select category';
        const cat = categories.find(c => c.id === id);
        return cat ? `${cat.icon} ${cat.name}` : 'Select category';
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#FFB800" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.closeButton}>
                    <Text style={styles.closeIcon}>×</Text>
                </Pressable>
                <Text style={styles.title}>New Transaction</Text>
                <View style={styles.closeButton} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Type Selector*/}
                <View style={styles.typeContainer}>
                    <Pressable
                        style={[styles.typeButton, type === 'income' &&styles.typeActive]}
                        onPress={() => { setType('income'); setSelectedCategoryId(null); }}
                    >
                        <Text style={[styles.typeText, type === 'income' && styles.typeTextActive]}>
                            Income
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[styles.typeButton, type === 'expense' && styles.typeActive]}
                        onPress={() => { setType('expense'); setSelectedCategoryId(null); }}
                    >
                        <Text style={[styles.typeText, type === 'expense' && styles.typeTextActive]}>
                            Expense
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[styles.typeButton, type === 'transfer' && styles.typeActive]}
                        onPress={() => setType('transfer')}
                    >
                        <Text style={[styles.typeText, type === 'transfer' && styles.typeTextActive]}>
                            Transfer
                        </Text>
                    </Pressable>
                </View>

                {/* Date Picker */}
                <Pressable style={styles.fieldContainer} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.label}>Date</Text>
                    <Text style={styles.value}>{formatDate(date)}</Text>
                </Pressable>
                {showDatePicker && (
                    <DateTimePicker
                        value={date}
                        mode="datetime"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, selectedDate) => {
                            setShowDatePicker(Platform.OS === 'ios');
                            if (selectedDate) setDate(selectedDate);
                        }}
                    />
                )}

                {/* Account Selector for Income/Expense */}
                {type !== 'transfer' && (
                    <>
                        <Pressable style={styles.fieldContainer} onPress={() => setShowAccountPicker(true)}>
                            <Text style={styles.label}>Account</Text>
                            <Text style={styles.value}>{getAccountName(selectedAccountId)}</Text>
                        </Pressable>
                        {showAccountPicker && (
                            <View style={styles.pickerContainer}>
                                {accounts.map(acc => (
                                    <Pressable
                                        key={acc.id}
                                        style={[
                                            styles.pickerItem,
                                            selectedAccountId === acc.id && styles.pickerItemActive,
                                        ]}
                                        onPress={() => {
                                            setSelectedAccountId(acc.id);
                                            setShowAccountPicker(false);
                                        }}
                                    >
                                        <Text style={styles.pickerText}>{acc.name}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}

                        <Pressable style={styles.fieldContainer} onPress={() => setShowCategoryPicker(true)}>
                            <Text style={styles.label}>Category</Text>
                            <Text style={styles.value}>{getCategoryName(selectedCategoryId)}</Text>
                        </Pressable>
                        {showCategoryPicker && (
                            <View style={styles.pickerContainer}>
                                {filteredCategories.map(cat => (
                                    <Pressable
                                        key={cat.id}
                                        style={[
                                            styles.pickerItem,
                                            selectedCategoryId === cat.id && styles.pickerItemActive,
                                        ]}
                                        onPress={() => {
                                            setSelectedCategoryId(cat.id);
                                            setShowCategoryPicker(false);
                                        }}
                                    >
                                        <Text style={styles.pickerText}>{cat.icon} {cat.name}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </>
                )}

                {/* Transfer Account Selectors */}
                {type === 'transfer' && (
                    <>
                        <Pressable style={styles.fieldContainer} onPress={() => setShowFromPicker(true)}>
                            <Text style={styles.label}>From</Text>
                            <Text style={styles.value}>{getAccountName(fromAccountId)}</Text>
                        </Pressable>
                        {showFromPicker && (
                            <View style={styles.pickerContainer}>
                                {accounts.map(acc => (
                                    <Pressable
                                        key={acc.id}
                                        style={[
                                            styles.pickerItem,
                                            fromAccountId === acc.id && styles.pickerItemActive,
                                        ]}
                                        onPress={() => {
                                            setFromAccountId(acc.id);
                                            setShowFromPicker(false);
                                        }}
                                    >
                                        <Text style={styles.pickerText}>{acc.name}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}

                        <Pressable style={styles.fieldContainer} onPress={() => setShowToPicker(true)}>
                            <Text style={styles.label}>To</Text>
                            <Text style={styles.value}>{getAccountName(toAccountId)}</Text>
                        </Pressable>
                        {showToPicker && (
                            <View style={styles.pickerContainer}>
                                {accounts.map(acc => (
                                    <Pressable
                                        key={acc.id}
                                        style={[
                                            styles.pickerItem,
                                            toAccountId === acc.id && styles.pickerItemActive,
                                        ]}
                                        onPress={() => {
                                            setToAccountId(acc.id);
                                            setShowToPicker(false);
                                        }}
                                    >
                                        <Text style={styles.pickerText}>{acc.name}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </>
                )}

                {/* Amount */}
                <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Amount</Text>
                    <TextInput
                        style={styles.amountInput}
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#6B7280"
                    />
                </View>

                {/* Note */}
                <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Note</Text>
                    <TextInput
                        style={styles.textInput}
                        value={note}
                        onChangeText={setNote}
                        placeholder="Add a note"
                        placeholderTextColor="#6B7280"
                    />
                </View>

                {/* Description */}
                <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Description</Text>
                    <TextInput
                        style={[styles.textInput, styles.descriptionInput]}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Add a description"
                        placeholderTextColor="#6B7280"
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                    />
                </View>
            </ScrollView>

            {/* Save Button */}
            <View style={styles.footer}>
                <Pressable style={styles.saveButton} onPress={handleSave}>
                    <Text style={styles.saveButtonText}>Save Transaction</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    closeButton: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeIcon: {
        fontSize: 28,
        color: '#1A1A1A',
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1A1A1A',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    typeContainer: {
        flexDirection: 'row',
        marginBottom: 20,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#E5E7EB',
    },
    typeButton: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
    },
    typeActive: {
        backgroundColor: '#FFB800',
    },
    typeText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#6B7280',
    },
    typeTextActive: {
        color: '#1A1A1A',
        fontWeight: '600',
    },
    fieldContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    label: {
        fontSize: 12,
        color: '#6B7280',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    value: {
        fontSize: 16,
        color: '#1A1A1A',
    },
    pickerContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginBottom: 12,
        overflow: 'hidden',
    },
    pickerItem: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    pickerItemActive: {
        backgroundColor: '#FFF8E6',
    },
    pickerText: {
        fontSize: 16,
        color: '#1A1A1A',
    },
    amountInput: {
        fontSize: 24,
        fontWeight: '600',
        color: '#1A1A1A',
        padding: 0,
    },
    textInput: {
        fontSize: 16,
        color: '#1A1A1A',
        padding: 0,
    },
    descriptionInput: {
        minHeight: 80,
        paddingTop: 0,
    },
    footer: {
        padding: 16,
        paddingBottom: 32,
    },
    saveButton: {
        backgroundColor: '#FFB800',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1A1A1A',
    },
});