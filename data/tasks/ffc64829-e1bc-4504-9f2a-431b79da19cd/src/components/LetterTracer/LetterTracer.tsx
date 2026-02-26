import React, { useRef, useState, useEffect } from 'react';
import { Card, CardContent, Typography, Button, Box, Slider } from '@mui/material';
import { Letter } from '../../types/letter';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { addPracticeAttempt, setSoundEnabled } from '../../store/slices/letterSlice';
import { updateLetterProgress, addPracticeTime, unlockAchievement } from '../../store/slices/progressSlice';

type Point = {
  x: number;
  y: number;
};

interface LetterTracerProps {
  letter: Letter;
  onComplete: () => void;
}

const LetterTracer: React.FC<LetterTracerProps> = ({ letter, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [accuracy, setAccuracy] = useState(0);
  const [lineWidth, setLineWidth] = useState(5);
  const [timeTaken, setTimeTaken] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const dispatch = useAppDispatch();
  const isSoundEnabled = useAppSelector((state) => state.letter.isSoundEnabled);
  const userId = useAppSelector((state) => state.user.id);

  // 初始化画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 设置画布尺寸
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    
    // 设置样式
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1976d2';
    ctx.lineWidth = lineWidth;
    
    // 绘制字母轮廓
    drawLetterOutline(ctx, letter.uppercase);
    
    // 开始计时
    setStartTime(Date.now());
    timerRef.current = setInterval(() => {
      if (startTime) {
        setTimeTaken(Date.now() - startTime);
      }
    }, 100);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [letter, lineWidth]);

  // 绘制字母轮廓
  const drawLetterOutline = (ctx: CanvasRenderingContext2D, letter: string) => {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#9e9e9e';
    ctx.lineWidth = lineWidth;
    
    // 这里简化了实际字母轮廓的绘制
    // 实际项目中应使用字体路径或预定义的点
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const size = Math.min(ctx.canvas.width, ctx.canvas.height) * 0.5;
    
    ctx.beginPath();
    ctx.font = `${size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(letter, centerX, centerY);
    
    ctx.restore();
  };

  // 绘制路径
  const drawPath = (ctx: CanvasRenderingContext2D, path: Point[]) => {
    if (path.length < 2) return;
    
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawLetterOutline(ctx, letter.uppercase);
    
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    
    ctx.stroke();
  };

  // 处理鼠标/触摸开始
  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const point = getPointFromEvent(e, rect);
    
    setPoints([point]);
  };

  // 处理移动
  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const point = getPointFromEvent(e, rect);
    
    const newPoints = [...points, point];
    setPoints(newPoints);
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawPath(ctx, newPoints);
    }
  };

  // 处理结束
  const handleEnd = () => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    calculateAccuracy();
    submitPractice();
  };

  // 从事件中获取点
  const getPointFromEvent = (e: React.MouseEvent | React.TouchEvent, rect: DOMRect): Point => {
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  // 计算准确度（简化版）
  const calculateAccuracy = () => {
    // 实际项目中应该使用更复杂的算法来比较用户轨迹和理想轨迹
    const calculatedAccuracy = Math.min(100, points.length * 2);
    setAccuracy(Math.min(100, Math.max(0, calculatedAccuracy)));
  };

  // 提交练习结果
  const submitPractice = () => {
    if (!userId || !startTime) return;
    
    const practiceTime = Math.round(timeTaken / 1000 / 60); // 转换为分钟
    
    // 更新进度
    dispatch(updateLetterProgress({
      letter: letter.id,
      accuracy,
    }));
    
    // 添加练习时间
    dispatch(addPracticeTime(practiceTime));
    
    // 保存练习记录
    dispatch(addPracticeAttempt({
      letter: letter.id,
      timestamp: Date.now(),
      accuracy,
      timeTaken: practiceTime,
    }));
    
    // 检查成就
    if (accuracy > 80) {
      dispatch(unlockAchievement('practice-10'));
    }
    
    // 完成回调
    onComplete();
  };

  // 清除画布
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawLetterOutline(ctx, letter.uppercase);
      setPoints([]);
    }
  };

  return (
    <Card sx={{ maxWidth: 500, width: '100%' }}>
      <CardContent>
        <Typography variant="h5" component="div" gutterBottom align="center">
          练习字母: {letter.uppercase} ({letter.lowercase})
        </Typography>
        
        <Box sx={{ position: 'relative', width: '100%', height: 300, my: 2 }}>
          <canvas
            ref={canvasRef}
            style={{
              border: '1px solid #ddd',
              borderRadius: 8,
              width: '100%',
              height: '100%',
              touchAction: 'none',
            }}
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
          />
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', my: 2 }}>
          <Typography variant="body1">
            准确度: {accuracy}%
          </Typography>
          <Typography variant="body1">
            用时: {Math.floor(timeTaken / 1000)}秒
          </Typography>
        </Box>
        
        <Box sx={{ my: 2 }}>
          <Typography variant="body2" gutterBottom>
            笔刷大小: {lineWidth}px
          </Typography>
          <Slider
            value={lineWidth}
            onChange={(e, value) => setLineWidth(value as number)}
            min={2}
            max={15}
            step={1}
            marks
            disabled={isDrawing}
          />
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
          <Button 
            variant="outlined" 
            onClick={clearCanvas}
            disabled={isDrawing || points.length === 0}
          >
            清除
          </Button>
          <Button 
            variant="contained" 
            onClick={handleEnd}
            disabled={isDrawing || points.length === 0}
          >
            完成练习
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default LetterTracer;
