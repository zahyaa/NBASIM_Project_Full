const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

mongoose.connect('mongodb://localhost:27017/nbasim');

app.use(cors());
app.use(express.json());

const gameRoutes = require('./routes/games');
app.use('/api/games', gameRoutes);

app.listen(5000, () => console.log('Server running on port 5000'));
