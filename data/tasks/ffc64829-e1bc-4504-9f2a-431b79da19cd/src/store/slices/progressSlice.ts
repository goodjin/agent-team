import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: number;
}

interface LetterProgress {
  letter: string;
  learnedAt: number;
  practiceCount: number;
  averageAccuracy: number;
}

interface ProgressState {
  completedLetters: string[];
  letterProgress: Record<string, LetterProgress>;
  totalPracticeTime: number; // in minutes
  streakDays: number;
  lastPracticeDate: string | null;
  achievements: Achievement[];
  totalPoints: number;
}

const initialState: ProgressState = {
  completedLetters: [],
  letterProgress: {},
  totalPracticeTime: 0,
  streakDays: 0,
  lastPracticeDate: null,
  achievements: [
    {
      id: 'first-letter',
      title: '第一个字母',
      description: '学习你的第一个字母',
      unlocked: false,
    },
    {
      id: 'abc-master',
      title: 'ABC大师',
      description: '完成所有26个字母的学习',
      unlocked: false,
    },
    {
      id: 'practice-10',
      title: '勤奋练习者',
      description: '完成10次练习',
      unlocked: false,
    },
    {
      id: 'week-streak',
      title: '一周连续',
      description: '连续7天学习',
      unlocked: false,
    },
  ],
  totalPoints: 0,
};

const progressSlice = createSlice({
  name: 'progress',
  initialState,
  reducers: {
    markLetterAsCompleted: (state, action: PayloadAction<string>) => {
      if (!state.completedLetters.includes(action.payload)) {
        state.completedLetters.push(action.payload);
        state.letterProgress[action.payload] = {
          letter: action.payload,
          learnedAt: Date.now(),
          practiceCount: 0,
          averageAccuracy: 0,
        };
      }
    },
    updateLetterProgress: (state, action: PayloadAction<{
      letter: string;
      accuracy: number;
    }>) => {
      const { letter, accuracy } = action.payload;
      
      if (!state.letterProgress[letter]) {
        state.letterProgress[letter] = {
          letter,
          learnedAt: Date.now(),
          practiceCount: 0,
          averageAccuracy: 0,
        };
      }
      
      const progress = state.letterProgress[letter];
      progress.practiceCount += 1;
      progress.averageAccuracy = 
        (progress.averageAccuracy * (progress.practiceCount - 1) + accuracy) / 
        progress.practiceCount;
    },
    addPracticeTime: (state, action: PayloadAction<number>) => {
      state.totalPracticeTime += action.payload;
    },
    updateStreak: (state, action: PayloadAction<string>) => {
      const today = new Date().toISOString().split('T')[0];
      
      if (state.lastPracticeDate === today) {
        // 同一天多次练习，不增加连续天数
        return;
      }
      
      if (state.lastPracticeDate) {
        const lastDate = new Date(state.lastPracticeDate);
        const currentDate = new Date(today);
        const dayDifference = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (dayDifference === 1) {
          // 连续第二天
          state.streakDays += 1;
        } else if (dayDifference > 1) {
          // 中断连续记录
          state.streakDays = 1;
        }
      } else {
        // 第一次练习
        state.streakDays = 1;
      }
      
      state.lastPracticeDate = today;
    },
    unlockAchievement: (state, action: PayloadAction<string>) => {
      const achievement = state.achievements.find(a => a.id === action.payload);
      if (achievement && !achievement.unlocked) {
        achievement.unlocked = true;
        achievement.unlockedAt = Date.now();
        state.totalPoints += 100; // 每个成就100分
      }
    },
    resetProgress: (state) => {
      state.completedLetters = [];
      state.letterProgress = {};
      state.totalPracticeTime = 0;
      state.streakDays = 0;
      state.lastPracticeDate = null;
      state.achievements.forEach(achievement => {
        achievement.unlocked = false;
        delete achievement.unlockedAt;
      });
      state.totalPoints = 0;
    },
  },
});

export const {
  markLetterAsCompleted,
  updateLetterProgress,
  addPracticeTime,
  updateStreak,
  unlockAchievement,
  resetProgress,
} = progressSlice.actions;

export default progressSlice.reducer;
