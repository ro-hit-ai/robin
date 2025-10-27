import React, { useState, useEffect, useCallback, useContext, createContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Cookies from "js-cookie";
import { apiUrl } from "../utils/api";

const SessionContext = createContext(null);

export const SessionProvider = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(() => {
    const cached = localStorage.getItem("user");
    const parsed = cached ? JSON.parse(cached) : null;
    console.log("Initial user from localStorage:", parsed); // Debug
    return parsed;
  });
  const [status, setStatus] = useState(user ? "authenticated" : "idle");
  const [error, setError] = useState(null);

  const logout = useCallback(
    (force = false) => {
      Cookies.remove("session");
      localStorage.removeItem("user");
      setUser(null);
      setStatus("unauthenticated");
      if (force) {
        navigate("/auth/login", { replace: true });
      }
    },
    [navigate]
  );

  const handleProfileResponse = async (response) => {
    if (!response.ok) {
      if (response.status === 401) {
        logout(true);
        return null;
      }
      throw new Error(`Profile fetch failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("Profile response data:", data); // Debug

    if (data.token) {
      Cookies.set("session", data.token, { sameSite: "strict" });
    }

    if (data.success && data.user) {
      const normalizedUser = {
        ...data.user,
        isAdmin: data.user.isAdmin === true,
        isAgent: data.user.isAgent === true, // Normalize isAgent
      };

      setUser(normalizedUser);
      localStorage.setItem("user", JSON.stringify(normalizedUser));
      setStatus("authenticated");
      console.log("Updated user state:", normalizedUser); // Debug
      return normalizedUser;
    } else {
      setError(data.message || "Failed to fetch profile");
      setStatus("unauthenticated");
      return null;
    }
  };

  const refreshSession = useCallback(async () => {
    const token = Cookies.get("session");
    console.log("Refreshing session, token:", token); // Debug
    if (!token) {
      setStatus("unauthenticated");
      return null;
    }
    try {
      setStatus("loading");
      const response = await fetch(apiUrl("/v1/auth/profile"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      return await handleProfileResponse(response);
    } catch (err) {
      console.error("Refresh session error:", err.message);
      setError(err.message);
      setStatus("unauthenticated");
      return null;
    }
  }, [logout]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (status === "unauthenticated" && location.pathname !== "/auth/login") {
      navigate("/auth/login", { replace: true });
    }
    if (status === "authenticated" && location.pathname === "/auth/login") {
      if (user?.isAgent) {
        navigate("/agents", { replace: true }); // Redirect agents to /agents
      } else if (user?.isAdmin) {
        navigate("/admin", { replace: true }); // Redirect admins to /admin
      } else {
        navigate("/portal", { replace: true }); // Default to portal for others
      }
    }
  }, [status, location.pathname, navigate, user?.isAgent, user?.isAdmin]);

  const loading = status === "idle" || status === "loading";

  const fetchWithAuth = useCallback(
    async (url, options = {}) => {
      let token = Cookies.get("session");
      if (!token) {
        logout(true);
        throw new Error("No session token available");
      }

      const doFetch = async (authToken) => {
        const headers = {
          "Content-Type": "application/json",
          ...(options.headers || {}),
          Authorization: `Bearer ${authToken}`,
        };
        return fetch(apiUrl(url), { ...options, headers });
      };

      let res = await doFetch(token);

      if (res.status === 401) {
        console.warn("🔄 Token might be expired, trying refresh...");
        const refreshed = await refreshSession();
        if (!refreshed) {
          logout(true);
          throw new Error("Session expired, please login again");
        }
        token = Cookies.get("session");
        res = await doFetch(token);
      }

      return res;
    },
    [logout, refreshSession]
  );

  return (
    <SessionContext.Provider
      value={{
        user,
        setUser,
        status,
        loading,
        error,
        isAdmin: user?.isAdmin || false,
        isAgent: user?.isAgent || false, // Expose isAgent in context
        refreshSession,
        logout,
        fetchWithAuth,
      }}
    >
      {loading ? (
        <div className="flex h-screen items-center justify-center">
          <p>Loading...</p>
        </div>
      ) : (
        children
      )}
    </SessionContext.Provider>
  );
};

export const useUser = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useUser must be used within SessionProvider");
  return ctx;
};