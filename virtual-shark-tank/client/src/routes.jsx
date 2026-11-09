import { Routes, Route } from "react-router-dom";
import Landing from "./pages/public/Landing";
import Login from "./pages/public/Login";
import Register from "./pages/public/Register";
import Dashboard from "./pages/business/Dashboard"; // Unified dashboard
import ProtectedRoute from "./components/ProtectedRoute";
import BusinessOnboarding from "./pages/onboarding/BusinessOnboarding";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* 1. Onboarding Route (Standalone, no sidebar) */}
      <Route
        path="/onboarding/*"
        element={
          <ProtectedRoute>
            <BusinessOnboarding />
          </ProtectedRoute>
        }
      />

      {/* 2. Dashboard Route (Contains sidebar, matches your Dashboard.jsx links) */}
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}