import { Navigate, Route, Routes } from "react-router-dom";

import { DashboardPage } from "./pages/DashboardPage";
import { TradesPage } from "./pages/TradesPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/pairs/:symbol" element={<TradesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}