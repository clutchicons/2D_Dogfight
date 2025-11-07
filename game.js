// ========================================
// SKY ACE: WARZONE SKIES - GAME LOGIC
// ========================================

// Canvas Setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Resize canvas to fill window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ========================================
// GAME STATE MANAGEMENT
// ========================================
const GameState = {
    MENU: 'menu',
    HANGAR: 'hangar',
    PLAYING: 'playing',
    WAVE_COMPLETE: 'waveComplete',
    GAME_OVER: 'gameOver'
};

const game = {
    state: GameState.MENU,
    wave: 1,
    credits: 0,
    kills: 0,
    waveKills: 0,
    paused: false,
    camera: { x: 0, y: 0 },
    screenShake: 0,
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
};

// ========================================
// UPGRADE SYSTEM
// ========================================
const upgrades = {
    maxHealth: { level: 1, cost: 100, multiplier: 1.5 },
    armor: { level: 1, cost: 100, multiplier: 1.5 },
    speed: { level: 1, cost: 100, multiplier: 1.5 },
    fireRate: { level: 1, cost: 100, multiplier: 1.5 },
    damage: { level: 1, cost: 100, multiplier: 1.5 },
    missiles: { level: 0, cost: 500, multiplier: 1.3 }
};

function getUpgradeCost(upgradeType) {
    const upgrade = upgrades[upgradeType];
    return Math.floor(upgrade.cost * Math.pow(upgrade.multiplier, upgrade.level - 1));
}

function upgradestat(upgradeType) {
    const cost = getUpgradeCost(upgradeType);
    if (game.credits >= cost) {
        game.credits -= cost;
        upgrades[upgradeType].level++;
        updateHangarUI();
        playSound('upgrade');
        return true;
    }
    return false;
}

// ========================================
// PLAYER CLASS
// ========================================
class Player {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.angle = 0;
        this.size = 20;

        // Stats
        this.maxHealth = 100 * upgrades.maxHealth.level;
        this.health = this.maxHealth;
        this.armor = 10 * upgrades.armor.level;
        this.speed = 3 + (upgrades.speed.level * 0.5);
        this.acceleration = 0.3;
        this.friction = 0.95;
        this.fireRate = 150 - (upgrades.fireRate.level * 10);
        this.damage = 10 * upgrades.damage.level;

        // Weapons
        this.lastFired = 0;
        this.isFiring = false;
        this.specialCharge = 0;
        this.maxSpecialCharge = 100;

        // Health regen
        this.lastHit = 0;
        this.regenDelay = 5000;
        this.regenRate = 0.5;

        // Invulnerability frames
        this.invulnerable = false;
        this.invulnerableTime = 0;
    }

    update(deltaTime) {
        // Apply movement
        this.x += this.vx;
        this.y += this.vy;

        // Apply friction
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Health regeneration
        if (Date.now() - this.lastHit > this.regenDelay) {
            this.health = Math.min(this.health + this.regenRate, this.maxHealth);
        }

        // Update invulnerability
        if (this.invulnerable && Date.now() - this.invulnerableTime > 2000) {
            this.invulnerable = false;
        }

        // Auto fire if firing flag is set
        if (this.isFiring) {
            this.fire();
        }
    }

    move(dx, dy) {
        this.vx += dx * this.acceleration;
        this.vy += dy * this.acceleration;

        // Limit max speed
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > this.speed) {
            this.vx = (this.vx / speed) * this.speed;
            this.vy = (this.vy / speed) * this.speed;
        }
    }

    aimAt(worldX, worldY) {
        this.angle = Math.atan2(worldY - this.y, worldX - this.x);
    }

    fire() {
        const now = Date.now();
        if (now - this.lastFired < this.fireRate) return;

        this.lastFired = now;

        // Create two bullets (dual guns)
        const spread = 0.1;
        const offset = 15;

        // Left gun
        const leftAngle = this.angle - Math.PI / 2;
        const leftX = this.x + Math.cos(leftAngle) * offset;
        const leftY = this.y + Math.sin(leftAngle) * offset;
        bullets.push(new Bullet(leftX, leftY, this.angle + (Math.random() - 0.5) * spread, this.damage, true));

        // Right gun
        const rightAngle = this.angle + Math.PI / 2;
        const rightX = this.x + Math.cos(rightAngle) * offset;
        const rightY = this.y + Math.sin(rightAngle) * offset;
        bullets.push(new Bullet(rightX, rightY, this.angle + (Math.random() - 0.5) * spread, this.damage, true));

        playSound('shoot');
    }

    fireSpecial() {
        if (this.specialCharge < this.maxSpecialCharge) return;
        if (upgrades.missiles.level === 0) return;

        this.specialCharge = 0;

        // Find nearest enemy
        let nearestEnemy = null;
        let nearestDist = Infinity;

        enemies.forEach(enemy => {
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestEnemy = enemy;
            }
        });

        // Fire homing missiles
        const missileCount = 2 + upgrades.missiles.level;
        for (let i = 0; i < missileCount; i++) {
            const angle = this.angle + (i - missileCount / 2) * 0.3;
            missiles.push(new HomingMissile(this.x, this.y, angle, nearestEnemy));
        }

        playSound('missile');
    }

    takeDamage(amount) {
        if (this.invulnerable) return;

        const actualDamage = Math.max(1, amount - this.armor);
        this.health -= actualDamage;
        this.lastHit = Date.now();

        game.screenShake = 10;

        if (this.health <= 0) {
            this.health = 0;
            gameOver();
        }

        playSound('hit');
    }

    draw() {
        ctx.save();
        ctx.translate(this.x - game.camera.x, this.y - game.camera.y);
        ctx.rotate(this.angle);

        // Draw plane body
        ctx.fillStyle = this.invulnerable ? '#ffff00' : '#00d4ff';
        ctx.beginPath();
        ctx.moveTo(this.size, 0);
        ctx.lineTo(-this.size, -this.size * 0.6);
        ctx.lineTo(-this.size * 0.5, 0);
        ctx.lineTo(-this.size, this.size * 0.6);
        ctx.closePath();
        ctx.fill();

        // Draw cockpit
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.size * 0.3, 0, this.size * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Draw wings
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-this.size * 0.5, -this.size * 0.6);
        ctx.lineTo(-this.size * 0.5, -this.size * 1.2);
        ctx.moveTo(-this.size * 0.5, this.size * 0.6);
        ctx.lineTo(-this.size * 0.5, this.size * 1.2);
        ctx.stroke();

        ctx.restore();
    }
}

// ========================================
// ENEMY CLASSES
// ========================================
class Enemy {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.angle = 0;
        this.vx = 0;
        this.vy = 0;
        this.lastFired = 0;
        this.aiTimer = 0;

        // Set stats based on type
        switch(type) {
            case 'scout':
                this.maxHealth = 30;
                this.speed = 2;
                this.size = 15;
                this.fireRate = 1500;
                this.damage = 5;
                this.color = '#88ff88';
                this.credits = 10;
                break;
            case 'fighter':
                this.maxHealth = 60;
                this.speed = 2.5;
                this.size = 18;
                this.fireRate = 800;
                this.damage = 8;
                this.color = '#ff8888';
                this.credits = 25;
                break;
            case 'bomber':
                this.maxHealth = 150;
                this.speed = 1;
                this.size = 25;
                this.fireRate = 2000;
                this.damage = 15;
                this.color = '#8888ff';
                this.credits = 50;
                break;
            case 'ace':
                this.maxHealth = 300;
                this.speed = 3;
                this.size = 22;
                this.fireRate = 500;
                this.damage = 12;
                this.color = '#ff88ff';
                this.credits = 100;
                break;
        }

        this.health = this.maxHealth;
    }

    update() {
        // AI behavior
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        const targetAngle = Math.atan2(dy, dx);

        this.aiTimer++;

        switch(this.type) {
            case 'scout':
                // Simple pursuit
                this.angle = targetAngle;
                this.vx = Math.cos(this.angle) * this.speed;
                this.vy = Math.sin(this.angle) * this.speed;
                break;

            case 'fighter':
                // Aggressive with strafing
                if (dist < 300) {
                    // Strafe
                    const strafeAngle = targetAngle + Math.PI / 2 * Math.sin(this.aiTimer * 0.05);
                    this.vx = Math.cos(strafeAngle) * this.speed;
                    this.vy = Math.sin(strafeAngle) * this.speed;
                } else {
                    // Chase
                    this.vx = Math.cos(targetAngle) * this.speed;
                    this.vy = Math.sin(targetAngle) * this.speed;
                }
                this.angle = targetAngle;
                break;

            case 'bomber':
                // Slow approach, keep distance
                if (dist > 400) {
                    this.vx = Math.cos(targetAngle) * this.speed;
                    this.vy = Math.sin(targetAngle) * this.speed;
                } else {
                    this.vx *= 0.9;
                    this.vy *= 0.9;
                }
                this.angle = targetAngle;
                break;

            case 'ace':
                // Unpredictable movement
                const weaveAngle = targetAngle + Math.sin(this.aiTimer * 0.1) * Math.PI / 3;
                this.vx = Math.cos(weaveAngle) * this.speed;
                this.vy = Math.sin(weaveAngle) * this.speed;
                this.angle = targetAngle;
                break;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Fire at player
        if (dist < 600) {
            this.fire();
        }
    }

    fire() {
        const now = Date.now();
        if (now - this.lastFired < this.fireRate) return;

        this.lastFired = now;

        if (this.type === 'bomber') {
            // Drop bomb
            bombs.push(new Bomb(this.x, this.y));
        } else {
            // Shoot bullets
            const bulletCount = this.type === 'ace' ? 3 : 1;
            for (let i = 0; i < bulletCount; i++) {
                const spread = bulletCount > 1 ? (i - 1) * 0.2 : 0;
                bullets.push(new Bullet(this.x, this.y, this.angle + spread, this.damage, false));
            }
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        // Award credits
        game.credits += this.credits;
        game.kills++;
        game.waveKills++;

        // Add to special charge
        player.specialCharge = Math.min(player.specialCharge + 10, player.maxSpecialCharge);

        // Create explosion
        createExplosion(this.x, this.y, this.size * 2);

        // Chance to drop pickup
        if (Math.random() < 0.2) {
            pickups.push(new Pickup(this.x, this.y));
        }

        // Remove from array
        const index = enemies.indexOf(this);
        if (index > -1) enemies.splice(index, 1);

        playSound('explosion');
    }

    draw() {
        ctx.save();
        ctx.translate(this.x - game.camera.x, this.y - game.camera.y);
        ctx.rotate(this.angle);

        // Draw plane
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.size, 0);
        ctx.lineTo(-this.size, -this.size * 0.5);
        ctx.lineTo(-this.size * 0.6, 0);
        ctx.lineTo(-this.size, this.size * 0.5);
        ctx.closePath();
        ctx.fill();

        // Draw health bar
        ctx.restore();
        const healthBarWidth = 30;
        const healthBarHeight = 4;
        const healthPercent = this.health / this.maxHealth;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(
            this.x - game.camera.x - healthBarWidth / 2,
            this.y - game.camera.y - this.size - 10,
            healthBarWidth,
            healthBarHeight
        );

        ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000';
        ctx.fillRect(
            this.x - game.camera.x - healthBarWidth / 2,
            this.y - game.camera.y - this.size - 10,
            healthBarWidth * healthPercent,
            healthBarHeight
        );
    }
}

// ========================================
// BULLET & PROJECTILE CLASSES
// ========================================
class Bullet {
    constructor(x, y, angle, damage, isPlayer) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 12;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.damage = damage;
        this.isPlayer = isPlayer;
        this.size = 4;
        this.lifetime = 2000;
        this.created = Date.now();
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // Remove if expired
        if (Date.now() - this.created > this.lifetime) {
            const index = bullets.indexOf(this);
            if (index > -1) bullets.splice(index, 1);
        }
    }

    draw() {
        ctx.fillStyle = this.isPlayer ? '#ffff00' : '#ff4444';
        ctx.beginPath();
        ctx.arc(this.x - game.camera.x, this.y - game.camera.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Trail
        ctx.strokeStyle = this.isPlayer ? 'rgba(255, 255, 0, 0.5)' : 'rgba(255, 68, 68, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x - game.camera.x, this.y - game.camera.y);
        ctx.lineTo(this.x - this.vx * 2 - game.camera.x, this.y - this.vy * 2 - game.camera.y);
        ctx.stroke();
    }
}

class HomingMissile {
    constructor(x, y, angle, target) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 8;
        this.turnSpeed = 0.1;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.target = target;
        this.damage = 50;
        this.size = 6;
        this.lifetime = 5000;
        this.created = Date.now();
    }

    update() {
        // Home in on target
        if (this.target && enemies.includes(this.target)) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const targetAngle = Math.atan2(dy, dx);

            // Smooth turning
            let angleDiff = targetAngle - this.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            this.angle += angleDiff * this.turnSpeed;
        }

        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        this.x += this.vx;
        this.y += this.vy;

        // Remove if expired
        if (Date.now() - this.created > this.lifetime) {
            const index = missiles.indexOf(this);
            if (index > -1) missiles.splice(index, 1);
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x - game.camera.x, this.y - game.camera.y);
        ctx.rotate(this.angle);

        // Missile body
        ctx.fillStyle = '#ff8800';
        ctx.fillRect(-this.size * 2, -this.size / 2, this.size * 2, this.size);

        // Missile tip
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-this.size, -this.size / 2);
        ctx.lineTo(-this.size, this.size / 2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Smoke trail
        if (Math.random() < 0.3) {
            particles.push(new Particle(this.x, this.y, 0, 0, 'rgba(150, 150, 150, 0.5)', 3, 30));
        }
    }
}

class Bomb {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vy = 2;
        this.damage = 30;
        this.size = 8;
        this.blastRadius = 100;
        this.armed = false;
        this.armTime = Date.now() + 500;
    }

    update() {
        this.y += this.vy;

        if (Date.now() > this.armTime) {
            this.armed = true;
        }

        // Check collision with player when armed
        if (this.armed) {
            const dist = Math.hypot(player.x - this.x, player.y - this.y);
            if (dist < this.blastRadius) {
                this.explode();
            }
        }
    }

    explode() {
        createExplosion(this.x, this.y, this.blastRadius);

        // Damage player if in range
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        if (dist < this.blastRadius) {
            const damageMultiplier = 1 - (dist / this.blastRadius);
            player.takeDamage(this.damage * damageMultiplier);
        }

        const index = bombs.indexOf(this);
        if (index > -1) bombs.splice(index, 1);

        playSound('explosion');
    }

    draw() {
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(this.x - game.camera.x, this.y - game.camera.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Warning circle when armed
        if (this.armed) {
            ctx.strokeStyle = 'rgba(255, 68, 68, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(this.x - game.camera.x, this.y - game.camera.y, this.blastRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

// ========================================
// PICKUP CLASS
// ========================================
class Pickup {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 10;
        this.magnetRange = 150;

        // Random pickup type
        const rand = Math.random();
        if (rand < 0.4) {
            this.type = 'health';
            this.color = '#ff0000';
        } else if (rand < 0.7) {
            this.type = 'armor';
            this.color = '#00d4ff';
        } else if (rand < 0.9) {
            this.type = 'fireRate';
            this.color = '#ffaa00';
        } else {
            this.type = 'shield';
            this.color = '#ffff00';
        }

        this.bobOffset = Math.random() * Math.PI * 2;
    }

    update() {
        // Magnetize toward player
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < this.magnetRange) {
            const speed = 5;
            this.x += (dx / dist) * speed;
            this.y += (dy / dist) * speed;
        }

        // Check collision with player
        if (dist < player.size + this.size) {
            this.collect();
        }
    }

    collect() {
        switch(this.type) {
            case 'health':
                player.health = Math.min(player.health + player.maxHealth * 0.25, player.maxHealth);
                break;
            case 'armor':
                player.armor += 5;
                break;
            case 'fireRate':
                player.fireRate = Math.max(50, player.fireRate - 20);
                setTimeout(() => {
                    player.fireRate = 150 - (upgrades.fireRate.level * 10);
                }, 10000);
                break;
            case 'shield':
                player.invulnerable = true;
                player.invulnerableTime = Date.now();
                break;
        }

        const index = pickups.indexOf(this);
        if (index > -1) pickups.splice(index, 1);

        playSound('pickup');
    }

    draw() {
        const bob = Math.sin(Date.now() * 0.005 + this.bobOffset) * 5;

        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x - game.camera.x, this.y - game.camera.y + bob, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Glow effect
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(this.x - game.camera.x, this.y - game.camera.y + bob, this.size + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

// ========================================
// PARTICLE SYSTEM
// ========================================
class Particle {
    constructor(x, y, vx, vy, color, size, lifetime) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.lifetime = lifetime;
        this.age = 0;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.age++;

        if (this.age > this.lifetime) {
            const index = particles.indexOf(this);
            if (index > -1) particles.splice(index, 1);
        }
    }

    draw() {
        const alpha = 1 - (this.age / this.lifetime);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x - game.camera.x, this.y - game.camera.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

function createExplosion(x, y, size) {
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount;
        const speed = Math.random() * 5 + 2;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const colors = ['#ff4444', '#ff8800', '#ffff00'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        particles.push(new Particle(x, y, vx, vy, color, Math.random() * 5 + 3, 60));
    }

    game.screenShake = Math.min(game.screenShake + size / 10, 20);
}

// ========================================
// GAME ARRAYS
// ========================================
let player;
const bullets = [];
const missiles = [];
const bombs = [];
const enemies = [];
const pickups = [];
const particles = [];

// ========================================
// WAVE SPAWNING SYSTEM
// ========================================
let waveSpawnTimer = 0;
let enemiesToSpawn = 0;

function startWave() {
    game.waveKills = 0;
    waveSpawnTimer = 0;

    // Calculate enemies for this wave
    enemiesToSpawn = 5 + (game.wave * 3);

    updateHUD();
}

function spawnEnemy() {
    if (enemiesToSpawn <= 0) return;

    // Spawn at random position around player
    const angle = Math.random() * Math.PI * 2;
    const distance = 800;
    const x = player.x + Math.cos(angle) * distance;
    const y = player.y + Math.sin(angle) * distance;

    // Determine enemy type based on wave
    let type = 'scout';
    const rand = Math.random();

    if (game.wave >= 3 && rand < 0.3) {
        type = 'fighter';
    }
    if (game.wave >= 5 && rand < 0.15) {
        type = 'bomber';
    }
    if (game.wave >= 8 && rand < 0.05) {
        type = 'ace';
    }

    enemies.push(new Enemy(x, y, type));
    enemiesToSpawn--;
}

function checkWaveComplete() {
    if (enemiesToSpawn === 0 && enemies.length === 0) {
        waveComplete();
    }
}

function waveComplete() {
    game.state = GameState.WAVE_COMPLETE;

    document.getElementById('waveCompleteScreen').classList.add('active');
    document.getElementById('hud').classList.remove('active');
    document.getElementById('mobileControls').classList.remove('active');

    document.getElementById('completedWave').textContent = game.wave;
    document.getElementById('waveCredits').textContent = game.waveKills * 10;
    document.getElementById('totalCredits').textContent = game.credits;

    playSound('waveComplete');
}

// ========================================
// INPUT HANDLING
// ========================================
const keys = {};
let mouseX = 0;
let mouseY = 0;

window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;

    // Space to fire
    if (e.key === ' ') {
        e.preventDefault();
        if (game.state === GameState.PLAYING) {
            player.isFiring = true;
        }
    }

    // Shift for special
    if (e.key === 'Shift') {
        e.preventDefault();
        if (game.state === GameState.PLAYING) {
            player.fireSpecial();
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;

    if (e.key === ' ') {
        if (game.state === GameState.PLAYING) {
            player.isFiring = false;
        }
    }
});

window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

window.addEventListener('mousedown', (e) => {
    if (game.state === GameState.PLAYING) {
        if (e.button === 0) { // Left click
            player.isFiring = true;
        } else if (e.button === 2) { // Right click
            e.preventDefault();
            player.fireSpecial();
        }
    }
});

window.addEventListener('mouseup', (e) => {
    if (game.state === GameState.PLAYING && e.button === 0) {
        player.isFiring = false;
    }
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

// Mobile touch controls
let joystickActive = false;
let joystickStartX = 0;
let joystickStartY = 0;
let joystickCurrentX = 0;
let joystickCurrentY = 0;

let aimTouchId = null;
let aimX = 0;
let aimY = 0;

const joystickContainer = document.getElementById('joystickContainer');
const joystickStick = document.getElementById('joystickStick');
const aimZone = document.getElementById('aimZone');
const fireBtn = document.getElementById('fireBtn');
const specialBtn = document.getElementById('specialBtn');

joystickContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    const rect = joystickContainer.getBoundingClientRect();
    joystickStartX = rect.left + rect.width / 2;
    joystickStartY = rect.top + rect.height / 2;
});

window.addEventListener('touchmove', (e) => {
    for (let touch of e.touches) {
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        // Joystick
        if (joystickActive) {
            const maxDistance = 45;
            const dx = touch.clientX - joystickStartX;
            const dy = touch.clientY - joystickStartY;
            const distance = Math.min(Math.hypot(dx, dy), maxDistance);
            const angle = Math.atan2(dy, dx);

            joystickCurrentX = Math.cos(angle) * distance;
            joystickCurrentY = Math.sin(angle) * distance;

            joystickStick.style.transform = `translate(calc(-50% + ${joystickCurrentX}px), calc(-50% + ${joystickCurrentY}px))`;
        }

        // Aim zone
        if (target === aimZone || aimZone.contains(target)) {
            aimTouchId = touch.identifier;
            aimX = touch.clientX;
            aimY = touch.clientY;
        }
    }
});

window.addEventListener('touchend', (e) => {
    for (let touch of e.changedTouches) {
        if (touch.identifier === aimTouchId) {
            aimTouchId = null;
        }
    }

    joystickActive = false;
    joystickCurrentX = 0;
    joystickCurrentY = 0;
    joystickStick.style.transform = 'translate(-50%, -50%)';
});

fireBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (game.state === GameState.PLAYING) {
        player.isFiring = true;
    }
});

fireBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (game.state === GameState.PLAYING) {
        player.isFiring = false;
    }
});

specialBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (game.state === GameState.PLAYING) {
        player.fireSpecial();
    }
});

// ========================================
// COLLISION DETECTION
// ========================================
function checkCollisions() {
    // Player bullets vs enemies
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (!bullet.isPlayer) continue;

        for (let enemy of enemies) {
            const dist = Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y);
            if (dist < enemy.size) {
                enemy.takeDamage(bullet.damage);
                bullets.splice(i, 1);
                break;
            }
        }
    }

    // Missiles vs enemies
    for (let i = missiles.length - 1; i >= 0; i--) {
        const missile = missiles[i];

        for (let enemy of enemies) {
            const dist = Math.hypot(enemy.x - missile.x, enemy.y - missile.y);
            if (dist < enemy.size + missile.size) {
                enemy.takeDamage(missile.damage);
                createExplosion(missile.x, missile.y, 30);
                missiles.splice(i, 1);
                break;
            }
        }
    }

    // Enemy bullets vs player
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (bullet.isPlayer) continue;

        const dist = Math.hypot(player.x - bullet.x, player.y - bullet.y);
        if (dist < player.size) {
            player.takeDamage(bullet.damage);
            bullets.splice(i, 1);
        }
    }

    // Enemy collision with player
    for (let enemy of enemies) {
        const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (dist < player.size + enemy.size) {
            player.takeDamage(20);
            enemy.takeDamage(50);
        }
    }
}

// ========================================
// CAMERA SYSTEM
// ========================================
function updateCamera() {
    // Center camera on player with screen shake
    const shakeX = (Math.random() - 0.5) * game.screenShake;
    const shakeY = (Math.random() - 0.5) * game.screenShake;

    game.camera.x = player.x - canvas.width / 2 + shakeX;
    game.camera.y = player.y - canvas.height / 2 + shakeY;

    // Reduce screen shake
    game.screenShake *= 0.9;
    if (game.screenShake < 0.1) game.screenShake = 0;
}

// ========================================
// HUD UPDATE
// ========================================
function updateHUD() {
    const healthPercent = (player.health / player.maxHealth) * 100;
    document.getElementById('healthBar').style.width = healthPercent + '%';

    const armorPercent = Math.min((player.armor / (10 * upgrades.armor.level)) * 100, 100);
    document.getElementById('armorBar').style.width = armorPercent + '%';

    const specialPercent = (player.specialCharge / player.maxSpecialCharge) * 100;
    document.getElementById('specialBar').style.width = specialPercent + '%';

    document.getElementById('waveNumber').textContent = game.wave;
    document.getElementById('hudCredits').textContent = game.credits;
    document.getElementById('enemyCount').textContent = enemies.length + enemiesToSpawn;
}

function updateHangarUI() {
    document.getElementById('hangarCredits').textContent = game.credits;
    document.getElementById('menuCredits').textContent = game.credits;

    // Update all upgrade displays
    const upgradeTypes = ['health', 'armor', 'speed', 'fireRate', 'damage', 'missiles'];
    upgradeTypes.forEach(type => {
        const upgrade = upgrades[type === 'missiles' ? 'missiles' : type === 'health' ? 'maxHealth' : type === 'fireRate' ? 'fireRate' : type];
        const level = upgrade.level;
        const cost = getUpgradeCost(type === 'missiles' ? 'missiles' : type === 'health' ? 'maxHealth' : type === 'fireRate' ? 'fireRate' : type);

        document.getElementById(`${type}Level`).textContent = level;
        document.getElementById(`${type}Cost`).textContent = cost;

        const button = document.getElementById(`upgrade${type.charAt(0).toUpperCase() + type.slice(1)}`);
        if (game.credits >= cost) {
            button.disabled = false;
        } else {
            button.disabled = true;
        }

        if (type === 'missiles') {
            button.textContent = level === 0 ? 'UNLOCK' : 'UPGRADE';
        }
    });
}

// ========================================
// SOUND SYSTEM (Placeholder)
// ========================================
const sounds = {};

function playSound(type) {
    // Placeholder for sound effects
    // In a full implementation, you would load and play actual audio files
    console.log(`Sound: ${type}`);
}

// ========================================
// GAME LOOP
// ========================================
let lastTime = 0;

function gameLoop(currentTime) {
    requestAnimationFrame(gameLoop);

    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    // Clear canvas
    ctx.fillStyle = '#0a0a1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw background grid
    drawBackground();

    if (game.state === GameState.PLAYING) {
        // Handle input
        handleInput();

        // Update player
        player.update(deltaTime);

        // Update camera
        updateCamera();

        // Spawn enemies
        waveSpawnTimer++;
        if (waveSpawnTimer % 60 === 0) { // Spawn every second
            spawnEnemy();
        }

        // Update enemies
        enemies.forEach(enemy => enemy.update());

        // Update projectiles
        bullets.forEach(bullet => bullet.update());
        missiles.forEach(missile => missile.update());
        bombs.forEach(bomb => bomb.update());

        // Update pickups
        pickups.forEach(pickup => pickup.update());

        // Update particles
        particles.forEach(particle => particle.update());

        // Check collisions
        checkCollisions();

        // Draw everything
        drawBackground();
        pickups.forEach(pickup => pickup.draw());
        bullets.forEach(bullet => bullet.draw());
        missiles.forEach(missile => missile.draw());
        bombs.forEach(bomb => bomb.draw());
        enemies.forEach(enemy => enemy.draw());
        player.draw();
        particles.forEach(particle => particle.draw());

        // Update HUD
        updateHUD();

        // Check wave complete
        checkWaveComplete();
    }
}

function handleInput() {
    let moveX = 0;
    let moveY = 0;

    // Desktop controls
    if (keys['w'] || keys['arrowup']) moveY -= 1;
    if (keys['s'] || keys['arrowdown']) moveY += 1;
    if (keys['a'] || keys['arrowleft']) moveX -= 1;
    if (keys['d'] || keys['arrowright']) moveX += 1;

    // Mobile controls
    if (joystickActive) {
        moveX = joystickCurrentX / 45;
        moveY = joystickCurrentY / 45;
    }

    // Apply movement
    if (moveX !== 0 || moveY !== 0) {
        player.move(moveX, moveY);
    }

    // Mouse aim
    if (!game.isMobile || aimTouchId === null) {
        const worldX = mouseX + game.camera.x;
        const worldY = mouseY + game.camera.y;
        player.aimAt(worldX, worldY);
    } else {
        // Touch aim
        const rect = canvas.getBoundingClientRect();
        const worldX = (aimX - rect.left) + game.camera.x;
        const worldY = (aimY - rect.top) + game.camera.y;
        player.aimAt(worldX, worldY);
    }
}

function drawBackground() {
    // Draw grid
    const gridSize = 100;
    const offsetX = game.camera.x % gridSize;
    const offsetY = game.camera.y % gridSize;

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = -offsetX; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // Horizontal lines
    for (let y = -offsetY; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// ========================================
// GAME STATE FUNCTIONS
// ========================================
function startGame() {
    game.state = GameState.PLAYING;

    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    // Show HUD
    document.getElementById('hud').classList.add('active');

    // Show mobile controls if needed
    if (game.isMobile) {
        document.getElementById('mobileControls').classList.add('active');
    }

    // Initialize player if first game
    if (!player) {
        player = new Player();
    } else {
        // Reset player stats
        player.maxHealth = 100 * upgrades.maxHealth.level;
        player.health = player.maxHealth;
        player.armor = 10 * upgrades.armor.level;
        player.speed = 3 + (upgrades.speed.level * 0.5);
        player.fireRate = 150 - (upgrades.fireRate.level * 10);
        player.damage = 10 * upgrades.damage.level;
        player.specialCharge = 0;
    }

    // Clear arrays
    bullets.length = 0;
    missiles.length = 0;
    bombs.length = 0;
    enemies.length = 0;
    pickups.length = 0;
    particles.length = 0;

    // Start wave
    startWave();

    playSound('start');
}

function gameOver() {
    game.state = GameState.GAME_OVER;

    document.getElementById('gameOverScreen').classList.add('active');
    document.getElementById('hud').classList.remove('active');
    document.getElementById('mobileControls').classList.remove('active');

    document.getElementById('finalWave').textContent = game.wave;
    document.getElementById('finalKills').textContent = game.kills;
    document.getElementById('finalScore').textContent = game.credits;

    playSound('gameOver');
}

function returnToMenu() {
    game.state = GameState.MENU;

    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    document.getElementById('mainMenu').classList.add('active');
    updateHangarUI();
}

function openHangar() {
    game.state = GameState.HANGAR;

    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    document.getElementById('hangarScreen').classList.add('active');
    updateHangarUI();
}

function nextWave() {
    game.wave++;

    document.getElementById('waveCompleteScreen').classList.remove('active');
    document.getElementById('hud').classList.add('active');

    if (game.isMobile) {
        document.getElementById('mobileControls').classList.add('active');
    }

    game.state = GameState.PLAYING;
    startWave();
}

function retry() {
    game.wave = 1;
    game.kills = 0;

    document.getElementById('gameOverScreen').classList.remove('active');

    startGame();
}

// ========================================
// UI EVENT LISTENERS
// ========================================
document.getElementById('startGameBtn').addEventListener('click', startGame);
document.getElementById('hangarBtn').addEventListener('click', openHangar);
document.getElementById('hangarBackBtn').addEventListener('click', returnToMenu);
document.getElementById('hangarStartBtn').addEventListener('click', startGame);
document.getElementById('nextWaveBtn').addEventListener('click', nextWave);
document.getElementById('upgradeScreenBtn').addEventListener('click', openHangar);
document.getElementById('retryBtn').addEventListener('click', retry);
document.getElementById('mainMenuBtn').addEventListener('click', returnToMenu);

// Upgrade buttons
document.getElementById('upgradeHealth').addEventListener('click', () => {
    if (upgradestat('maxHealth')) {
        if (player) {
            player.maxHealth = 100 * upgrades.maxHealth.level;
            player.health = player.maxHealth;
        }
    }
});

document.getElementById('upgradeArmor').addEventListener('click', () => {
    if (upgradestat('armor')) {
        if (player) player.armor = 10 * upgrades.armor.level;
    }
});

document.getElementById('upgradeSpeed').addEventListener('click', () => {
    if (upgradestat('speed')) {
        if (player) player.speed = 3 + (upgrades.speed.level * 0.5);
    }
});

document.getElementById('upgradeFireRate').addEventListener('click', () => {
    if (upgradestat('fireRate')) {
        if (player) player.fireRate = 150 - (upgrades.fireRate.level * 10);
    }
});

document.getElementById('upgradeDamage').addEventListener('click', () => {
    if (upgradestat('damage')) {
        if (player) player.damage = 10 * upgrades.damage.level;
    }
});

document.getElementById('upgradeMissiles').addEventListener('click', () => {
    upgradestat('missiles');
});

// ========================================
// INITIALIZE GAME
// ========================================
updateHangarUI();
gameLoop(0);

console.log('Sky Ace: Warzone Skies loaded!');
console.log('Controls: WASD/Arrows - Move, Mouse - Aim, Click/Space - Fire, Right Click/Shift - Special');
