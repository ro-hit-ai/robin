// src/shadcn/components/app-sidebar.jsx
import {
  Building,
  FileText,
  ListPlus,
  Settings,
  SquareKanban,
} from "lucide-react";
import * as React from "react";
import { NavMain } from "./nav-main.jsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "../ui/sidebar.jsx";
import { useEffect, useState } from "react";
import CreateTicketModal from "../../components/CreateTicketModal/index.jsx";
import ThemeSettings from "../../components/ThemeSettings/index.jsx";
import { useNavigate, useLocation } from "react-router-dom";
import { useUser } from "../../store/session.jsx";

function AppSidebar({ ...props }) {
  const { user, loading } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const locale = user ? user.language : "en";

  const [keypressdown, setKeyPressDown] = useState(false);
  const sidebar = useSidebar();

  React.useEffect(() => {
    if (!user) {
      navigate("/auth/login");
    }

    if (location.pathname.includes("/admin") && user && !user.isAdmin) {
      navigate("/");
      alert("You do not have the correct perms for that action.");
    }

    if (user && user.external_user) {
      navigate("/portal");
    }
  }, [user, location.pathname, navigate]);

  const data = {
    teams: [
      {
        name: "Peppermint",
        plan: `version: ${import.meta.env.VITE_CLIENT_VERSION || "1.0.0"}`, // Changed to import.meta.env
      },
    ],
    navMain: [
      {
        title: "New Issue",
        url: ``,
        icon: ListPlus,
        isActive: location.pathname === "/" ? true : false,
        initial: "c",
      },
      {
        title: "Dashboard",
        url: `/${locale}/`,
        icon: Building,
        isActive: location.pathname === "/" ? true : false,
        initial: "h",
      },
      {
        title: "Documents",
        url: `/${locale}/documents`,
        icon: FileText,
        isActive: location.pathname === "/documents" ? true : false,
        initial: "d",
        internal: true,
      },
      {
        title: "Issues",
        url: `/${locale}/issues`,
        icon: SquareKanban,
        isActive: location.pathname === "/issues" ? true : false,
        initial: "t",
        items: [
          {
            title: "Open",
            url: "/issues/open",
            initial: "o",
          },
          {
            title: "Closed",
            url: "/issues/closed",
            initial: "f",
          },
        ],
      },
      ...(user?.isAdmin
        ? [
            {
              title: "Admin",
              url: "/admin",
              icon: Settings,
              isActive: true,
              initial: "a",
            },
          ]
        : []),
    ],
  };

  const handleKeyPress = React.useCallback(
    (event) => {
      const pathname = location.pathname;

      if (event.ctrlKey || event.metaKey) {
        return;
      }

      if (
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA" &&
        !document.activeElement.className.includes("ProseMirror") &&
        !pathname.includes("/new")
      ) {
        switch (event.key) {
          case "c":
            setKeyPressDown(true);
            break;
          case "h":
            navigate("/");
            break;
          case "d":
            navigate("/documents");
            break;
          case "t":
            navigate("/issues");
            break;
          case "a":
            navigate("/admin");
            break;
          case "o":
            navigate("/issues/open");
            break;
          case "f":
            navigate("/issues/closed");
            break;
          case "[":
            sidebar.toggleSidebar();
            break;
          default:
            break;
        }
      }
    },
    [location.pathname, navigate, sidebar]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyPress);
    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [handleKeyPress]);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg text-sidebar-primary-foreground">
            <img
              src="/favicon/favicon-32x32.png"
              className="size-4"
              alt="Peppermint Logo"
            />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold text-xl">Peppermint</span>
            <span className="truncate text-xs">
              version: {import.meta.env.VITE_CLIENT_VERSION || "1.0.0"} // Changed to import.meta.env
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <CreateTicketModal
          keypress={keypressdown}
          setKeyPressDown={setKeyPressDown}
        />
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <div className="hidden sm:block">
          <ThemeSettings />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export default AppSidebar;