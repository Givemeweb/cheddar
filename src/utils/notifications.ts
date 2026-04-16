import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getAlarmSettings } from "../db/storage";

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

export async function scheduleAlarmNotification(): Promise<string | null> {
  const settings = await getAlarmSettings();

  if (!settings.enabled) {
    return null;
  }

  // Get notification content fromi18n - using hardcoded for now
  const title = "Time to track your expenses!";
  const body = "Don't forget to add your transactions for today.";

  // Cancel any existing alarm notifications first
  await cancelAlarmNotifications();

  // Schedule for each selected day
  const notificationIds: string[] = [];

  for (const dayOfWeek of settings.days) {
    const [hours, minutes] = settings.time.split(":").map(Number);

    // Calculate next occurrence of this day/time
    const now = new Date();
    let scheduledDate = new Date();
    scheduledDate.setHours(hours, minutes, 0, 0);

    // Find the next occurrence of the target day
    const currentDay = now.getDay();
    let daysUntilTarget = dayOfWeek - currentDay;
    if (daysUntilTarget < 0 || (daysUntilTarget === 0 && scheduledDate <= now)) {
      daysUntilTarget += 7;
    }
    scheduledDate.setDate(scheduledDate.getDate() + daysUntilTarget);

    // If the time has alreadypassed today, schedule for next week
    if (daysUntilTarget === 0 && scheduledDate <= now) {
      scheduledDate.setDate(scheduledDate.getDate() + 7);
    }

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: dayOfWeek + 1, // Expo uses 1-7 for Sunday-Saturday
        hour: hours,
        minute: minutes,
      },
    });

    notificationIds.push(identifier);
  }

  return notificationIds.join(",");
}

export async function cancelAlarmNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return await Notifications.getAllScheduledNotificationsAsync();
}

export async function initializeNotifications(): Promise<void> {
  // Request permissions on app start
  const granted = await requestNotificationPermissions();
  if (!granted) {
    console.log("Notification permissions not granted");
    return;
  }

  // Configure Android channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("alarms", {
      name: "Expense Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FFB800",
    });
  }
}