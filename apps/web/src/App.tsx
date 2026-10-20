import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { isUnauthorized } from "./api/client";
import { NoticeProvider } from "./components/Notice";
import { Shell } from "./components/Shell";
import { AuthGate, forgetUser } from "./lib/auth";
import { AnalysisPage } from "./pages/AnalysisPage";
import { AreaPage } from "./pages/AreaPage";
import { CashFlowPage } from "./pages/CashFlowPage";
import { FundsPage } from "./pages/FundsPage";
import { GanttPage } from "./pages/GanttPage";
import { HistoryPage } from "./pages/HistoryPage";
import { ItemsPage } from "./pages/ItemsPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { TotalPage } from "./pages/TotalPage";
import { UsersPage } from "./pages/UsersPage";

const queryClient = new QueryClient({
  // Any screen whose data is refused with 401 (session expired or revoked) ends on the sign-in page.
  queryCache: new QueryCache({ onError: (error) => isUnauthorized(error) && forgetUser(queryClient) }),
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: false, staleTime: 5_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NoticeProvider>
        <AuthGate>
          <BrowserRouter>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<Navigate to="/budget/mt-dmt" replace />} />
                <Route path="budget/:code" element={<AreaPage />} />
                <Route path="cash-from" element={<FundsPage />} />
                <Route path="bought-from" element={<SuppliersPage />} />
                <Route path="cash-flow" element={<CashFlowPage />} />
                <Route path="gantt/:phase" element={<GanttPage />} />
                <Route path="total" element={<TotalPage />} />
                <Route path="analysis/funds" element={<AnalysisPage kind="funds" />} />
                <Route path="analysis/suppliers" element={<AnalysisPage kind="suppliers" />} />
                <Route path="analysis/items" element={<ItemsPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="*" element={<p className="empty">This page does not exist.</p>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthGate>
      </NoticeProvider>
    </QueryClientProvider>
  );
}
