import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "../ui/sidebar";

export function NavMain({ items }) {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebar = useSidebar();
  const [hideKeyboardShortcuts, setHideKeyboardShortcuts] = useState(false);

  useEffect(() => {
    const loadFlags = () => {
      const savedFlags = localStorage.getItem("featureFlags");
      if (savedFlags) {
        const flags = JSON.parse(savedFlags);
        const hideShortcuts = flags.find(
          (f) => f.name === "Hide Keyboard Shortcuts"
        )?.enabled;
        setHideKeyboardShortcuts(hideShortcuts || false);
      }
    };

    loadFlags();
    window.addEventListener("storage", loadFlags);
    return () => window.removeEventListener("storage", loadFlags);
  }, []);

  const handleNavigation = (url) => {
    if (url) {
      navigate(url);
    }
  };

  const handleKeyboardEvent = (initial) => {
    const event = new KeyboardEvent("keydown", {
      key: initial,
    });
    document.dispatchEvent(event);
  };

  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) =>
          item.items ? (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={!hideKeyboardShortcuts ? item.initial : item.title}
                onClick={() => handleNavigation(item.url)}
              >
                <div className="flex flex-row items-center justify-between w-full">
                  <div className="flex flex-row items-center gap-x-2 w-full">
                    {item.icon && <item.icon className="size-4" />}
                    <span
                      className={sidebar.state === "collapsed" ? "hidden" : ""}
                    >
                      {item.title}
                    </span>
                  </div>
                  {!hideKeyboardShortcuts && (
                    <span
                      className={sidebar.state === "collapsed" ? "hidden" : ""}
                    >
                      {item.initial}
                    </span>
                  )}
                </div>
              </SidebarMenuButton>
              <SidebarMenuSub>
                {item.items?.map((subItem) => (
                  <SidebarMenuSubItem key={subItem.title}>
                    <SidebarMenuSubButton
                      onClick={() => handleNavigation(subItem.url)}
                      className="cursor-pointer flex flex-row items-center justify-between w-full px-0 pl-2.5 text-xs"
                    >
                      <span>{subItem.title}</span>
                      <span className="flex h-6 w-6 shrink-0 items-center bg-transparent border-none justify-center text-md font-medium">
                        {!hideKeyboardShortcuts && (
                          <span className="">{subItem.initial}</span>
                        )}
                      </span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
          ) : (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={!hideKeyboardShortcuts ? item.initial : item.title}
                onClick={() => {
                  if (item.url) {
                    handleNavigation(item.url);
                  } else {
                    handleKeyboardEvent(item.initial);
                  }
                }}
              >
                <div className="flex flex-row items-center justify-between w-full">
                  <div className="flex flex-row items-center gap-x-2 w-full">
                    {item.icon && <item.icon className="size-4" />}
                    <span
                      className={sidebar.state === "collapsed" ? "hidden" : ""}
                    >
                      {item.title}
                    </span>
                  </div>
                  {!hideKeyboardShortcuts && (
                    <span
                      className={sidebar.state === "collapsed" ? "hidden" : ""}
                    >
                      {item.initial}
                    </span>
                  )}
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
