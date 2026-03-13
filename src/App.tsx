import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import Topics from "./pages/Topics";
import TopicDetail from "./pages/TopicDetail";
import Insights from "./pages/Insights";
import Documents from "./pages/Documents";
import Experiments from "./pages/Experiments";
import DailyFocus from "./pages/DailyFocus";
import IdentitySeed from "./pages/IdentitySeed";
import LearningPaths from "./pages/LearningPaths";
import LearningPathDetail from "./pages/LearningPathDetail";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Lab from "./pages/Lab";
import Explore from "./pages/Explore";
import Landing from "./pages/Landing";
import Mind from "./pages/Mind";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/landing" element={<Landing />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Dashboard />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            {/* Mind - unified view */}
            <Route
              path="/mind"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Mind />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            {/* Redirects from old routes */}
            <Route path="/identity" element={<Navigate to="/mind" replace />} />
            <Route path="/experiments" element={<Navigate to="/mind" replace />} />
            <Route path="/lab" element={<Navigate to="/mind" replace />} />
            <Route path="/explore" element={<Navigate to="/mind" replace />} />
            <Route path="/daily" element={<Navigate to="/" replace />} />
            {/* Keep these for deep links */}
            <Route
              path="/topics"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Topics />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/topics/:id"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <TopicDetail />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insights"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Insights />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Documents />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/learning-paths"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <LearningPaths />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/learning-paths/:id"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <LearningPathDetail />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
  </QueryClientProvider>
);

export default App;
