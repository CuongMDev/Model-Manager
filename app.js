const API = {
  health: "/api/health",
  searchOrders: "/api/search/orders",
  overview: "/api/stats/overview",
  byCustomer: "/api/stats/by-customer",
  byTime: "/api/stats/by-time",
  byProduct: "/api/stats/by-product",
  pivot: "/api/stats/pivot/customer-time",
};

const state = {
  searchPage: 1,
  pageSize: 15,
  totalSearchRows: 0,
  charts: {
    customer: null,
    time: null,
    product: null,
  },
};

const dom = {
  apiStatus: document.getElementById("apiStatus"),
  searchForm: document.getElementById("searchForm"),
  customerFilter: document.getElementById("customerFilter"),
  productFilter: document.getElementById("productFilter"),
  statusFilter: document.getElementById("statusFilter"),
  searchFromDate: document.getElementById("searchFromDate"),
  searchToDate: document.getElementById("searchToDate"),
  pageSize: document.getElementById("pageSize"),
  clearSearchBtn: document.getElementById("clearSearchBtn"),
  searchResultBody: document.getElementById("searchResultBody"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageInfo: document.getElementById("pageInfo"),

  statsFilterForm: document.getElementById("statsFilterForm"),
  statsFromDate: document.getElementById("statsFromDate"),
  statsToDate: document.getElementById("statsToDate"),
  statsYear: document.getElementById("statsYear"),
  statsLimit: document.getElementById("statsLimit"),

  overviewRevenue: document.getElementById("overviewRevenue"),
  overviewOrders: document.getElementById("overviewOrders"),
  overviewCustomers: document.getElementById("overviewCustomers"),
  overviewAov: document.getElementById("overviewAov"),

  customerChart: document.getElementById("customerChart"),
  timeChart: document.getElementById("timeChart"),
  productChart: document.getElementById("productChart"),

  pivotContainer: document.getElementById("pivotContainer"),
};

function init() {
  bindEvents();
  setDefaults();

  checkApiHealth();
  loadSearch(1);
  loadStats();
}

function bindEvents() {
  dom.searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadSearch(1);
  });

  dom.pageSize.addEventListener("change", async () => {
    state.pageSize = Number(dom.pageSize.value);
    await loadSearch(1);
  });

  dom.clearSearchBtn.addEventListener("click", async () => {
    dom.customerFilter.value = "";
    dom.productFilter.value = "";
    dom.statusFilter.value = "";
    dom.searchFromDate.value = "";
    dom.searchToDate.value = "";
    await loadSearch(1);
  });

  dom.prevPageBtn.addEventListener("click", async () => {
    if (state.searchPage > 1) {
      await loadSearch(state.searchPage - 1);
    }
  });

  dom.nextPageBtn.addEventListener("click", async () => {
    const totalPages = Math.max(Math.ceil(state.totalSearchRows / state.pageSize), 1);
    if (state.searchPage < totalPages) {
      await loadSearch(state.searchPage + 1);
    }
  });

  dom.statsFilterForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadStats();
  });
}

function setDefaults() {
  state.pageSize = Number(dom.pageSize.value);
  if (!dom.statsYear.value) {
    dom.statsYear.value = "2004";
  }
}

function buildSearchQuery(page) {
  const params = new URLSearchParams();
  const customer = dom.customerFilter.value.trim();
  const product = dom.productFilter.value.trim();
  const status = dom.statusFilter.value.trim();

  if (customer) {
    params.set("customer", customer);
  }
  if (product) {
    params.set("product", product);
  }
  if (status) {
    params.set("status", status);
  }
  if (dom.searchFromDate.value) {
    params.set("fromDate", dom.searchFromDate.value);
  }
  if (dom.searchToDate.value) {
    params.set("toDate", dom.searchToDate.value);
  }

  params.set("page", String(page));
  params.set("pageSize", String(state.pageSize));

  return params;
}

function buildStatsQuery() {
  const params = new URLSearchParams();

  if (dom.statsFromDate.value) {
    params.set("fromDate", dom.statsFromDate.value);
  }
  if (dom.statsToDate.value) {
    params.set("toDate", dom.statsToDate.value);
  }

  const year = dom.statsYear.value.trim();
  if (year) {
    params.set("year", year);
  }

  const limit = dom.statsLimit.value.trim();
  if (limit) {
    params.set("limit", limit);
  }

  return params;
}

async function checkApiHealth() {
  try {
    const health = await apiRequest(API.health);
    dom.apiStatus.textContent = `Connected: ${health.database}@${health.host}`;
  } catch (error) {
    dom.apiStatus.textContent = "API unavailable";
  }
}

async function loadSearch(page) {
  state.searchPage = page;

  try {
    const query = buildSearchQuery(page);
    const payload = await apiRequest(`${API.searchOrders}?${query.toString()}`);

    state.totalSearchRows = Number(payload.total || 0);
    renderSearchRows(Array.isArray(payload.data) ? payload.data : []);
    renderSearchPagination();
  } catch (error) {
    renderSearchError(error.message || "Could not load search data.");
    renderSearchPagination();
  }
}

function renderSearchRows(rows) {
  dom.searchResultBody.innerHTML = "";

  if (rows.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 7;
    emptyCell.textContent = "No records found for current filters.";
    emptyCell.className = "muted-empty";
    emptyRow.appendChild(emptyCell);
    dom.searchResultBody.appendChild(emptyRow);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.appendChild(createCell(`#${row.orderNumber}`));
    tr.appendChild(createCell(formatDate(row.orderDate)));
    tr.appendChild(createCell(row.customerName));
    tr.appendChild(createCell(row.status));
    tr.appendChild(createCell(formatNumber(row.itemCount)));
    tr.appendChild(createCell(formatNumber(row.unitsSold)));
    tr.appendChild(createCell(formatCurrency(row.orderTotal)));
    fragment.appendChild(tr);
  }

  dom.searchResultBody.appendChild(fragment);
}

function renderSearchError(message) {
  dom.searchResultBody.innerHTML = "";
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 7;
  cell.textContent = message;
  cell.className = "muted-empty";
  row.appendChild(cell);
  dom.searchResultBody.appendChild(row);
}

function renderSearchPagination() {
  const totalPages = Math.max(Math.ceil(state.totalSearchRows / state.pageSize), 1);
  dom.pageInfo.textContent = `Page ${state.searchPage} / ${totalPages} (${state.totalSearchRows} rows)`;
  dom.prevPageBtn.disabled = state.searchPage <= 1;
  dom.nextPageBtn.disabled = state.searchPage >= totalPages;
}

async function loadStats() {
  try {
    const query = buildStatsQuery();
    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";

    const [overview, byCustomer, byTime, byProduct, pivot] = await Promise.all([
      apiRequest(`${API.overview}${suffix}`),
      apiRequest(`${API.byCustomer}${suffix}`),
      apiRequest(`${API.byTime}${suffix}`),
      apiRequest(`${API.byProduct}${suffix}`),
      apiRequest(`${API.pivot}${suffix}`),
    ]);

    renderOverview(overview);
    renderCustomerChart(Array.isArray(byCustomer) ? byCustomer : []);
    renderTimeChart(Array.isArray(byTime) ? byTime : []);
    renderProductChart(Array.isArray(byProduct) ? byProduct : []);
    renderPivotTable(pivot);
  } catch (error) {
    dom.pivotContainer.innerHTML = `<div class="muted-empty">${escapeHtml(
      error.message || "Could not load statistics.",
    )}</div>`;
  }
}

function renderOverview(overview) {
  dom.overviewRevenue.textContent = formatCurrency(Number(overview.revenue || 0));
  dom.overviewOrders.textContent = formatNumber(Number(overview.totalOrders || 0));
  dom.overviewCustomers.textContent = formatNumber(Number(overview.totalCustomers || 0));
  dom.overviewAov.textContent = formatCurrency(Number(overview.averageOrderValue || 0));
}

function renderCustomerChart(rows) {
  const labels = rows.map((row) => row.customerName);
  const values = rows.map((row) => Number(row.revenue || 0));

  upsertChart("customer", dom.customerChart, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue",
          data: values,
          backgroundColor: "rgba(15, 118, 110, 0.7)",
          borderRadius: 8,
        },
      ],
    },
    options: buildMoneyAxisChartOptions(),
  });
}

function renderTimeChart(rows) {
  const labels = rows.map((row) => row.bucket);
  const values = rows.map((row) => Number(row.revenue || 0));

  upsertChart("time", dom.timeChart, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue",
          data: values,
          borderColor: "#b45309",
          pointBackgroundColor: "#92400e",
          fill: true,
          backgroundColor: "rgba(180, 83, 9, 0.15)",
          tension: 0.2,
        },
      ],
    },
    options: buildMoneyAxisChartOptions(),
  });
}

function renderProductChart(rows) {
  const labels = rows.map((row) => row.productName);
  const values = rows.map((row) => Number(row.revenue || 0));

  upsertChart("product", dom.productChart, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue",
          data: values,
          backgroundColor: [
            "#0f766e",
            "#ea580c",
            "#0284c7",
            "#16a34a",
            "#b45309",
            "#0e7490",
            "#475569",
            "#7c3aed",
            "#dc2626",
            "#4f46e5",
          ],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 10,
          },
        },
      },
    },
  });
}

function renderPivotTable(pivot) {
  dom.pivotContainer.innerHTML = "";

  if (!pivot || !Array.isArray(pivot.rows) || pivot.rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted-empty";
    empty.textContent = "No pivot data for selected filters.";
    dom.pivotContainer.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  const headerRow = document.createElement("tr");
  headerRow.appendChild(createCell("Customer", true));

  pivot.columns.forEach((monthLabel) => {
    headerRow.appendChild(createCell(monthLabel, true));
  });

  headerRow.appendChild(createCell("Total", true));
  thead.appendChild(headerRow);

  pivot.rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.appendChild(createCell(row.customerName));

    row.months.forEach((value) => {
      tr.appendChild(createCell(formatCurrency(value)));
    });

    tr.appendChild(createCell(formatCurrency(row.total)));
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  dom.pivotContainer.appendChild(table);
}

function upsertChart(chartKey, canvas, config) {
  if (state.charts[chartKey]) {
    state.charts[chartKey].destroy();
  }

  state.charts[chartKey] = new Chart(canvas, config);
}

function buildMoneyAxisChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => formatCurrency(Number(value)),
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}`,
        },
      },
    },
  };
}

function createCell(text, isHeader = false) {
  const element = document.createElement(isHeader ? "th" : "td");
  element.textContent = text;
  return element;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    let message = "Request failed.";
    try {
      const payload = await response.json();
      if (payload && payload.error) {
        message = payload.error;
      }
    } catch (error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return response.json();
}

init();
