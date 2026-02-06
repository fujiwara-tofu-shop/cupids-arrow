// Cupid's Arrow - Valentine's Day Game
// Shoot arrows to match falling hearts!

// Play.fun SDK
let ogp = null;
let ogpReady = false;

if (typeof OpenGameSDK !== 'undefined') {
  ogp = new OpenGameSDK({
    ui: { usePointsWidget: true, theme: 'light' },
    logLevel: 1,
  });
  
  ogp.on('OnReady', () => {
    console.log('Play.fun SDK ready!');
    ogpReady = true;
  });
  
  ogp.on('SavePointsSuccess', () => console.log('Score saved!'));
  ogp.on('SavePointsFailed', () => console.log('Save failed'));
  
  // Game ID will be set after registration
  ogp.init({ gameId: 'PENDING' });
}

// Canvas setup
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const container = document.getElementById('game-container');
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Game state
const game = {
  isPlaying: false,
  score: 0,
  combo: 0,
  maxCombo: 0,
  hearts: [],
  arrows: [],
  particles: [],
  brokenHearts: [],
  cupidY: 0,
  cupidAngle: 0,
  targetAngle: 0,
  lastHeartTime: 0,
  difficulty: 1,
  missedHearts: 0,
};

// Heart colors - shoot matching colors!
const HEART_COLORS = [
  { fill: '#ff6b6b', stroke: '#e55555', name: 'red' },
  { fill: '#ff69b4', stroke: '#e557a0', name: 'pink' },
  { fill: '#da70d6', stroke: '#c45cc2', name: 'purple' },
  { fill: '#ff8c94', stroke: '#e57880', name: 'coral' },
];

// Current arrow color
let currentArrowColor = HEART_COLORS[0];

// Audio context
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playShootSound() {
  try {
    const ctx = initAudio();
    if (ctx.state === 'suspended') ctx.resume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
}

function playHitSound(combo) {
  try {
    const ctx = initAudio();
    if (ctx.state === 'suspended') ctx.resume();
    
    const baseFreq = 523.25 + (combo * 50);
    
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.setValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.05);
    osc.frequency.setValueAtTime(baseFreq * 2, ctx.currentTime + 0.1);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(baseFreq * 1.5, ctx.currentTime);
    
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc2.start();
    osc.stop(ctx.currentTime + 0.25);
    osc2.stop(ctx.currentTime + 0.25);
  } catch (e) {}
}

function playMissSound() {
  try {
    const ctx = initAudio();
    if (ctx.state === 'suspended') ctx.resume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {}
}

// Draw heart shape
function drawHeart(x, y, size, color, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  
  const s = size;
  ctx.moveTo(0, s * 0.3);
  ctx.bezierCurveTo(-s * 0.5, -s * 0.3, -s, s * 0.1, 0, s);
  ctx.bezierCurveTo(s, s * 0.1, s * 0.5, -s * 0.3, 0, s * 0.3);
  
  ctx.fillStyle = color.fill;
  ctx.fill();
  ctx.strokeStyle = color.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Shine
  ctx.beginPath();
  ctx.arc(-s * 0.25, 0, s * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
  
  ctx.restore();
}

// Draw broken heart
function drawBrokenHeart(x, y, size, color, split) {
  ctx.save();
  ctx.translate(x, y);
  
  ctx.save();
  ctx.translate(-split, 0);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.3);
  ctx.bezierCurveTo(-size * 0.5, -size * 0.3, -size, size * 0.1, 0, size);
  ctx.lineTo(0, size * 0.3);
  ctx.fillStyle = color.fill;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.restore();
  
  ctx.save();
  ctx.translate(split, 0);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.3);
  ctx.bezierCurveTo(size * 0.5, -size * 0.3, size, size * 0.1, 0, size);
  ctx.lineTo(0, size * 0.3);
  ctx.fillStyle = color.fill;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.restore();
  
  ctx.restore();
}

// Draw cupid bow
function drawCupid(x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  
  // Bow
  ctx.beginPath();
  ctx.arc(0, 0, 30, -Math.PI * 0.4, Math.PI * 0.4);
  ctx.strokeStyle = '#d4a574';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // String
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(-10, 0);
  ctx.lineTo(0, 22);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Arrow shaft
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(25, 0);
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // Arrow head (heart!)
  drawHeart(30, 0, 10, currentArrowColor, Math.PI / 2);
  
  ctx.restore();
}

// Draw arrow in flight
function drawArrow(arrow) {
  ctx.save();
  ctx.translate(arrow.x, arrow.y);
  ctx.rotate(arrow.angle);
  
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(15, 0);
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  drawHeart(20, 0, 10, arrow.color, Math.PI / 2);
  
  // Feathers
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(-28, -6);
  ctx.lineTo(-25, 0);
  ctx.lineTo(-28, 6);
  ctx.closePath();
  ctx.fillStyle = '#ffb6c1';
  ctx.fill();
  
  ctx.restore();
}

// Spawn heart
function spawnHeart() {
  const containerRect = document.getElementById('game-container').getBoundingClientRect();
  const w = containerRect.width;
  
  const color = HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)];
  const size = 25 + Math.random() * 10;
  
  game.hearts.push({
    x: 40 + Math.random() * (w - 80),
    y: -40,
    size,
    color,
    speed: 1.5 + game.difficulty * 0.3 + Math.random() * 0.5,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.03 + Math.random() * 0.02,
  });
}

// Create particles
function createParticles(x, y, color, count = 15) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const speed = 3 + Math.random() * 5;
    game.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 6,
      color: color.fill,
      life: 1,
      type: Math.random() > 0.5 ? 'heart' : 'circle',
    });
  }
}

// Shoot arrow
function shoot(targetX, targetY) {
  if (!game.isPlaying) return;
  
  const containerRect = document.getElementById('game-container').getBoundingClientRect();
  const cupidX = containerRect.width / 2;
  const cupidY = containerRect.height - 80;
  
  const angle = Math.atan2(targetY - cupidY, targetX - cupidX);
  
  game.arrows.push({
    x: cupidX,
    y: cupidY,
    angle,
    speed: 15,
    color: currentArrowColor,
  });
  
  // Cycle to next color
  const idx = HEART_COLORS.findIndex(c => c.name === currentArrowColor.name);
  currentArrowColor = HEART_COLORS[(idx + 1) % HEART_COLORS.length];
  
  game.cupidAngle = angle;
  playShootSound();
}

// Check collision
function checkCollision(arrow, heart) {
  const dx = arrow.x - heart.x;
  const dy = arrow.y - heart.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < heart.size + 15;
}

// Update score display
function updateScore() {
  document.getElementById('score').textContent = game.score;
  
  const comboEl = document.getElementById('combo');
  if (game.combo >= 2) {
    comboEl.textContent = `x${game.combo} COMBO!`;
    comboEl.classList.add('active');
  } else {
    comboEl.classList.remove('active');
  }
}

// Flash screen
function flashScreen(color = '#ff69b4') {
  const flash = document.getElementById('flash');
  flash.style.background = color;
  flash.style.opacity = '0.3';
  setTimeout(() => flash.style.opacity = '0', 80);
}

// Game loop
function update() {
  if (!game.isPlaying) return;
  
  const containerRect = document.getElementById('game-container').getBoundingClientRect();
  const w = containerRect.width;
  const h = containerRect.height;
  
  // Spawn hearts
  const now = Date.now();
  const spawnRate = Math.max(600, 1400 - game.difficulty * 80);
  if (now - game.lastHeartTime > spawnRate) {
    spawnHeart();
    game.lastHeartTime = now;
  }
  
  // Update hearts
  for (let i = game.hearts.length - 1; i >= 0; i--) {
    const heart = game.hearts[i];
    heart.y += heart.speed;
    heart.wobble += heart.wobbleSpeed;
    heart.x += Math.sin(heart.wobble) * 0.5;
    
    if (heart.y > h + 40) {
      game.hearts.splice(i, 1);
      game.combo = 0;
      game.missedHearts++;
      
      game.brokenHearts.push({
        x: heart.x,
        y: h - 30,
        color: heart.color,
        split: 0,
        life: 1,
      });
      
      playMissSound();
      flashScreen('#666');
      
      if (game.missedHearts >= 5) {
        endGame();
        return;
      }
    }
  }
  
  // Update arrows
  for (let i = game.arrows.length - 1; i >= 0; i--) {
    const arrow = game.arrows[i];
    arrow.x += Math.cos(arrow.angle) * arrow.speed;
    arrow.y += Math.sin(arrow.angle) * arrow.speed;
    
    let hit = false;
    for (let j = game.hearts.length - 1; j >= 0; j--) {
      const heart = game.hearts[j];
      if (checkCollision(arrow, heart)) {
        // Color match?
        const colorMatch = arrow.color.name === heart.color.name;
        
        if (colorMatch) {
          game.combo++;
          game.maxCombo = Math.max(game.maxCombo, game.combo);
          
          const points = 10 * game.combo;
          game.score += points;
          
          createParticles(heart.x, heart.y, heart.color);
          flashScreen(heart.color.fill);
          playHitSound(game.combo);
          
          if (ogp && ogpReady) {
            ogp.addPoints(points);
          }
        } else {
          // Wrong color - break combo, small penalty
          game.combo = 0;
          playMissSound();
          flashScreen('#666');
        }
        
        game.hearts.splice(j, 1);
        hit = true;
        
        if (game.score > 0 && game.score % 100 === 0) {
          game.difficulty = Math.min(10, game.difficulty + 0.5);
        }
        
        break;
      }
    }
    
    if (arrow.x < -50 || arrow.x > w + 50 || arrow.y < -50 || arrow.y > h + 50) {
      game.arrows.splice(i, 1);
    } else if (hit) {
      game.arrows.splice(i, 1);
    }
  }
  
  // Update particles
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life -= 0.025;
    
    if (p.life <= 0) {
      game.particles.splice(i, 1);
    }
  }
  
  // Update broken hearts
  for (let i = game.brokenHearts.length - 1; i >= 0; i--) {
    const bh = game.brokenHearts[i];
    bh.split += 0.5;
    bh.life -= 0.02;
    
    if (bh.life <= 0) {
      game.brokenHearts.splice(i, 1);
    }
  }
  
  updateScore();
}

// Render
function render() {
  const containerRect = document.getElementById('game-container').getBoundingClientRect();
  const w = containerRect.width;
  const h = containerRect.height;
  
  ctx.clearRect(0, 0, w, h);
  
  if (!game.isPlaying) return;
  
  // Draw broken hearts at bottom
  game.brokenHearts.forEach(bh => {
    ctx.globalAlpha = bh.life;
    drawBrokenHeart(bh.x, bh.y, 20, bh.color, bh.split);
    ctx.globalAlpha = 1;
  });
  
  // Draw missed counter (lives)
  const heartsLeft = 5 - game.missedHearts;
  ctx.font = '16px Quicksand';
  ctx.textAlign = 'left';
  let lifeX = 15;
  for (let i = 0; i < 5; i++) {
    const color = i < heartsLeft ? HEART_COLORS[0] : { fill: '#999', stroke: '#666' };
    drawHeart(lifeX + i * 22, h - 25, 10, color);
  }
  
  // Draw hearts
  game.hearts.forEach(heart => {
    drawHeart(heart.x, heart.y, heart.size, heart.color, Math.sin(heart.wobble) * 0.1);
  });
  
  // Draw arrows
  game.arrows.forEach(arrow => {
    drawArrow(arrow);
  });
  
  // Draw particles
  game.particles.forEach(p => {
    ctx.globalAlpha = p.life;
    if (p.type === 'heart') {
      drawHeart(p.x, p.y, p.size, { fill: p.color, stroke: p.color });
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  
  // Draw cupid
  const cupidX = w / 2;
  const cupidY = h - 80;
  
  const angleDiff = game.targetAngle - game.cupidAngle;
  game.cupidAngle += angleDiff * 0.1;
  
  drawCupid(cupidX, cupidY, game.cupidAngle);
  
  // Draw color selector hint
  ctx.font = '12px Quicksand';
  ctx.fillStyle = '#999';
  ctx.textAlign = 'center';
  ctx.fillText('Next arrow:', w / 2, h - 10);
}

// Game loop
function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

// Start game
function startGame() {
  game.isPlaying = true;
  game.score = 0;
  game.combo = 0;
  game.maxCombo = 0;
  game.hearts = [];
  game.arrows = [];
  game.particles = [];
  game.brokenHearts = [];
  game.difficulty = 1;
  game.missedHearts = 0;
  game.lastHeartTime = Date.now();
  currentArrowColor = HEART_COLORS[0];
  
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('final-score').textContent = '';
  updateScore();
  
  initAudio();
}

// End game
async function endGame() {
  game.isPlaying = false;
  
  document.getElementById('menu').classList.remove('hidden');
  document.querySelector('.menu-title').textContent = 'Game Over!';
  document.querySelector('.menu-subtitle').textContent = 'Tap to play again';
  document.getElementById('play-btn').textContent = 'Play Again';
  document.getElementById('final-score').textContent = 
    `Score: ${game.score} | Max Combo: x${game.maxCombo}`;
  
  if (ogp && ogpReady && game.score > 0) {
    try {
      await ogp.savePoints(game.score);
    } catch (e) {
      console.log('Save error:', e);
    }
  }
}

// Input handling
const gameContainer = document.getElementById('game-container');

function handleInput(clientX, clientY) {
  const rect = gameContainer.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  
  if (game.isPlaying) {
    shoot(x, y);
  }
}

function handleMove(clientX, clientY) {
  if (!game.isPlaying) return;
  
  const rect = gameContainer.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const cupidX = rect.width / 2;
  const cupidY = rect.height - 80;
  
  game.targetAngle = Math.atan2(y - cupidY, x - cupidX);
}

gameContainer.addEventListener('click', (e) => handleInput(e.clientX, e.clientY));
gameContainer.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));

gameContainer.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  handleInput(touch.clientX, touch.clientY);
});

gameContainer.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  handleMove(touch.clientX, touch.clientY);
});

document.getElementById('play-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  startGame();
});

gameLoop();
