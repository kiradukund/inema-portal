# INEMA Financial Solutions Ltd — Backend & Client Portal

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Language:** TypeScript
- **Deployment:** Vercel

---

## Setup in 5 Steps

### 1. Install dependencies
```bash
cd inema-backend
npm install
```

### 2. Set up Supabase
1. Go to supabase.com → New Project → name it `inema-financial`
2. Go to Settings → API
3. Copy Project URL, anon key, service_role key

### 3. Create environment file
```bash
cp .env.example .env.local
# Fill in your Supabase keys
```

### 4. Run the database SQL
1. Supabase dashboard → SQL Editor → New Query
2. Paste entire contents of `supabase.sql` → Run

### 5. Create test user + seed data
1. Supabase → Authentication → Users → Add User
2. Email: test@inema.rw | Password: TestInema123!
3. Re-run the seed block at bottom of supabase.sql

### 6. Start locally
```bash
npm run dev
# Open http://localhost:3000
```

---

## Folder Structure
```
inema-backend/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (portal)/
│   │   ├── layout.tsx              ← sidebar nav
│   │   ├── dashboard/page.tsx      ← home summary
│   │   ├── loans/
│   │   │   ├── page.tsx            ← all loans
│   │   │   ├── apply/page.tsx      ← 3-step application
│   │   │   └── [id]/page.tsx       ← loan + schedule
│   │   ├── calculator/page.tsx     ← full report
│   │   └── profile/page.tsx        ← edit profile
│   └── api/
│       ├── auth/{register,login,logout,profile}/route.ts
│       ├── calculator/route.ts
│       ├── applications/route.ts + [id]/route.ts
│       ├── loans/route.ts + [id]/route.ts
│       └── contact/route.ts
├── lib/
│   ├── supabase.ts
│   ├── calculator.ts               ← INEMA formula engine
│   ├── validations.ts
│   └── api.ts
├── types/index.ts
├── middleware.ts
├── supabase.sql                    ← run this in Supabase
└── .env.example
```

---

## API Routes
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/auth/register | No | Create account |
| POST | /api/auth/login | No | Sign in |
| POST | /api/auth/logout | Yes | Sign out |
| GET | /api/auth/profile | Yes | Get profile |
| PATCH | /api/auth/profile | Yes | Update profile |
| POST | /api/calculator | No | Full loan report |
| GET | /api/applications | Yes | My applications |
| POST | /api/applications | Yes | Submit application |
| GET | /api/applications/:id | Yes | Single application |
| GET | /api/loans | Yes | My loans |
| GET | /api/loans/:id | Yes | Loan + schedule |
| POST | /api/contact | No | Contact form |

---

## Loan Formula
```
Month 1 only:
  interest    = principal × 5%
  fee         = principal × 4%  (1% app + 1.5% processing + 1.5% mgmt)
  vat         = fee × 18%
  TOTAL M1    = interest + fee + vat

Month 2+:
  TOTAL       = principal × 5%  (no fees, no VAT)

Example: RWF 1,000,000 / 3 months
  Month 1: 50,000 + 40,000 + 7,200 = 97,200
  Month 2: 50,000
  Month 3: 50,000
  Total repayment: 1,197,200

Late payment: 5%/month on overdue amount
```

---

## Deploy to Vercel
```bash
npx vercel --prod
# Add all .env.local vars in Vercel → Settings → Environment Variables
```
