# 🏫 Brainec Salam School Management System

A modern, full-stack school management system built for Brainec Salam school.

## Features
- Student management (add, edit, archive, restore)
- Teacher management (add, edit, archive, restore)
- Class management (KG1, KG2, Nursery1, Nursery2, Primary1)
- Manual fee/payment tracking in Ghana Cedi (₵)
- Attendance marking per class
- Role-based access (Headmistress, Admin, Teacher)
- Immutable activity logs
- Archive system for deleted records
- Live search + pagination on all lists

## Default Login
| Role | Email | Password |
|------|-------|----------|
| Headmistress | headmistress@brainec-salam.edu.gh | Admin@1234 |

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT (httpOnly cookies) |
| Photos | Cloudinary |

## Quick Start (Docker)
```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
# Edit backend/.env and add your CLOUDINARY credentials and a strong JWT_SECRET
docker-compose up --build
```
Then visit http://localhost:3000

## Quick Start (Manual)
### Backend
```bash
cd backend
npm install
cp .env.example .env  # fill in your values
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```
### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## Role Hierarchy
- **HEADMISTRESS**: Full access including creating Admin accounts
- **ADMIN**: Full access except creating other admins
- **TEACHER**: Can only view their assigned class students and mark attendance

## Environment Variables
### Backend (`backend/.env`)
```
DATABASE_URL="postgresql://brainec_user:brainec_pass@localhost:5432/brainec_salam"
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
PORT=5000
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:5000
```
