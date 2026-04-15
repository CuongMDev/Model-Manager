const path = require("node:path");
require("dotenv").config();

const express = require("express");
const { Sequelize, DataTypes, Op } = require("sequelize");

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_PAGE_SIZE = 15;
const DEFAULT_LIMIT = 10;

const sequelize = new Sequelize(
  process.env.DB_NAME || "classicmodels",
  process.env.DB_USER || "root",
  process.env.DB_PASSWORD || "",
  {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    dialect: "mysql",
    logging: false,
    dialectOptions: {
      decimalNumbers: true,
    },
  },
);

const Customer = sequelize.define(
  "Customer",
  {
    customerNumber: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    customerName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "customers",
    freezeTableName: true,
    timestamps: false,
  },
);

const Order = sequelize.define(
  "Order",
  {
    orderNumber: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    orderDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    customerNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "orders",
    freezeTableName: true,
    timestamps: false,
  },
);

const Product = sequelize.define(
  "Product",
  {
    productCode: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    productName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    productLine: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "products",
    freezeTableName: true,
    timestamps: false,
  },
);

const OrderDetail = sequelize.define(
  "OrderDetail",
  {
    orderNumber: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    productCode: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    quantityOrdered: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    priceEach: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
  },
  {
    tableName: "orderdetails",
    freezeTableName: true,
    timestamps: false,
  },
);

Customer.hasMany(Order, { as: "orders", foreignKey: "customerNumber" });
Order.belongsTo(Customer, { as: "customer", foreignKey: "customerNumber" });

Order.hasMany(OrderDetail, { as: "details", foreignKey: "orderNumber" });
OrderDetail.belongsTo(Order, { as: "order", foreignKey: "orderNumber" });

Product.hasMany(OrderDetail, { as: "orderDetails", foreignKey: "productCode" });
OrderDetail.belongsTo(Product, { as: "product", foreignKey: "productCode" });

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function normalizeDateInput(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  return text;
}

function parseIntegerInput(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function parseDateRange(query) {
  const fromDate = normalizeDateInput(query.fromDate);
  const toDate = normalizeDateInput(query.toDate);

  if (query.fromDate && !fromDate) {
    return { error: "fromDate must be in YYYY-MM-DD format." };
  }

  if (query.toDate && !toDate) {
    return { error: "toDate must be in YYYY-MM-DD format." };
  }

  if (fromDate && toDate && fromDate > toDate) {
    return { error: "fromDate must be less than or equal to toDate." };
  }

  return { fromDate, toDate };
}

function toYearValue(input) {
  if (!input) {
    return null;
  }

  const parsed = Number.parseInt(String(input), 10);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2099) {
    return null;
  }

  return parsed;
}

function roundMoney(value) {
  return Number((value || 0).toFixed(2));
}

function getOrderDateYear(orderDate) {
  return Number.parseInt(String(orderDate).slice(0, 4), 10);
}

function buildOrderWhere(fromDate, toDate) {
  const where = {};

  if (!fromDate && !toDate) {
    return where;
  }

  where.orderDate = {};
  if (fromDate) {
    where.orderDate[Op.gte] = fromDate;
  }
  if (toDate) {
    where.orderDate[Op.lte] = toDate;
  }

  return where;
}

async function fetchSalesRows({ fromDate, toDate }) {
  const orderWhere = buildOrderWhere(fromDate, toDate);

  const rows = await OrderDetail.findAll({
    attributes: ["orderNumber", "productCode", "quantityOrdered", "priceEach"],
    include: [
      {
        model: Order,
        as: "order",
        required: true,
        where: orderWhere,
        attributes: ["orderNumber", "orderDate", "status", "customerNumber"],
        include: [
          {
            model: Customer,
            as: "customer",
            required: true,
            attributes: ["customerNumber", "customerName"],
          },
        ],
      },
      {
        model: Product,
        as: "product",
        required: true,
        attributes: ["productCode", "productName", "productLine"],
      },
    ],
    raw: true,
    nest: true,
  });

  return rows.map((row) => {
    const quantity = Number(row.quantityOrdered || 0);
    const priceEach = Number(row.priceEach || 0);
    const amount = quantity * priceEach;

    return {
      orderNumber: Number(row.orderNumber),
      orderDate: String(row.order.orderDate),
      status: String(row.order.status),
      customerNumber: Number(row.order.customer.customerNumber),
      customerName: String(row.order.customer.customerName),
      productCode: String(row.productCode),
      productName: String(row.product.productName),
      productLine: String(row.product.productLine || ""),
      quantityOrdered: quantity,
      priceEach,
      amount,
    };
  });
}

function buildSearchResponse(rows, { customer, product, status, page, pageSize }) {
  const customerKey = customer.trim().toLowerCase();
  const productKey = product.trim().toLowerCase();
  const statusKey = status.trim().toLowerCase();

  const filteredRows = rows.filter((row) => {
    const customerMatch = !customerKey || row.customerName.toLowerCase().includes(customerKey);
    const productMatch = !productKey || row.productName.toLowerCase().includes(productKey);
    const statusMatch = !statusKey || row.status.toLowerCase() === statusKey;

    return customerMatch && productMatch && statusMatch;
  });

  const map = new Map();

  for (const row of filteredRows) {
    if (!map.has(row.orderNumber)) {
      map.set(row.orderNumber, {
        orderNumber: row.orderNumber,
        orderDate: row.orderDate,
        status: row.status,
        customerNumber: row.customerNumber,
        customerName: row.customerName,
        itemCodes: new Set(),
        unitsSold: 0,
        orderTotal: 0,
      });
    }

    const target = map.get(row.orderNumber);
    target.itemCodes.add(row.productCode);
    target.unitsSold += row.quantityOrdered;
    target.orderTotal += row.amount;
  }

  const orders = Array.from(map.values())
    .map((item) => ({
      orderNumber: item.orderNumber,
      orderDate: item.orderDate,
      status: item.status,
      customerNumber: item.customerNumber,
      customerName: item.customerName,
      itemCount: item.itemCodes.size,
      unitsSold: item.unitsSold,
      orderTotal: roundMoney(item.orderTotal),
    }))
    .sort((a, b) => {
      if (a.orderDate === b.orderDate) {
        return b.orderNumber - a.orderNumber;
      }
      return b.orderDate.localeCompare(a.orderDate);
    });

  const total = orders.length;
  const offset = (page - 1) * pageSize;
  const data = orders.slice(offset, offset + pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    data,
  };
}

function aggregateOverview(rows) {
  const orderSet = new Set();
  const customerSet = new Set();
  let unitsSold = 0;
  let revenue = 0;

  for (const row of rows) {
    orderSet.add(row.orderNumber);
    customerSet.add(row.customerNumber);
    unitsSold += row.quantityOrdered;
    revenue += row.amount;
  }

  return {
    totalOrders: orderSet.size,
    totalCustomers: customerSet.size,
    unitsSold,
    revenue: roundMoney(revenue),
    averageOrderValue: orderSet.size === 0 ? 0 : roundMoney(revenue / orderSet.size),
  };
}

function aggregateByCustomer(rows, limit) {
  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.customerNumber)) {
      map.set(row.customerNumber, {
        customerNumber: row.customerNumber,
        customerName: row.customerName,
        unitsSold: 0,
        revenue: 0,
        orderSet: new Set(),
      });
    }

    const target = map.get(row.customerNumber);
    target.unitsSold += row.quantityOrdered;
    target.revenue += row.amount;
    target.orderSet.add(row.orderNumber);
  }

  return Array.from(map.values())
    .map((item) => ({
      customerNumber: item.customerNumber,
      customerName: item.customerName,
      unitsSold: item.unitsSold,
      ordersCount: item.orderSet.size,
      revenue: roundMoney(item.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function aggregateByProduct(rows, limit) {
  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.productCode)) {
      map.set(row.productCode, {
        productCode: row.productCode,
        productName: row.productName,
        productLine: row.productLine,
        unitsSold: 0,
        revenue: 0,
        orderSet: new Set(),
      });
    }

    const target = map.get(row.productCode);
    target.unitsSold += row.quantityOrdered;
    target.revenue += row.amount;
    target.orderSet.add(row.orderNumber);
  }

  return Array.from(map.values())
    .map((item) => ({
      productCode: item.productCode,
      productName: item.productName,
      productLine: item.productLine,
      unitsSold: item.unitsSold,
      ordersCount: item.orderSet.size,
      revenue: roundMoney(item.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function aggregateByTime(rows, granularity, year) {
  const map = new Map();

  for (const row of rows) {
    const rowYear = getOrderDateYear(row.orderDate);
    if (year && rowYear !== year) {
      continue;
    }

    const key =
      granularity === "day" ? row.orderDate : `${row.orderDate.slice(0, 4)}-${row.orderDate.slice(5, 7)}`;

    if (!map.has(key)) {
      map.set(key, {
        bucket: key,
        unitsSold: 0,
        revenue: 0,
      });
    }

    const target = map.get(key);
    target.unitsSold += row.quantityOrdered;
    target.revenue += row.amount;
  }

  return Array.from(map.values())
    .map((item) => ({
      bucket: item.bucket,
      unitsSold: item.unitsSold,
      revenue: roundMoney(item.revenue),
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function aggregatePivot(rows, selectedYear, limit) {
  const map = new Map();

  for (const row of rows) {
    const rowYear = getOrderDateYear(row.orderDate);
    if (rowYear !== selectedYear) {
      continue;
    }

    if (!map.has(row.customerNumber)) {
      map.set(row.customerNumber, {
        customerNumber: row.customerNumber,
        customerName: row.customerName,
        months: Array(12).fill(0),
        total: 0,
      });
    }

    const monthIndex = Number.parseInt(row.orderDate.slice(5, 7), 10) - 1;
    const target = map.get(row.customerNumber);
    target.months[monthIndex] += row.amount;
    target.total += row.amount;
  }

  const rowsData = Array.from(map.values())
    .map((item) => ({
      customerNumber: item.customerNumber,
      customerName: item.customerName,
      months: item.months.map((value) => roundMoney(value)),
      total: roundMoney(item.total),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return {
    year: selectedYear,
    columns: monthLabels,
    rows: rowsData,
  };
}

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(__dirname));

  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      database: process.env.DB_NAME || "classicmodels",
      host: process.env.DB_HOST || "127.0.0.1",
    });
  });

  app.get("/api/search/orders", async (req, res, next) => {
    try {
      const dateRange = parseDateRange(req.query);
      if (dateRange.error) {
        res.status(400).json({ error: dateRange.error });
        return;
      }

      const page = parseIntegerInput(req.query.page, 1, 1, 1000000);
      const pageSize = parseIntegerInput(req.query.pageSize, DEFAULT_PAGE_SIZE, 1, 100);

      const rows = await fetchSalesRows(dateRange);
      const payload = buildSearchResponse(rows, {
        customer: String(req.query.customer || ""),
        product: String(req.query.product || ""),
        status: String(req.query.status || ""),
        page,
        pageSize,
      });

      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stats/overview", async (req, res, next) => {
    try {
      const dateRange = parseDateRange(req.query);
      if (dateRange.error) {
        res.status(400).json({ error: dateRange.error });
        return;
      }

      const rows = await fetchSalesRows(dateRange);
      res.json(aggregateOverview(rows));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stats/by-customer", async (req, res, next) => {
    try {
      const dateRange = parseDateRange(req.query);
      if (dateRange.error) {
        res.status(400).json({ error: dateRange.error });
        return;
      }

      const limit = parseIntegerInput(req.query.limit, DEFAULT_LIMIT, 1, 50);
      const rows = await fetchSalesRows(dateRange);
      res.json(aggregateByCustomer(rows, limit));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stats/by-time", async (req, res, next) => {
    try {
      const dateRange = parseDateRange(req.query);
      if (dateRange.error) {
        res.status(400).json({ error: dateRange.error });
        return;
      }

      const year = req.query.year ? toYearValue(req.query.year) : null;
      if (req.query.year && !year) {
        res.status(400).json({ error: "year must be between 1900 and 2099." });
        return;
      }

      const granularity = req.query.granularity === "day" ? "day" : "month";

      const rows = await fetchSalesRows(dateRange);
      res.json(
        aggregateByTime(rows, granularity, year).map((item) => ({
          ...item,
          year: year || null,
          granularity,
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stats/by-product", async (req, res, next) => {
    try {
      const dateRange = parseDateRange(req.query);
      if (dateRange.error) {
        res.status(400).json({ error: dateRange.error });
        return;
      }

      const limit = parseIntegerInput(req.query.limit, DEFAULT_LIMIT, 1, 50);
      const rows = await fetchSalesRows(dateRange);
      res.json(aggregateByProduct(rows, limit));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stats/pivot/customer-time", async (req, res, next) => {
    try {
      const dateRange = parseDateRange(req.query);
      if (dateRange.error) {
        res.status(400).json({ error: dateRange.error });
        return;
      }

      const limit = parseIntegerInput(req.query.limit, DEFAULT_LIMIT, 1, 30);
      const rows = await fetchSalesRows(dateRange);

      const yearList = [...new Set(rows.map((row) => getOrderDateYear(row.orderDate)))].sort();

      if (yearList.length === 0) {
        res.json({ year: null, columns: monthLabels, rows: [] });
        return;
      }

      const requestedYear = req.query.year ? toYearValue(req.query.year) : null;
      if (req.query.year && !requestedYear) {
        res.status(400).json({ error: "year must be between 1900 and 2099." });
        return;
      }

      const selectedYear = requestedYear || yearList[yearList.length - 1];
      res.json(aggregatePivot(rows, selectedYear, limit));
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  });

  return app;
}

async function startServer() {
  await sequelize.authenticate();

  await Promise.all([
    Customer.count({ limit: 1 }),
    Order.count({ limit: 1 }),
    Product.count({ limit: 1 }),
    OrderDetail.count({ limit: 1 }),
  ]);

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Classicmodels dashboard running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server.");
  console.error(error.message);
  process.exit(1);
});
