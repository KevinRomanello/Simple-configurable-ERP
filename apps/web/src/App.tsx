import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { isUnauthorized } from "./core/api";
import { NoticeProvider } from "./core/Notice";
import { MANIFESTS } from "./manifests";
import { AuthGate, forgetUser, useMe } from "./platform/auth";
import { manifestOn, ManifestsProvider } from "./platform/manifest";
import { HomePage } from "./platform/home";
import { Shell } from "./platform/Shell";

const queryClient = new QueryClient({
  // Any screen whose data is refused with 401 (session expired or revoked) ends on the sign-in page.
  queryCache: new QueryCache({ onError: (error) => isUnauthorized(error) && forgetUser(queryClient) }),
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: false, staleTime: 5_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NoticeProvider>
        <ManifestsProvider value={MANIFESTS}>
          <BrowserRouter>
            <Routes>
              {MANIFESTS.flatMap((manifest) => manifest.openRoutes ?? []).map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
              <Route path="*" element={<AuthGate><SignedIn /></AuthGate>} />
            </Routes>
          </BrowserRouter>
        </ManifestsProvider>
      </NoticeProvider>
    </QueryClientProvider>
  );
}

/**
 * The site of whoever is signed in: the menu and the pages of every module and bridge. The pages of one that is off (Settings › App ›
 * Modules) lead to the first page.
 */
function SignedIn() {
  const me = useMe();
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        {MANIFESTS.flatMap((manifest) =>
          (manifest.routes ?? []).map((route) => (
            <Route key={route.path} path={route.path} element={manifestOn(manifest, me) ? route.element : <Navigate to="/" replace />} />
          )),
        )}
        <Route path="*" element={<p className="empty">This page does not exist.</p>} />
      </Route>
    </Routes>
  );
}
