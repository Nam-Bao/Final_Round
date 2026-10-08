const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Import file route upload (file bạn vừa cắt từ booking sang đây)
const uploadRoutes = require('./routes/upload.route.js');

// Mount route vào '/upload'
// (Vì API Gateway cắt mất chữ /api/media rồi, nên request đến đây chỉ còn là /upload)
app.use('/upload', uploadRoutes);

app.listen(4005, () => {
  console.log('📦 [Service Media] đang chạy tại port 4005');
});