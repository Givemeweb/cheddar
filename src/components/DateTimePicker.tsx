import React, { useState, useRef, useCallback } from 'react';

import {
    View,
    Text,
    Pressable,
    Modal,
    Platform,
    StyleSheet,
} from 'react-native';
import DateTimePickerNative from '@react-native-community/datetimepicker';

type DateTimePickerProps = {
    value: Date;
    onChange: (date: Date) => void;
    mode?: 'date' | 'time' | 'datetime';
    display?: 'default' | 'spinner' | 'calendar' | 'clock';
};

const formatDateShort = (d: Date) => {
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

const formatTimeShort = (d: Date) => {
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
};

const formatDateTime = (d: Date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const dayName = days[d.getDay()];
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${day}/${month}/${year} (${dayName}) ${hour12}:${minutes} ${ampm}`;
};

export default function DateTimePicker({
    value,
    onChange,
    mode = 'datetime',
    display = 'default',
}: DateTimePickerProps) {
    const [showPicker, setShowPicker] = useState(false);
    const [tempDate, setTempDate] = useState(new Date(value));

    // Keep onChange stable so the Android native dialog isn't dismissed on parent re-renders
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    // Web implementation using native HTML inputs
    if (Platform.OS === 'web') {
        const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const newDate = new Date(e.target.value);
            if (!isNaN(newDate.getTime())) {
                const updated = new Date(value);
                updated.setFullYear(newDate.getFullYear());
                updated.setMonth(newDate.getMonth());
                updated.setDate(newDate.getDate());
                onChangeRef.current(updated);
            }
        };

        const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const [hours, minutes] = e.target.value.split(':').map(Number);
            if (!isNaN(hours) && !isNaN(minutes)) {
                const updated = new Date(value);
                updated.setHours(hours);
                updated.setMinutes(minutes);
                onChangeRef.current(updated);
            }
        };

        const formatWebDate = (d: Date) => {
            const year = d.getFullYear();
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const day = d.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const formatWebTime = (d: Date) => {
            const hours = d.getHours().toString().padStart(2, '0');
            const minutes = d.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        };

        const webInputStyle: React.CSSProperties = {
            fontSize: 16,
            padding: 12,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            borderRadius: 12,
            backgroundColor: "#FFFFFF",
            color: "#212226",
        };

        const webDateInputStyle: React.CSSProperties = {
            ...webInputStyle,
            flex: 1,
        };

        const webTimeInputStyle: React.CSSProperties = {
            ...webInputStyle,
            width: 120,
        };

        return (
            <View style={styles.webContainer}>
                {mode === 'datetime' && (
                    <>
                        <input
                            type="date"
                            value={formatWebDate(value)}
                            onChange={handleDateChange}
                            style={webDateInputStyle}
                        />
                        <input
                            type="time"
                            value={formatWebTime(value)}
                            onChange={handleTimeChange}
                            style={webTimeInputStyle}
                        />
                    </>
                )}
                {mode === 'date' && (
                    <input
                        type="date"
                        value={formatWebDate(value)}
                        onChange={handleDateChange}
                        style={webDateInputStyle}
                    />
                )}
                {mode === 'time' && (
                    <input
                        type="time"
                        value={formatWebTime(value)}
                        onChange={handleTimeChange}
                        style={webTimeInputStyle}
                    />
                )}
            </View>
        );
    }

    // iOS implementation - show modal with spinner picker
    if (Platform.OS === 'ios') {
        return (
            <>
                <Pressable style={styles.trigger} onPress={() => {
                    setTempDate(new Date(value));
                    setShowPicker(true);
                }}>
                    <Text style={styles.triggerText}>
                        {mode === 'date' && formatDateShort(value)}
                        {mode === 'time' && formatTimeShort(value)}
                        {mode === 'datetime' && formatDateTime(value)}
                    </Text>
                </Pressable>

                <Modal
                    transparent
                    visible={showPicker}
                    animationType="slide"
                >
                    <Pressable
                        style={styles.modalOverlay}
                        onPress={() => setShowPicker(false)}
                    >
                        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                            <View style={styles.modalHeader}>
                                <Pressable onPress={() => setShowPicker(false)}>
                                    <Text style={styles.cancelButton}>Cancel</Text>
                                </Pressable>
                                <Pressable onPress={() => {
                                    onChangeRef.current(tempDate);
                                    setShowPicker(false);
                                }}>
                                    <Text style={styles.doneButton}>Done</Text>
                                </Pressable>
                            </View>
                            <DateTimePickerNative
                                value={tempDate}
                                mode={mode}
                                display="spinner"
                                onChange={(event, selectedDate) => {
                                    if (selectedDate) setTempDate(selectedDate);
                                }}
                            />
                        </Pressable>
                    </Pressable>
                </Modal>
            </>
        );
    }

    // Android implementation - native picker dialog
    // Android does not support mode="datetime", so we use two sequential pickers.
    // The onChange callback MUST be stable (via ref) so parent re-renders don't
    // dismiss the dialog. The library's Android component re-opens the native
    // dialog whenever onChange changes (it's in a useEffect dep array).
    const [androidPickerMode, setAndroidPickerMode] = useState<'date' | 'time' | null>(null);
    const [androidDate, setAndroidDate] = useState<Date>(new Date(value));

    // Stable callback that never changes - calls the latest ref implementation
    const stableOnChange = useCallback((event: any, selectedDate?: Date) => {
        if (!selectedDate) {
            setAndroidPickerMode(null);
            return;
        }

        if (mode === 'datetime' && androidPickerMode === 'date') {
            // Date selected, preserve time and open time picker
            const updated = new Date(selectedDate);
            updated.setHours(value.getHours());
            updated.setMinutes(value.getMinutes());
            setAndroidDate(updated);
            setAndroidPickerMode('time');
        } else {
            // Time selected (or single-mode picker)
            setAndroidPickerMode(null);
            if (mode === 'datetime') {
                const final = new Date(androidDate);
                final.setHours(selectedDate.getHours());
                final.setMinutes(selectedDate.getMinutes());
                onChangeRef.current(final);
            } else {
                onChangeRef.current(selectedDate);
            }
        }
    }, [mode, androidPickerMode, value, androidDate]);

    const openAndroidPicker = useCallback(() => {
        setAndroidDate(new Date(value));
        if (mode === 'datetime') {
            setAndroidPickerMode('date');
        } else {
            setAndroidPickerMode(mode);
        }
    }, [mode, value]);

    return (
        <>
            <Pressable style={styles.trigger} onPress={openAndroidPicker}>
                <Text style={styles.triggerText}>
                    {mode === 'date' && formatDateShort(value)}
                    {mode === 'time' && formatTimeShort(value)}
                    {mode === 'datetime' && formatDateTime(value)}
                </Text>
            </Pressable>
            {androidPickerMode && (
                <DateTimePickerNative
                    value={androidDate}
                    mode={androidPickerMode}
                    display={display}
                    onChange={stableOnChange}
                />
            )}
        </>
    );
}

const styles = StyleSheet.create({
  webContainer: {
    flexDirection: "row",
    gap: 12,
  },
  trigger: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  triggerText: {
    fontSize: 16,
    color: "#212226",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  cancelButton: {
    fontSize: 16,
    color: "#6B7280",
  },
  doneButton: {
    fontSize: 16,
    color: "#FFB800",
    fontWeight: "600",
  },
});
