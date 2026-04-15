import {
  useEffect,
  useState,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { View, ActivityIndicator, Text, useColorScheme } from "react-native";
import { initDatabase } from "../db/index";
import { initializeDatabase } from "../db/storage";

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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    async function setupDatabase() {
      try {
        console.log("Starting database initialization...");
        // Initialize the database connection first
        await initDatabase();
        console.log("Database connection established");
        // Then seed data if needed
        await initializeDatabase();
        console.log("Database seeded");
        setIsReady(true);
      } catch (err) {
        console.error("Database initialization error:", err);
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    setupDatabase();
  }, []);

  if (error) {
    return (
      <View className={`flex-1 items-center justify-center p-4 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <Text className="text-cheddar-expense text-lg text-center">
          Database error: {error}
        </Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View className={`flex-1 items-center justify-center ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <ActivityIndicator size="large" color="#FFB800" />
        <Text className={`mt-4 ${isDark ? 'text-gray-400' : 'text-cheddar-gray'}`}>Loading database...</Text>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={{ isReady }}>
      {children}
    </DatabaseContext.Provider>
  );
}
