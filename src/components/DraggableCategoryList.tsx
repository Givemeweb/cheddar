import React, { useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronRight, GripVertical, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { Category } from '@/src/db/storage';

const DEFAULT_ROW_HEIGHT = 60;
const DRAG_SLOP = 2;

interface DraggableRowProps {
  index: number;
  isFirst: boolean;
  isDark: boolean;
  onDrop: (fromIndex: number, dy: number) => void;
  onMeasure: (height: number) => void;
  children: React.ReactNode;
}

function DraggableRow({ index, isFirst, isDark, onDrop, onMeasure, children }: DraggableRowProps) {
  const [dragging, setDragging] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;
  const dyRef = useRef(0);
  const draggingRef = useRef(false);
  const indexRef = useRef(index);
  const onDropRef = useRef(onDrop);

  indexRef.current = index;
  onDropRef.current = onDrop;

  const setDragActive = (active: boolean) => {
    draggingRef.current = active;
    setDragging(active);
  };

  const reset = () => {
    dyRef.current = 0;
    setDragActive(false);
    translateY.setValue(0);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dyRef.current = 0;
        setDragActive(false);
      },
      onPanResponderMove: (_event, gesture) => {
        // No hold needed: as soon as the grip moves, the row is being dragged.
        if (!draggingRef.current) {
          if (Math.abs(gesture.dy) < DRAG_SLOP) return;
          setDragActive(true);
        }
        dyRef.current = gesture.dy;
        translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: () => {
        if (draggingRef.current) {
          onDropRef.current(indexRef.current, dyRef.current);
        }
        reset();
      },
      onPanResponderTerminate: reset,
    })
  ).current;

  const { t } = useTranslation();

  return (
    <Animated.View
      onLayout={isFirst ? event => onMeasure(event.nativeEvent.layout.height) : undefined}
      className={`flex-row items-center justify-between p-4 ${
        isFirst ? '' : isDark ? 'border-t border-gray-700' : 'border-t border-gray-100'
      }`}
      style={{
        transform: [{ translateY }, { scale: dragging ? 1.02 : 1 }],
        zIndex: dragging ? 20 : 0,
        elevation: dragging ? 6 : 0,
        backgroundColor: dragging ? (isDark ? '#33353B' : '#F3F4F6') : 'transparent',
        borderRadius: dragging ? 12 : 0,
        shadowColor: '#000',
        shadowOpacity: dragging ? 0.2 : 0,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      {children}
      <View
        {...pan.panHandlers}
        accessibilityRole="button"
        accessibilityLabel={t('categories.reorderCategory')}
        className="p-2 -mr-2 ml-1"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <GripVertical size={22} color={isDark ? '#6B7280' : '#9CA3AF'} />
      </View>
    </Animated.View>
  );
}

interface DraggableCategoryListProps {
  categories: Category[];
  isDark: boolean;
  subcategoriesEnabled: boolean;
  renderIcon: (iconName: string) => React.ReactNode;
  onPressCategory: (category: Category) => void;
  onDeleteCategory: (category: Category) => void;
  onReorder: (categories: Category[]) => void;
}

export function DraggableCategoryList({
  categories,
  isDark,
  subcategoriesEnabled,
  renderIcon,
  onPressCategory,
  onDeleteCategory,
  onReorder,
}: DraggableCategoryListProps) {
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;

  const handleDrop = (fromIndex: number, dy: number) => {
    const offset = Math.round(dy / rowHeightRef.current);
    const toIndex = Math.max(0, Math.min(categories.length - 1, fromIndex + offset));
    if (toIndex === fromIndex) return;

    const next = [...categories];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorder(next);
  };

  const handleMeasure = (height: number) => {
    if (height > 0 && Math.abs(height - rowHeightRef.current) > 1) {
      setRowHeight(height);
    }
  };

  return (
    <View className={`rounded-xl ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}>
      {categories.map((category, index) => (
        <DraggableRow
          key={category.id}
          index={index}
          isFirst={index === 0}
          isDark={isDark}
          onDrop={handleDrop}
          onMeasure={handleMeasure}
        >
          <Pressable
            onPress={() => onPressCategory(category)}
            className="flex-row items-center flex-1"
          >
            <View className="mr-3">{renderIcon(category.icon)}</View>
            <Text
              numberOfLines={1}
              className={`text-lg flex-1 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
            >
              {category.name}
            </Text>
            {subcategoriesEnabled && (
              <ChevronRight size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
            )}
          </Pressable>
          <TouchableOpacity
            onPress={event => {
              event.preventDefault();
              event.stopPropagation();
              onDeleteCategory(category);
            }}
            className="p-2"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Trash2 size={22} color="#EF4444" />
          </TouchableOpacity>
        </DraggableRow>
      ))}
    </View>
  );
}
