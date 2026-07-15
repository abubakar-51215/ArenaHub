import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/services/notifications";

const EVENT_ICON: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  booking_confirmed: { icon: "checkmark-circle", color: Colors.light.success },
  booking_cancelled: {
    icon: "close-circle-outline",
    color: Colors.light.destructive,
  },
  booking_payment_failed: {
    icon: "alert-circle-outline",
    color: Colors.light.destructive,
  },
  booking_reminder_24h: { icon: "alarm-outline", color: Colors.light.warning },
  booking_reminder_1h: { icon: "alarm-outline", color: Colors.light.warning },
  new_confirmed_booking: {
    icon: "checkmark-circle",
    color: Colors.light.success,
  },
  refund_initiated: { icon: "card-outline", color: Colors.light.tint },
};
const DEFAULT_ICON = {
  icon: "notifications-outline" as const,
  color: Colors.light.tint,
};

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => listMyNotifications(),
  });

  const notifications = data?.items ?? [];

  async function handlePress(item: AppNotification) {
    if (item.read_at) return;
    await markNotificationRead(item.id);
    queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
  }

  async function handleMarkAll() {
    await markAllNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <Pressable onPress={handleMarkAll} disabled={!data?.unread_count}>
          <Text
            style={[styles.markAll, { opacity: data?.unread_count ? 1 : 0.3 }]}
          >
            Mark all read
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator
          color={Colors.light.tint}
          style={{ marginTop: 32 }}
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const { icon, color } = EVENT_ICON[item.event] ?? DEFAULT_ICON;
            return (
              <Pressable style={styles.row} onPress={() => handlePress(item)}>
                <View
                  style={[styles.iconWrap, { backgroundColor: `${color}22` }]}
                >
                  <Ionicons name={icon} size={18} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowSubtitle}>{item.body}</Text>
                </View>
                {!item.read_at && <View style={styles.unreadDot} />}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>No notifications yet.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: "700", color: Colors.light.text },
  markAll: { fontSize: 12, fontWeight: "600", color: Colors.light.tint },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: Colors.light.text },
  rowSubtitle: { fontSize: 12, color: Colors.light.muted, marginTop: 2 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.tint,
  },
  empty: { textAlign: "center", color: Colors.light.muted, marginTop: 32 },
});
