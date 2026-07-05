import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useStore } from "@/lib/store/store";

export const Route = createFileRoute("/_app")({
  component: AppGuard,
});

function AppGuard() {
  const { isAuthenticated } = useStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <AppShell />;
}
