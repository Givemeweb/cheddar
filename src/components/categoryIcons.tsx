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
  LucideIcon,
} from "lucide-react-native";

export const categoryIconMap: Record<string, LucideIcon> = {
  "trending-up": TrendingUp,
  gift: Gift,
  briefcase: Briefcase,
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  utensils: Utensils,
  car: Car,
  "shopping-cart": ShoppingCart,
  film: Film,
  receipt: Receipt,
  "heart-pulse": HeartPulse,
  laptop: Laptop,
};

export const categoryIconOptions = Object.entries(categoryIconMap).map(
  ([name, icon]) => ({ name, icon })
);

export const renderCategoryIcon = (
  iconName: string,
  size: number = 18,
  color: string = "#212226",
  showIcons: boolean = true,
) => {
  if (!showIcons) return null;
  const IconComponent = categoryIconMap[iconName];
  if (IconComponent) {
    return <IconComponent size={size} color={color} />;
  }
  return null;
};
