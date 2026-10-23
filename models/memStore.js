const bcrypt = require('bcryptjs');

// In-Memory store used as a fallback when MongoDB Atlas is unreachable or not configured
class MemoryStore {
    constructor() {
        this.users = [];
        this.subjects = [];
        this.assignments = [];
        this.attendance = [];
        this.notifications = [];
        this.sessions = [];

        this.initDemoData();
    }

    initDemoData() {
        const hashedPassword = bcrypt.hashSync('password123', 10);

        // Demo Teacher
        const teacher = {
            _id: '65f000000000000000000001',
            name: 'Demo Teacher',
            email: 'teacher@test.com',
            password: hashedPassword,
            role: 'teacher',
            avatar: '',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Demo Student
        const student = {
            _id: '65f000000000000000000002',
            name: 'Demo Student',
            email: 'student@test.com',
            password: hashedPassword,
            role: 'student',
            avatar: '',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.users.push(teacher, student);

        // Demo Subject
        const subject = {
            _id: '65f000000000000000000010',
            name: 'Mathematics 101',
            description: 'Algebra, Geometry, and Trigonometry',
            teacherId: {
                _id: teacher._id,
                name: teacher.name,
                email: teacher.email
            },
            coverImage: '',
            enrolledStudents: [
                {
                    _id: student._id,
                    name: student.name,
                    email: student.email
                }
            ],
            syllabus: [
                { title: 'Algebra Fundamentals', description: 'Basic equations and expressions', order: 1, completed: true },
                { title: 'Linear Functions', description: 'Graphs and linear models', order: 2, completed: false }
            ],
            schedule: {
                day: 'Monday, Wednesday',
                time: '10:00 AM',
                duration: '60 mins'
            },
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.subjects.push(subject);

        // Demo Assignment
        const assignment = {
            _id: '65f000000000000000000020',
            title: 'Algebra Problem Set 1',
            description: 'Solve questions 1 through 10 on page 24.',
            subjectId: subject._id,
            teacherId: teacher._id,
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
            maxPoints: 100,
            attachments: [],
            submissions: [],
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.assignments.push(assignment);
    }

    // Helper: generate 24-char hex id like MongoDB ObjectId
    generateId() {
        return Math.floor(Date.now() / 1000).toString(16) + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, () => (Math.random() * 16 | 0).toString(16)).toLowerCase();
    }
}

const memStore = new MemoryStore();
module.exports = memStore;
