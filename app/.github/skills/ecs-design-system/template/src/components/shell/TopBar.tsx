import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu as MenuIcon, Search, X } from "lucide-react";
import { Kbd, Sheet, SheetClose } from "@/components/ui";
import { cn } from "@/lib/utils";
import { appConfig, type Destination, type NavItem } from "@/app.config";
import logoWhite from "@/assets/vestas/Secondary_RGB.svg";
import { AccountMenu } from "./AccountMenu";
import { CommandPalette } from "./CommandPalette";
import { Notifications, type AppNotification } from "./Notifications";

/**
 * The Night Sky top bar: product name, primary links (active = white with a 2 px Blue Sky 03 bar),
 * "Search or go to" (Ctrl K), notifications, account and the white Vestas logo at the right.
 * Below 1024 px the links move into a start-side sheet.
 */
export function TopBar({ notifications }: { notifications?: AppNotification[] }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const user = appConfig.user;
  const isAdmin = user?.role === "admin";

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav: NavItem[] = [
    ...appConfig.nav,
    ...(isAdmin && appConfig.adminSections.length
      ? [{ to: appConfig.adminSections[0].to, label: "Administration", matchPrefixes: ["/admin"] }]
      : []),
  ];

  const destinations: Destination[] = [
    ...appConfig.extraDestinations,
    ...appConfig.nav.map((item) => ({ to: item.to, label: item.label })),
    ...(isAdmin ? appConfig.adminSections.map((item) => ({ ...item, label: `Administration: ${item.label}` })) : []),
  ];
  const isOn = (item: NavItem) => [item.to, ...(item.matchPrefixes ?? [])].some((prefix) => location.pathname.startsWith(prefix));
  const linkClass = (on: boolean) => cn(
    "relative inline-flex h-14 items-center gap-1.5 px-2.5 text-ui no-underline transition-colors",
    "after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5",
    on ? "text-shell-ink after:bg-shell-ring" : "text-shell-ink-2 hover:text-shell-ink",
  );

  return (
    <header className="on-shell sticky top-0 z-40 bg-shell text-shell-ink">
      <a href="#main" className="sr-only z-50 rounded-[var(--radius-control)] bg-canvas text-ui font-medium text-ink focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:inline-flex focus:h-10 focus:items-center focus:px-4">Skip to content</a>
      <div className="mx-auto flex h-14 max-w-[1564px] items-center gap-2 px-4 sm:px-6 lg:px-8">
        <button type="button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}
          className="-ml-2 grid size-9 place-items-center rounded-[var(--radius-control)] text-shell-ink hover:bg-white/10 lg:hidden">
          <MenuIcon aria-hidden="true" strokeWidth={1.75} className="size-5" />
        </button>
        <Link to="/" aria-current={location.pathname === "/" ? "page" : undefined} className="mr-4 text-heading font-medium text-shell-ink no-underline">{appConfig.productName}<span className="sr-only">, home</span></Link>
        <nav aria-label="Main" className="hidden min-w-0 items-center lg:flex">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} aria-current={isOn(item) ? "page" : undefined} className={() => linkClass(isOn(item))}>
              {item.label}
              {item.count ? <span className="figures text-meta text-shell-ink-2"><span className="sr-only">, </span>{item.count}<span className="sr-only"> waiting</span></span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search or go to"
            className="hidden h-9 w-60 items-center gap-2 rounded-[var(--radius-control)] border border-shell-rule px-3 text-meta text-shell-ink-2 transition-colors hover:border-shell-ink-2 hover:text-shell-ink xl:flex">
            <Search aria-hidden="true" strokeWidth={1.75} className="size-4" />
            <span className="flex-1 text-left">Search or go to</span>
            <Kbd>Ctrl K</Kbd>
          </button>
          <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search or go to"
            className="grid size-9 place-items-center rounded-[var(--radius-control)] text-shell-ink-2 hover:bg-white/10 hover:text-shell-ink xl:hidden">
            <Search aria-hidden="true" strokeWidth={1.75} className="size-[18px]" />
          </button>
          <Notifications items={notifications} />
          <AccountMenu user={user} />
          <span className="ml-1 py-5 pl-2 sm:ml-2 sm:pl-4">
            <img src={logoWhite} alt="Vestas" className="h-4 w-auto" />
          </span>
        </div>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} side="start" label="Navigation" className="w-[min(20rem,100vw)] bg-shell text-shell-ink">
        <div className="on-shell flex h-14 items-center justify-between px-4">
          <Link to="/" onClick={() => setMenuOpen(false)} className="text-heading font-medium text-shell-ink no-underline">{appConfig.productName}<span className="sr-only">, home</span></Link>
          <SheetClose aria-label="Close navigation" className="grid size-9 place-items-center rounded-[var(--radius-control)] hover:bg-white/10">
            <X aria-hidden="true" strokeWidth={1.75} className="size-5" />
          </SheetClose>
        </div>
        <nav aria-label="Main" className="on-shell flex flex-col px-2 py-2">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} aria-current={isOn(item) ? "page" : undefined}
              className={cn("flex h-11 items-center justify-between rounded-[var(--radius-control)] px-3 text-body no-underline",
                isOn(item) ? "bg-white/10 text-shell-ink" : "text-shell-ink-2 hover:text-shell-ink")}>
              {item.label}
              {item.count ? <span className="figures text-meta">{item.count}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-6 pb-8 pt-6"><img src={logoWhite} alt="Vestas" className="h-4 w-auto" /></div>
      </Sheet>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} destinations={destinations} />
    </header>
  );
}
