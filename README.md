# 🏀 NBASIM - NBA Simulation App

NBASIM is a full-stack NBA game simulator built with the MERN stack (MongoDB, Express, React, Node.js). It simulates real-time basketball games using live player data and includes features like team selection, game controls, live play-by-play commentary, and historical game storage.

## 🌐 Live Features

- 🧠 **Real-Time Game Simulation** – 48-minute games using actual NBA player stats
- 🎮 **Interactive Controls** – Start, Pause, Stop, Timeout, Fast Forward
- 📊 **Live Play-by-Play Log** – Track actions as they happen
- 🧾 **Game History Tracking** – Stores previous games in MongoDB
- 🧑‍🤝‍🧑 **Team Selector** – Choose different NBA teams
- 📡 **Socket.IO Ready** – Optional real-time broadcasting support

## 🚀 Tech Stack

- **Frontend:** React, Tailwind (optional), JavaScript
- **Backend:** Node.js, Express, Mongoose
- **Database:** MongoDB (local or Atlas)
- **API:** NBA stats via [balldontlie.io](https://www.balldontlie.io/)

## 📁 Project Structure

```
project-root/
├── client/    # React frontend
├── server/    # Express backend
└── README.md
```

## ⚙️ Local Setup

### 1. Clone the Repo

```bash
git clone https://github.com/your-username/NBASIM_Project_Full.git
cd NBASIM_Project_Full
```

### 2. Start MongoDB

```bash
mkdir -p ~/mongo-data/db
mongod --dbpath ~/mongo-data/db
```

### 3. Start Backend

```bash
cd server
npm install
npm start
```

### 4. Start Frontend

```bash
cd ../client
npm install
npm start
```

Visit [http://localhost:3000](http://localhost:3000)

---

## 🧪 API Endpoints

- `GET /api/games` – Get all saved games
- `POST /api/games/save` – Save a game result

---

## 🧠 Future Improvements

- WebSocket-powered live view
- ESPN-style GameCast layout
- Player performance graphs
- Multiplayer simulation mode

## 📄 License

MIT License

---

Built with ❤️ by [@zahyaa](https://github.com/zahyaa)
