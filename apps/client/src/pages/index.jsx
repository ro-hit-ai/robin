// apps/client/src/pages/index.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import moment from "moment";
import { useUser } from "../store/session.jsx";
import { toast } from "react-toastify";
import { debounce } from "lodash";
import { apiUrl } from "../utils/api"; // 👈 centralized API helper

const CLIENT_VERSION = import.meta.env.VITE_CLIENT_VERSION || "unknown";

const Home = () => {
  const navigate = useNavigate();
  const { user, loading, logout } = useUser();
  const token = Cookies.get("session");

  const [openTickets, setOpenTickets] = useState(0);
  const [completedTickets, setCompletedTickets] = useState(0);
  const [unassigned, setUnassigned] = useState(0);
  const [tickets, setTickets] = useState([]);
  const [errMessage, setErrMessage] = useState(null);

  const dashboardFetched = useRef(false);
  const stableUser = useMemo(() => user, [user?.id]);
  const debouncedToastError = debounce(toast.error, 2000);

  const fetchDashboardData = async () => {
    if (dashboardFetched.current) return;
    dashboardFetched.current = true;

    try {
      const res = await fetch(apiUrl("/v1/ticket/data/tickets/summary"), {
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error ${res.status}: ${text}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Expected JSON, got: ${text.slice(0, 100)}`);
      }

      const data = await res.json();

      if (data.success) {
        setOpenTickets(data.open || 0);
        setCompletedTickets(data.completed || 0);
        setUnassigned(data.unassigned || 0);
        setTickets(data.tickets || []);
        setErrMessage(null);
      } else {
        setErrMessage(data.message || "Failed to load dashboard data.");
        debouncedToastError(data.message || "Failed to load dashboard data.");
      }
    } catch (err) {
      setErrMessage(err.message);
      debouncedToastError(err.message);
    }
  };

  useEffect(() => {
    if (!loading && stableUser && token && !dashboardFetched.current) {
      fetchDashboardData();
    }
  }, [loading, stableUser?.id, token]);

  if (loading) {
    return (
      <div className="flex flex-col xl:flex-row p-8 justify-center w-full">
        <div className="w-full xl:w-[70%] max-w-5xl">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    { name: "Open Issues", stat: openTickets, to: "/issues" },
    {
      name: "Completed Issues",
      stat: completedTickets,
      to: "/issues?filter=closed",
    },
    {
      name: "Unassigned Issues",
      stat: unassigned,
      to: "/issues?filter=unassigned",
    },
  ];

  return (
    <div className="flex flex-col xl:flex-row p-8 justify-center w-full">
      <div className="w-full xl:w-[70%] max-w-5xl">

        {/* ✅ Go to Dashboard button */}
        {stableUser && (
          <div className="mb-6 flex justify-end">
            <button
              onClick={() => {
                if (stableUser.isAdmin) {
                  navigate("/admin");
                } else {
                  navigate("/portal");
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Go to {stableUser.isAdmin ? "Admin" : "User"} Dashboard
            </button>
          </div>
        )}

        {errMessage && (
          <div className="text-red-500 p-4 bg-red-50 rounded-md mb-4">
            <p>{errMessage}</p>
            <button
              onClick={fetchDashboardData}
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded-md"
            >
              Retry
            </button>
            <button
              onClick={() => logout(true)}
              className="mt-4 ml-2 px-4 py-2 bg-red-600 text-white rounded-md"
            >
              Logout
            </button>
          </div>
        )}

        {/* Version for small screens */}
        <div className="block sm:hidden mb-4">
          {stableUser?.isAdmin && (
            <Link to="https://github.com/Peppermint-Lab/peppermint/releases">
              <span className="inline-flex items-center rounded-md bg-green-700/10 px-3 py-2 text-xs font-medium text-green-600 ring-1 ring-inset ring-green-500/20">
                Version {CLIENT_VERSION}
              </span>
            </Link>
          )}
        </div>

        {/* Stats */}
        <div>
          <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {stats.map((item, index) => (
              <Link key={index} to={item.to}>
                <div className="px-4 py-5 bg-gray-900 shadow rounded-lg overflow-hidden sm:p-6 cursor-pointer hover:bg-gray-800 transition-colors">
                  <dt className="text-sm font-medium text-white truncate">
                    {item.name}
                  </dt>
                  <dd className="mt-1 text-3xl font-semibold text-white">
                    {item.stat}
                  </dd>
                </div>
              </Link>
            ))}
          </dl>
        </div>

        {/* Tickets */}
        <div className="flex w-full flex-col mt-4 px-1 mb-4">
          {tickets?.length === 0 ? (
            <div className="text-center p-4">
              <p className="text-gray-500">
                No tickets found. Create your first issue or check your filters.
              </p>
              <Link to="/issues/new">
                <button className="mt-4 px-4 py-2 bg-green-600 text-white rounded-md">
                  Create New Issue
                </button>
              </Link>
            </div>
          ) : (
            <>
              <span className="font-bold text-2xl mb-4">Recent Issues</span>
              <div className="-mx-4 sm:-mx-0 w-full">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead>
                    <tr>
                      <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-0">
                        Title
                      </th>
                      <th className="hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white lg:table-cell">
                        Priority
                      </th>
                      <th className="hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white sm:table-cell">
                        Status
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Created
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Assigned To
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {tickets.slice(0, 10).map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-300 dark:hover:bg-green-600 cursor-pointer transition-colors"
                        onClick={() => navigate(`/issue/${item.id}`)}
                      >
                        <td className="truncate py-1 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-white sm:pl-0">
                          {item.title}
                        </td>
                        <td className="hidden px-3 py-1 text-sm text-gray-500 lg:table-cell">
                          {item.priority}
                        </td>
                        <td className="hidden px-3 py-1 text-sm text-gray-500 sm:table-cell">
                          {item.isComplete ? "Closed" : "Open"}
                        </td>
                        <td className="px-3 py-1 text-sm text-gray-500 dark:text-white">
                          {moment(item.createdAt).format("DD/MM/YYYY")}
                        </td>
                        <td className="px-3 py-1 text-sm text-gray-500 dark:text-white truncate whitespace-nowrap">
                          {item.assignedTo ? item.assignedTo.name : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
