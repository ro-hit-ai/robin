// src/layouts/shad.jsx
import React from "react";
import { Button } from "../shadcn/ui/button.jsx";
import { Bell } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import AccountDropdown from "../components/AccountDropdown/index.jsx";
import { useUser } from "../store/session.jsx"; // Updated path
import Cookies from "js-cookie";
import AppSidebar from "../shadcn/components/app-sidebar.jsx";
import { CommandMenu } from "../shadcn/components/command-menu.jsx"; // Updated to named import
import NoPermissions from "../shadcn/components/forbidden.jsx";

function ShadLayout({ children }) {
  const { user, loading, logout } = useUser();
  const token = Cookies.get("session");
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Mock translation function
  const translations = {};
  const t = (key) => translations[key] || key;

  // Redirect logic
  if (!user && !loading) {
    navigate("/auth/login");
    return null;
  }

  if (location.pathname.includes("/admin") && user?.isAdmin === false) {
    return <NoPermissions />;
  }

  if (user?.external_user) {
    navigate("/portal");
    return null;
  }

  return (
    !loading &&
    user && (
      <div className="min-h-screen overflow-hidden">
        <div className="flex">
          <div className="hidden lg:block">
            <AppSidebar />
          </div>
          <div className="lg:hidden">
            {sidebarOpen && (
              <div className="fixed inset-0 z-50 bg-gray-900/80">
                <div className="relative flex w-full max-w-xs flex-col bg-background h-full">
                  <button
                    className="absolute top-5 right-5 p-2.5 text-foreground"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="sr-only">Close sidebar</span>
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                  <AppSidebar />
                </div>
              </div>
            )}
          </div>
          <div className="w-full">
            <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-x-4 border-b bg-background px-4 sm:gap-x-6">
              <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6 items-center">
                <button
                  className="lg:hidden -m-2.5 p-2.5 text-foreground"
                  onClick={() => setSidebarOpen(true)}
                  title="["
                >
                  <span className="sr-only">Open sidebar</span>
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
                <div className="sm:flex hidden w-full justify-start items-center space-x-6">
                  {user.isAdmin && (
                    <Link to="https://github.com/Peppermint-Lab/peppermint/releases">
                      <span className="inline-flex items-center rounded-md bg-green-700/10 px-3 py-2 text-xs font-medium text-green-600 ring-1 ring-inset ring-green-500/20">
                        Version {process.env.REACT_APP_CLIENT_VERSION || "1.0.0"}
                      </span>
                    </Link>
                  )}
                  <CommandMenu user={user} token={token} />
                </div>
                <div className="flex w-full sticky right-0 justify-end items-center gap-x-2 lg:gap-x-2">
                  <Button
                    variant="outline"
                    className="relative rounded-md p-2 text-gray-400 hover:text-gray-500 hover:cursor-pointer focus:outline-none"
                  >
                    <Link to="/notifications">
                      <Bell className="h-4 w-4 text-foreground" />
                      {user.notifications &&
                        user.notifications.filter(
                          (notification) => !notification.read
                        ).length > 0 && (
                          <svg
                            className="h-2.5 w-2.5 absolute bottom-6 left-6 animate-pulse fill-green-500"
                            viewBox="0 0 6 6"
                            aria-hidden="true"
                          >
                            <circle cx={3} cy={3} r={3} />
                          </svg>
                        )}
                    </Link>
                  </Button>
                  {user.isAdmin && (
                    <Link
                      to="https://github.com/Peppermint-Lab/peppermint/discussions"
                      target="_blank"
                      className="hover:cursor-pointer"
                    >
                      <Button
                        variant="outline"
                        className="text-foreground hover:cursor-pointer whitespace-nowrap"
                      >
                        Send Feedback
                      </Button>
                    </Link>
                  )}
                  <AccountDropdown user={user} onLogout={logout} />
                </div>
              </div>
            </div>
            {!loading && !user.external_user && (
              <main className="bg-background min-h-screen">{children}</main>
            )}
          </div>
        </div>
      </div>
    )
  );
}

export default ShadLayout;