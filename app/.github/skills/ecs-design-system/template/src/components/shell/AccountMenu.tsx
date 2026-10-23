import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info, LogOut, Moon, Sun } from "lucide-react";
import { ConfirmDialog, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui";
import { appConfig, type AppUser } from "@/app.config";
import { useTheme } from "@/lib/theme";

function initials(name?: string) {
  if (!name) return "";
  const parts = name.replace(/[._@-]/g, " ").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Who you are, the theme, About and signing out. One place, no duplicated toggles. */
export function AccountMenu({ user }: { user?: AppUser }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [confirm, setConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    await appConfig.signOut();
  }

  return (
    <>
      <Menu>
        <MenuTrigger aria-label={user ? `Account: ${user.name}` : "Account"}
          className="grid size-9 place-items-center rounded-[var(--radius-control)] text-meta font-medium text-shell-ink transition-colors hover:bg-white/10">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-full border border-shell-rule">{initials(user?.name) || "·"}</span>
        </MenuTrigger>
        <MenuContent className="w-64">
          <MenuLabel className="pt-3">
            <span className="block truncate text-ui font-medium text-ink">{user?.name ?? "Signed in"}</span>
            <span className="block truncate">{user?.email ?? ""}{user?.role === "admin" ? " · Administrator" : ""}</span>
          </MenuLabel>
          <MenuSeparator />
          <MenuItem onSelect={toggle}>{theme === "dark" ? <Sun /> : <Moon />}{theme === "dark" ? "Use light theme" : "Use dark theme"}</MenuItem>
          <MenuItem onSelect={() => navigate(appConfig.aboutPath)}><Info />About {appConfig.productName}</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => setConfirm(true)}><LogOut />Sign out</MenuItem>
        </MenuContent>
      </Menu>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={signOut} busy={leaving}
        title={`Sign out of ${appConfig.productName}?`} description="You will need to sign in again to continue."
        confirmLabel="Sign out" />
    </>
  );
}