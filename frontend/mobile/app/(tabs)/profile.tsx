import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Text } from '@/components/ui/text';
import { ArenaImage } from '@/components/ui/arena-image';
import { SafeAreaView } from "react-native-safe-area-context";

import { Colors, Shadow } from "@/constants/theme";
import { logout } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

const MENU_ITEMS = [
  {
    label: "Personal Information",
    icon: "person-outline" as const,
    href: "/profile/edit" as const,
  },
  {
    label: "Liked Arenas",
    icon: "heart-outline" as const,
    href: "/profile/liked" as const,
  },
  {
    label: "Payment History",
    icon: "card-outline" as const,
    href: "/profile/payments" as const,
  },
  {
    label: "Booking History",
    icon: "time-outline" as const,
    href: "/profile/report" as const,
  },
  {
    label: "Change Password",
    icon: "lock-closed-outline" as const,
    href: "/profile/change-password" as const,
  },
  { label: "My Addresses", icon: "location-outline" as const },
  {
    label: "Settings",
    icon: "settings-outline" as const,
    href: "/profile/settings" as const,
  },
  { label: "Help & Support", icon: "help-circle-outline" as const },
  { label: "Terms & Conditions", icon: "document-text-outline" as const },
];

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);

  async function onLogout() {
    try {
      if (refreshToken) await logout(refreshToken);
    } catch {
      // Ignore — clear the local session regardless.
    } finally {
      clear();
      router.replace("/(auth)/login");
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          style={styles.editBtn}
          hitSlop={12}
          onPress={() => router.push("/profile/edit")}
        >
          <Ionicons name="create-outline" size={20} color="#fff" />
        </Pressable>
        <ArenaImage
          photo={user?.profile_picture}
          style={styles.avatar}
          fallback={
            <Text style={styles.avatarInitial}>
              {user?.full_name?.[0]?.toUpperCase() ?? "?"}
            </Text>
          }
        />
        <Text style={styles.name}>{user?.full_name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.menu}>
        {MENU_ITEMS.map((item) => (
          <Pressable
            key={item.label}
            style={styles.menuItem}
            onPress={() =>
              item.href
                ? router.push(item.href)
                : Alert.alert(item.label, "Coming soon.")
            }
          >
            <Ionicons name={item.icon} size={20} color={Colors.light.text} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors.light.muted}
            />
          </Pressable>
        ))}

        <Pressable style={styles.menuItem} onPress={onLogout}>
          <Ionicons
            name="log-out-outline"
            size={20}
            color={Colors.light.destructive}
          />
          <Text style={[styles.menuLabel, { color: Colors.light.destructive }]}>
            Logout
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: Colors.light.ink,
  },
  editBtn: {
    position: "absolute",
    top: 16,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.light.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
    ...Shadow.card,
  },
  avatarInitial: { fontSize: 28, fontWeight: "700", color: Colors.light.tint },
  name: { fontSize: 18, fontWeight: "700", color: "#fff" },
  email: { fontSize: 13, color: "#E5EDFF", marginTop: 2 },
  menu: { padding: 16, gap: 2 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  menuLabel: { flex: 1, fontSize: 15, color: Colors.light.text },
});
