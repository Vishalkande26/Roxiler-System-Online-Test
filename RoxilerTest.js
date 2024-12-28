
//npm install express mongoose axios body-parser -------(//This is command for install express mongoose)




const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const bodyParser = require('body-parser');

// Initialize app and middleware
const app = express();
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/transactionsDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define Mongoose Schema
const transactionSchema = new mongoose.Schema({
  title: String,
  description: String,
  price: Number,
  category: String,
  sold: Boolean,
  dateOfSale: Date,
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// API: Seed Database
app.get('/api/initialize', async (req, res) => {
  try {
    const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    await Transaction.deleteMany({});
    await Transaction.insertMany(response.data);
    res.send({ message: 'Database initialized with seed data.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to initialize database.' });
  }
});

// API: List Transactions (Search & Pagination)
app.get('/api/transactions', async (req, res) => {
  const { month, search, page = 1, perPage = 10 } = req.query;

  const query = {};
  if (month) {
    const monthIndex = new Date(`${month} 1, 2000`).getMonth();
    query.dateOfSale = {
      $gte: new Date(2000, monthIndex, 1),
      $lt: new Date(2000, monthIndex + 1, 1),
    };
  }

  if (search) {
    query.$or = [
      { title: new RegExp(search, 'i') },
      { description: new RegExp(search, 'i') },
      { price: parseFloat(search) },
    ];
  }

  const transactions = await Transaction.find(query)
    .skip((page - 1) * perPage)
    .limit(parseInt(perPage));
  res.send(transactions);
});

// API: Statistics
app.get('/api/statistics', async (req, res) => {
  const { month } = req.query;
  const monthIndex = new Date(`${month} 1, 2000`).getMonth();

  const match = {
    dateOfSale: {
      $gte: new Date(2000, monthIndex, 1),
      $lt: new Date(2000, monthIndex + 1, 1),
    },
  };

  const [stats] = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$price' },
        soldItems: { $sum: { $cond: ['$sold', 1, 0] } },
        unsoldItems: { $sum: { $cond: ['$sold', 0, 1] } },
      },
    },
  ]);

  res.send(stats || { totalSales: 0, soldItems: 0, unsoldItems: 0 });
});

// API: Bar Chart
app.get('/api/bar-chart', async (req, res) => {
  const { month } = req.query;
  const monthIndex = new Date(`${month} 1, 2000`).getMonth();

  const match = {
    dateOfSale: {
      $gte: new Date(2000, monthIndex, 1),
      $lt: new Date(2000, monthIndex + 1, 1),
    },
  };

  const ranges = [
    [0, 100],
    [101, 200],
    [201, 300],
    [301, 400],
    [401, 500],
    [501, 600],
    [601, 700],
    [701, 800],
    [801, 900],
    [901, Infinity],
  ];

  const barData = await Promise.all(
    ranges.map(async ([min, max]) => {
      const count = await Transaction.countDocuments({
        ...match,
        price: { $gte: min, $lt: max },
      });
      return { range: `${min}-${max}`, count };
    })
  );

  res.send(barData);
});

// API: Pie Chart
app.get('/api/pie-chart', async (req, res) => {
  const { month } = req.query;
  const monthIndex = new Date(`${month} 1, 2000`).getMonth();

  const match = {
    dateOfSale: {
      $gte: new Date(2000, monthIndex, 1),
      $lt: new Date(2000, monthIndex + 1, 1),
    },
  };

  const categories = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
      },
    },
  ]);

  res.send(categories.map((c) => ({ category: c._id, count: c.count })));
});

// API: Combined
app.get('/api/combined', async (req, res) => {
  const { month } = req.query;
  const [transactions, statistics, barChart, pieChart] = await Promise.all([
    axios.get(`/api/transactions?month=${month}`),
    axios.get(`/api/statistics?month=${month}`),
    axios.get(`/api/bar-chart?month=${month}`),
    axios.get(`/api/pie-chart?month=${month}`),
  ]);

  res.send({
    transactions: transactions.data,
    statistics: statistics.data,
    barChart: barChart.data,
    pieChart: pieChart.data,
  });
});

// Start the server
const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
