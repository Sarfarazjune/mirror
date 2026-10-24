import { PriorityShareInput } from '../lib/mirror-engine';

export interface SampleAppState {
  user: {
    name: string;
    email: string;
    phone: string;
  };
  priorities: (PriorityShareInput & { id: string; why: string })[];
  wastedMinutes: number;
  sleepMinutes: number;
  activeExperiment: {
    id: string;
    targetPriorityName: string;
    transferMinutesPerDay: number;
    daysCompleted: number;
    totalDays: number;
    extraMinutesGained: number;
    startDate: string;
    endDate: string;
  };
  checkinTodayDone: boolean;
}

export const SAMPLE_ALEX_DATA: SampleAppState = {
  user: {
    name: "Alex",
    email: "alex@example.com",
    phone: "+1 555 019 2834",
  },
  priorities: [
    {
      id: "p-guitar",
      name: "Guitar & Music",
      why: "The one thing that makes me feel like myself and grounds my creativity.",
      targetMinutes: 180,
      actualMinutes: 35,
      colour: "#8b5cf6", // soft violet
    },
    {
      id: "p-fitness",
      name: "Strength & Health",
      why: "Clears mental brain fog and keeps my energy steady for study.",
      targetMinutes: 150,
      actualMinutes: 110,
      colour: "#06b6d4", // teal
    },
    {
      id: "p-study",
      name: "Computer Science Study",
      why: "Building my foundation so I have the freedom to build impactful projects.",
      targetMinutes: 300,
      actualMinutes: 260,
      colour: "#3b82f6", // blue
    },
    {
      id: "p-reading",
      name: "Deep Reading",
      why: "Expands my mental models beyond quick surface-level social content.",
      targetMinutes: 90,
      actualMinutes: 40,
      colour: "#f59e0b", // amber
    },
  ],
  wastedMinutes: 220, // scrolling / unplanned
  sleepMinutes: 440, // 7h 20m average
  activeExperiment: {
    id: "exp-1",
    targetPriorityName: "Guitar & Music",
    transferMinutesPerDay: 20,
    daysCompleted: 5,
    totalDays: 7,
    extraMinutesGained: 110,
    startDate: "2026-10-18",
    endDate: "2026-10-25",
  },
  checkinTodayDone: true,
};
