/**
 * The ONLY file you normally edit to adapt the shell to your app: the product name,
 * top-bar navigation, administration sections and the signed-in user.
 * Colours, type, spacing and motion live in index.css. Do not change them if the app
 * should look 1:1 like the ECS / CAPE app.
 */

export interface NavItem {
  to: string;
  label: string;
  /** Count shown after the label (e.g. items waiting for you). Never a coloured pill. */
  count?: number;
  /** Treat these path prefixes as "on" too. */
  matchPrefixes?: string[];
}

export interface Destination {
  to: string;
  label: string;
  /** Extra words the command palette should match. */
  keywords?: string;
}

export interface AppUser {
  name: string;
  email?: string;
  role?: "admin" | "user";
}

export const appConfig = {
  /** Product name in the top bar. Short, sentence case, set in Vestas Sans Medium. */
  productName: "My app",
  /** Where "About" in the account menu goes. */
  aboutPath: "/about",
  nav: [
    { to: "/items", label: "Items" },
    { to: "/reviews", label: "Reviews", count: 3 },
  ] as NavItem[],
  /** Administration area: one section nav beside every admin page. Shown to admins only. */
  adminSections: [
    { to: "/admin/usage", label: "Usage", keywords: "statistics visits" },
    { to: "/admin/history", label: "History", keywords: "versions audit" },
    { to: "/admin/settings", label: "Settings", keywords: "users groups integrations api keys" },
  ] as Destination[],
  /** Extra command-palette destinations that are not in the top bar. */
  extraDestinations: [
    { to: "/", label: "Home", keywords: "start" },
  ] as Destination[],
  user: { name: "jane.doe", email: "jane.doe@vestas.com", role: "admin" } as AppUser | undefined,
  signOut: async () => {
    window.location.href = "/login";
  },
};