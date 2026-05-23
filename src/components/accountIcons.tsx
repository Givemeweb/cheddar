import {
  Wallet,
  PiggyBank,
  CreditCard,
  Landmark,
  Building2,
  CircleDollarSign,
  Banknote,
  TrendingUp,
  Gift,
  Briefcase,
  Utensils,
  Car,
  ShoppingCart,
  Film,
  Receipt,
  HeartPulse,
  Laptop,
  LucideIcon,
} from "lucide-react-native";

// Comprehensive icon map — includes both account and category icons.
// This ensures accounts created with any icon name (including from imports)
// will render correctly.
export const accountIconMap: Record<string, LucideIcon> = {
  // Account icons
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  "credit-card": CreditCard,
  landmark: Landmark,
  "building-2": Building2,
  "circle-dollar-sign": CircleDollarSign,
  banknote: Banknote,
  // Category icons (fallback for imported data, etc.)
  "trending-up": TrendingUp,
  gift: Gift,
  briefcase: Briefcase,
  utensils: Utensils,
  car: Car,
  "shopping-cart": ShoppingCart,
  film: Film,
  receipt: Receipt,
  "heart-pulse": HeartPulse,
  laptop: Laptop,
};

// Selection grid options — only the account-appropriate icons
export const accountIconOptions = [
  { name: 'wallet', icon: Wallet },
  { name: 'piggy-bank', icon: PiggyBank },
  { name: 'credit-card', icon: CreditCard },
  { name: 'landmark', icon: Landmark },
  { name: 'building-2', icon: Building2 },
  { name: 'circle-dollar-sign', icon: CircleDollarSign },
  { name: 'banknote', icon: Banknote },
];

export const renderAccountIcon = (
  iconName: string,
  size: number = 18,
  color: string = "#212226",
  showIcons: boolean = true,
) => {
  if (!showIcons) return null;
  const IconComponent = accountIconMap[iconName];
  if (IconComponent) {
    return <IconComponent size={size} color={color} />;
  }
  return null;
};
