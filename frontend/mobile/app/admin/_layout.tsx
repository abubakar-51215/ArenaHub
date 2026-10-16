import { Redirect, Stack } from 'expo-router';

import { useAuthStore } from '@/store/auth';

// Every admin screen sits under this layout. The root layout already hides this whole group from anyone who is not an
// admin (Stack.Protected); this is the second lock: a player or an owner who somehow lands here is sent away.
export default function AdminLayout() {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'admin') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
