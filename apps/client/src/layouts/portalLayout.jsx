// PortalLayout.jsx
import React, { Fragment, useState, useEffect, useCallback } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import Header from "./Header.jsx";
import ThemeSettings from "../components/ThemeSettings";
import AccountDropdown from "../components/AccountDropdown";
import { Home, FolderKanban, ChevronRight, Mail } from "lucide-react";
import { useUser } from "../store/session.jsx";

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

const CLIENT_VERSION = import.meta.env.VITE_CLIENT_VERSION || "1.0.0";

function PortalLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, role } = useUser();

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><p>Loading...</p></div>;
  }

  if (!user) {
    return <div className="flex items-center justify-center h-screen"><h1 className="text-2xl font-bold">Please log in</h1></div>;
  }

  const navigation = [
    { name: "Dashboard", href: "/portal", current: location.pathname === "/portal", icon: Home },
    {
      name: "Issues",
      href: "/portal/issues",
      current: location.pathname.startsWith("/portal/issues"),
      icon: FolderKanban,
      subItems: [
        { name: "Open Issues", href: "/portal/issues/open" },
        { name: "Closed Issues", href: "/portal/issues/closed" },
      ],
    },
    { name: "Inbox", href: "/portal/inbox", current: location.pathname === "/portal/inbox", icon: Mail },
    { name: "Tickets", href: "/portal/tickets", current: location.pathname.startsWith("/portal/tickets"), icon: Mail },
    ...(role === "admin" ? [{ name: "Admin Panel", href: "/admin", current: location.pathname.startsWith("/admin"), icon: Home }] : []),
  ];

  const handleKeyPress = useCallback(
    (e) => {
      if (!user || document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
      e.preventDefault();
      const keyMap = {
        h: "/portal",
        t: "/portal/issues",
        o: "/portal/issues/open",
        f: "/portal/issues/closed",
        i: "/portal/inbox",
        k: "/portal/tickets",
        ...(role === "admin" && { a: "/admin" }),
      };
      if (keyMap[e.key]) navigate(keyMap[e.key]);
    },
    [user, navigate, role]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [handleKeyPress]);

  useEffect(() => {
    const handleToggle = (e) => {
      if (e.key === "[" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSidebarOpen(true);
      }
    };
    document.addEventListener("keydown", handleToggle);
    return () => document.removeEventListener("keydown", handleToggle);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background w-full">
      <Header user={user} setSidebarOpen={setSidebarOpen} />
      <div className="flex flex-1">
        <Transition.Root show={sidebarOpen} as={Fragment}>
          <Dialog as="div" className="relative z-50 lg:hidden" onClose={setSidebarOpen}>
            <div className="fixed inset-0 bg-gray-900/80" />
            <div className="fixed inset-0 flex">
              <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                  <button type="button" className="-m-2.5 p-2.5" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
                    <span className="sr-only">Close sidebar</span>
                    <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-background px-6 pb-4">
                  <div className="flex align-middle flex-row h-14 items-center border-b-[1px]">
                    <Link to="/">
                      <span className="text-3xl ml-2 hover:text-primary font-bold">Peppermint</span>
                    </Link>
                  </div>
                  <nav className="flex flex-1 flex-col" role="navigation">
                    <ul role="list" className="flex flex-1 flex-col gap-y-7">
                      <li>
                        <ul role="list" className="-mx-2 space-y-1">
                          {navigation.map((item) => (
                            <li key={item.name}>
                              <Link
                                to={item.href}
                                className={classNames(
                                  item.current ? "bg-secondary text-secondary-foreground" : "text-foreground hover:bg-muted",
                                  "group -mx-2 flex gap-x-3 p-1 rounded-md text-sm font-semibold leading-6"
                                )}
                                aria-current={item.current ? "page" : undefined}
                              >
                                <item.icon className="h-4 w-4 ml-1 shrink-0 mt-1" />
                                <span className="whitespace-nowrap">{item.name}</span>
                              </Link>
                              {item.subItems && (
                                <ul className="ml-4 pl-2 space-y-1 -mx-2">
                                  {item.subItems.map((sub) => (
                                    <li key={sub.name}>
                                      <Link
                                        to={sub.href}
                                        className={classNames(
                                          location.pathname === sub.href
                                            ? "bg-secondary text-secondary-foreground font-bold"
                                            : "text-muted-foreground hover:bg-muted",
                                          "group -mx-2 flex gap-x-3 p-1 rounded-md text-sm leading-6 pl-2"
                                        )}
                                        aria-current={location.pathname === sub.href ? "page" : undefined}
                                      >
                                        <ChevronRight className="h-3 w-3 ml-1 shrink-0 mt-1 text-muted-foreground" />
                                        <span className="whitespace-nowrap">{sub.name}</span>
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    </ul>
                    <ThemeSettings />
                  </nav>
                </div>
              </Dialog.Panel>
            </div>
          </Dialog>
        </Transition.Root>
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-10 lg:flex lg:w-64 2xl:w-72 lg:flex-col border-r bg-background">
          <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-background pb-4">
            <div className="flex align-middle flex-row h-14 items-center border-b px-6">
              <Link to="/">
                <span className="text-3xl ml-2 hover:text-primary font-bold">Peppermint</span>
              </Link>
            </div>
            <nav className="flex flex-1 flex-col px-6" role="navigation">
              <ul role="list" className="flex flex-1 flex-col gap-y-7 w-full">
                <li>
                  <ul role="list" className="-mx-2 space-y-1 w-full">
                    {navigation.map((item) => (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          className={classNames(
                            item.current ? "bg-secondary text-secondary-foreground" : "text-foreground hover:bg-muted",
                            "group -mx-2 flex gap-x-3 p-1 rounded-md text-sm font-semibold leading-6"
                          )}
                          aria-current={item.current ? "page" : undefined}
                        >
                          <item.icon className="h-4 w-4 ml-1 shrink-0 mt-1" />
                          <span className="whitespace-nowrap">{item.name}</span>
                        </Link>
                        {item.subItems && (
                          <ul className="ml-4 pl-2 space-y-1 -mx-2">
                            {item.subItems.map((sub) => (
                              <li key={sub.name}>
                                <Link
                                  to={sub.href}
                                  className={classNames(
                                    location.pathname === sub.href
                                      ? "bg-secondary text-secondary-foreground font-bold"
                                      : "text-muted-foreground hover:bg-muted",
                                    "group -mx-2 flex gap-x-3 p-1 rounded-md text-sm leading-6 pl-2"
                                  )}
                                  aria-current={location.pathname === sub.href ? "page" : undefined}
                                >
                                  <ChevronRight className="h-3 w-3 ml-1 shrink-0 mt-1 text-muted-foreground" />
                                  <span className="whitespace-nowrap">{sub.name}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              </ul>
              <ThemeSettings />
            </nav>
          </div>
        </div>
        <div className="flex flex-col flex-1 lg:pl-64 2xl:pl-72">
          <main className="flex-1 p-4 overflow-y-auto w-full">
            <Outlet />
          </main>
          <footer className="flex justify-end items-center gap-x-2 p-2 border-t">
            <Link to="https://github.com/Peppermint-Lab/peppermint/releases">
              <span className="inline-flex items-center rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
                Version {CLIENT_VERSION}
              </span>
            </Link>
            <AccountDropdown />
          </footer>
        </div>
      </div>
    </div>
  );
}

export default PortalLayout;