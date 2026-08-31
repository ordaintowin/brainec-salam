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
| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin |

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

## Vercel Production Alignment

The frontend and backend must be deployed as separate Vercel projects while
using the same PostgreSQL database that Prisma Studio uses.

### Backend Vercel project

Set the project root to `backend` and configure these Production environment
variables in Vercel:

```
DATABASE_URL=<the pooled connection for the same database used by Prisma Studio>
DIRECT_DATABASE_URL=<the direct connection for that same database>
JWT_SECRET=<the existing application JWT secret>
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://brainecs-salam.vercel.app
```

Use `npm run build` as the build command. The backend URL is:

```
https://brainec-salam-bck.vercel.app
```

### Frontend Vercel project

Set the project root to `frontend` and configure this Production environment
variable:

```
NEXT_PUBLIC_API_URL=https://brainec-salam-bck.vercel.app
```

Do not add `/api` to this value. The frontend calls the backend routes
directly, such as `/finance/summary` and `/archive/students/:id`.

Deploy the backend first, then the frontend. After deployment, confirm the
backend health endpoint responds at `/health`, then refresh Archive and
Finance in the frontend. Both Vercel projects and Prisma Studio must reference
the same database; otherwise the UI will show a different data state even
when every individual request succeeds.
