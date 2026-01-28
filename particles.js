class Particle {
    constructor(x, y, canvas) {
        this.x = x;
        this.y = y;
        this.canvas = canvas;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.radius = Math.random() * 2 + 1;
        this.opacity = Math.random() * 0.5 + 0.5;
        this.hue = Math.random() * 60 + 200; // 蓝紫色调
        this.life = 1;
        this.decay = Math.random() * 0.02 + 0.005;
        this.isExplosion = false;
    }
    
    update(mouse, config) {
        if (this.isExplosion) {
            this.life -= this.decay;
            if (this.life <= 0) {
                return false;
            }
        }
        
        // 鼠标交互
        if (mouse.x !== null && mouse.y !== null) {
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 150) {
                const force = (150 - distance) / 150;
                const angle = Math.atan2(dy, dx);
                this.vx += Math.cos(angle) * force * config.mouseForce;
                this.vy += Math.sin(angle) * force * config.mouseForce;
            }
        }
        
        // 边界检测
        if (this.x < 0 || this.x > this.canvas.width) {
            this.vx *= -0.8;
            this.x = Math.max(0, Math.min(this.canvas.width, this.x));
        }
        if (this.y < 0 || this.y > this.canvas.height) {
            this.vy *= -0.8;
            this.y = Math.max(0, Math.min(this.canvas.height, this.y));
        }
        
        // 阻尼
        this.vx *= 0.99;
        this.vy *= 0.99;
        
        // 更新位置
        this.x += this.vx;
        this.y += this.vy;
        
        return true;
    }
    
    draw(ctx, config) {
        ctx.save();
        ctx.globalAlpha = this.opacity * this.life;
        
        // 粒子发光效果
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius * 3 * config.particleSize
        );
        gradient.addColorStop(0, `hsla(${this.hue}, 70%, 60%, 1)`);
        gradient.addColorStop(0.4, `hsla(${this.hue}, 70%, 50%, 0.8)`);
        gradient.addColorStop(1, `hsla(${this.hue}, 70%, 40%, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * config.particleSize, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

class ParticleSystem {
    constructor() {
        this.canvas = document.getElementById('particleCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: null, y: null };
        this.config = {
            particleCount: 100,
            connectionDistance: 120,
            mouseForce: 0.1,
            particleSize: 2
        };
        
        this.init();
        this.setupEventListeners();
        this.animate();
    }
    
    init() {
        this.resizeCanvas();
        this.createParticles();
        this.setupControls();
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    createParticles() {
        this.particles = [];
        for (let i = 0; i < this.config.particleCount; i++) {
            this.particles.push(new Particle(
                Math.random() * this.canvas.width,
                Math.random() * this.canvas.height,
                this.canvas
            ));
        }
    }
    
    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.x = null;
            this.mouse.y = null;
        });
        
        this.canvas.addEventListener('click', (e) => {
            this.createExplosion(e.clientX, e.clientY);
        });
    }
    
    createExplosion(x, y) {
        const explosionParticles = 15;
        for (let i = 0; i < explosionParticles; i++) {
            const particle = new Particle(x, y, this.canvas);
            particle.isExplosion = true;
            const angle = (Math.PI * 2 * i) / explosionParticles;
            const speed = Math.random() * 5 + 3;
            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed;
            particle.radius = Math.random() * 3 + 2;
            particle.hue = Math.random() * 60 + 300; // 紫红色调
            this.particles.push(particle);
        }
    }
    
    setupControls() {
        const particleCountSlider = document.getElementById('particleCount');
        const connectionDistanceSlider = document.getElementById('connectionDistance');
        const mouseForceSlider = document.getElementById('mouseForce');
        const particleSizeSlider = document.getElementById('particleSize');
        
        const updateValue = (slider, valueSpan, configKey) => {
            const value = parseFloat(slider.value);
            valueSpan.textContent = value;
            this.config[configKey] = value;
            
            if (configKey === 'particleCount') {
                this.createParticles();
            }
        };
        
        particleCountSlider.addEventListener('input', (e) => {
            updateValue(e.target, document.getElementById('particleCountValue'), 'particleCount');
        });
        
        connectionDistanceSlider.addEventListener('input', (e) => {
            updateValue(e.target, document.getElementById('connectionDistanceValue'), 'connectionDistance');
        });
        
        mouseForceSlider.addEventListener('input', (e) => {
            updateValue(e.target, document.getElementById('mouseForceValue'), 'mouseForce');
        });
        
        particleSizeSlider.addEventListener('input', (e) => {
            updateValue(e.target, document.getElementById('particleSizeValue'), 'particleSize');
        });
    }
    
    drawConnections() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < this.config.connectionDistance) {
                    const opacity = (1 - distance / this.config.connectionDistance) * 0.5;
                    this.ctx.globalAlpha = opacity;
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    this.ctx.stroke();
                }
            }
        }
    }
    
    animate() {
        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制连接线
        this.drawConnections();
        
        // 更新和绘制粒子
        this.particles = this.particles.filter(particle => {
            const alive = particle.update(this.mouse, this.config);
            if (alive) {
                particle.draw(this.ctx, this.config);
            }
            return alive;
        });
        
        // 保持最小粒子数量
        while (this.particles.length < this.config.particleCount) {
            this.particles.push(new Particle(
                Math.random() * this.canvas.width,
                Math.random() * this.canvas.height,
                this.canvas
            ));
        }
        
        requestAnimationFrame(() => this.animate());
    }
}

// 初始化粒子系统
window.addEventListener('load', () => {
    new ParticleSystem();
});