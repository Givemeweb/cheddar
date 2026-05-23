import {
  Wallet,
  PiggyBank,
  CreditCard,
  Landmark,
  Building2,
  CircleDollarSign,
  Banknote,
  LucideIcon,
} from "lucide-react-native";

export const accountIconMap: Record<string, LucideIcon> = {
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  "credit-card": CreditCard,
  landmark: Landmark,
  "building-2": Building2,
  "circle-dollar-sign": CircleDollarSign,
  banknote: Banknote,
};

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
