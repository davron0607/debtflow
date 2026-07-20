import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useStore } from "@/lib/store/store";
import { homeFor } from "@/lib/home";
import { MarketingHome } from "@/components/marketing-home";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

// Неавторизованным — публичная главная страница; авторизованным — их рабочий
// дом по роли (банк — контроль-центр, остальные — очередь задач)
function IndexPage() {
  const { isAuthenticated, currentUser } = useStore();
  if (!isAuthenticated) return <MarketingHome />;
  return <Navigate to={homeFor(currentUser.role)} />;
}
