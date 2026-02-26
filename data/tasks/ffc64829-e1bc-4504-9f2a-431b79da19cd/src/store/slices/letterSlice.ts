import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface PracticeAttempt {
  letter: string;
  timestamp: number;
  accuracy: number;
  timeTaken: number;
}

interface LetterState {
  currentLetter: string | null;
  letterHistory: string[];
  practiceAttempts: PracticeAttempt[];
  isSoundEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: LetterState = {
  currentLetter: null,
  letterHistory: [],
  practiceAttempts: [],
  isSoundEnabled: true,
  isLoading: false,
  error: null,
};

const letterSlice = createSlice({
  name: 'letter',
  initialState,
  reducers: {
    setCurrentLetter: (state, action: PayloadAction<string>) => {
      state.currentLetter = action.payload;
      if (!state.letterHistory.includes(action.payload)) {
        state.letterHistory.push(action.payload);
      }
    },
    addPracticeAttempt: (state, action: PayloadAction<PracticeAttempt>) => {
      state.practiceAttempts.push(action.payload);
    },
    setSoundEnabled: (state, action: PayloadAction<boolean>) => {
      state.isSoundEnabled = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearHistory: (state) => {
      state.letterHistory = [];
      state.practiceAttempts = [];
    },
  },
});

export const {
  setCurrentLetter,
  addPracticeAttempt,
  setSoundEnabled,
  setLoading,
  setError,
  clearHistory,
} = letterSlice.actions;

export default letterSlice.reducer;
