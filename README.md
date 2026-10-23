# tuitions_center

Tuition Center & Online Classroom Meeting Platform with LiveKit video conferencing, attendance tracking, assignments, subject management, and real-time interactive classrooms.

## Features

- **Live Video Classrooms**: Powered by LiveKit SDK & WebRTC for high-quality, real-time video/audio conferencing.
- **Interactive Whiteboard & Chat**: Real-time communication with socket.io.
- **Session Management**: Scheduled sessions, recording, and teacher/student roles.
- **Assignments & Attendance**: Manage student homework, grading, and automated attendance logging.
- **Subject Management & Notifications**: Organized syllabus tracking and class updates.

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO, LiveKit Server SDK, Mongoose / MongoDB Atlas
- **Frontend**: React, LiveKit React Components, Tailwind CSS, Vite
- **Authentication**: JWT, bcryptjs

## Getting Started

### 1. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

Set the following variables:
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: Credentials from LiveKit Cloud

### 3. Run the Server
```bash
# Start server in production mode
npm start

# Run in development mode
npm run dev
```

## Deployment
See [DEPLOY_NODEJS_OVIPANEL.md](DEPLOY_NODEJS_OVIPANEL.md) for detailed deployment instructions on Node.js hosting environments.
