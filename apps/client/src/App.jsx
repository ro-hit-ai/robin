// src/App.jsx
import React, { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { SidebarProvider } from "./shadcn/ui/sidebar";
import AppSidebar from "./shadcn/components/app-sidebar"; // Corrected to default import
import AdminLayout from "./layouts/adminLayout";
import ShadLayout from "./layouts/shad";
import PortalLayout from "./layouts/portalLayout";
import AgentsLayout from "./layouts/agentLayout";
import Settings from "./layouts/settings";
import Home from "./pages/index";
import NewPage from "./pages/new";
import NotificationsPage from "./pages/notifications";
import OnboardingPage from "./pages/onboarding";
import ProfilePage from "./pages/profile";
import SubmitPage from "./pages/submit";
import NotFoundPage from "./pages/404";
import LoginPage from "./pages/auth/login";
import Inbox from "./pages/inbox";
import Ticket from "./pages/tickets/index";
import NewTicket from "./pages/tickets/new";
import TicketDetail from "./pages/tickets/detail";
import TicketSummary from "./pages/tickets/summary";
import TicketSearch from "./pages/tickets/search";
import { useUser } from "./store/session.jsx";

// Admin pages
import Users from "./pages/admin/users";
import NewUser from "./pages/admin/users/new.jsx";
import Clients from "./pages/admin/clients";
import NewClient from "./pages/admin/clients/new.jsx";
import EmailQueuesList from "./pages/admin/email-queues";
import NewEmailQueue from "./pages/admin/email-queues/new.jsx";
import Webhooks from "./pages/admin/webhooks.jsx";
import SMTP from "./pages/admin/smtp";
import OAuth from "./pages/admin/smtp/oauth.jsx";
import Authentication from "./pages/admin/authentication.jsx";
import Roles from "./pages/admin/roles";
import NewRole from "./pages/admin/roles/new.jsx";
import Logs from "./pages/admin/logs.jsx";

/**
 * Error boundary to catch runtime errors
 */
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen justify-center items-center text-red-500 p-4 bg-red-50 rounded-md">
          <div>
            <p>
              Something went wrong: {this.state.error?.message || "Unknown error"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded-md"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Role-based wrapper
 */
function RequireRole({ children, adminOnly }) {
  const { user, loading, isAdmin, isAgent } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAgent && !adminOnly) {
      navigate("/agents", { replace: true });
    }
  }, [isAgent, adminOnly, navigate]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (!user) return <Navigate to="/auth/login" replace />;

  if (adminOnly && !isAdmin) {
    return <Navigate to="/portal" replace />;
  }

  if (adminOnly === false && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

/**
 * Root app component
 */
function App() {
  return (
    <SidebarProvider>
      <ErrorBoundary>
        <Routes>
          {/* Public routes */}
          <Route
            path="/"
            element={
              <div className="flex min-h-screen">
                <AppSidebar />
                <div className="flex-1 p-4">
                  <Home />
                </div>
              </div>
            }
          />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/submit" element={<SubmitPage />} />
          {/* Portal (Agent Panel, non-admins) */}
          <Route
            path="/portal/*"
            element={
              <RequireRole adminOnly={false}>
                <PortalLayout />
              </RequireRole>
            }
          >
            <Route index element={<Home />} />
            <Route path="issues" element={<NotificationsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="tickets" element={<Ticket />} />
            <Route path="tickets/new" element={<NewTicket />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="tickets/search" element={<TicketSearch />} />
            <Route
              path="tickets/summary"
              element={
                <RequireRole adminOnly={true}>
                  <TicketSummary />
                </RequireRole>
              }
            />
          </Route>
          {/* Admin Layout (Admins only) */}
          <Route
            path="/admin/*"
            element={
              <RequireRole adminOnly={true}>
                <AdminLayout />
              </RequireRole>
            }
          >
            <Route index element={<Home />} />
            <Route path="users" element={<Users />} />
            <Route path="users/new" element={<NewUser />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/new" element={<NewClient />} />
            <Route path="email-queues" element={<EmailQueuesList />} />
            <Route path="email-queues/new" element={<NewEmailQueue />} />
            <Route path="webhooks" element={<Webhooks />} />
            <Route path="smtp" element={<SMTP />} />
            <Route path="smtp/oauth" element={<OAuth />} />
            <Route path="authentication" element={<Authentication />} />
            <Route path="roles" element={<Roles />} />
            <Route path="roles/new" element={<NewRole />} />
            <Route path="logs" element={<Logs />} />
            <Route path="new" element={<NewPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="tickets" element={<Ticket />} />
            <Route path="tickets/new" element={<NewTicket />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="tickets/search" element={<TicketSearch />} />
            <Route path="tickets/summary" element={<TicketSummary />} />
          </Route>
          {/* Agents Layout */}
          <Route
            path="/agents/*"
            element={
              <RequireRole adminOnly={false}>
                <AgentsLayout />
              </RequireRole>
            }
          >
            <Route index element={<Home />} />
            <Route path="tickets/open" element={<Ticket />} />
            <Route path="tickets/closed" element={<Ticket />} />
            <Route path="inbox" element={<Inbox />} />
          </Route>
          {/* Settings (both roles allowed) */}
          <Route
            path="/settings/*"
            element={
              <ShadLayout>
                <Settings />
              </ShadLayout>
            }
          >
            <Route path="profile" element={<ProfilePage />} />
          </Route>
          {/* Fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
    </SidebarProvider>
  );
}

export default App;