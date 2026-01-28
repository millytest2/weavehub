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
import ExploreSimplified from "./pages/ExploreSimplified";
import Landing from "./pages/Landing";
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
              path="/experiments"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Experiments />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/daily"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <DailyFocus />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/identity"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <IdentitySeed />
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
            <Route
              path="/lab"
              element={
                <ProtectedRoute>
                  <Lab />
                </ProtectedRoute>
              }
            />
            <Route
              path="/explore"
              element={
                <ProtectedRoute>
                  <ExploreSimplified />
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
