const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const Attendance = require('../models/Attendance');
const memStore = require('../models/memStore');

// Get attendance for a specific room/session (teacher only)
router.get('/session/:roomId', auth, roleGuard('teacher'), async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const attendance = await Attendance.findOne({ roomId: req.params.roomId });
            if (!attendance) {
                return res.status(404).json({ message: 'No attendance records found' });
            }
            return res.json(attendance);
        }

        const attendance = memStore.attendance.find(a => a.roomId === req.params.roomId);
        if (!attendance) {
            return res.status(404).json({ message: 'No attendance records found' });
        }
        res.json(attendance);
    } catch (err) {
        console.error('Error fetching attendance:', err);
        res.status(500).json({ message: 'Error fetching attendance' });
    }
});

// Get all attendance records for a teacher's sessions
router.get('/my-sessions', auth, roleGuard('teacher'), async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const records = await Attendance.find({ teacherId: req.user.id })
                .sort({ sessionDate: -1 })
                .limit(50);
            return res.json(records);
        }

        const records = memStore.attendance.filter(
            a => a.teacherId?.toString() === req.user.id.toString()
        );
        res.json(records);
    } catch (err) {
        console.error('Error fetching attendance records:', err);
        res.status(500).json({ message: 'Error fetching attendance records' });
    }
});

// Get a student's own attendance history
router.get('/my-history', auth, async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const records = await Attendance.find({
                'records.userId': req.user.id
            }).sort({ sessionDate: -1 });

            const history = records.map(session => {
                const myRecord = session.records.find(
                    r => r.userId && r.userId.toString() === req.user.id
                );
                return {
                    roomId: session.roomId,
                    sessionTitle: session.sessionTitle,
                    sessionDate: session.sessionDate,
                    joinedAt: myRecord?.joinedAt,
                    leftAt: myRecord?.leftAt,
                    duration: myRecord?.duration || 0
                };
            });

            return res.json(history);
        }

        const history = memStore.attendance
            .filter(session => session.records.some(r => (r.userId?.toString() === req.user.id.toString() || r.username === req.user.name)))
            .map(session => {
                const myRecord = session.records.find(
                    r => r.userId?.toString() === req.user.id.toString() || r.username === req.user.name
                );
                return {
                    roomId: session.roomId,
                    sessionTitle: session.sessionTitle || session.roomId,
                    sessionDate: session.sessionDate,
                    joinedAt: myRecord?.joinedAt,
                    leftAt: myRecord?.leftAt,
                    duration: myRecord?.duration || 0
                };
            });

        res.json(history);
    } catch (err) {
        console.error('Error fetching attendance history:', err);
        res.status(500).json({ message: 'Error fetching attendance history' });
    }
});

// Export recordJoin and recordLeave as separate functions
module.exports = router;

module.exports.recordJoin = async (roomId, userId, username, role) => {
    try {
        if (mongoose.connection.readyState === 1) {
            let attendance = await Attendance.findOne({ roomId });

            if (!attendance) {
                attendance = new Attendance({
                    roomId,
                    teacherId: role === 'teacher' ? userId : null,
                    records: []
                });
            }

            const existing = attendance.records.find(
                r => (userId ? r.userId && r.userId.toString() === userId.toString() : r.username === username) && !r.leftAt
            );

            if (!existing) {
                attendance.records.push({
                    userId,
                    username,
                    role,
                    joinedAt: new Date()
                });
                await attendance.save();
            }

            return attendance;
        }

        // Memory Store Fallback
        let attendance = memStore.attendance.find(a => a.roomId === roomId);
        if (!attendance) {
            attendance = {
                _id: memStore.generateId(),
                roomId,
                teacherId: role === 'teacher' ? userId : null,
                sessionTitle: roomId,
                sessionDate: new Date(),
                records: []
            };
            memStore.attendance.push(attendance);
        }

        const existing = attendance.records.find(
            r => (userId ? r.userId && r.userId.toString() === userId.toString() : r.username === username) && !r.leftAt
        );

        if (!existing) {
            attendance.records.push({
                userId,
                username,
                role,
                joinedAt: new Date()
            });
        }

        return attendance;
    } catch (err) {
        console.error('Error recording attendance join:', err);
    }
};

module.exports.recordLeave = async (roomId, username) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const attendance = await Attendance.findOne({ roomId });
            if (!attendance) return;

            const record = attendance.records.find(
                r => r.username === username && !r.leftAt
            );

            if (record) {
                record.leftAt = new Date();
                record.duration = Math.round(
                    (record.leftAt.getTime() - record.joinedAt.getTime()) / 1000
                );
                await attendance.save();
            }

            return attendance;
        }

        const attendance = memStore.attendance.find(a => a.roomId === roomId);
        if (!attendance) return;

        const record = attendance.records.find(
            r => r.username === username && !r.leftAt
        );

        if (record) {
            record.leftAt = new Date();
            record.duration = Math.round(
                (record.leftAt.getTime() - record.joinedAt.getTime()) / 1000
            );
        }

        return attendance;
    } catch (err) {
        console.error('Error recording attendance leave:', err);
    }
};
