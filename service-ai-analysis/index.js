const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const aiRoutes = require('./routes/aiAnalysis.route');
require('dotenv').config();
if (!process.env.JWT_SECRET) throw new Error('Thiếu JWT_SECRET trong file .env của service');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', aiRoutes);

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/medical_db')
  .then(() => app.listen(4004, () => console.log('AI Service running on port 4004')))
  .catch(err => console.error('Database connection error:', err));1