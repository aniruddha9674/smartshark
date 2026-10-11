import { Routes, Route } from "react-router-dom";
import Landing from "./pages/public/Landing";
import Login from "./pages/public/Login";
import Register from "./pages/public/Register";
import BusinessDashboard from "./pages/business/Dashboard";
import InvestorDashboard from "./pages/investor/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/business/*"
        element={
          <ProtectedRoute role="business">
            <BusinessDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/investor/*"
        element={
          <ProtectedRoute role="investor">
            <InvestorDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}