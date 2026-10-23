import { History } from "lucide-react";
import { AdminLayout } from "@/components/shell/AdminLayout";
import { EmptyState } from "@/components/ui";

export function HistoryPage() {
  return (
    <AdminLayout title="History" meta="Every change made in administration.">
      <EmptyState icon={History} title="No changes yet" description="Changes to settings, users and integrations will appear here." align="start" />
    </AdminLayout>
  );
}
