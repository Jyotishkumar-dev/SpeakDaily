# SpeakDaily 🎙️

**Your Five-Minute English Practice Partner**  
*Speak in Hindi/Hinglish or English — get instant corrections and actionable AI feedback.*

---

## 🌟 Overview

**SpeakDaily** is a modern, responsive, character-rich web application designed to help learners build confidence in spoken English through bite-sized, 5-minute daily practice sessions.

### Key Highlights
- **Daily Speaking Topics**: Fresh, curated topics every day with guiding prompts.
- **Microphone & Voice Recording**: Live audio waveform visualization and a 5-minute countdown timer.
- **Smart AI Feedback Engine**:
  - Automatically identifies common Indianisms and Hindi-to-English grammar translation mistakes (e.g., *"I am having a car"* → *"I have a car"*, *"He don't"* → *"He doesn't"*, *"Myself Rahul"* → *"My name is Rahul"*, *"revert back"*, *"repeat again"*, *"passed out from college"*, etc.).
  - Detailed score breakdown: **Grammar**, **Fluency**, **Pronunciation**, and **Overall**.
  - Actionable before/after suggestions with clear explanations.
  - Celebratory confetti animations for high scores!
- **Supabase Integration**:
  - Email/password authentication
  - User profiles with streak tracking and session counters
  - Row Level Security (RLS) on all tables
  - Realtime subscriptions
- **Neat & Minimal Glassmorphism UI**:
  - Brand Palette: Indigo `#6C63FF`, Coral `#FF6584`, Soft Lavender `#F8F9FE`
  - Friendly mascot character 🎙️
  - Mobile-first, fully responsive design

---

## 📁 Project Structure

```
SpeakDaily/
├── db/
│   └── schema.sql         # Supabase PostgreSQL schema, triggers, RLS, & seed data
├── frontend/
│   ├── index.html         # SPA shell with semantic HTML5
│   ├── assets/
│   │   └── logo.svg       # Custom SpeakDaily vector logo
│   ├── css/
│   │   ├── style.css      # Complete design system & glassmorphism components
│   │   └── animations.css # Keyframes, waveforms, confetti, pulses
│   └── js/
│       ├── app.js         # Supabase client init, SPA hash router, toasts
│       ├── auth.js        # Sign up, sign in, sign out, form validation
│       ├── dashboard.js   # Today's topic, user stats, streak, rotating quotes
│       ├── practice.js    # Web Audio / MediaRecorder, waveform canvas, AI feedback engine
│       ├── history.js     # Past practice sessions, score history, filtering
│       └── profile.js     # User profile, 28-day streak heatmap, password change
└── backend/
    ├── package.json       # Node.js dependencies
    ├── .env               # Supabase credentials & server port
    ├── .env.example       # Template environment variables
    ├── server.js          # Express app entry point
    ├── config/
    │   └── supabase.js    # Supabase public & service-role clients
    ├── middleware/
    │   └── auth.js        # Supabase JWT authentication middleware
    └── routes/
        ├── auth.js        # Auth endpoints
        ├── topics.js      # Topic endpoints
        ├── sessions.js    # Practice session endpoints
        └── feedback.js    # AI feedback analysis API
```

---

## 🚀 Getting Started

### 1. Supabase Database Setup
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard/project/jpbgvropizffgdffwgvt).
2. Open the **SQL Editor**.
3. Copy and paste the contents of `db/schema.sql` into the SQL Editor.
4. Click **Run**.  
   *This creates the `profiles`, `daily_topics`, `practice_sessions`, and `ai_feedback` tables, configures RLS policies, attaches the user creation trigger, and inserts 7 days of starter topics.*

---

### 2. Running the Frontend (Static / Zero-Build)
The frontend is a pure HTML/CSS/JavaScript SPA that connects directly to Supabase via CDN.

You can serve it with any local static server:

```bash
# Option A: Using Python
cd frontend
python3 -m http.server 8000

# Option B: Using Node's npx serve
npx serve frontend -p 8000
```

Open `http://localhost:8000` in your browser!

---

### 3. Running the Backend (Optional Node.js API)
If you wish to run the Node.js / Express backend server:

```bash
cd backend
npm install
npm start
```

The API will be live at `http://localhost:3000`.

---

## 🛠️ Supabase Configuration
- **Project Ref**: `jpbgvropizffgdffwgvt`
- **Project URL**: `https://jpbgvropizffgdffwgvt.supabase.co`
- **Publishable Key**: `sb_publishable_RZqdWfJMc2Ohb24XKGDfnA_d91usQ9v`

---

## 👨‍💻 Author & Credits

Designed & Developed by **Jyotish Verma** ❤️
