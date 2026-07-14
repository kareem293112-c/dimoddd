import React, { useRef, useEffect, useState } from 'react';
import { FoodId, FOODS, Bet } from '../types.js';

interface GameCanvasProps {
  phase: 'betting' | 'spinning' | 'result';
  timer: number;
  totalBets: Record<FoodId, number>;
  userBets: Record<FoodId, number>;
  winningFood: FoodId | null;
  onPlaceBet: (foodId: FoodId) => void;
  allBetsList: Bet[];
  selectedFoodId: FoodId;
  onSelectFood: (foodId: FoodId) => void;
  soundEnabled?: boolean;
}

interface ChipAnimation {
  id: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  progress: number; // 0 to 1
  amount: number;
  color: string;
  isMine: boolean;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  phase,
  timer,
  totalBets,
  userBets,
  winningFood,
  onPlaceBet,
  allBetsList,
  selectedFoodId,
  onSelectFood,
  soundEnabled = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Wheel angles
  const [wheelAngle, setWheelAngle] = useState(0);
  const angleRef = useRef(0);
  const spinTargetRef = useRef<number | null>(null);
  const spinStartAngleRef = useRef<number>(0);
  const spinStartTimeRef = useRef<number | null>(null);
  const lastSoundTimeRef = useRef<string | null>(null);

  // Store changing props in a ref to avoid restarting the animation loop
  const propsRef = useRef({ phase, timer, totalBets, userBets, winningFood, selectedFoodId, onSelectFood, soundEnabled });
  useEffect(() => {
    propsRef.current = { phase, timer, totalBets, userBets, winningFood, selectedFoodId, onSelectFood, soundEnabled };
  }, [phase, timer, totalBets, userBets, winningFood, selectedFoodId, onSelectFood, soundEnabled]);

  // Chip animations
  const chipsRef = useRef<ChipAnimation[]>([]);
  const lastBetsCountRef = useRef<number>(0);

  // Sound generator helper (Web Audio API synthesis for tickers/chimes)
  const playSound = (type: 'tick' | 'win' | 'bet') => {
    if (!propsRef.current.soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'tick') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      } else if (type === 'bet') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(450, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } else if (type === 'win') {
        const now = audioCtx.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start();
        osc.stop(now + 0.4);
      }
    } catch (e) {
      // Audio context block by browser security or not supported
    }
  };

  // Synchronize new bets to generate flying chip particles
  useEffect(() => {
    if (allBetsList.length > lastBetsCountRef.current) {
      const newBets = allBetsList.slice(lastBetsCountRef.current);
      lastBetsCountRef.current = allBetsList.length;

      // Spawn chips for each new bet
      newBets.forEach(bet => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const startX = bet.userId === 'user_me' ? canvas.width * 0.5 : canvas.width * (0.2 + Math.random() * 0.6);
        const startY = canvas.height * 0.95;

        // Calculate slot coordinate on the wheel
        const foodItem = FOODS[bet.foodId];
        const angle = -Math.PI / 2 + foodItem.angle;
        const radius = Math.max(10, Math.min(canvas.width, canvas.height) * 0.32);
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const targetX = centerX + radius * Math.cos(angle);
        const targetY = centerY + radius * Math.sin(angle);

        // Chip color based on bet amount
        let color = '#22c55e'; // 10 (green)
        if (bet.amount === 100) color = '#3b82f6'; // blue
        else if (bet.amount === 1000) color = '#a855f7'; // purple
        else if (bet.amount === 10000) color = '#f59e0b'; // gold

        chipsRef.current.push({
          id: bet.id,
          startX,
          startY,
          currentX: startX,
          currentY: startY,
          targetX,
          targetY,
          progress: 0,
          amount: bet.amount,
          color,
          isMine: bet.userId === 'user_me',
        });

        playSound('bet');
      });
    } else if (allBetsList.length === 0) {
      lastBetsCountRef.current = 0;
      chipsRef.current = [];
    }
  }, [allBetsList]);

  // Handle Tick Tock sounds on timer countdown
  const lastTimerRef = useRef<number>(timer);
  useEffect(() => {
    if (timer !== lastTimerRef.current) {
      if (phase === 'betting' && timer <= 5) {
        playSound('tick');
      }
      lastTimerRef.current = timer;
    }
  }, [timer, phase]);

  // Setup Canvas, Handle resizing, and run main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resizeCanvas = () => {
      const rect = containerRef.current?.getBoundingClientRect() || { width: 500, height: 500 };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(() => resizeCanvas());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    let lastTime = performance.now();

    const draw = (timestamp: number) => {
      const dt = (timestamp - lastTime) / 1000;
      lastTime = timestamp;

      const { phase, timer, totalBets, userBets, winningFood, selectedFoodId } = propsRef.current;

      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      const centerX = w / 2;
      const centerY = h / 2;
      const radius = Math.max(10, Math.min(w, h) * 0.32);

      ctx.clearRect(0, 0, w, h);

      // 1. UPDATE HIGHLIGHT LIGHT ROTATION ANGLE
      let highlightedFoodId: string | null = null;
      const foodKeys = Object.keys(FOODS) as FoodId[];
      let wheelHasStopped = false;
      let timeSinceStop = 0;

      if (phase === 'betting') {
        if (timer <= 1) {
           angleRef.current = (angleRef.current + 6 * dt) % (2 * Math.PI);
        } else {
           angleRef.current = -Math.PI / 2;
        }
        spinTargetRef.current = null;
        spinStartTimeRef.current = null;
      } else if (phase === 'spinning' && winningFood) {
        if (spinTargetRef.current === null) {
          const winningItem = FOODS[winningFood];
          const minRotations = 4;
          const target = -Math.PI / 2 + winningItem.angle + minRotations * 2 * Math.PI;
          
          spinTargetRef.current = target;
          spinStartAngleRef.current = angleRef.current % (2 * Math.PI);
          if (spinTargetRef.current < spinStartAngleRef.current) {
             spinTargetRef.current += 2 * Math.PI;
          }
          spinStartTimeRef.current = timestamp;
        }

        const duration = 5000;
        const elapsed = timestamp - (spinStartTimeRef.current || timestamp);
        const progress = Math.min(elapsed / duration, 1);

        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
        const easedProgress = easeOutCubic(progress);

        angleRef.current = spinStartAngleRef.current + (spinTargetRef.current - spinStartAngleRef.current) * easedProgress;

        if (progress >= 1) {
          wheelHasStopped = true;
          timeSinceStop = elapsed - duration;
          if (timeSinceStop < 30) playSound('win'); // Play sound precisely once at stop
        }
      } else if (phase === 'result' && winningFood) {
        angleRef.current = -Math.PI / 2 + FOODS[winningFood].angle;
        highlightedFoodId = winningFood;
        wheelHasStopped = true;
        
        // Compute time since stop assuming spin finished at 5 seconds during the 6-second spinning phase
        // Here we just use a generic continuous time for result phase
        timeSinceStop = 1000 + (4 - timer) * 1000; 
      }

      if ((phase === 'spinning' && !wheelHasStopped) || (phase === 'betting' && timer <= 1)) {
         if (foodKeys.length > 0) {
           const lightAngle = ((angleRef.current % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
           let minDiff = Infinity;
           foodKeys.forEach(foodId => {
             const food = FOODS[foodId];
             const seatAngle = ((-Math.PI / 2 + food.angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
             let diff = Math.abs(seatAngle - lightAngle);
             if (diff > Math.PI) diff = 2 * Math.PI - diff;
             if (diff < minDiff) {
               minDiff = diff;
               highlightedFoodId = foodId;
             }
           });
         }
      } else if (wheelHasStopped && winningFood) {
         highlightedFoodId = winningFood;
      }

      if (phase === 'spinning' && !wheelHasStopped && highlightedFoodId && highlightedFoodId !== lastSoundTimeRef.current) {
        playSound('tick');
        lastSoundTimeRef.current = highlightedFoodId;
      }

      setWheelAngle(angleRef.current);

      // 2. LUXURY DEEP PURPLE RADIAL AURORA BACKGROUND
      const bgGlow = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, radius * 1.6);
      bgGlow.addColorStop(0, '#22123f'); // gorgeous deep royal purple
      bgGlow.addColorStop(0.5, '#0e0622'); // midnight violet
      bgGlow.addColorStop(1, '#05020c'); // obsidian deepest plum
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, w, h);

      // 3. DRAW 3D EMBOSSED UNDER-RIM BEVEL SHADOW
      ctx.save();
      ctx.strokeStyle = '#05020c';
      ctx.lineWidth = 22;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(centerX, centerY + 6, radius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();

      // Outer golden-neon halo aura
      ctx.save();
      ctx.strokeStyle = '#3b125c';
      ctx.lineWidth = 18;
      ctx.shadowColor = '#d97706'; // gold glow
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 1, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();

      // 4. DRAW ROTATING WHEEL STRUCTURE (GOLD GRADIENTS & RIVETS)
      ctx.save();
      ctx.translate(centerX, centerY);

      // Metallic outer golden wheel rim gradient
      const goldGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
      goldGrad.addColorStop(0, '#92400e'); // Deep bronze gold
      goldGrad.addColorStop(0.25, '#fef08a'); // Super bright gold
      goldGrad.addColorStop(0.5, '#d97706'); // Warm gold
      goldGrad.addColorStop(0.75, '#fef08a'); // Super bright gold
      goldGrad.addColorStop(1, '#78350f'); // Shadow bronze

      ctx.strokeStyle = goldGrad;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.stroke();

      // Inner thin golden track
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, radius - 6, 0, 2 * Math.PI);
      ctx.stroke();

      // Draw metallic structural rivets (16 studs around the golden rim)
      for (let i = 0; i < 16; i++) {
        const rivetAngle = (i * Math.PI) / 8;
        const rx = radius * Math.cos(rivetAngle);
        const ry = radius * Math.sin(rivetAngle);

        // Rivet base
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(rx, ry, 3.5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 1;
        ctx.stroke();

        // White sheen dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(rx - 1, ry - 1, 1, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Draw metallic purple spokes
      foodKeys.forEach(foodId => {
        const food = FOODS[foodId];
        ctx.save();
        ctx.rotate(-Math.PI / 2 + food.angle);

        // Spoke bar
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius, 0);
        
        const spokeGrad = ctx.createLinearGradient(0, 0, radius, 0);
        spokeGrad.addColorStop(0, '#a855f7');
        spokeGrad.addColorStop(0.5, '#d97706');
        spokeGrad.addColorStop(1, '#fef08a');

        ctx.strokeStyle = spokeGrad;
        ctx.lineWidth = 4;
        ctx.stroke();

        // Neon spoke highlight center line
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius * 0.9, 0);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
      });

      ctx.restore(); // restored wheel rotation

      // 5. DRAW THE SUSPENDED 2.5D TACTILE SLOTS (Perfect upright vertical passenger cabins)
      foodKeys.forEach(foodId => {
        const food = FOODS[foodId];
        const currentSeatAngle = -Math.PI / 2 + food.angle;
        const seatX = centerX + radius * Math.cos(currentSeatAngle);
        const seatY = centerY + radius * Math.sin(currentSeatAngle);

        // Base logical dimensions for mapping (everything designed around a base radius of 120)
        const scaleFactor = radius / 120;
        
        ctx.save();
        ctx.translate(seatX, seatY);
        ctx.scale(scaleFactor, scaleFactor);

        // Design properties for 3D tactile card look
        const cardW = 70;
        const cardH = 80;
        const rx = -cardW / 2;
        const ry = -cardH / 2;

        const isSelected = selectedFoodId === foodId;
        const hasBet = (userBets[foodId] || 0) > 0;
        let isHighlighted = false;
        
        // Exact 4 flashes logic ONLY when wheel has stopped
        let isWinningVisual = false;
        if (winningFood === foodId) {
           if (wheelHasStopped) {
               if (timeSinceStop < 1200) {
                   const flashCycle = timeSinceStop % 300;
                   isWinningVisual = flashCycle < 150;
               } else {
                   isWinningVisual = true; // Stay on after 4 flashes
               }
           }
        }
        
        if (highlightedFoodId === foodId) {
            if (phase === 'spinning' && !wheelHasStopped) isHighlighted = true;
            if (phase === 'betting' && timer <= 1) isHighlighted = true;
        }

        // A. 3D Under-Shadow Bevel Offset Plate
        ctx.fillStyle = '#05020c';
        ctx.beginPath();
        ctx.roundRect(rx, ry + 4, cardW, cardH, 10);
        ctx.fill();

        // B. Subtle, professional drop shadow (No glowing neon halos)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;

        // C. Front Card Body (Luxury dark purple glass plate)
        ctx.fillStyle = isWinningVisual ? '#14532d' : 'rgba(23, 14, 45, 0.95)';
        ctx.strokeStyle = (isWinningVisual || isHighlighted) ? '#22c55e' : (hasBet ? '#a855f7' : '#4b5563');
        ctx.lineWidth = (isWinningVisual || isHighlighted) ? 3 : 1.5;

        ctx.beginPath();
        ctx.roundRect(rx, ry, cardW, cardH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0; // reset shadow immediately

        // D. Hanging metallic bracket structure
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, ry);
        ctx.lineTo(0, ry - 6);
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(0, ry - 6, 3, 0, 2 * Math.PI);
        ctx.fill();

        // E. Metallic Gold/Chrome header stripe for Multiplier badge
        const multiplierGrad = ctx.createLinearGradient(rx, ry, rx + cardW, ry);
        if (isWinningVisual) {
          multiplierGrad.addColorStop(0, '#15803d');
          multiplierGrad.addColorStop(1, '#22c55e');
        } else {
          multiplierGrad.addColorStop(0, food.color);
          multiplierGrad.addColorStop(0.5, '#fef08a');
          multiplierGrad.addColorStop(1, food.color);
        }

        ctx.fillStyle = multiplierGrad;
        ctx.beginPath();
        ctx.roundRect(rx + 3, ry + 3, cardW - 6, 17, 5);
        ctx.fill();

        ctx.font = 'black 11px Inter, Cairo, sans-serif';
        ctx.fillStyle = '#05020c';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`x${food.multiplier}`, 0, ry + 12.5);

        // F. Tiny golden rivets at the 4 card corners for a premium industrial look
        const rivetPositions = [
          { x: rx + 5, y: ry + 24 },
          { x: rx + cardW - 5, y: ry + 24 },
          { x: rx + 5, y: ry + cardH - 5 },
          { x: rx + cardW - 5, y: ry + cardH - 5 }
        ];
        ctx.fillStyle = '#fef08a';
        rivetPositions.forEach(pos => {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 1.2, 0, 2 * Math.PI);
          ctx.fill();
        });

        // G. Large Food Emoji Icon
        ctx.font = '28px Segoe UI Symbol, Apple Color Emoji, sans-serif';
        ctx.fillText(food.icon, 0, ry + 41);

        // Draw physical overlapping banknotes "ورقات الرهان" on the card if other players placed bets
        const otherBets = allBetsList.filter(b => b.foodId === foodId && b.userId !== 'user_me');
        const otherBetsCount = otherBets.length;

        if (otherBetsCount > 0) {
          const maxVisualNotes = Math.min(otherBetsCount, 3);
          for (let i = 0; i < maxVisualNotes; i++) {
            ctx.save();
            ctx.translate(-14 + i * 8, ry + 48); // staggered near the emoji/label
            ctx.rotate(-0.15 + i * 0.1); // natural tilt
            
            // Draw tiny banknote
            const w = 15;
            const h = 8;
            ctx.fillStyle = '#10b981';
            ctx.strokeStyle = '#047857';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.roundRect(-w/2, -h/2, w, h, 1.5);
            ctx.fill();
            ctx.stroke();

            // Tiny white inner border
            ctx.strokeStyle = '#a7f3d0';
            ctx.lineWidth = 0.3;
            ctx.beginPath();
            ctx.roundRect(-w/2 + 1, -h/2 + 1, w - 2, h - 2, 0.8);
            ctx.stroke();

            ctx.restore();
          }
        }

        // H. Food Arabic Label
        ctx.font = 'bold 9px Cairo, Inter, sans-serif';
        ctx.fillStyle = isSelected ? '#f59e0b' : '#e2e8f0';
        ctx.fillText(food.nameAr, 0, ry + 58);

        // I. Active Bet statistics indicator
        const userAmt = userBets[foodId] || 0;

        if (userAmt > 0 || otherBetsCount > 0) {
          ctx.fillStyle = '#020005';
          ctx.beginPath();
          ctx.roundRect(rx + 5, ry + 64, cardW - 10, 12, 3);
          ctx.fill();

          ctx.font = 'bold 8px Cairo, system-ui';
          
          if (userAmt > 0 && otherBetsCount > 0) {
            // Draw BOTH: user bet on the left, other bets count on the right
            ctx.textAlign = 'left';
            ctx.fillStyle = '#f59e0b';
            ctx.fillText(`أنت: ${userAmt}`, rx + 8, ry + 70.5);

            ctx.textAlign = 'right';
            ctx.fillStyle = '#10b981';
            ctx.fillText(`💵 x${otherBetsCount}`, rx + cardW - 8, ry + 70.5);
          } else if (userAmt > 0) {
            // Only user bet
            ctx.textAlign = 'center';
            ctx.fillStyle = '#f59e0b';
            ctx.fillText(`أنت: ${userAmt}`, 0, ry + 70.5);
          } else {
            // Only other bets (show banknote count)
            ctx.textAlign = 'center';
            ctx.fillStyle = '#10b981';
            ctx.fillText(`💵 أوراق: ${otherBetsCount}`, 0, ry + 70.5);
          }
        }

        // J. Gold crown selection graphic for active selected food card
        if (isSelected) {
          ctx.font = '11px sans-serif';
          ctx.fillText('👑', 0, ry - 14);
        }

        ctx.restore();
      });

      // 6. DRAW SEAMLESS FLYING MULTIPLAYER CHIPS PARTICLES
      chipsRef.current.forEach((chip) => {
        chip.progress += 2.5 * dt;
        if (chip.progress >= 1) {
          chip.progress = 1;
        }

        chip.currentX = chip.startX + (chip.targetX - chip.startX) * chip.progress;
        chip.currentY = chip.startY + (chip.targetY - chip.startY) * chip.progress;

        const scaleFactor = radius / 120;

        ctx.save();
        ctx.translate(chip.currentX, chip.currentY);
        ctx.scale(scaleFactor, scaleFactor);
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 4;

        if (chip.isMine) {
          // Draw standard circular high-end chip for the user
          ctx.fillStyle = chip.color;
          ctx.beginPath();
          ctx.arc(0, 0, 11, 0, 2 * Math.PI);
          ctx.fill();

          // White border ring dashes
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, 2 * Math.PI);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.font = 'bold 7px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(chip.amount.toString(), 0, 0);
        } else {
          // Draw other player's bet as a beautiful paper banknote / card "ورقة رهان"
          // Slight tilt for a casual natural look
          ctx.rotate(0.2);
          
          const billW = 26;
          const billH = 14;
          
          // Outer paper bill border / bevel shadow
          ctx.fillStyle = '#064e3b'; // dark green shadow
          ctx.beginPath();
          ctx.roundRect(-billW/2, -billH/2 + 2, billW, billH, 3);
          ctx.fill();

          // Main bill body - soft emerald bank-note green
          ctx.fillStyle = '#10b981';
          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(-billW/2, -billH/2, billW, billH, 3);
          ctx.fill();
          ctx.stroke();

          // Inner ornamental dash frame
          ctx.strokeStyle = '#a7f3d0';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([1.5, 1.5]);
          ctx.beginPath();
          ctx.roundRect(-billW/2 + 2, -billH/2 + 2, billW - 4, billH - 4, 1.5);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw 💵 center watermark/symbol
          ctx.font = '10px Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('💵', 0, 0);
        }

        ctx.restore();
      });

      chipsRef.current = chipsRef.current.filter(c => c.progress < 1);

      // 7. DRAW THE CROWN POINTER HOUSING (TOP CENTER SECTOR INDICATOR)
      ctx.save();
      ctx.translate(centerX, centerY - radius - 5);
      
      const scaleFactor = radius / 120;
      ctx.scale(scaleFactor, scaleFactor);

      // Shadow pointer
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 4;

      // Draw metallic gold crown-like pointer plaque
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(-14, -24);
      ctx.lineTo(14, -24);
      ctx.lineTo(8, -8);
      ctx.lineTo(0, 2);
      ctx.lineTo(-8, -8);
      ctx.closePath();
      ctx.fill();

      // Shiny center gemstone rivet
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(0, -12, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      // 8. HIGH-END 3D EMBOSSED CENTRAL TIMER HUB (WITH GLASS SHINE COATING)
      ctx.save();
      ctx.translate(centerX, centerY);

      // A. Deep thick 3D bevel bottom layer
      ctx.fillStyle = '#05020c';
      ctx.beginPath();
      ctx.arc(0, 4 * scaleFactor, radius * 0.28, 0, 2 * Math.PI);
      ctx.fill();

      // B. Outer gold chrome ring with light radial pulses
      const pulse = 1 + 0.03 * Math.sin(timestamp * 0.008);
      const hubRingGrad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 0.29);
      hubRingGrad.addColorStop(0, '#78350f');
      hubRingGrad.addColorStop(0.5, '#fef08a');
      hubRingGrad.addColorStop(1, '#92400e');

      ctx.fillStyle = hubRingGrad;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.28 * pulse, 0, 2 * Math.PI);
      ctx.fill();

      // C. Internal obsidian status plate
      const hubInnerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.23);
      hubInnerGrad.addColorStop(0, '#1c0a35');
      hubInnerGrad.addColorStop(1, '#05020c');

      ctx.fillStyle = hubInnerGrad;
      ctx.strokeStyle = phase === 'betting' ? '#d97706' : '#a855f7';
      ctx.lineWidth = 3 * scaleFactor;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.23, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // D. Draw mini golden crown ornament
      ctx.font = `${16 * scaleFactor}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👑', 0, -radius * 0.12);

      // E. Label "مدة الاختيار" (Decision/Choosing period) or Spin/Win text
      ctx.font = `bold ${8 * scaleFactor}px Cairo, system-ui`;
      ctx.fillStyle = phase === 'betting' ? '#fde047' : '#c084fc';
      ctx.fillText(
        phase === 'betting' ? 'مدة الاختيار' : (phase === 'spinning' ? 'جارِ الدوران' : 'الفائز!'), 
        0, 
        radius * 0.08
      );

      // F. Main countdown timer numbers
      ctx.font = `bold ${radius * 0.12 * pulse}px "JetBrains Mono", monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(timer.toString(), 0, -radius * 0.015);

      // G. STUNNING SHINY GLASS COATING OVERLAY (Crescent Glare Accent)
      ctx.save();
      const glassGrad = ctx.createLinearGradient(-radius * 0.2, -radius * 0.2, radius * 0.2, radius * 0.2);
      glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      glassGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
      glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = glassGrad;
      ctx.beginPath();
      // Clip a semi-circle to represent reflective glass
      ctx.arc(0, 0, radius * 0.23, -Math.PI, 0);
      ctx.fill();
      ctx.restore();

      ctx.restore(); // restored timer hub

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, []);

  // Handle click on canvas: map to closest seat card
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== 'betting' || timer <= 1) return; // Disable interactions if betting is closed

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const w = rect.width;
    const h = rect.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.max(10, Math.min(w, h) * 0.32);

    let closestFood: FoodId | null = null;
    let minDistance = 50;

    const foodKeys = Object.keys(FOODS) as FoodId[];
    foodKeys.forEach(foodId => {
      const food = FOODS[foodId];
      // The wheel is stationary at -Math.PI / 2
      const currentSeatAngle = -Math.PI / 2 + food.angle;
      const seatX = centerX + radius * Math.cos(currentSeatAngle);
      const seatY = centerY + radius * Math.sin(currentSeatAngle);

      const dist = Math.hypot(x - seatX, y - seatY);
      if (dist < minDistance) {
        minDistance = dist;
        closestFood = foodId;
      }
    });

    if (closestFood) {
      onSelectFood(closestFood);
    }
  };

  const showBettingClosed = phase === 'betting' && timer === 1;

  return (
    <div ref={containerRef} className="relative w-full h-[320px] md:h-[390px] flex items-center justify-center">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="block cursor-pointer select-none rounded-xl bg-transparent"
        style={{ touchAction: 'none' }}
      />
      {showBettingClosed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-xl z-50 animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-red-600 to-rose-600 px-6 py-3 rounded-full shadow-2xl border border-red-400/50 transform animate-bounce">
            <span className="text-white font-black text-xl tracking-wider">تم إيقاف الرهان</span>
          </div>
        </div>
      )}
    </div>
  );
};
