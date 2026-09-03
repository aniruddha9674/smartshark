import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./theme/theme.css";

import Landing from "./pages/Landing";
import BusinessDashboard from "./pages/business/Dashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/business/dashboard" element={<BusinessDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}