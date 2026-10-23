const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const Assignment = require('../models/Assignment');
const memStore = require('../models/memStore');

// Create assignment (teacher only)
router.post('/', auth, roleGuard('teacher'), async (req, res) => {
    try {
        const { title, description, subjectId, dueDate, maxPoints, attachments } = req.body;

        if (mongoose.connection.readyState === 1) {
            const assignment = new Assignment({
                title,
                description,
                subjectId,
                teacherId: req.user.id,
                dueDate,
                maxPoints: maxPoints || 100,
                attachments: attachments || []
            });

            await assignment.save();
            return res.status(201).json(assignment);
        }

        const newAssignment = {
            _id: memStore.generateId(),
            title,
            description: description || '',
            subjectId,
            teacherId: req.user.id,
            dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            maxPoints: maxPoints || 100,
            attachments: attachments || [],
            submissions: [],
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        memStore.assignments.unshift(newAssignment);
        res.status(201).json(newAssignment);
    } catch (err) {
        console.error('Error creating assignment:', err);
        res.status(500).json({ message: 'Error creating assignment' });
    }
});

// Get all assignments (filtered by role)
router.get('/', auth, async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            let assignments;
            if (req.user.role === 'teacher') {
                assignments = await Assignment.find({ teacherId: req.user.id })
                    .sort({ createdAt: -1 });
            } else {
                assignments = await Assignment.find({ status: 'published' })
                    .sort({ dueDate: 1 });
            }
            return res.json(assignments);
        }

        if (req.user.role === 'teacher') {
            const teacherAssigns = memStore.assignments.filter(
                a => a.teacherId?.toString() === req.user.id.toString()
            );
            return res.json(teacherAssigns);
        } else {
            return res.json(memStore.assignments.filter(a => a.status === 'published'));
        }
    } catch (err) {
        console.error('Error fetching assignments:', err);
        res.status(500).json({ message: 'Error fetching assignments' });
    }
});

// Get single assignment
router.get('/:id', auth, async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const assignment = await Assignment.findById(req.params.id);
            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found' });
            }
            return res.json(assignment);
        }

        const assignment = memStore.assignments.find(a => a._id.toString() === req.params.id);
        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }
        res.json(assignment);
    } catch (err) {
        console.error('Error fetching assignment:', err);
        res.status(500).json({ message: 'Error fetching assignment' });
    }
});

// Update assignment (teacher only)
router.put('/:id', auth, roleGuard('teacher'), async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const assignment = await Assignment.findOneAndUpdate(
                { _id: req.params.id, teacherId: req.user.id },
                req.body,
                { new: true }
            );

            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found or unauthorized' });
            }
            return res.json(assignment);
        }

        const idx = memStore.assignments.findIndex(a => a._id.toString() === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ message: 'Assignment not found or unauthorized' });
        }
        memStore.assignments[idx] = { ...memStore.assignments[idx], ...req.body, updatedAt: new Date() };
        res.json(memStore.assignments[idx]);
    } catch (err) {
        console.error('Error updating assignment:', err);
        res.status(500).json({ message: 'Error updating assignment' });
    }
});

// Delete assignment (teacher only)
router.delete('/:id', auth, roleGuard('teacher'), async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const assignment = await Assignment.findOneAndDelete({
                _id: req.params.id,
                teacherId: req.user.id
            });

            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found or unauthorized' });
            }
            return res.json({ message: 'Assignment deleted' });
        }

        const idx = memStore.assignments.findIndex(a => a._id.toString() === req.params.id);
        if (idx === -1) {
            return res.status(404).json({ message: 'Assignment not found or unauthorized' });
        }
        memStore.assignments.splice(idx, 1);
        res.json({ message: 'Assignment deleted' });
    } catch (err) {
        console.error('Error deleting assignment:', err);
        res.status(500).json({ message: 'Error deleting assignment' });
    }
});

// Student submits work
router.post('/:id/submit', auth, roleGuard('student'), async (req, res) => {
    try {
        const { content, attachments } = req.body;

        if (mongoose.connection.readyState === 1) {
            const assignment = await Assignment.findById(req.params.id);

            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found' });
            }

            if (assignment.status === 'closed') {
                return res.status(400).json({ message: 'Assignment is closed for submissions' });
            }

            const existingIdx = assignment.submissions.findIndex(
                s => s.studentId.toString() === req.user.id
            );

            const submission = {
                studentId: req.user.id,
                submittedAt: new Date(),
                content,
                attachments: attachments || []
            };

            if (existingIdx >= 0) {
                assignment.submissions[existingIdx] = {
                    ...assignment.submissions[existingIdx].toObject(),
                    ...submission
                };
            } else {
                assignment.submissions.push(submission);
            }

            await assignment.save();
            return res.json({ message: 'Submission saved', assignment });
        }

        const assignment = memStore.assignments.find(a => a._id.toString() === req.params.id);
        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        const subIdx = assignment.submissions.findIndex(
            s => s.studentId.toString() === req.user.id.toString()
        );

        const sub = {
            studentId: req.user.id,
            submittedAt: new Date(),
            content,
            attachments: attachments || []
        };

        if (subIdx >= 0) {
            assignment.submissions[subIdx] = { ...assignment.submissions[subIdx], ...sub };
        } else {
            assignment.submissions.push(sub);
        }

        res.json({ message: 'Submission saved', assignment });
    } catch (err) {
        console.error('Error submitting assignment:', err);
        res.status(500).json({ message: 'Error submitting assignment' });
    }
});

// Teacher grades a submission
router.put('/:id/grade/:studentId', auth, roleGuard('teacher'), async (req, res) => {
    try {
        const { points, feedback } = req.body;

        if (mongoose.connection.readyState === 1) {
            const assignment = await Assignment.findOne({
                _id: req.params.id,
                teacherId: req.user.id
            });

            if (!assignment) {
                return res.status(404).json({ message: 'Assignment not found or unauthorized' });
            }

            const submission = assignment.submissions.find(
                s => s.studentId.toString() === req.params.studentId
            );

            if (!submission) {
                return res.status(404).json({ message: 'Student submission not found' });
            }

            submission.grade = {
                points,
                feedback,
                gradedAt: new Date()
            };

            await assignment.save();
            return res.json({ message: 'Grade saved', assignment });
        }

        const assignment = memStore.assignments.find(a => a._id.toString() === req.params.id);
        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found or unauthorized' });
        }

        const sub = assignment.submissions.find(s => s.studentId.toString() === req.params.studentId);
        if (!sub) {
            return res.status(404).json({ message: 'Student submission not found' });
        }

        sub.grade = {
            points,
            feedback,
            gradedAt: new Date()
        };

        res.json({ message: 'Grade saved', assignment });
    } catch (err) {
        console.error('Error grading assignment:', err);
        res.status(500).json({ message: 'Error grading assignment' });
    }
});

module.exports = router;
