class Particle {
    constructor(x, y, vx, vy, color, life = 60) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.gravity = 0.1;
        this.friction = 0.98;
        this.size = Math.random() * 3 + 1;
    }
    
    update() {
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vy += this.gravity;
        
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
    }
    
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    isDead() {
        return this.life <= 0;
    }
}

cn Firework {
    constructor(x, y, targetX, targetY) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.targetX = targetX;
        this.targetY = targetY;
        
        const distance = Math.sqrt((targetX - x) ** 2 + (targetY - y) ** 2);
        this.vx = (targetX - x) / distance * 8;
        this.vy = (targetY - y) / distance * 8;
        
        this.distanceTraveled = 0;
        this.distanceToTarget = distance;
        this.trail = [];
        this.trailLength = 10;
        
        this.color = `hsl(${Math.random() * 360}, 100%, 60%)`;
        this.exploded = false;
        this.particles = [];
    }
    
    update() {
        if (!this.exploded) {
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > this.trailLength) {
                this.trail.shift();
            }
            
            this.x += this.vx;
            this.y += this.vy;
            
            this.distanceTraveled = Math.sqrt(
                (this.x - this.startX) ** 2 + (this.y - this.startY) ** 2
            );
            
            if (this.distanceTraveled >= this.distanceToTarget) {
                this.explode();
            }
        } else {
            this.particles.forEach(particle => particle.update());
            this.particles = this.particles.filter(particle => !particle.isDead());
        }
    }
    
    explode() {
        this.exploded = true;
        const particleCount = Math.random() * 30 + 20;
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const velocity = Math.random() * 6 + 2;
            
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity;
            
            const hue = parseInt(this.color.match(/\d+/)[0]);
            const particleColor = `hsl(${hue + Math.random() * 60 - 30}, 100%, ${50 + Math.random() * 30}%)`;
            
            this.particles.push(new Particle(
                this.x, this.y, vx, vy, particleColor, Math.random() * 60 + 40
            ));
        }
        
        // 添加一些闪烁粒子
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const velocity = Math.random() * 3 + 1;
            
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity;
            
            this.particles.push(new Particle(
                this.x, this.y, vx, vy, '#ffffff', Math.random() * 30 + 20
            ));
        }
    }
    
    draw(ctx) {
        if (!this.exploded) {
            // 绘制尾迹
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.trail[0]?.x || this.x, this.trail[0]?.y || this.y);
            
            for (let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
            
            ctx.lineTo(this.x, this.y);
            ctx.stroke();
            
            // 绘制烟花头部
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            this.particles.forEach(particle => particle.draw(ctx));
        }
    }
    
    isDead() {
        return this.exploded && this.particles.length === 0;
    }
}

cn FireworkShow {
    constructor() {
        this.canvas = document.getElementById('fireworksCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.fireworks = [];
        this.autoMode = true;
        this.autoTimer = 0;
        
        this.resizeCanvas();
        this.setupEventListeners();
        this.animate();
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.canvas.addEventListener('click', (e) => {
            this.createFirework(e.clientX, e.clientY);
        });
        
        // 键盘控制
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                this.autoMode = !this.autoMode;
            }
        });
    }
    
    createFirework(targetX = null, targetY = null) {
        if (targetX === null) {
            targetX = Math.random() * this.canvas.width;
            targetY = Math.random() * this.canvas.height * 0.6;
        }
        
        const startX = Math.random() * this.canvas.width;
        const startY = this.canvas.height;
        
        this.fireworks.push(new Firework(startX, startY, targetX, targetY));
    }
    
    update() {
        this.fireworks.forEach(firework => firework.update());
        this.fireworks = this.fireworks.filter(firework => !firework.isDead());
        
        // 自动模式
        if (this.autoMode) {
            this.autoTimer++;
            if (this.autoTimer >= Math.random() * 60 + 30) {
                this.createFirework();
                this.autoTimer = 0;
            }
        }
        
        // 更新烟花计数
        document.getElementById('fireworkCount').textContent = this.fireworks.length;
    }
    
    draw() {
        // 创建渐变背景
        this.ctx.fillStyle = 'rgba(0, 4, 40, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.fireworks.forEach(firework => firework.draw(this.ctx));
    }
    
    animate() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// 启动烟花秀
window.addEventListener('load', () => {
    new FireworkShow();
});