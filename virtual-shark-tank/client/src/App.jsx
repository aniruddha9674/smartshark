import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./stores/auth";
import Login from "./pages/public/Login";
import Register from "./pages/public/Register";
import Dashboard from "./pages/Dashboard";
import ChoosePath from "./pages/onboarding/ChoosePath";
import BusinessOnboarding from "./pages/onboarding/BusinessOnboarding";
import InvestorOnboarding from "./pages/onboarding/InvestorOnboarding";


export default function App() {
  const { user, loading, loadUser } = useAuth();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/onboarding" replace /> : <Register />}
      />

      <Route
        path="/onboarding"
        element={user ? <ChoosePath /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/onboarding/business"
        element={user ? <BusinessOnboarding /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/onboarding/investor"
        element={user ? <InvestorOnboarding /> : <Navigate to="/login" replace />}
      />

      <Route
        path="/dashboard/*"
        element={user ? <Dashboard /> : <Navigate to="/login" replace />}
      />

      <Route
        path="*"
        element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
      />

    </Routes>
  );
}