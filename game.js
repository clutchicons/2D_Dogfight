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
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    // Deadzone settings for camera
    deadzone: {
        width: 400,  // Horizontal deadzone
        height: 300  // Vertical deadzone
    },
    // Map boundaries (soft borders)
    mapBounds: {
        minX: -2000,
        maxX: 2000,
        minY: -2000,
        maxY: 2000
    }
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
        this.angle = -Math.PI / 2; // Start facing up
        this.size = 20;
        this.roll = 0;  // Banking angle for turning animation (-1 to 1)
        this.lastAngle = this.angle;
        this.turnRate = 0; // Current turn rate for banking

        // Flight mechanics
        this.thrust = 0; // Current thrust level (0-1)
        this.maxSpeed = 4 + (upgrades.speed.level * 0.5);
        this.minSpeed = 1; // Minimum forward speed
        this.thrustPower = 0.15;
        this.drag = 0.98;
        this.turnSpeed = 0.04; // Base turn speed
        this.maxTurnSpeed = 0.06; // Max turn speed

        // Stats
        this.maxHealth = 100 * upgrades.maxHealth.level;
        this.health = this.maxHealth;
        this.armor = 10 * upgrades.armor.level;
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
        // Always move forward based on angle (plane physics)
        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const targetSpeed = this.minSpeed + (this.thrust * (this.maxSpeed - this.minSpeed));

        // Apply thrust
        this.vx += Math.cos(this.angle) * this.thrustPower * this.thrust;
        this.vy += Math.sin(this.angle) * this.thrustPower * this.thrust;

        // Apply drag
        this.vx *= this.drag;
        this.vy *= this.drag;

        // Maintain minimum speed (planes can't hover)
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed < this.minSpeed) {
            const speedBoost = this.minSpeed / (speed || 1);
            this.vx = Math.cos(this.angle) * this.minSpeed;
            this.vy = Math.sin(this.angle) * this.minSpeed;
        }

        // Limit maximum speed
        if (speed > this.maxSpeed) {
            this.vx = (this.vx / speed) * this.maxSpeed;
            this.vy = (this.vy / speed) * this.maxSpeed;
        }

        // Apply movement
        this.x += this.vx;
        this.y += this.vy;

        // Apply soft map boundaries (bounce back gently)
        if (this.x < game.mapBounds.minX) {
            this.x = game.mapBounds.minX;
            this.vx *= -0.5;
        }
        if (this.x > game.mapBounds.maxX) {
            this.x = game.mapBounds.maxX;
            this.vx *= -0.5;
        }
        if (this.y < game.mapBounds.minY) {
            this.y = game.mapBounds.minY;
            this.vy *= -0.5;
        }
        if (this.y > game.mapBounds.maxY) {
            this.y = game.mapBounds.maxY;
            this.vy *= -0.5;
        }

        // Calculate roll based on turn rate (banking animation)
        const targetRoll = Math.max(-1, Math.min(1, this.turnRate * 20));
        this.roll += (targetRoll - this.roll) * 0.15;

        // Smooth out turn rate
        this.turnRate *= 0.85;

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

    turn(direction) {
        // direction: -1 for left, 1 for right
        const actualTurnSpeed = this.turnSpeed + (this.thrust * 0.02);
        this.angle += direction * actualTurnSpeed;
        this.turnRate = direction * actualTurnSpeed;
    }

    adjustThrust(amount) {
        // amount: positive to increase, negative to decrease
        this.thrust += amount;
        this.thrust = Math.max(0, Math.min(1, this.thrust));
    }

    fire() {
        const now = Date.now();
        if (now - this.lastFired < this.fireRate) return;

        this.lastFired = now;

        // Fire from nose of plane with slight spread
        const spread = 0.08;
        const noseOffset = this.size * 1.2; // Fire from front of plane

        // Calculate nose position
        const noseX = this.x + Math.cos(this.angle) * noseOffset;
        const noseY = this.y + Math.sin(this.angle) * noseOffset;

        // Create two bullets (wing-mounted guns) with slight convergence
        const wingOffset = 12;
        const convergence = 0.02; // Slight inward angle for bullet convergence

        // Left gun
        const leftX = noseX + Math.cos(this.angle - Math.PI / 2) * wingOffset;
        const leftY = noseY + Math.sin(this.angle - Math.PI / 2) * wingOffset;
        bullets.push(new Bullet(leftX, leftY, this.angle + convergence + (Math.random() - 0.5) * spread, this.damage, true));

        // Right gun
        const rightX = noseX + Math.cos(this.angle + Math.PI / 2) * wingOffset;
        const rightY = noseY + Math.sin(this.angle + Math.PI / 2) * wingOffset;
        bullets.push(new Bullet(rightX, rightY, this.angle - convergence + (Math.random() - 0.5) * spread, this.damage, true));

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

        // WW2 plane colors (olive drab or RAF gray)
        const planeColor = this.invulnerable ? '#ffff00' : '#6B7F5A';
        const wingColor = '#5A6B4A';

        // Scale based on roll for 3D banking effect
        const rollScale = Math.cos(this.roll * Math.PI / 4); // -1 to 1 roll creates banking effect

        // Draw wings (scaled by roll for banking effect)
        ctx.fillStyle = wingColor;
        ctx.beginPath();
        ctx.moveTo(-this.size * 0.3, -this.size * 1.2 * rollScale);
        ctx.lineTo(this.size * 0.2, -this.size * 0.7 * rollScale);
        ctx.lineTo(this.size * 0.2, this.size * 0.7 * rollScale);
        ctx.lineTo(-this.size * 0.3, this.size * 1.2 * rollScale);
        ctx.lineTo(-this.size * 0.5, 0);
        ctx.closePath();
        ctx.fill();

        // Wing outline
        ctx.strokeStyle = '#3A4B2A';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw plane body (fuselage)
        ctx.fillStyle = planeColor;
        ctx.beginPath();
        ctx.moveTo(this.size * 1.2, 0);
        ctx.lineTo(-this.size * 0.8, -this.size * 0.4);
        ctx.lineTo(-this.size * 0.8, this.size * 0.4);
        ctx.closePath();
        ctx.fill();

        // Body outline
        ctx.strokeStyle = '#3A4B2A';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw cockpit/canopy
        ctx.fillStyle = 'rgba(100, 150, 200, 0.6)';
        ctx.beginPath();
        ctx.ellipse(this.size * 0.2, 0, this.size * 0.35, this.size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2A3B1A';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw propeller spinner
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.arc(this.size * 1.2, 0, this.size * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Draw tail
        ctx.fillStyle = wingColor;
        ctx.beginPath();
        ctx.moveTo(-this.size * 0.8, 0);
        ctx.lineTo(-this.size * 1.1, -this.size * 0.5 * rollScale);
        ctx.lineTo(-this.size * 1.1, this.size * 0.5 * rollScale);
        ctx.closePath();
        ctx.fill();

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

        // Set stats based on type (WW2 themed)
        switch(type) {
            case 'rookie':
                // Inexperienced pilot - poor aim, slow
                this.maxHealth = 25;
                this.speed = 1.5;
                this.size = 15;
                this.fireRate = 2000;
                this.damage = 4;
                this.color = '#7A8C6F'; // Light gray-green
                this.credits = 8;
                this.accuracy = 0.3; // 30% accuracy
                break;
            case 'scout':
                // Fast, light planes for reconnaissance
                this.maxHealth = 35;
                this.speed = 2.5;
                this.size = 15;
                this.fireRate = 1500;
                this.damage = 5;
                this.color = '#8B9F7A'; // Tan/brown
                this.credits = 12;
                this.accuracy = 0.5;
                break;
            case 'fighter':
                // Standard fighter - balanced
                this.maxHealth = 60;
                this.speed = 2.2;
                this.size = 18;
                this.fireRate = 900;
                this.damage = 8;
                this.color = '#5F6F4F'; // Olive drab
                this.credits = 25;
                this.accuracy = 0.7;
                break;
            case 'veteran':
                // Experienced pilot - defensive, smart positioning
                this.maxHealth = 80;
                this.speed = 2.4;
                this.size = 18;
                this.fireRate = 700;
                this.damage = 10;
                this.color = '#4F5F3F'; // Dark green
                this.credits = 40;
                this.accuracy = 0.8;
                break;
            case 'bomber':
                // Heavy, slow, tough
                this.maxHealth = 150;
                this.speed = 1.2;
                this.size = 25;
                this.fireRate = 2500;
                this.damage = 15;
                this.color = '#6A6A6A'; // Gray
                this.credits = 50;
                this.accuracy = 0.6;
                break;
            case 'elite':
                // Elite squadron - aggressive, accurate
                this.maxHealth = 100;
                this.speed = 2.8;
                this.size = 19;
                this.fireRate = 600;
                this.damage = 12;
                this.color = '#3F4F2F'; // Dark olive
                this.credits = 70;
                this.accuracy = 0.9;
                break;
            case 'ace':
                // Ace pilot - best of the best
                this.maxHealth = 200;
                this.speed = 3.2;
                this.size = 22;
                this.fireRate = 450;
                this.damage = 14;
                this.color = '#8B0000'; // Dark red (Red Baron style)
                this.credits = 100;
                this.accuracy = 0.95;
                break;
        }

        this.health = this.maxHealth;
        this.roll = 0;
        this.lastAngle = 0;
    }

    update() {
        // AI behavior
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        const targetAngle = Math.atan2(dy, dx);

        this.aiTimer++;

        switch(this.type) {
            case 'rookie':
                // Inexperienced - flies straight at player, poor tactics
                this.angle = targetAngle;
                this.vx = Math.cos(this.angle) * this.speed;
                this.vy = Math.sin(this.angle) * this.speed;
                break;

            case 'scout':
                // Fast hit and run - approaches quickly then retreats
                if (dist < 250) {
                    // Retreat
                    const retreatAngle = targetAngle + Math.PI;
                    this.vx = Math.cos(retreatAngle) * this.speed;
                    this.vy = Math.sin(retreatAngle) * this.speed;
                } else {
                    // Chase
                    this.vx = Math.cos(targetAngle) * this.speed;
                    this.vy = Math.sin(targetAngle) * this.speed;
                }
                this.angle = targetAngle;
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

            case 'veteran':
                // Defensive positioning - tries to stay at optimal range
                const optimalRange = 350;
                if (dist < optimalRange - 50) {
                    // Back off
                    const retreatAngle = targetAngle + Math.PI + Math.sin(this.aiTimer * 0.03) * 0.5;
                    this.vx = Math.cos(retreatAngle) * this.speed;
                    this.vy = Math.sin(retreatAngle) * this.speed;
                } else if (dist > optimalRange + 50) {
                    // Close in
                    this.vx = Math.cos(targetAngle) * this.speed;
                    this.vy = Math.sin(targetAngle) * this.speed;
                } else {
                    // Circle at optimal range
                    const circleAngle = targetAngle + Math.PI / 2;
                    this.vx = Math.cos(circleAngle) * this.speed;
                    this.vy = Math.sin(circleAngle) * this.speed;
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

            case 'elite':
                // Aggressive scissor maneuvers
                const scissorAngle = targetAngle + Math.sin(this.aiTimer * 0.08) * Math.PI / 2.5;
                this.vx = Math.cos(scissorAngle) * this.speed;
                this.vy = Math.sin(scissorAngle) * this.speed;
                this.angle = targetAngle;
                break;

            case 'ace':
                // Unpredictable barrel rolls and weaving
                const weaveAngle = targetAngle + Math.sin(this.aiTimer * 0.1) * Math.PI / 3;
                if (dist < 200 && Math.random() < 0.02) {
                    // Sudden barrel roll / evasive maneuver
                    const evadeAngle = targetAngle + (Math.random() - 0.5) * Math.PI;
                    this.vx = Math.cos(evadeAngle) * this.speed * 1.2;
                    this.vy = Math.sin(evadeAngle) * this.speed * 1.2;
                } else {
                    this.vx = Math.cos(weaveAngle) * this.speed;
                    this.vy = Math.sin(weaveAngle) * this.speed;
                }
                this.angle = targetAngle;
                break;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Calculate roll for banking animation
        let angleDiff = this.angle - this.lastAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const targetRoll = Math.max(-1, Math.min(1, angleDiff * 10));
        this.roll += (targetRoll - this.roll) * 0.2;
        this.lastAngle = this.angle;

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
            // Shoot bullets with accuracy variation
            const bulletCount = this.type === 'ace' || this.type === 'elite' ? 3 : 1;
            for (let i = 0; i < bulletCount; i++) {
                // Apply accuracy - less accurate shots have more spread
                const inaccuracy = (1 - this.accuracy) * 0.4;
                const spread = (Math.random() - 0.5) * inaccuracy;
                const baseSpread = bulletCount > 1 ? (i - 1) * 0.15 : 0;
                bullets.push(new Bullet(this.x, this.y, this.angle + spread + baseSpread, this.damage, false));
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

        // Scale based on roll for banking effect
        const rollScale = Math.cos(this.roll * Math.PI / 4);

        // Different visuals for bomber
        if (this.type === 'bomber') {
            // Larger, boxier plane
            ctx.fillStyle = this.color;

            // Wings
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.2, -this.size * 1.3 * rollScale);
            ctx.lineTo(this.size * 0.3, -this.size * 0.7 * rollScale);
            ctx.lineTo(this.size * 0.3, this.size * 0.7 * rollScale);
            ctx.lineTo(-this.size * 0.2, this.size * 1.3 * rollScale);
            ctx.lineTo(-this.size * 0.4, 0);
            ctx.closePath();
            ctx.fill();

            // Body (large fuselage)
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.size * 0.7, -this.size * 0.5, this.size * 1.5, this.size);

            // Cockpit
            ctx.fillStyle = 'rgba(80, 100, 120, 0.6)';
            ctx.fillRect(this.size * 0.4, -this.size * 0.3, this.size * 0.4, this.size * 0.6);
        } else {
            // Fighter planes with WW2 styling
            const wingColor = this.type === 'ace' ? '#660000' : this.color;

            // Wings with banking
            ctx.fillStyle = wingColor;
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.3, -this.size * 1.1 * rollScale);
            ctx.lineTo(this.size * 0.2, -this.size * 0.6 * rollScale);
            ctx.lineTo(this.size * 0.2, this.size * 0.6 * rollScale);
            ctx.lineTo(-this.size * 0.3, this.size * 1.1 * rollScale);
            ctx.lineTo(-this.size * 0.4, 0);
            ctx.closePath();
            ctx.fill();

            // Body
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(this.size * 1.1, 0);
            ctx.lineTo(-this.size * 0.7, -this.size * 0.35);
            ctx.lineTo(-this.size * 0.7, this.size * 0.35);
            ctx.closePath();
            ctx.fill();

            // Cockpit
            ctx.fillStyle = 'rgba(100, 140, 180, 0.5)';
            ctx.beginPath();
            ctx.ellipse(this.size * 0.2, 0, this.size * 0.3, this.size * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();

            // Propeller spinner
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(this.size * 1.1, 0, this.size * 0.15, 0, Math.PI * 2);
            ctx.fill();

            // Tail
            ctx.fillStyle = wingColor;
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.7, 0);
            ctx.lineTo(-this.size, -this.size * 0.4 * rollScale);
            ctx.lineTo(-this.size, this.size * 0.4 * rollScale);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // Draw health bar
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
        // WW2 style tracer rounds
        const tracerLength = 15;

        // Draw the tracer trail (longer, more visible)
        ctx.save();
        ctx.strokeStyle = this.isPlayer ? '#ffaa00' : '#ff6644';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(this.x - game.camera.x, this.y - game.camera.y);
        ctx.lineTo(
            this.x - this.vx * tracerLength - game.camera.x,
            this.y - this.vy * tracerLength - game.camera.y
        );
        ctx.stroke();

        // Inner bright core
        ctx.strokeStyle = this.isPlayer ? '#ffff88' : '#ffaa88';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(this.x - game.camera.x, this.y - game.camera.y);
        ctx.lineTo(
            this.x - this.vx * (tracerLength * 0.7) - game.camera.x,
            this.y - this.vy * (tracerLength * 0.7) - game.camera.y
        );
        ctx.stroke();

        // Bullet tip (bright point)
        ctx.fillStyle = this.isPlayer ? '#ffffaa' : '#ffddaa';
        ctx.beginPath();
        ctx.arc(this.x - game.camera.x, this.y - game.camera.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
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

    // Determine enemy type based on wave (WW2 themed progression)
    let type = 'rookie';
    const rand = Math.random();

    if (game.wave === 1) {
        // Wave 1: Mostly rookies with some scouts
        type = rand < 0.7 ? 'rookie' : 'scout';
    } else if (game.wave === 2) {
        // Wave 2: Scouts and rookies
        type = rand < 0.5 ? 'scout' : 'rookie';
    } else if (game.wave <= 4) {
        // Wave 3-4: Introduce fighters
        if (rand < 0.4) type = 'scout';
        else if (rand < 0.8) type = 'fighter';
        else type = 'rookie';
    } else if (game.wave <= 6) {
        // Wave 5-6: Veterans appear
        if (rand < 0.3) type = 'fighter';
        else if (rand < 0.6) type = 'veteran';
        else if (rand < 0.85) type = 'scout';
        else type = 'bomber';
    } else if (game.wave <= 9) {
        // Wave 7-9: Elite squadrons
        if (rand < 0.25) type = 'veteran';
        else if (rand < 0.5) type = 'elite';
        else if (rand < 0.75) type = 'fighter';
        else type = 'bomber';
    } else {
        // Wave 10+: All types including aces
        if (rand < 0.15) type = 'rookie';
        else if (rand < 0.3) type = 'scout';
        else if (rand < 0.45) type = 'fighter';
        else if (rand < 0.6) type = 'veteran';
        else if (rand < 0.75) type = 'elite';
        else if (rand < 0.9) type = 'bomber';
        else type = 'ace';
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

window.addEventListener('mousedown', (e) => {
    if (game.state === GameState.PLAYING) {
        if (e.button === 0) { // Left click to fire
            player.isFiring = true;
        } else if (e.button === 2) { // Right click for special
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
// CAMERA SYSTEM (Deadzone)
// ========================================
function updateCamera() {
    // Deadzone camera - only moves when player approaches edges
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Player position on screen
    const playerScreenX = player.x - game.camera.x;
    const playerScreenY = player.y - game.camera.y;

    // Deadzone boundaries
    const deadzoneLeft = centerX - game.deadzone.width / 2;
    const deadzoneRight = centerX + game.deadzone.width / 2;
    const deadzoneTop = centerY - game.deadzone.height / 2;
    const deadzoneBottom = centerY + game.deadzone.height / 2;

    // Camera smoothly follows when player exits deadzone
    const cameraSpeed = 0.1;

    if (playerScreenX < deadzoneLeft) {
        game.camera.x += (playerScreenX - deadzoneLeft) * cameraSpeed;
    } else if (playerScreenX > deadzoneRight) {
        game.camera.x += (playerScreenX - deadzoneRight) * cameraSpeed;
    }

    if (playerScreenY < deadzoneTop) {
        game.camera.y += (playerScreenY - deadzoneTop) * cameraSpeed;
    } else if (playerScreenY > deadzoneBottom) {
        game.camera.y += (playerScreenY - deadzoneBottom) * cameraSpeed;
    }

    // Apply screen shake
    const shakeX = (Math.random() - 0.5) * game.screenShake;
    const shakeY = (Math.random() - 0.5) * game.screenShake;

    game.camera.x += shakeX;
    game.camera.y += shakeY;

    // Reduce screen shake
    game.screenShake *= 0.9;
    if (game.screenShake < 0.1) game.screenShake = 0;

    // Keep camera within map bounds
    const maxCameraX = game.mapBounds.maxX - canvas.width / 2;
    const minCameraX = game.mapBounds.minX + canvas.width / 2;
    const maxCameraY = game.mapBounds.maxY - canvas.height / 2;
    const minCameraY = game.mapBounds.minY + canvas.height / 2;

    game.camera.x = Math.max(minCameraX, Math.min(maxCameraX, game.camera.x));
    game.camera.y = Math.max(minCameraY, Math.min(maxCameraY, game.camera.y));
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

    // Clear canvas with WW2 sky background
    ctx.fillStyle = '#87CEEB'; // Sky blue
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw background grid and clouds
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
    // Desktop controls - plane-based flight
    if (keys['w'] || keys['arrowup']) {
        // Increase thrust (pitch up / accelerate)
        player.adjustThrust(0.02);
    }
    if (keys['s'] || keys['arrowdown']) {
        // Decrease thrust (pitch down / decelerate)
        player.adjustThrust(-0.02);
    }
    if (keys['a'] || keys['arrowleft']) {
        // Turn left
        player.turn(-1);
    }
    if (keys['d'] || keys['arrowright']) {
        // Turn right
        player.turn(1);
    }

    // Mobile controls - joystick controls rotation and thrust
    if (joystickActive) {
        const joyX = joystickCurrentX / 45;
        const joyY = joystickCurrentY / 45;
        const joyMagnitude = Math.sqrt(joyX * joyX + joyY * joyY);

        if (joyMagnitude > 0.1) {
            // Joystick angle determines rotation
            const joyAngle = Math.atan2(joyY, joyX);

            // Calculate angle difference for turning
            let angleDiff = joyAngle - player.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // Turn toward joystick direction
            if (Math.abs(angleDiff) > 0.1) {
                player.turn(angleDiff > 0 ? 1 : -1);
            }

            // Joystick magnitude controls thrust
            player.thrust = Math.min(1, joyMagnitude);
        } else {
            // No joystick input, maintain minimum speed
            player.thrust = 0.2;
        }
    } else if (!game.isMobile) {
        // Desktop: if no thrust keys pressed, decay thrust slowly
        if (!keys['w'] && !keys['arrowup'] && !keys['s'] && !keys['arrowdown']) {
            player.thrust *= 0.98;
            if (player.thrust < 0.2) player.thrust = 0.2; // Maintain minimum
        }
    }
}

function drawBackground() {
    // WW2 sky background with clouds
    const gridSize = 150;
    const offsetX = game.camera.x % gridSize;
    const offsetY = game.camera.y % gridSize;

    // Light grid for altitude reference
    ctx.strokeStyle = 'rgba(200, 220, 240, 0.15)';
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

    // Draw simple cloud shapes
    const cloudSize = 300;
    const cloudOffsetX = (game.camera.x * 0.3) % cloudSize;
    const cloudOffsetY = (game.camera.y * 0.3) % cloudSize;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = -cloudOffsetX - cloudSize; x < canvas.width + cloudSize; x += cloudSize) {
        for (let y = -cloudOffsetY - cloudSize; y < canvas.height + cloudSize; y += cloudSize) {
            const cloudX = x + (Math.sin(x * 0.01 + y * 0.01) * 50);
            const cloudY = y + (Math.cos(x * 0.01 + y * 0.01) * 50);
            ctx.beginPath();
            ctx.ellipse(cloudX, cloudY, 80, 50, 0, 0, Math.PI * 2);
            ctx.fill();
        }
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
        player.x = 0;
        player.y = 0;
        player.vx = 0;
        player.vy = 0;
        player.angle = -Math.PI / 2;
        player.thrust = 0.5; // Start with 50% thrust
        player.maxHealth = 100 * upgrades.maxHealth.level;
        player.health = player.maxHealth;
        player.armor = 10 * upgrades.armor.level;
        player.maxSpeed = 4 + (upgrades.speed.level * 0.5);
        player.fireRate = 150 - (upgrades.fireRate.level * 10);
        player.damage = 10 * upgrades.damage.level;
        player.specialCharge = 0;
        player.roll = 0;
        player.turnRate = 0;
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
        if (player) player.maxSpeed = 4 + (upgrades.speed.level * 0.5);
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
console.log('Controls: W/Up - Thrust Up | S/Down - Thrust Down | A/Left - Turn Left | D/Right - Turn Right');
console.log('Weapons: Space/Left Click - Fire Guns | Right Click/Shift - Special Weapon');
