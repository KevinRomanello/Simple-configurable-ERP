import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { NoticeProvider } from "./components/Notice";
import { Shell } from "./components/Shell";
import { AnalysisPage } from "./pages/AnalysisPage";
import { AreaPage } from "./pages/AreaPage";
import { CashFlowPage } from "./pages/CashFlowPage";
import { FundsPage } from "./pages/FundsPage";
import { GanttPage } from "./pages/GanttPage";
import { ItemsPage } from "./pages/ItemsPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { TotalPage } from "./pages/TotalPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: false, staleTime: 5_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NoticeProvider>
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
            </Route>
          </Routes>
        </BrowserRouter>
      </NoticeProvider>
    </QueryClientProvider>
  );
}
