import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "@/pages/HomePage";
import { ListPage } from "@/pages/ListPage";
import { UsagePage } from "@/pages/UsagePage";
import { HistoryPage } from "@/pages/HistoryPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { AboutPage } from "@/pages/AboutPage";
import { LoginPage } from "@/pages/LoginPage";

/** Each page renders its own <AppShell> (or <AdminLayout>), so pages can opt into fullBleed. */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/items" element={<ListPage />} />
      <Route path="/reviews" element={<ListPage />} />
      <Route path="/admin" element={<Navigate to="/admin/usage" replace />} />
      <Route path="/admin/usage" element={<UsagePage />} />
      <Route path="/admin/history" element={<HistoryPage />} />
      <Route path="/admin/settings" element={<SettingsPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
