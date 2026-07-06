import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useStore } from "@/lib/store/store";
import { homeFor } from "@/lib/home";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

// Домашняя страница зависит от роли: банк — контроль-центр, остальные — очередь задач
function IndexRedirect() {
  const { isAuthenticated, currentUser } = useStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <Navigate to={homeFor(currentUser.role)} />;
}
