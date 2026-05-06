import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import AddTransaction from "./pages/AddTransaction";
import Transfers from "./pages/Transfers";
import Categories from "./pages/Categories";
import PayPeriods from "./pages/PayPeriods";
import History from "./pages/History";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Protected = ({ el }: { el: JSX.Element }) => <ProtectedRoute><AppLayout>{el}</AppLayout></ProtectedRoute>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<Protected el={<Dashboard />} />} />
            <Route path="/accounts" element={<Protected el={<Accounts />} />} />
            <Route path="/add" element={<Protected el={<AddTransaction />} />} />
            <Route path="/transfers" element={<Protected el={<Transfers />} />} />
            <Route path="/categories" element={<Protected el={<Categories />} />} />
            <Route path="/pay-periods" element={<Protected el={<PayPeriods />} />} />
            <Route path="/history" element={<Protected el={<History />} />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
