// src/pages/admin/logs/index.jsx
import React,{ useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useUser } from "../../store/session";

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { fetchWithAuth } = useUser();

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/v1/data/logs", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error(`Failed to fetch logs: ${response.statusText}`);
      const data = await response.json();

      if (data.success !== false) {
        // Split logs by newline and parse each line as JSON
        const parsedLogs = data.logs
          .split("\n")
          .filter((line) => line.trim()) // Remove empty lines
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch (e) {
              console.error("Failed to parse log line:", e);
              return null;
            }
          })
          .filter((log) => log !== null) // Remove invalid logs
          .sort((a, b) => b.time - a.time); // Sort by timestamp (descending)

        setLogs(parsedLogs);
      } else {
        throw new Error(data.error || "Failed to fetch logs");
      }
    } catch (error) {
      toast.error(`Error fetching logs: ${error.message}`, {
        toastId: "fetch-logs-error",
        autoClose: 5000,
      });
      navigate("/auth/login");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchWithAuth]);

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="p-4">
      <button
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        onClick={() => {
          setLoading(true);
          fetchLogs();
        }}
      >
        Refresh Logs
      </button>
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Logs</h2>
        </div>
        <div className="p-6">
          {logs.length === 0 ? (
            <div>No logs available</div>
          ) : (
            <ul>
              {logs.map((log, index) => (
                <li key={index} className="border-b py-2">
                  <div className="flex flex-row gap-x-2 text-xs">
                    <span className="text-xs text-gray-500">
                      {new Date(log.time).toLocaleString()}
                    </span>
                    <strong>{log.msg}</strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default Logs;