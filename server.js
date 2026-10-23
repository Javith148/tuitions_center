require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/session');
const livekitRoutes = require('./routes/livekit');
const assignmentRoutes = require('./routes/assignments');
const attendanceRoutes = require('./routes/attendance');
const subjectRoutes = require('./routes/subjects');
const notificationRoutes = require('./routes/notifications');
const { WebhookReceiver } = require('livekit-server-sdk');

const app = express();
const server = http.createServer(app);

// Dynamic CORS origin checker: allows local ports, same origin, and configured host
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000'
];
if (process.env.VITE_SIGNALING_SERVER) {
    allowedOrigins.push(process.env.VITE_SIGNALING_SERVER);
}

const checkOrigin = (origin, callback) => {
    // Requests with no origin (curl, same-origin, mobile) are always allowed
    if (!origin) return callback(null, true);

    // Allow any localhost / 127.0.0.1 with any port
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production' || !process.env.VITE_SIGNALING_SERVER) {
        return callback(null, true);
    }

    return callback(null, true);
};

const io = new Server(server, {
    cors: {
        origin: checkOrigin,
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors({
    origin: checkOrigin,
    credentials: true
}));

app.use(express.json());

// Configure Mongoose
mongoose.set('bufferCommands', false);

const mongoURI = process.env.MONGODB_URI;
if (mongoURI && !mongoURI.includes('<db_password>')) {
    mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 4000 })
        .then(() => console.log('Connected to MongoDB successfully'))
        .catch(err => {
            console.warn('MongoDB connection error:', err.message);
            console.warn('Proceeding with In-Memory Store Fallback. (Demo accounts: teacher@test.com / student@test.com, password: password123)');
        });
} else {
    console.warn('Proceeding with In-Memory Store Fallback. (Demo accounts: teacher@test.com / student@test.com, password: password123)');
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/notifications', notificationRoutes);

const PORT = process.env.PORT || 5000;

const fs = require('fs');
const util = require('util');

// Create a write stream (in append mode) for logging when not on Vercel
if (!process.env.VERCEL) {
    try {
        const logFile = fs.createWriteStream(path.join(__dirname, 'server_debug.log'), { flags: 'a' });
        const logStdout = process.stdout;

        console.log = function () {
            logFile.write(util.format.apply(null, arguments) + '\n');
            logStdout.write(util.format.apply(null, arguments) + '\n');
        };
        console.error = function () {
            logFile.write(util.format.apply(null, arguments) + '\n');
            logStdout.write(util.format.apply(null, arguments) + '\n');
        };
    } catch (err) {
        // Fallback to console
    }
}

console.log('--- Server Starting ---');
console.log('Current directory:', __dirname);

try {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
        console.log('dist folder exists');
        app.use(express.static(distPath));
    } else {
        console.error('CRITICAL: dist folder MISSING. Frontend will not load.');
    }
} catch (e) {
    console.error('Error checking dist folder:', e);
}

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'UP',
        mode: process.env.NODE_ENV || 'development',
        database: mongoose.connection.readyState === 1 ? 'MongoDB' : 'In-Memory Store',
        port: PORT
    });
});

// The catchall handler: for any non-API request, send back React's index.html file
app.get(/^(?!\/api).*/, (req, res) => {
    if (!req.path.startsWith('/api')) {
        const indexFile = path.join(__dirname, 'dist', 'index.html');
        if (fs.existsSync(indexFile)) {
            res.sendFile(indexFile);
        } else {
            res.status(500).send('Frontend build not found on server.');
        }
    }
});

if (!process.env.VERCEL) {
    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

const rooms = {};

// LiveKit Webhook Handler
app.post('/api/livekit/webhook', async (req, res) => {
    try {
        if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
            return res.status(200).send('LiveKit webhook ignored (keys not configured)');
        }
        const receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
        const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        const event = receiver.receive(bodyStr, req.get('Authorization'));
        console.log('LiveKit Event:', event.event, event.room?.name);

        if (event.event === 'participant_joined') {
            console.log(`Participant ${event.participant?.identity} joined ${event.room?.name}`);
            if (event.participant?.identity && event.room?.name) {
                attendanceRoutes.recordJoin(
                    event.room.name,
                    null,
                    event.participant.identity,
                    'student'
                );
            }
        } else if (event.event === 'participant_left') {
            const identity = event.participant?.identity;
            console.log(`Participant ${identity} left ${event.room?.name}`);
            if (identity && event.room?.name) {
                attendanceRoutes.recordLeave(event.room.name, identity);
            }

            if (event.room?.name && rooms[event.room.name]) {
                const initialCount = rooms[event.room.name].length;
                rooms[event.room.name] = rooms[event.room.name].filter(u => u.name !== identity);
                if (rooms[event.room.name].length < initialCount) {
                    console.log(`Cleaned up legacy ghost participant: ${identity}`);
                    io.to(event.room.name).emit('user-left-fallback', identity);
                }
            }
        }

        res.status(200).send('ok');
    } catch (error) {
        console.error('Webhook error:', error.message || error);
        res.status(400).send('error');
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId, userData) => {
        socket.join(roomId);
        console.log(`User ${userData?.name || socket.id} joined room ${roomId} (Socket)`);

        if (!rooms[roomId]) rooms[roomId] = [];
        const newUser = { id: socket.id, ...userData };
        if (!rooms[roomId].find(u => u.id === socket.id)) {
            rooms[roomId].push(newUser);
        }
    });

    socket.on('signal', (payload) => {
        io.to(payload.to).emit('signal', {
            signal: payload.signal,
            from: socket.id
        });
    });

    socket.on('chat-message', (roomId, message) => {
        socket.to(roomId).emit('chat-message', message);
    });

    socket.on('reaction', (roomId, emoji) => {
        socket.to(roomId).emit('reaction', emoji);
    });

    socket.on('end-session', (data) => {
        console.log('Session ended:', data);
        io.emit('session-ended', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const roomId in rooms) {
            rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
            socket.to(roomId).emit('user-left', socket.id);
        }
    });
});

module.exports = app;
