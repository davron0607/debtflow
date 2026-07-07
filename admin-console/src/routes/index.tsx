import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { isAuthenticated, isLoading } = useStore();
  if (isLoading) return null;
  return <Navigate to={isAuthenticated ? "/orgs" : "/login"} />;
}
