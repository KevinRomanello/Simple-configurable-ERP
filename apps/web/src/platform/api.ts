// The calls of platform to the API (split from api/client.ts in G7: docs/moduli-architettura.md, §7.1).
import { del, get, isUnauthorized, patch, post, put } from "../core/api";
import type { ApiTokenRow, AppModule, Area, HistoryPage, Me, Role, Season, SettingsView, SignInOptions, UserFlag, UserRow } from "./types";

export const platformApi = {
  // sign-in
  signInOptions: () => get<SignInOptions>("/auth/config"),
  /** The signed-in person, or null when nobody is signed in. */
  me: async (): Promise<Me | null> => {
    try {
      return await get<Me>("/me");
    } catch (error) {
      if (isUnauthorized(error)) return null;
      throw error;
    }
  },
  signOut: () => post<void>("/auth/logout", {}),
  // users and history
  users: () => get<UserRow[]>("/users"),
  createUser: (body: { email: string; name: string; role: Role }) => post<UserRow>("/users", body),
  /** The boxes of the modules that are on, for the Users page. */
  flags: () => get<UserFlag[]>("/flags"),
  /** `flags` is the whole list of boxes wanted for the person. */
  updateUser: (id: number, body: { role?: Role; flags?: string[]; active?: boolean; areaIds?: number[] }) =>
    patch<UserRow>(`/users/${id}`, body),
  history: (query: { table?: string; before?: number }) => {
    const params = new URLSearchParams({ limit: "50" });
    if (query.table) params.set("table", query.table);
    if (query.before) params.set("before", String(query.before));
    return get<HistoryPage>(`/audit?${params}`);
  },
  // the Settings page (admin)
  settings: () => get<SettingsView>("/settings"),
  createCategory: (name: string) => post<{ id: number }>("/settings/categories", { name }),
  updateCategory: (id: number, body: { name: string }) => patch<void>(`/settings/categories/${id}`, body),
  deleteCategory: (id: number) => del(`/settings/categories/${id}`),
  orderCategories: (ids: number[]) => put<void>("/settings/categories/order", { ids }),
  createVatRate: (rate: number) => post<{ id: number }>("/settings/vat-rates", { rate }),
  deleteVatRate: (id: number) => del(`/settings/vat-rates/${id}`),
  /** The admin's switch: whether the site can be changed from a phone. */
  updateSite: (body: { editOnPhone: boolean }) => patch<void>("/settings/site", body),
  /** The parts of the ERP that can be turned off, and turning one on or off (admins). */
  modules: () => get<AppModule[]>("/modules"),
  setModule: (key: string, enabled: boolean) => patch<void>(`/modules/${key}`, { enabled }),
  /** The keys of the services (n8n, the bot…): they act as the user chosen; the key is in the answer of `createToken` only. */
  tokens: () => get<ApiTokenRow[]>("/tokens"),
  createToken: (name: string, userId: number) => post<{ id: number; name: string; token: string }>("/tokens", { name, userId }),
  revokeToken: (id: number) => del(`/tokens/${id}`),
  // lookups
  categories: () => get<string[]>("/lookups/categories"),
  vatRates: () => get<number[]>("/lookups/vat-rates"),
  // seasons
  seasons: () => get<Season[]>("/seasons"),
  createSeason: (body: { startYear: number; car: string }) => post<Season>("/seasons", body),
  updateSeason: (id: number, body: { car?: string; readOnly?: boolean }) => patch(`/seasons/${id}`, body),
  // budget
  areas: () => get<Area[]>("/areas"),
};
