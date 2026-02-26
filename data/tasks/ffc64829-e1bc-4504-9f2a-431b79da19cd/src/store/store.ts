import { configureStore } from '@reduxjs/toolkit';
import letterSlice from './slices/letterSlice';
import userSlice from './slices/userSlice';
import progressSlice from './slices/progressSlice';

export const store = configureStore({
  reducer: {
    letter: letterSlice,
    user: userSlice,
    progress: progressSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
