# Sincerity

> *"The example of those who spend in the cause of Allah is that of a grain that sprouts into seven ears, each bearing one hundred grains."* — Quran 2:261

**Sadaqah is sincerity in action. We help you grow it.**

Built at Niyyah Hacks 2026 by a team of Muslim women in Seattle.

---

## What is Sincerity?

Sincerity is a sadaqah tracking app that helps Muslims plan, track, and grow their giving — both monetary donations and non-monetary acts of kindness. A living plant grows as you log acts of sadaqah, and wilts when you go idle. At the end of each month, your plant is saved to a personal history garden.

---

## Features

- **Personalized onboarding** — 3 paths based on your situation, with AI-generated sadaqah suggestions powered by Claude
- **Living plant** — grows from a sprout to 7 leaves (Quran 2:261), wilts if you go idle, resets each month
- **Monetary sadaqah tracker** — log donations, track goals, visualize causes
- **Hasanat tracker** — log non-monetary acts by category, Leetcode-style activity heatmap, streak counter
- **Email notifications** — reminder emails when your plant starts to wilt

---

## Tech Stack

- React + Vite
- React Router
- Anthropic Claude API (AI suggestions)
- Resend (email notifications)
- localStorage (data persistence)

---

## Getting Started

### 1. Clone the repo

```bash
git clone YOUR_REPO_URL
cd sincerity
npm install
```

### 2. Set up environment variables

Create a `.env` file in the root:

```
VITE_ANTHROPIC_API_KEY=your_anthropic_key_here
VITE_RESEND_API_KEY=your_resend_key_here
```

- Get your Anthropic API key at: console.anthropic.com
- Get your Resend API key at: resend.com

### 3. Run the app

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

---

## Project Structure

```
src/
  pages/
    Onboarding.jsx     # 3-screen onboarding flow
    Home.jsx           # Dashboard with plant
    Tracker.jsx        # Monetary sadaqah page
    Hasanat.jsx        # Hasanat tracker page
  components/
    Plant.jsx          # Living plant component
  data/
    storage.js         # All localStorage read/write (import from here)
  api/
    claude.js          # Anthropic API call
    notify.js          # Resend email notification
  App.jsx              # Routing
```

---

## Team

Built by 4 Muslim women at Niyyah Hacks 2026, Seattle.

---

## Inspiration

Sincerity was built because no existing app acknowledged the full picture
of sadaqah. Giving is not always monetary — it's removing harm from a
path, smiling at a stranger, or visiting someone who is ill. And not
everyone can give money. We built the app we wished existed.

