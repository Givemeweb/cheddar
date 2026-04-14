import {
  useEffect,
  useState,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { getCategories, getAccounts, getTransactions } from "../db/storage";

type DatabaseContextType = {
  isReady: boolean;
};

const DatabaseContext = createContext<DatabaseContextType>({ isReady: false });

export function useDatabase() {
  return useContext(DatabaseContext);
}

interface DatabaseProviderProps {
  children: ReactNode;
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initDatabase() {
      try {
        // Initialize storage (seeds data if needed)
        await getCategories();
        await getAccounts();
        await getTransactions();
        setIsReady(true);
      } catch (err) {
        console.error("Database initialization error:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }

    initDatabase();
  }, []);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-cheddar-light">
        <Text className="text-cheddar-expense text-lg">
          Database error: {error}
        </Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View className="flex-1 items-center justify-center bg-cheddar-light">
        <ActivityIndicator size="large" color="#FFB800" />
        <Text className="text-cheddar-gray mt-4">Loading database...</Text>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={{ isReady }}>
      {children}
    </DatabaseContext.Provider>
  );
}
