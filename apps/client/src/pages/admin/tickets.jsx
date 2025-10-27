// src/pages/tickets/index.jsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  useFilters,
  useGlobalFilter,
  usePagination,
  useTable,
} from "@tanstack/react-table";
import moment from "moment";
import { useUser } from "../../store/session";

const fetchAllTickets = async (fetchWithAuth) => {
  const response = await fetchWithAuth("/v1/ticket/tickets/all", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch tickets: ${response.statusText}`);
  const data = await response.json();
  if (data.success === false) {
    throw new Error(data.error || "Failed to fetch tickets");
  }
  return data;
};

const TicketsMobileList = ({ tickets }) => {
  return (
    <div className="p-4">
      {tickets.map((ticket, index) => (
        <div key={index} className="border-b py-2">
          <div className="text-sm font-medium text-gray-900">{ticket.title}</div>
          <div className="text-xs text-gray-500">
            {moment(ticket.createdAt).format("DD/MM/YYYY")}
          </div>
        </div>
      ))}
    </div>
  );
};

const DefaultColumnFilter = ({ column }) => {
  const { filterValue, setFilter } = column;
  return (
    <input
      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
      type="text"
      value={filterValue || ""}
      onChange={(e) => {
        setFilter(e.target.value || undefined);
      }}
      placeholder="Type to filter"
    />
  );
};

const Table = ({ columns, data }) => {
  const filterTypes = useMemo(
    () => ({
      text: (rows, id, filterValue) =>
        rows.filter((row) => {
          const rowValue = row.values[id];
          return rowValue !== undefined
            ? String(rowValue)
                .toLowerCase()
                .startsWith(String(filterValue).toLowerCase())
            : true;
        }),
    }),
    []
  );

  const defaultColumn = useMemo(
    () => ({
      Filter: DefaultColumnFilter,
    }),
    []
  );

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    page,
    prepareRow,
    canPreviousPage,
    canNextPage,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize },
  } = useTable(
    {
      columns,
      data,
      defaultColumn,
      filterTypes,
      initialState: {
        pageIndex: 0,
      },
    },
    useFilters,
    useGlobalFilter,
    usePagination
  );

  return (
    <div className="overflow-x-auto md:-mx-6 lg:-mx-8">
      <div className="py-2 align-middle inline-block min-w-full md:px-6 lg:px-8">
        <div className="shadow overflow-hidden border-b border-gray-200 md:rounded-lg">
          <table
            {...getTableProps()}
            className="min-w-full divide-y divide-gray-200"
          >
            <thead className="bg-gray-50">
              {headerGroups.map((headerGroup) => (
                <tr
                  {...headerGroup.getHeaderGroupProps()}
                  key={headerGroup.headers.map((header) => header.id).join("-")}
                >
                  {headerGroup.headers.map((column) =>
                    column.hideHeader === false ? null : (
                      <th
                        {...column.getHeaderProps()}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {column.render("Header")}
                        <div>
                          {column.canFilter ? column.render("Filter") : null}
                        </div>
                      </th>
                    )
                  )}
                </tr>
              ))}
            </thead>
            <tbody {...getTableBodyProps()}>
              {page.map((row) => {
                prepareRow(row);
                return (
                  <tr {...row.getRowProps()} className="bg-white">
                    {row.cells.map((cell) => (
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"
                        {...cell.getCellProps()}
                      >
                        {cell.render("Cell")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {data.length > 10 && (
            <nav
              className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6"
              aria-label="Pagination"
            >
              <div className="hidden sm:block">
                <div className="flex flex-row flex-nowrap w-full space-x-2">
                  <p className="block text-sm font-medium text-gray-700 mt-4">
                    Show
                  </p>
                  <select
                    id="location"
                    name="location"
                    className="block w-full pl-3 pr-10 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                    }}
                  >
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <option key={pageSize} value={pageSize}>
                        {pageSize}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex-1 flex justify-between sm:justify-end">
                <button
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  type="button"
                  onClick={() => previousPage()}
                  disabled={!canPreviousPage}
                >
                  Previous
                </button>
                <button
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  type="button"
                  onClick={() => nextPage()}
                  disabled={!canNextPage}
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
};

const Tickets = () => {
  const navigate = useNavigate();
  const { fetchWithAuth } = useUser();

  const { data, status, refetch } = useQuery({
    queryKey: ["fetchAllTickets"],
    queryFn: () => fetchAllTickets(fetchWithAuth),
    onError: (error) => {
      toast.error(`Error fetching tickets: ${error.message}`, {
        toastId: "fetch-tickets-error",
        autoClose: 5000,
      });
      navigate("/auth/login");
    },
  });

  const high = "bg-red-100 text-red-800";
  const low = "bg-blue-100 text-blue-800";
  const normal = "bg-green-100 text-green-800";

  const columns = useMemo(
    () => [
      {
        Header: "Type",
        accessor: "type",
        id: "type",
        width: 50,
      },
      {
        Header: "Summary",
        accessor: "title",
        id: "summary",
        Cell: ({ row, value }) => (
          <span className="max-w-[240px] truncate">{value}</span>
        ),
      },
      {
        Header: "Assignee",
        accessor: "assignedTo.name",
        id: "assignee",
        Cell: ({ row, value }) => (
          <span className="w-[80px] truncate">{value ? value : "n/a"}</span>
        ),
      },
      {
        Header: "Client",
        accessor: "client.name",
        id: "client",
        Cell: ({ row, value }) => (
          <span className="w-[80px] truncate">{value ? value : "n/a"}</span>
        ),
      },
      {
        Header: "Priority",
        accessor: "priority",
        id: "priority",
        Cell: ({ row, value }) => {
          let badge;
          if (value === "Low") {
            badge = low;
          }
          if (value === "Normal") {
            badge = normal;
          }
          if (value === "High") {
            badge = high;
          }
          return (
            <span
              className={`inline-flex items-center rounded-md justify-center w-1/2 px-2 py-1 text-xs font-medium ring-1 ring-inset ${badge}`}
            >
              {value}
            </span>
          );
        },
      },
      {
        Header: "Status",
        accessor: "status",
        id: "status",
        Cell: ({ row, value }) => (
          <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-700 ring-1 ring-inset ring-red-600/10">
            {value === "needs_support" && <span>Needs Support</span>}
            {value === "in_progress" && <span>In Progress</span>}
            {value === "in_review" && <span>In Review</span>}
            {value === "done" && <span>Done</span>}
          </span>
        ),
      },
      {
        Header: "Created",
        accessor: "createdAt",
        id: "created",
        Cell: ({ row, value }) => (
          <span>{moment(value).format("DD/MM/YYYY")}</span>
        ),
      },
    ],
    []
  );

  return (
    <main className="flex-1">
      <div className="relative max-w-4xl mx-auto md:px-8 xl:px-0">
        <div className="pt-10 pb-16 divide-y-2">
          <div className="px-4 sm:px-6 md:px-0">
            <h1 className="text-3xl font-extrabold text-gray-900">Tickets</h1>
          </div>
          <div className="px-4 sm:px-6 md:px-0">
            <div className="sm:flex sm:items-center">
              <div className="sm:flex-auto mt-4">
                <p className="mt-2 text-sm text-gray-700">
                  A list of all your organisation's tickets, regardless of status.
                </p>
              </div>
            </div>
            <div className="py-4">
              {status === "pending" && (
                <div className="min-h-screen flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8">
                  <h2>Loading data...</h2>
                </div>
              )}
              {status === "error" && (
                <div className="min-h-screen flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8">
                  <h2 className="text-2xl font-bold">Error fetching data...</h2>
                </div>
              )}
              {status === "success" && (
                <>
                  {data.tickets && data.tickets.length > 0 ? (
                    <>
                      <div className="hidden sm:block">
                        <Table columns={columns} data={data.tickets} />
                      </div>
                      <div className="sm:hidden">
                        <TicketsMobileList tickets={data.tickets} />
                      </div>
                    </>
                  ) : (
                    <div className="text-center mt-72">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">
                        You currently don't have any assigned tickets. :)
                      </h3>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Tickets;