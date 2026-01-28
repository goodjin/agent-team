import pygame
import random
import math
from pygame import gfxdraw

# 初始化 Pygame
pygame.init()

# 设置窗口
WIDTH, HEIGHT = 800, 600
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption('烟花绽放')

# 颜色定义
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
COLORS = [
    (255, 0, 0), (255, 165, 0), (255, 255, 0), (0, 255, 0),
    (0, 0, 255), (75, 0, 130), (238, 130, 238), (255, 192, 203)
]

class Particle:
    def __init__(self, x, y, color, speed, angle, size=3):
        self.x = x
        self.y = y
        self.color = color
        self.size = size
        self.vx = math.cos(angle) * speed
        self.vy = math.sin(angle) * speed
        self.gravity = 0.1
        self.life = 100
        self.decay = random.uniform(0.8, 0.99)
        self.trail = []
        
    def update(self):
        # 添加轨迹点
        self.trail.append((self.x, self.y))
        if len(self.trail) > 10:
            self.trail.pop(0)
            
        # 更新位置
        self.vx *= self.decay
        self.vy *= self.decay
        self.vy += self.gravity
        self.x += self.vx
        self.y += self.vy
        self.life -= 1
        
    def draw(self, surface):
        # 绘制轨迹
        if len(self.trail) > 1:
            for i, pos in enumerate(self.trail):
                alpha = int(255 * (i / len(self.trail)) * (self.life / 100))
                color_with_alpha = (*self.color, alpha)
                pygame.draw.circle(surface, color_with_alpha, (int(pos[0]), int(pos[1])), 
                                 max(1, self.size // 2))
        
        # 绘制粒子
        alpha = max(0, min(255, self.life * 2))
        color_with_alpha = (*self.color, alpha)
        pygame.draw.circle(surface, color_with_alpha, (int(self.x), int(self.y)), self.size)
        
    def is_alive(self):
        return self.life > 0 and self.y < HEIGHT + 50

class Firework:
    def __init__(self, x, target_y, color):
        self.x = x
        self.y = HEIGHT
        self.target_y = target_y
        self.color = color
        self.vx = 0
        self.vy = -random.uniform(15, 20)
        self.exploded = False
        self.particles = []
        self.trail = []
        
    def update(self):
        if not self.exploded:
            # 添加轨迹
            self.trail.append((self.x, self.y))
            if len(self.trail) > 20:
                self.trail.pop(0)
                
            # 更新位置
            self.vy += 0.3
            self.y += self.vy
            
            # 检查是否到达目标高度
            if self.vy >= 0 or self.y <= self.target_y:
                self.explode()
        else:
            # 更新粒子
            for particle in self.particles[:]:
                particle.update()
                if not particle.is_alive():
                    self.particles.remove(particle)
                    
    def explode(self):
        self.exploded = True
        particle_count = random.randint(30, 60)
        
        for i in range(particle_count):
            angle = (2 * math.pi * i) / particle_count
            speed = random.uniform(2, 8)
            size = random.randint(2, 4)
            
            # 创建粒子
            particle = Particle(self.x, self.y, self.color, speed, angle, size)
            self.particles.append(particle)
            
            # 添加一些随机粒子
            if random.random() < 0.3:
                random_angle = random.uniform(0, 2 * math.pi)
                random_speed = random.uniform(1, 5)
                random_particle = Particle(self.x, self.y, self.color, random_speed, 
                                         random_angle, size // 2)
                self.particles.append(random_particle)
                
    def draw(self, surface):
        if not self.exploded:
            # 绘制上升轨迹
            if len(self.trail) > 1:
                for i, pos in enumerate(self.trail):
                    alpha = int(255 * (i / len(self.trail)))
                    color_with_alpha = (*self.color, alpha)
                    pygame.draw.circle(surface, color_with_alpha, (int(pos[0]), int(pos[1])), 2)
            
            # 绘制烟花本体
            pygame.draw.circle(surface, self.color, (int(self.x), int(self.y)), 3)
        else:
            # 绘制所有粒子
            for particle in self.particles:
                particle.draw(surface)
                
    def is_alive(self):
        if not self.exploded:
            return True
        return len(self.particles) > 0

def main():
    clock = pygame.time.Clock()
    fireworks = []
    running = True
    auto_firework = 0
    
    # 创建半透明表面用于轨迹
    trail_surface = pygame.Surface((WIDTH, HEIGHT))
    trail_surface.set_alpha(20)
    
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN:
                # 点击鼠标创建烟花
                x, y = pygame.mouse.get_pos()
                color = random.choice(COLORS)
                fireworks.append(Firework(x, y, color))
                
        # 自动烟花
        auto_firework += 1
        if auto_firework > random.randint(30, 60):
            x = random.randint(50, WIDTH - 50)
            target_y = random.randint(50, HEIGHT // 2)
            color = random.choice(COLORS)
            fireworks.append(Firework(x, target_y, color))
            auto_firework = 0
            
        # 清屏（带拖尾效果）
        screen.fill(BLACK)
        trail_surface.fill(BLACK)
        screen.blit(trail_surface, (0, 0))
        
        # 更新和绘制烟花
        for firework in fireworks[:]:
            firework.update()
            firework.draw(screen)
            if not firework.is_alive():
                fireworks.remove(firework)
                
        # 显示提示文字
        font = pygame.font.Font(None, 24)
        text = font.render('点击鼠标创建烟花', True, WHITE)
        screen.blit(text, (10, 10))
        
        pygame.display.flip()
        clock.tick(60)
        
    pygame.quit()

if __name__ == "__main__":
    main()
