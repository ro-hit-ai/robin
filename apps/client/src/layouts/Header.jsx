import React from "react";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import AccountDropdown from "../components/AccountDropdown";

function Header({ user, setSidebarOpen }) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-x-4 border-b bg-background px-4 h-14 sm:gap-x-6">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        className="lg:hidden -m-2.5 p-2.5 text-gray-700 dark:text-gray-300"
        onClick={() => setSidebarOpen(true)}
      >
        <span className="sr-only">Open sidebar</span>
        <Bars3Icon className="h-6 w-6" aria-hidden="true" />
      </button>

      {/* Left Section: Branding / Navigation */}
      <div className="flex flex-1 items-center justify-start gap-x-6">
        <Link to="/" className="text-xl font-bold text-foreground">
          Peppermint
        </Link>
      </div>

      {/* Right Section: Actions */}
      <div className="flex items-center gap-x-3">
        {user?.isAdmin && (
          <Link
            to="https://github.com/Peppermint-Lab/peppermint/discussions"
            target="_blank"
            className="text-sm text-foreground hover:underline"
          >
            Send Feedback
          </Link>
        )}

        {/* Notifications */}
        <Link to="/notifications" className="relative">
          <span className="sr-only">View notifications</span>
          <svg
            className="h-6 w-6 text-gray-500 dark:text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405M19 13V7a7 7 0 10-14 0v6l-1.405 1.405A2.032 2.032 0 004 18h16a2.032 2.032 0 00.405-3.595L19 13z"
            />
          </svg>
          {user?.notifications?.some((n) => !n.read) && (
            <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
          )}
        </Link>

        {/* User dropdown */}
        <AccountDropdown user={user} />
      </div>
    </header>
  );
}

export default Header;
