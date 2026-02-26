import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

interface UserPreferences {
  difficulty: 'easy' | 'medium' | 'hard';
  soundEnabled: boolean;
  hintsEnabled: boolean;
  theme: 'light' | 'dark';
}

interface UserState {
  id: string | null;
  name: string | null;
  avatar: string | null;
  preferences: UserPreferences;
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: UserState = {
  id: null,
  name: null,
  avatar: null,
  preferences: {
    difficulty: 'medium',
    soundEnabled: true,
    hintsEnabled: true,
    theme: 'light',
  },
  isLoggedIn: false,
  isLoading: false,
  error: null,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<{
      id: string;
      name: string;
      avatar?: string;
    }>) => {
      state.id = action.payload.id;
      state.name = action.payload.name;
      state.avatar = action.payload.avatar || null;
      state.isLoggedIn = true;
      state.error = null;
    },
    updateUserPreferences: (state, action: PayloadAction<Partial<UserPreferences>>) => {
      state.preferences = { ...state.preferences, ...action.payload };
    },
    logout: (state) => {
      state.id = null;
      state.name = null;
      state.avatar = null;
      state.isLoggedIn = false;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

// 配置持久化
const persistedUserReducer = persistReducer(
  {
    key: 'user',
    storage,
  },
  userSlice.reducer
);

export const {
  setUser,
  updateUserPreferences,
  logout,
  setLoading,
  setError,
} = userSlice.actions;

export default persistedUserReducer;
