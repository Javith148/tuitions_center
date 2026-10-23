const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const Notification = require('../models/Notification');
const memStore = require('../models/memStore');

// Get user's notifications (paginated)
router.get('/', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        if (mongoose.connection.readyState === 1) {
            const notifications = await Notification.find({ userId: req.user.id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('senderId', 'name');

            const unreadCount = await Notification.countDocuments({
                userId: req.user.id,
                read: false
            });

            return res.json({ notifications, unreadCount, page, limit });
        }

        const userNotes = memStore.notifications.filter(
            n => n.userId?.toString() === req.user.id.toString()
        );
        const unreadCount = userNotes.filter(n => !n.read).length;
        const notifications = userNotes.slice(skip, skip + limit);

        res.json({ notifications, unreadCount, page, limit });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const notification = await Notification.findOneAndUpdate(
                { _id: req.params.id, userId: req.user.id },
                { read: true },
                { new: true }
            );

            if (!notification) {
                return res.status(404).json({ message: 'Notification not found' });
            }

            return res.json(notification);
        }

        const note = memStore.notifications.find(
            n => n._id.toString() === req.params.id && n.userId?.toString() === req.user.id.toString()
        );
        if (!note) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        note.read = true;
        res.json(note);
    } catch (err) {
        console.error('Error updating notification:', err);
        res.status(500).json({ message: 'Error updating notification' });
    }
});

// Mark all notifications as read
router.put('/read-all', auth, async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            await Notification.updateMany(
                { userId: req.user.id, read: false },
                { read: true }
            );
            return res.json({ message: 'All notifications marked as read' });
        }

        memStore.notifications.forEach(n => {
            if (n.userId?.toString() === req.user.id.toString()) {
                n.read = true;
            }
        });
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error('Error updating notifications:', err);
        res.status(500).json({ message: 'Error updating notifications' });
    }
});

// Send notification to specific users (teacher only)
router.post('/send', auth, roleGuard('teacher'), async (req, res) => {
    try {
        const { userIds, type, title, message, link } = req.body;

        if (!userIds || !userIds.length) {
            return res.status(400).json({ message: 'userIds array is required' });
        }

        if (mongoose.connection.readyState === 1) {
            const notifications = userIds.map(userId => ({
                userId,
                type: type || 'announcement',
                title,
                message,
                link: link || '',
                senderId: req.user.id
            }));

            await Notification.insertMany(notifications);
            return res.status(201).json({ message: `${notifications.length} notifications sent` });
        }

        const newNotes = userIds.map(userId => ({
            _id: memStore.generateId(),
            userId,
            type: type || 'announcement',
            title,
            message,
            link: link || '',
            senderId: { _id: req.user.id, name: req.user.name || 'Teacher' },
            read: false,
            createdAt: new Date()
        }));

        memStore.notifications.unshift(...newNotes);
        res.status(201).json({ message: `${newNotes.length} notifications sent` });
    } catch (err) {
        console.error('Error sending notifications:', err);
        res.status(500).json({ message: 'Error sending notifications' });
    }
});

// Helper: Broadcast notification to all students of a subject (used internally)
router.broadcastToSubject = async (subjectId, senderId, type, title, message, link) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const Subject = require('../models/Subject');
            const subject = await Subject.findById(subjectId);

            if (!subject || !subject.enrolledStudents.length) return;

            const notifications = subject.enrolledStudents.map(studentId => ({
                userId: studentId,
                type,
                title,
                message,
                link: link || '',
                senderId
            }));

            await Notification.insertMany(notifications);
            return notifications.length;
        }

        const subject = memStore.subjects.find(s => s._id.toString() === subjectId.toString());
        if (!subject || !subject.enrolledStudents.length) return;

        const newNotes = subject.enrolledStudents.map(student => ({
            _id: memStore.generateId(),
            userId: student._id || student,
            type,
            title,
            message,
            link: link || '',
            senderId: { _id: senderId, name: 'Teacher' },
            read: false,
            createdAt: new Date()
        }));

        memStore.notifications.unshift(...newNotes);
        return newNotes.length;
    } catch (err) {
        console.error('Error broadcasting notifications:', err);
    }
};

module.exports = router;
