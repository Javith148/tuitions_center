const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const Subject = require('../models/Subject');
const memStore = require('../models/memStore');

// Create subject (teacher only)
router.post('/', auth, roleGuard('teacher'), async (req, res) => {
    try {
        const { name, description, coverImage, syllabus, schedule } = req.body;

        if (mongoose.connection.readyState === 1) {
            const subject = new Subject({
                name,
                description,
                teacherId: req.user.id,
                coverImage,
                syllabus: syllabus || [],
                schedule: schedule || {}
            });

            await subject.save();
            return res.status(201).json(subject);
        }

        const newSubject = {
            _id: memStore.generateId(),
            name,
            description: description || '',
            teacherId: { _id: req.user.id, name: req.user.name || 'Teacher' },
            coverImage: coverImage || '',
            enrolledStudents: [],
            syllabus: syllabus || [],
            schedule: schedule || {},
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        memStore.subjects.unshift(newSubject);
        res.status(201).json(newSubject);
    } catch (err) {
        console.error('Error creating subject:', err);
        res.status(500).json({ message: 'Error creating subject' });
    }
});

// Get all subjects (filtered by role)
router.get('/', auth, async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            let subjects;
            if (req.user.role === 'teacher') {
                subjects = await Subject.find({ teacherId: req.user.id })
                    .sort({ createdAt: -1 });
            } else {
                subjects = await Subject.find({ status: 'active' })
                    .populate('teacherId', 'name email')
                    .sort({ name: 1 });
            }
            return res.json(subjects);
        }

        if (req.user.role === 'teacher') {
            const teacherSubs = memStore.subjects.filter(
                s => s.teacherId?._id?.toString() === req.user.id.toString() || s.teacherId?.toString() === req.user.id.toString()
            );
            return res.json(teacherSubs);
        } else {
            return res.json(memStore.subjects.filter(s => s.status === 'active'));
        }
    } catch (err) {
        console.error('Error fetching subjects:', err);
        res.status(500).json({ message: 'Error fetching subjects' });
    }
});

// Get single subject
router.get('/:id', auth, async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const subject = await Subject.findById(req.params.id)
                .populate('teacherId', 'name email')
                .populate('enrolledStudents', 'name email');

            if (!subject) {
                return res.status(404).json({ message: 'Subject not found' });
            }
            return res.json(subject);
        }

        const subject = memStore.subjects.find(s => s._id.toString() === req.params.id);
        if (!subject) {
            return res.status(404).json({ message: 'Subject not found' });
        }
        res.json(subject);
    } catch (err) {
        console.error('Error fetching subject:', err);
        res.status(500).json({ message: 'Error fetching subject' });
    }
});

// Update subject (teacher only)
router.put('/:id', auth, roleGuard('teacher'), async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const subject = await Subject.findOneAndUpdate(
                { _id: req.params.id, teacherId: req.user.id },
                req.body,
                { new: true }
            );

            if (!subject) {
                return res.status(404).json({ message: 'Subject not found or unauthorized' });
            }
            return res.json(subject);
        }

        const idx = memStore.subjects.findIndex(s => s._id.toString() === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ message: 'Subject not found or unauthorized' });
        }
        memStore.subjects[idx] = { ...memStore.subjects[idx], ...req.body, updatedAt: new Date() };
        res.json(memStore.subjects[idx]);
    } catch (err) {
        console.error('Error updating subject:', err);
        res.status(500).json({ message: 'Error updating subject' });
    }
});

// Delete subject (teacher only)
router.delete('/:id', auth, roleGuard('teacher'), async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const subject = await Subject.findOneAndDelete({
                _id: req.params.id,
                teacherId: req.user.id
            });

            if (!subject) {
                return res.status(404).json({ message: 'Subject not found or unauthorized' });
            }
            return res.json({ message: 'Subject deleted' });
        }

        const idx = memStore.subjects.findIndex(s => s._id.toString() === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ message: 'Subject not found or unauthorized' });
        }
        memStore.subjects.splice(idx, 1);
        res.json({ message: 'Subject deleted' });
    } catch (err) {
        console.error('Error deleting subject:', err);
        res.status(500).json({ message: 'Error deleting subject' });
    }
});

// Student enrolls in a subject
router.post('/:id/enroll', auth, roleGuard('student'), async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const subject = await Subject.findById(req.params.id);

            if (!subject) {
                return res.status(404).json({ message: 'Subject not found' });
            }

            if (subject.enrolledStudents.includes(req.user.id)) {
                return res.status(400).json({ message: 'Already enrolled' });
            }

            subject.enrolledStudents.push(req.user.id);
            await subject.save();
            return res.json({ message: 'Enrolled successfully', subject });
        }

        const subject = memStore.subjects.find(s => s._id.toString() === req.params.id);
        if (!subject) {
            return res.status(404).json({ message: 'Subject not found' });
        }
        const already = subject.enrolledStudents.some(
            s => (s._id || s).toString() === req.user.id.toString()
        );
        if (already) {
            return res.status(400).json({ message: 'Already enrolled' });
        }
        subject.enrolledStudents.push({ _id: req.user.id, name: req.user.name || 'Student' });
        res.json({ message: 'Enrolled successfully', subject });
    } catch (err) {
        console.error('Error enrolling in subject:', err);
        res.status(500).json({ message: 'Error enrolling in subject' });
    }
});

// Student unenrolls from a subject
router.post('/:id/unenroll', auth, roleGuard('student'), async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const subject = await Subject.findById(req.params.id);

            if (!subject) {
                return res.status(404).json({ message: 'Subject not found' });
            }

            subject.enrolledStudents = subject.enrolledStudents.filter(
                id => id.toString() !== req.user.id
            );

            await subject.save();
            return res.json({ message: 'Unenrolled successfully' });
        }

        const subject = memStore.subjects.find(s => s._id.toString() === req.params.id);
        if (!subject) {
            return res.status(404).json({ message: 'Subject not found' });
        }
        subject.enrolledStudents = subject.enrolledStudents.filter(
            s => (s._id || s).toString() !== req.user.id.toString()
        );
        res.json({ message: 'Unenrolled successfully' });
    } catch (err) {
        console.error('Error unenrolling from subject:', err);
        res.status(500).json({ message: 'Error unenrolling from subject' });
    }
});

module.exports = router;
