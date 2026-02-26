import React from 'react';
import { Card, CardContent, Typography, IconButton, Box } from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import StarIcon from '@mui/icons-material/Star';
import { Letter } from '../../types/letter';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setCurrentLetter, setSoundEnabled } from '../../store/slices/letterSlice';

interface AlphabetCardProps {
  letter: Letter;
  isCompleted?: boolean;
}

const AlphabetCard: React.FC<AlphabetCardProps> = ({ letter, isCompleted = false }) => {
  const dispatch = useAppDispatch();
  const isSoundEnabled = useAppSelector((state) => state.letter.isSoundEnabled);
  
  const handleClick = () => {
    dispatch(setCurrentLetter(letter.id));
  };

  const handleSoundToggle = () => {
    dispatch(setSoundEnabled(!isSoundEnabled));
  };

  const playLetterSound = () => {
    if (isSoundEnabled) {
      // 实际项目中，这里会播放字母发音
      console.log(`Playing sound for letter: ${letter.id}`);
    }
  };

  return (
    <Card 
      sx={{
        width: 120,
        height: 140,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        bgcolor: isCompleted ? '#e8f5e9' : '#f5f5f5',
        border: isCompleted ? '2px solid #4caf50' : '1px solid #e0e0e0',
        borderRadius: 2,
        m: 1,
        '&:hover': {
          transform: 'scale(1.05)',
          boxShadow: 3,
        },
      }}
      onClick={handleClick}
    >
      <CardContent sx={{ p: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography 
          variant="h4" 
          component="div" 
          fontWeight="bold"
          color="primary"
        >
          {letter.uppercase}
        </Typography>
        <Typography 
          variant="h6" 
          component="div" 
          color="secondary"
          sx={{ mt: 0.5 }}
        >
          {letter.lowercase}
        </Typography>
        
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
          <IconButton 
            size="small" 
            onClick={(e) => {
              e.stopPropagation();
              playLetterSound();
            }}
            color={isSoundEnabled ? 'primary' : 'default'}
          >
            <VolumeUpIcon />
          </IconButton>
          
          {isCompleted && (
            <StarIcon color="warning" sx={{ ml: 0.5 }} />
          )}
        </Box>
        
        <Typography variant="caption" color="textSecondary">
          {letter.word}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default AlphabetCard;
