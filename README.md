# Classicmodels Analytics Dashboard

Website for searching and analyzing Classicmodels data by customer, time, and product.

## Stack

- Backend: Node.js, Express, Sequelize ORM, MySQL
- API: RESTful JSON endpoints
- Frontend: Vanilla JavaScript, Chart.js, Pivot table rendering

## Features

- Search orders by customer, product, status, and date range
- KPI cards: revenue, total orders, total customers, average order value
- Charts:
  - Revenue by customer
  - Revenue by time
  - Revenue by product
- Pivot table: customer x month

## 1) Prepare database

Use the MySQL sample database `classicmodels`.

If needed, import sample SQL:

```bash
mysql -u root -p < classicmodels.sql
```

## 2) Configure environment

Create `.env` from `.env.example` and set your DB credentials:

```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=classicmodels
DB_USER=root
DB_PASSWORD=your_password
```

## 3) Install and run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## REST API

- `GET /api/health`
- `GET /api/search/orders?customer=&product=&status=&fromDate=&toDate=&page=&pageSize=`
- `GET /api/stats/overview?fromDate=&toDate=`
- `GET /api/stats/by-customer?fromDate=&toDate=&limit=`
- `GET /api/stats/by-time?fromDate=&toDate=&year=&granularity=month|day`
- `GET /api/stats/by-product?fromDate=&toDate=&limit=`
- `GET /api/stats/pivot/customer-time?fromDate=&toDate=&year=&limit=`
"# Model-Manager" 
