const canvas = document.getElementById('game-screen')
const drawInGame = canvas.getContext('2d')

const keys = new Set()
let mouseX = 0
let mouseY = 0
let cameraX = 0
let jumpBufferFrames = 0
let trashHits = 0
let trashDestroyed = false
let lampActive = true
let trashActive = true
let trashCircleActive = false
let trashCircleConsumed = false
let arenaTriggered = false
let arenaCleared = false
let cameraLocked = false
let cameraLockX = 0
let goArrowSequenceStarted = false
let goArrowPhaseCount = 0
let goArrowPhaseTimer = 0
const enemyWaveSize = 3
const enemies = []
const superRipples = []
let enemyIdCounter = 0

const world = {
    width: 3520
}

const player = {
    x: 180,
    y: 420,
    width: 70,
    height: 110,
    speed: 4.32,
    depthSpeed: 2.8,
    airControl: 0.82,
    jumpHeight: 0,
    jumpVelocity: 0,
    jumpImpulse: 11.3,
    gravity: 0.62,
    isJumping: false,
    landingTimer: 0,
    facing: 1,
    attackTimer: 0,
    attackDuration: 7,
    attackWidth: 30,
    attackHeight: 12,
    attackHitIds: new Set(),
    crouchTimer: 0,
    crouchDuration: 18,
    maxHealth: 100,
    health: 100,
    maxSuper: 100,
    super: 100,
    superAttackTimer: 0,
    superAttackDuration: 180,
    maxLives: 3,
    lives: 3,
    invulnerableTimer: 0,
    invulnerableDuration: 90,
    isGameOver: false,
    color: '#40d66b'
}

const scene = {
    streetY: 290,
    topFeetLimitY: 295,
    screenWallPadding: 2,
    feetHitboxHeight: 5,
    sideBuildingWidth: 120,
    cameraFollowStartRatio: 0.45,
    limiteMaximoX_Mapa: 2620,
    propAnchorX: 500,
    propAnchorY: 300,
    trashOffsetX: 22,
    trashWidth: 34,
    trashHeight: 52,
    trashCircleOffsetX: 46,
    trashCircleOffsetY: 34,
    trashCircleRadius: 13,
    despawnBehindLeftDistance: 8,
    progressGateX: 880,
    combatTriggerOffsetX: -220,
    combatTriggerWidth: 220,
    enemySpawnOutsideDistance: 140,
    enemySpawnSpacing: 36,
    trashMaxHits: 3,
    sidewalkBottomY: 380,
    streetColor: '#7b7b7b',
    skyColor: '#0c0c0c',
    sidewalkColor: '#9a9a9a',
    edgeColor: '#5f5f5f'
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

function getBeatPulse(frame, periodFrames = 15) {
    const phase = (frame % periodFrames) / periodFrames
    const triangle = 1 - Math.abs((phase * 2) - 1)
    return clamp(triangle, 0, 1)
}

function applyDamage(amount) {
    if (player.isGameOver || player.invulnerableTimer > 0) {
        return
    }

    player.health = clamp(player.health - amount, 0, player.maxHealth)

    if (player.health === 0) {
        player.lives = Math.max(0, player.lives - 1)

        if (player.lives === 0) {
            player.isGameOver = true
        } else {
            player.health = player.maxHealth
            player.invulnerableTimer = player.invulnerableDuration
        }
    }
}

function resetRunState() {
    cameraX = 0
    jumpBufferFrames = 0
    trashHits = 0
    trashDestroyed = false
    lampActive = true
    trashActive = true
    trashCircleActive = false
    trashCircleConsumed = false
    arenaTriggered = false
    arenaCleared = false
    cameraLocked = false
    cameraLockX = 0
    goArrowSequenceStarted = false
    goArrowPhaseCount = 0
    goArrowPhaseTimer = 0
    enemies.length = 0

    player.x = 180
    player.y = 420
    player.jumpHeight = 0
    player.jumpVelocity = 0
    player.isJumping = false
    player.landingTimer = 0
    player.attackTimer = 0
    player.attackHitIds.clear()
    player.crouchTimer = 0
    player.health = player.maxHealth
    player.super = player.maxSuper
    player.superAttackTimer = 0
    player.lives = player.maxLives
    player.invulnerableTimer = 0
    player.isGameOver = false
    superRipples.length = 0
}

function activateSuperMove() {
    if (player.superAttackTimer > 0) {
        return false
    }

    player.superAttackTimer = player.superAttackDuration
    player.attackTimer = 0
    player.attackHitIds.clear()
    player.jumpHeight = 0
    player.jumpVelocity = 0
    player.isJumping = false
    player.landingTimer = 0

    const rippleOriginX = player.x + (player.width * 0.5)
    const rippleOriginY = (player.y - player.jumpHeight) + (player.height * 0.28)
    const rippleSpacingFrames = 20
    const rippleDurationFrames = 120

    for (let delay = 0; delay < player.superAttackDuration; delay += rippleSpacingFrames) {
        superRipples.push({
            x: rippleOriginX,
            y: rippleOriginY,
            delay,
            life: 0,
            duration: rippleDurationFrames,
            hitEnemyIds: new Set()
        })
    }

    return true
}

function tryActivateSuperCombo(triggerCode) {
    if (triggerCode !== 'KeyA' && triggerCode !== 'KeyS') {
        return false
    }

    const comboPressed =
        (triggerCode === 'KeyA' && keys.has('KeyS')) ||
        (triggerCode === 'KeyS' && keys.has('KeyA'))

    if (!comboPressed) {
        return false
    }

    return activateSuperMove()
}

function updateSuperRipples() {
    const maxRadius = Math.min(canvas.width, canvas.height) * 0.48

    for (let i = superRipples.length - 1; i >= 0; i -= 1) {
        const ripple = superRipples[i]

        if (ripple.delay > 0) {
            ripple.delay -= 1
            continue
        }

        ripple.life += 1

        const progress = clamp(ripple.life / ripple.duration, 0, 1)
        const radius = maxRadius * progress

        for (const enemy of enemies) {
            if (!enemy.alive || ripple.hitEnemyIds.has(enemy.id)) {
                continue
            }

            const enemyCenterX = enemy.x + (enemy.width * 0.5)
            const enemyCenterY = enemy.y + (enemy.height * 0.34)
            const dx = enemyCenterX - ripple.x
            const dy = enemyCenterY - ripple.y
            const distance = Math.hypot(dx, dy)
            const hitBand = Math.max(10, enemy.width * 0.45)

            if (Math.abs(distance - radius) <= hitBand) {
                enemy.superStunTimer = 240
                enemy.attackTimer = 0
                enemy.attackHasHit = false
                enemy.attackCooldownTimer = 0
                ripple.hitEnemyIds.add(enemy.id)
            }
        }

        if (ripple.life > ripple.duration) {
            superRipples.splice(i, 1)
        }
    }
}

function drawRectFromBase(x, baseY, width, height, color) {
    drawInGame.fillStyle = color
    drawInGame.fillRect(x, baseY - height, width, height)
}

function updateStageDespawn() {
    const leftCullX = cameraX - scene.despawnBehindLeftDistance

    const lampRightX = scene.propAnchorX + 14
    if (lampActive && lampRightX < leftCullX) {
        lampActive = false
    }

    const trashLeftX = scene.propAnchorX + scene.trashOffsetX
    const trashRightX = trashLeftX + scene.trashWidth
    if (trashActive && trashRightX < leftCullX) {
        trashActive = false
        trashCircleActive = false
    }
}

function intersects(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    )
}

function getTrashRect() {
    return {
        x: scene.propAnchorX + scene.trashOffsetX,
        y: scene.propAnchorY - scene.trashHeight,
        width: scene.trashWidth,
        height: scene.trashHeight
    }
}

function getCombatTriggerRect() {
    return {
        x: scene.progressGateX + scene.combatTriggerOffsetX,
        y: scene.topFeetLimitY - scene.feetHitboxHeight,
        width: scene.combatTriggerWidth,
        height: canvas.height - scene.topFeetLimitY + scene.feetHitboxHeight
    }
}

function getAttackRect() {
    if (player.attackTimer <= 0) {
        return null
    }

    const attackProgress = 1 - (player.attackTimer / player.attackDuration)
    const extension = 5 + (attackProgress * 8)
    const width = player.attackWidth + extension
    const y = (player.y - player.jumpHeight) + (player.height * 0.34)
    const x = player.facing === 1
        ? player.x + player.width - 2
        : player.x - width + 2

    return {
        x,
        y,
        width,
        height: player.attackHeight
    }
}

function getTrashCircle() {
    return {
        x: scene.propAnchorX + scene.trashCircleOffsetX,
        y: scene.propAnchorY + scene.trashCircleOffsetY,
        radius: scene.trashCircleRadius
    }
}

function tryInteractWithTrashCircle() {
    if (!trashCircleActive || trashCircleConsumed) {
        return
    }

    const circle = getTrashCircle()
    const playerCenterX = player.x + (player.width * 0.5)
    const playerWaistY = (player.y - player.jumpHeight) + (player.height * 0.55)
    const playerFeetY = (player.y - player.jumpHeight) + player.height

    const insideHorizontal = Math.abs(playerCenterX - circle.x) <= (player.width * 0.55)
    const insideVerticalBand = circle.y > playerWaistY && circle.y < playerFeetY

    if (insideHorizontal && insideVerticalBand) {
        player.crouchTimer = player.crouchDuration
        player.health = player.maxHealth
        trashCircleConsumed = true
        trashCircleActive = false
    }
}

function spawnEnemyFromSide(spawnIndex = 0, side = 'right') {
    enemyIdCounter += 1

    const enemyWidth = 58
    const enemyHeight = 104
    const leftFeetLimit = cameraX + scene.screenWallPadding
    const rightFeetLimit = cameraX + canvas.width - scene.screenWallPadding
    const enemyFeetY = 345 + ((spawnIndex % 3) * 18)
    const spawnOffset = scene.enemySpawnOutsideDistance + (spawnIndex * scene.enemySpawnSpacing)

    const spawnX = side === 'left'
        ? leftFeetLimit - enemyWidth - spawnOffset
        : rightFeetLimit + spawnOffset

    enemies.push({
        id: `enemy-${enemyIdCounter}`,
        x: spawnX,
        y: enemyFeetY - enemyHeight,
        width: enemyWidth,
        height: enemyHeight,
        speed: 1.05,
        depthSpeed: 0.95,
        maxHits: 5,
        hits: 0,
        facing: side === 'left' ? 1 : -1,
        spawnSide: side,
        enteredArena: false,
        forceReturnToScreen: false,
        attackTimer: 0,
        attackDuration: 7,
        attackWidth: 30,
        attackHeight: 12,
        attackCooldownTimer: 0,
        attackCooldownDuration: 18,
        attackHasHit: false,
        superStunTimer: 0,
        damagePerHit: 5,
        alive: true,
        color: '#d71f1f'
    })
}

function activateCombatArena() {
    if (arenaTriggered) {
        return
    }

    arenaTriggered = true
    cameraLocked = true
    cameraLockX = cameraX

    for (let i = 0; i < enemyWaveSize; i += 1) {
        const side = i % 2 === 0 ? 'right' : 'left'
        spawnEnemyFromSide(i, side)
    }
}

function getEnemyAttackRect(enemy) {
    if (enemy.attackTimer <= 0) {
        return null
    }

    const attackProgress = 1 - (enemy.attackTimer / enemy.attackDuration)
    const extension = 5 + (attackProgress * 8)
    const width = enemy.attackWidth + extension
    const y = enemy.y + (enemy.height * 0.34)
    const x = enemy.facing === 1
        ? enemy.x + enemy.width - 2
        : enemy.x - width + 2

    return {
        x,
        y,
        width,
        height: enemy.attackHeight
    }
}

function hasAliveEnemy() {
    return enemies.some((enemy) => enemy.alive)
}

function hasActiveCombatWave() {
    return arenaTriggered && hasAliveEnemy()
}

function updateGoArrowState() {
    if (!goArrowSequenceStarted && arenaCleared && !hasActiveCombatWave()) {
        goArrowSequenceStarted = true
        goArrowPhaseCount = 0
        goArrowPhaseTimer = 12
    }

    if (!goArrowSequenceStarted) {
        return
    }

    if (goArrowPhaseCount >= 8) {
        return
    }

    goArrowPhaseTimer -= 1
    if (goArrowPhaseTimer <= 0) {
        goArrowPhaseCount += 1
        goArrowPhaseTimer = 12
    }
}

function updateEnemies() {
    const minEnemyY = scene.topFeetLimitY - 104
    const maxEnemyY = canvas.height - 104 - 10
    const minEnemyX = cameraX + scene.screenWallPadding
    const maxEnemyX = cameraX + canvas.width - scene.screenWallPadding
    const playerBodyRect = {
        x: player.x,
        y: player.y - player.jumpHeight,
        width: player.width,
        height: player.height
    }

    for (const enemy of enemies) {
        if (!enemy.alive) {
            continue
        }

        if (enemy.superStunTimer > 0) {
            enemy.superStunTimer -= 1
            continue
        }

        if (enemy.x < minEnemyX) {
            enemy.forceReturnToScreen = true
        }

        if (enemy.forceReturnToScreen) {
            enemy.facing = 1
            enemy.attackTimer = 0
            enemy.attackHasHit = false
            enemy.x += enemy.speed * 1.35

            if (enemy.x + enemy.width >= minEnemyX) {
                enemy.forceReturnToScreen = false
            }
            continue
        }

        const enemyCenterX = enemy.x + (enemy.width * 0.5)
        const playerCenterX = player.x + (player.width * 0.5)
        const deltaX = playerCenterX - enemyCenterX
        const deltaY = player.y - enemy.y
        const closeInX = Math.abs(deltaX) <= 74
        const closeInY = Math.abs(deltaY) <= 42

        if (deltaX !== 0) {
            enemy.facing = deltaX > 0 ? 1 : -1
        }

        if (enemy.attackTimer > 0) {
            enemy.attackTimer -= 1

            const enemyAttackRect = getEnemyAttackRect(enemy)
            if (!enemy.attackHasHit && enemyAttackRect && intersects(enemyAttackRect, playerBodyRect)) {
                applyDamage(enemy.damagePerHit)
                enemy.attackHasHit = true
            }

            if (enemy.attackTimer === 0) {
                enemy.attackHasHit = false
                enemy.attackCooldownTimer = enemy.attackCooldownDuration
            }
            continue
        }

        if (enemy.attackCooldownTimer > 0) {
            enemy.attackCooldownTimer -= 1
        }

        if (closeInX && closeInY && enemy.attackCooldownTimer === 0) {
            enemy.attackTimer = enemy.attackDuration
            enemy.attackHasHit = false
            continue
        }

        if (!closeInX) {
            enemy.x += Math.sign(deltaX) * enemy.speed
        }

        if (!enemy.enteredArena) {
            if (enemy.spawnSide === 'left' && enemy.x + enemy.width >= minEnemyX) {
                enemy.enteredArena = true
            }
            if (enemy.spawnSide === 'right' && enemy.x <= maxEnemyX - enemy.width) {
                enemy.enteredArena = true
            }
        }

        if (Math.abs(deltaY) > 8) {
            enemy.y += Math.sign(deltaY) * enemy.depthSpeed
            enemy.y = clamp(enemy.y, minEnemyY, maxEnemyY)
        }
    }
}

function drawEnemies() {
    for (const enemy of enemies) {
        if (!enemy.alive) {
            continue
        }

        drawInGame.fillStyle = 'rgba(0, 0, 0, 0.22)'
        drawInGame.beginPath()
        drawInGame.ellipse(
            (enemy.x - cameraX) + (enemy.width * 0.5),
            enemy.y + enemy.height - 3,
            enemy.width * 0.34,
            enemy.height * 0.1,
            0,
            0,
            Math.PI * 2
        )
        drawInGame.fill()

        const stunElapsedFrames = 240 - enemy.superStunTimer
        const stunBeatPulse = enemy.superStunTimer > 0
            ? getBeatPulse(stunElapsedFrames, 15)
            : 0
        const stunBounceY = enemy.superStunTimer > 0
            ? Math.pow(stunBeatPulse, 0.7) * 4.1
            : 0
        const stunSwayX = enemy.superStunTimer > 0
            ? Math.sin(stunElapsedFrames * 0.5) * 2.6
            : 0
        const drawEnemyX = (enemy.x - cameraX) + stunSwayX
        const drawEnemyY = enemy.y - stunBounceY

        drawInGame.fillStyle = enemy.color
        drawInGame.fillRect(drawEnemyX, drawEnemyY, enemy.width, enemy.height)

        if (enemy.superStunTimer > 0) {
            const armWidth = Math.max(6, Math.round(enemy.width * 0.14))
            const armHeight = Math.max(20, Math.round(enemy.height * 0.34))
            const armX = enemy.facing === 1
                ? drawEnemyX + enemy.width - armWidth - 2
                : drawEnemyX + 2
            const armY = drawEnemyY - armHeight + 6 - (stunBeatPulse * 4)

            drawInGame.fillStyle = '#ffd9d9'
            drawInGame.fillRect(armX, armY, armWidth, armHeight)

            const centerX = drawEnemyX + (enemy.width * 0.5)
            const centerY = drawEnemyY - 16
            const turns = 2.35
            const maxRadius = 11

            drawInGame.strokeStyle = '#f3e7ff'
            drawInGame.lineWidth = 2
            drawInGame.beginPath()

            for (let step = 0; step <= 36; step += 1) {
                const t = step / 36
                const angle = t * turns * Math.PI * 2
                const radius = t * maxRadius
                const wobble = Math.sin((enemy.superStunTimer * 0.18) + (t * 10)) * 0.8
                const x = centerX + Math.cos(angle) * (radius + wobble)
                const y = centerY + Math.sin(angle) * (radius + wobble)

                if (step === 0) {
                    drawInGame.moveTo(x, y)
                } else {
                    drawInGame.lineTo(x, y)
                }
            }

            drawInGame.stroke()
        }

        if (enemy.attackTimer > 0) {
            const enemyAttackRect = getEnemyAttackRect(enemy)
            drawInGame.fillStyle = '#ffd9d9'
            drawInGame.fillRect(
                enemyAttackRect.x - cameraX,
                enemyAttackRect.y - stunBounceY,
                enemyAttackRect.width,
                enemyAttackRect.height
            )
        }
    }
}

function drawBackground() {
    drawInGame.fillStyle = scene.skyColor
    drawInGame.fillRect(0, 0, canvas.width, canvas.height)

    drawInGame.fillStyle = '#101010'
    drawInGame.fillRect(0, 0, canvas.width, scene.streetY + 20)

    const buildingBaseY = scene.streetY
    const buildingStep = 206
    const buildingPaddingLeft = canvas.width * 0.15
    const buildingPaddingRight = canvas.width * 0.25
    const renderWorldStart = cameraX - buildingPaddingLeft
    const renderWorldEnd = cameraX + canvas.width + buildingPaddingRight
    const firstIndex = Math.floor(renderWorldStart / buildingStep) - 1
    const lastIndex = Math.ceil(renderWorldEnd / buildingStep) + 1
    const worldFacadeMinX = -buildingStep
    const worldFacadeMaxX = world.width + buildingStep
    const facadeBlues = ['#133a66', '#194a7a', '#1f5d96', '#2b73a8', '#3f87ba']
    const facadeBlueShadows = ['#0f2f54', '#153d65', '#184a79', '#20598a', '#2a6999']

    for (let i = firstIndex; i <= lastIndex; i += 1) {
        const buildingWorldX = i * buildingStep

        if (buildingWorldX < worldFacadeMinX || buildingWorldX > worldFacadeMaxX) {
            continue
        }

        const variant = ((i % 5) + 5) % 5
        const buildingWidth = 176 + (variant * 22)
        const buildingHeight = 280 + (variant * 52)
        const buildingY = buildingBaseY - buildingHeight
        const screenX = buildingWorldX - cameraX
        const facadeColor = facadeBlues[variant]
        const shadowColor = facadeBlueShadows[variant]
        const hasPortal = variant === 1 || variant === 3

        drawInGame.fillStyle = facadeColor
        drawInGame.fillRect(screenX, buildingY, buildingWidth, buildingHeight)

        drawInGame.fillStyle = shadowColor
        drawInGame.fillRect(screenX + 16, buildingY + 24, 18, buildingHeight - 34)
        drawInGame.fillRect(screenX + 48, buildingY + 24, 16, buildingHeight - 34)
        drawInGame.fillRect(screenX + 78, buildingY + 24, 16, buildingHeight - 34)
        drawInGame.fillRect(screenX + 108, buildingY + 24, 16, buildingHeight - 34)
        drawInGame.fillRect(screenX + 138, buildingY + 24, 16, buildingHeight - 34)

        if (hasPortal) {
            const portalWidth = Math.round(player.width * 0.92)
            const portalHeight = Math.round(player.height * 1.12)
            const portalX = screenX + Math.round((buildingWidth - portalWidth) * 0.5)
            const portalY = buildingBaseY - portalHeight

            drawInGame.fillStyle = '#7a4a1b'
            drawInGame.fillRect(portalX, portalY, portalWidth, portalHeight)

            drawInGame.fillStyle = '#5c3611'
            drawInGame.fillRect(portalX + 6, portalY + 8, portalWidth - 12, portalHeight - 10)
        }
    }

    drawInGame.fillStyle = scene.streetColor
    drawInGame.fillRect(0, scene.sidewalkBottomY, canvas.width, canvas.height - scene.sidewalkBottomY)

    drawInGame.fillStyle = scene.sidewalkColor
    drawInGame.fillRect(0, scene.streetY, canvas.width, scene.sidewalkBottomY - scene.streetY)

    drawInGame.fillStyle = scene.edgeColor
    drawInGame.fillRect(0, scene.sidewalkBottomY - 3, canvas.width, 3)

    drawInGame.fillStyle = 'rgba(255, 255, 255, 0.2)'
    for (let i = 0; i < 16; i += 1) {
        const roadX = ((i * 140) - (cameraX * 0.7)) % (canvas.width + 140) - 70
        drawInGame.fillRect(roadX, scene.sidewalkBottomY + 110, 42, 5)
    }
}

function drawPlayer() {
    const blinkHidden = player.invulnerableTimer > 0 && Math.floor(player.invulnerableTimer / 5) % 2 === 0
    if (blinkHidden) {
        return
    }

    const jumpRatio = clamp(player.jumpHeight / 120, 0, 1)
    const landingRatio = clamp(player.landingTimer / 10, 0, 1)
    const crouchRatio = clamp(player.crouchTimer / player.crouchDuration, 0, 1)

    const scaleX = 1 + (jumpRatio * 0.08) - (landingRatio * 0.12) + (crouchRatio * 0.08)
    const scaleY = 1 - (jumpRatio * 0.1) + (landingRatio * 0.12) - (crouchRatio * 0.22)

    const scaledWidth = player.width * scaleX
    const scaledHeight = player.height * scaleY
    const centerX = (player.x - cameraX) + (player.width * 0.5)
    const superElapsedFrames = player.superAttackDuration - player.superAttackTimer
    const superBeatPulse = player.superAttackTimer > 0
        ? getBeatPulse(superElapsedFrames, 15)
        : 0
    const superBounceY = player.superAttackTimer > 0
        ? Math.pow(superBeatPulse, 0.72) * 4.3
        : 0
    const superGrooveY = player.superAttackTimer > 0
        ? Math.sin(superElapsedFrames * 0.24) * 0.9
        : 0
    const drawX = centerX - (scaledWidth * 0.5)
    const drawY = (player.y - player.jumpHeight) + (player.height - scaledHeight) - superBounceY + superGrooveY

    const shadowScale = 1 - (jumpRatio * 0.45)
    const shadowAlpha = 0.3 - (jumpRatio * 0.2)
    drawInGame.fillStyle = `rgba(0, 0, 0, ${clamp(shadowAlpha, 0.06, 0.32)})`
    drawInGame.beginPath()
    drawInGame.ellipse(
        centerX,
        player.y + player.height - 3,
        (player.width * 0.4) * shadowScale,
        (player.height * 0.12) * shadowScale,
        0,
        0,
        Math.PI * 2
    )
    drawInGame.fill()

    drawInGame.fillStyle = player.color
    drawInGame.fillRect(drawX, drawY, scaledWidth, scaledHeight)

    if (player.superAttackTimer > 0) {
        const armWidth = Math.max(6, Math.round(scaledWidth * 0.16))
        const armHeight = Math.max(22, Math.round(scaledHeight * 0.38))
        const armX = player.facing === 1
            ? drawX + scaledWidth - armWidth - 2
            : drawX + 2
        const armY = drawY - armHeight + 6 - (superBeatPulse * 5)

        drawInGame.fillStyle = '#c7f3ff'
        drawInGame.fillRect(armX, armY, armWidth, armHeight)
    }

    if (player.attackTimer > 0) {
        const attackRect = getAttackRect()

        drawInGame.fillStyle = '#f2f2f2'
        drawInGame.fillRect(
            attackRect.x - cameraX,
            attackRect.y,
            attackRect.width,
            attackRect.height
        )
    }
}

function drawSuperRipples() {
    if (superRipples.length === 0) {
        return
    }

    const maxRadius = Math.min(canvas.width, canvas.height) * 0.48

    for (const ripple of superRipples) {
        if (ripple.delay > 0 || ripple.life <= 0) {
            continue
        }

        const progress = clamp(ripple.life / ripple.duration, 0, 1)
        const radius = maxRadius * progress
        const alpha = (1 - progress) * 0.55
        const thickness = 2 + ((1 - progress) * 2.5)

        drawInGame.strokeStyle = `rgba(110, 225, 255, ${alpha})`
        drawInGame.lineWidth = thickness
        drawInGame.beginPath()
        drawInGame.arc(ripple.x - cameraX, ripple.y, radius, 0, Math.PI * 2)
        drawInGame.stroke()
    }
}

function drawProps() {
    const baseX = scene.propAnchorX - cameraX
    const baseY = scene.propAnchorY

    if (lampActive) {
        drawInGame.fillStyle = 'rgba(0, 0, 0, 0.25)'
        drawInGame.beginPath()
        drawInGame.ellipse(baseX + 7, baseY - 2, 12, 4, 0, 0, Math.PI * 2)
        drawInGame.fill()

        drawRectFromBase(baseX, baseY, 14, 150, '#d9b300')
    }

    if (trashActive && !trashDestroyed) {
        const trashCenterX = baseX + scene.trashOffsetX + (scene.trashWidth * 0.5)
        drawInGame.fillStyle = 'rgba(0, 0, 0, 0.25)'
        drawInGame.beginPath()
        drawInGame.ellipse(trashCenterX, baseY - 2, scene.trashWidth * 0.42, 6, 0, 0, Math.PI * 2)
        drawInGame.fill()

        drawRectFromBase(baseX + scene.trashOffsetX, baseY, scene.trashWidth, scene.trashHeight, '#7a4a1b')
    }
}

function drawHud() {
    const healthBarX = 14
    const healthBarY = 12
    const healthBarWidth = 220
    const healthBarHeight = 18
    const healthRatio = player.health / player.maxHealth
    const superBarX = healthBarX
    const superBarY = healthBarY + 24
    const superBarWidth = 220
    const superBarHeight = 12
    const superRatio = player.super / player.maxSuper

    drawInGame.fillStyle = 'rgba(0, 0, 0, 0.45)'
    drawInGame.fillRect(healthBarX - 2, healthBarY - 2, healthBarWidth + 4, healthBarHeight + 4)

    drawInGame.fillStyle = '#3a0a0a'
    drawInGame.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight)

    drawInGame.fillStyle = '#ff2a2a'
    drawInGame.fillRect(healthBarX, healthBarY, healthBarWidth * healthRatio, healthBarHeight)

    drawInGame.strokeStyle = '#ffffff'
    drawInGame.lineWidth = 1
    drawInGame.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight)

    drawInGame.fillStyle = 'rgba(0, 0, 0, 0.45)'
    drawInGame.fillRect(superBarX - 2, superBarY - 2, superBarWidth + 4, superBarHeight + 4)

    drawInGame.fillStyle = '#1a1a3f'
    drawInGame.fillRect(superBarX, superBarY, superBarWidth, superBarHeight)

    drawInGame.fillStyle = '#2ed0ff'
    drawInGame.fillRect(superBarX, superBarY, superBarWidth * superRatio, superBarHeight)

    drawInGame.strokeStyle = '#ffffff'
    drawInGame.lineWidth = 1
    drawInGame.strokeRect(superBarX, superBarY, superBarWidth, superBarHeight)

    drawInGame.fillStyle = '#ffffff'
    drawInGame.font = '13px monospace'
    drawInGame.textAlign = 'left'
    drawInGame.textBaseline = 'middle'
    drawInGame.fillText(`HP ${Math.ceil(player.health)}/${player.maxHealth}`, healthBarX + 8, healthBarY + (healthBarHeight * 0.5))

    drawInGame.fillStyle = '#ffffff'
    drawInGame.font = '12px monospace'
    drawInGame.textAlign = 'left'
    drawInGame.textBaseline = 'middle'
    drawInGame.fillText(`SUPER ${Math.round(superRatio * 100)}%`, healthBarX + 6, superBarY + (superBarHeight * 0.5))

    drawInGame.fillStyle = '#ffffff'
    drawInGame.font = '14px monospace'
    drawInGame.fillText(`VIDAS ${player.lives}/${player.maxLives}`, healthBarX, healthBarY + 46)

    drawInGame.fillStyle = '#ffffff'
    drawInGame.font = '16px monospace'
    drawInGame.textAlign = 'right'
    drawInGame.textBaseline = 'top'
    drawInGame.fillText(`X: ${mouseX}  Y: ${mouseY}`, canvas.width - 12, 10)

    if (trashActive && !trashDestroyed) {
        drawInGame.fillText(`Papelera: ${trashHits}/${scene.trashMaxHits}`, canvas.width - 12, 30)
    }

    const remainingEnemies = arenaTriggered ? enemies.filter((enemy) => enemy.alive).length : 0
    if (remainingEnemies > 0) {
        drawInGame.fillText(`Enemigos restantes: ${remainingEnemies}`, canvas.width - 12, 50)
    }

    if (trashCircleActive && !trashCircleConsumed) {
        drawInGame.fillText('Pulsa abajo sobre el circulo', canvas.width - 12, 70)
    }
}

function drawGameOverOverlay() {
    if (!player.isGameOver) {
        return
    }

    drawInGame.fillStyle = 'rgba(0, 0, 0, 0.57)'
    drawInGame.fillRect(0, 0, canvas.width, canvas.height)

    drawInGame.fillStyle = '#ff2a2a'
    drawInGame.font = 'bold 54px monospace'
    drawInGame.textAlign = 'center'
    drawInGame.textBaseline = 'middle'
    drawInGame.fillText('GAME OVER', canvas.width * 0.5, canvas.height * 0.5)

    drawInGame.fillStyle = '#ffffff'
    drawInGame.font = 'bold 24px monospace'
    drawInGame.fillText('REINTENTAR (R)', canvas.width * 0.5, (canvas.height * 0.5) + 52)
}

function drawFrontInteractionProps() {
    if (!trashCircleActive || trashCircleConsumed) {
        return
    }

    const circle = getTrashCircle()
    drawInGame.fillStyle = 'rgba(0, 0, 0, 0.22)'
    drawInGame.beginPath()
    drawInGame.ellipse(circle.x - cameraX, circle.y + circle.radius - 1, circle.radius * 0.92, circle.radius * 0.35, 0, 0, Math.PI * 2)
    drawInGame.fill()

    drawInGame.fillStyle = '#e32020'
    drawInGame.beginPath()
    drawInGame.arc(circle.x - cameraX, circle.y, circle.radius, 0, Math.PI * 2)
    drawInGame.fill()

    drawInGame.strokeStyle = '#ffd7d7'
    drawInGame.lineWidth = 2
    drawInGame.stroke()

    // Capa frontal extra para asegurar que siempre quede por encima del personaje.
    drawInGame.fillStyle = 'rgba(255, 255, 255, 0.18)'
    drawInGame.beginPath()
    drawInGame.arc(circle.x - cameraX, circle.y, Math.max(2, circle.radius - 6), 0, Math.PI * 2)
    drawInGame.fill()
}

function drawGoArrow() {
    if (!goArrowSequenceStarted || goArrowPhaseCount >= 8 || goArrowPhaseCount % 2 !== 0) {
        return
    }

    const rightPlayerLimitScreenX = canvas.width - scene.screenWallPadding
    const arrowBaseX = rightPlayerLimitScreenX - 200
    const arrowY = 150

    drawInGame.fillStyle = '#ff2b2b'
    drawInGame.beginPath()
    drawInGame.moveTo(arrowBaseX, arrowY)
    drawInGame.lineTo(arrowBaseX + 38, arrowY)
    drawInGame.lineTo(arrowBaseX + 38, arrowY + 4)
    drawInGame.lineTo(arrowBaseX + 60, arrowY + 18)
    drawInGame.lineTo(arrowBaseX + 38, arrowY + 32)
    drawInGame.lineTo(arrowBaseX + 38, arrowY + 20)
    drawInGame.lineTo(arrowBaseX, arrowY + 20)
    drawInGame.closePath()
    drawInGame.fill()

    drawInGame.fillStyle = '#ffffff'
    drawInGame.font = 'bold 18px monospace'
    drawInGame.textAlign = 'left'
    drawInGame.textBaseline = 'middle'
    drawInGame.fillText('GO', arrowBaseX + 68, arrowY + 8)
}

function updatePlayer() {
    if (player.isGameOver) {
        return
    }

    const inputX = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)
    const inputY = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0)

    const isSuperActive = player.superAttackTimer > 0

    if (inputX !== 0 && !isSuperActive) {
        player.facing = inputX > 0 ? 1 : -1
    }

    const diagonalFactor = inputX !== 0 && inputY !== 0 ? Math.SQRT1_2 : 1
    const controlFactor = player.isJumping ? player.airControl : 1
    const effectiveInputY = player.crouchTimer > 0 && inputY > 0 ? 0 : inputY
    const moveX = isSuperActive ? 0 : inputX * player.speed * diagonalFactor * controlFactor
    const moveY = isSuperActive ? 0 : effectiveInputY * player.depthSpeed * diagonalFactor * controlFactor

    if (jumpBufferFrames > 0) {
        jumpBufferFrames -= 1
    }

    if (jumpBufferFrames > 0 && !player.isJumping && !isSuperActive) {
        player.isJumping = true
        player.jumpVelocity = player.jumpImpulse
        jumpBufferFrames = 0
    }

    if (player.isJumping) {
        player.jumpHeight += player.jumpVelocity
        player.jumpVelocity -= player.gravity

        if (player.jumpHeight <= 0) {
            player.jumpHeight = 0
            player.jumpVelocity = 0
            player.isJumping = false
            player.landingTimer = 10
        }
    } else if (player.landingTimer > 0) {
        player.landingTimer -= 1
    }

    if (player.crouchTimer > 0) {
        player.crouchTimer -= 1
    }

    if (player.invulnerableTimer > 0) {
        player.invulnerableTimer -= 1
    }

    if (player.superAttackTimer > 0) {
        player.superAttackTimer -= 1
    }

    if (player.attackTimer > 0) {
        player.attackTimer -= 1

        const attackRect = getAttackRect()

        if (trashActive && !trashDestroyed && !player.attackHitIds.has('trash')) {
            const trashRect = getTrashRect()
            if (attackRect && intersects(attackRect, trashRect)) {
                trashHits += 1
                player.attackHitIds.add('trash')

                if (trashHits >= scene.trashMaxHits) {
                    trashDestroyed = true
                    trashCircleActive = true
                }
            }
        }

        if (attackRect) {
            for (const enemy of enemies) {
                if (!enemy.alive) {
                    continue
                }

                if (player.attackHitIds.has(enemy.id)) {
                    continue
                }

                if (intersects(attackRect, enemy)) {
                    enemy.hits += 1
                    player.attackHitIds.add(enemy.id)

                    if (enemy.hits >= enemy.maxHits) {
                        enemy.alive = false
                    }
                }
            }
        }

        if (player.attackTimer === 0) {
            player.attackHitIds.clear()
        }
    }

    const maxCameraXByWorld = Math.max(0, world.width - canvas.width)
    const maxCameraX = Math.max(0, Math.min(maxCameraXByWorld, scene.limiteMaximoX_Mapa))

    const feetColliderWidth = Math.round(player.width * 0.62)
    const feetLeftOffset = Math.round((player.width - feetColliderWidth) * 0.5)
    const feetHitbox = {
        leftOffset: feetLeftOffset,
        rightOffset: feetLeftOffset + feetColliderWidth,
        topOffset: player.height - scene.feetHitboxHeight,
        bottomOffset: player.height
    }

    let nextX = player.x + moveX
    let nextY = player.y + moveY

    const nextFeetRect = {
        x: nextX + feetHitbox.leftOffset,
        y: nextY + feetHitbox.topOffset,
        width: feetHitbox.rightOffset - feetHitbox.leftOffset,
        height: feetHitbox.bottomOffset - feetHitbox.topOffset
    }

    function syncFeetRectX() {
        nextFeetRect.x = nextX + feetHitbox.leftOffset
    }

    function syncFeetRectY() {
        nextFeetRect.y = nextY + feetHitbox.topOffset
    }

    if (trashActive && !trashDestroyed && !hasActiveCombatWave()) {
        const trashSolidRect = getTrashRect()

        if (intersects(nextFeetRect, trashSolidRect)) {
            if (moveX > 0) {
                nextX = trashSolidRect.x - feetHitbox.rightOffset
            } else if (moveX < 0) {
                nextX = trashSolidRect.x + trashSolidRect.width - feetHitbox.leftOffset
            }
            syncFeetRectX()

            if (intersects(nextFeetRect, trashSolidRect)) {
                if (moveY > 0) {
                    nextY = trashSolidRect.y - feetHitbox.bottomOffset
                } else if (moveY < 0) {
                    nextY = (trashSolidRect.y + trashSolidRect.height) - feetHitbox.topOffset
                }
                syncFeetRectY()
            }
        }

    }

    if (!arenaTriggered && !arenaCleared) {
        const triggerRect = getCombatTriggerRect()
        if (intersects(nextFeetRect, triggerRect)) {
            activateCombatArena()
        }
    }

    if (arenaTriggered && !hasAliveEnemy()) {
        arenaTriggered = false
        arenaCleared = true
    }

    if (!hasActiveCombatWave()) {
        cameraLocked = false
    }

    if (cameraLocked) {
        cameraX = clamp(cameraLockX, 0, maxCameraX)
    } else {
        const followStartX = cameraX + (canvas.width * scene.cameraFollowStartRatio)
        const feetCenterX = nextX + feetHitbox.leftOffset + ((feetHitbox.rightOffset - feetHitbox.leftOffset) * 0.5)
        if (moveX > 0 && feetCenterX > followStartX) {
            const overrun = feetCenterX - followStartX
            cameraX = clamp(cameraX + overrun, 0, maxCameraX)
        }
    }

    // Clamp final usando coordenadas de pantalla de la hitbox de pies.
    const feetWidth = feetHitbox.rightOffset - feetHitbox.leftOffset
    const feetHeight = feetHitbox.bottomOffset - feetHitbox.topOffset
    const feetScreenLeft = (nextX + feetHitbox.leftOffset) - cameraX
    const feetScreenTop = nextY + feetHitbox.topOffset

    // Clamp horizontal por cuerpo completo para que los laterales no sobrepasen limites.
    const bodyScreenLeft = nextX - cameraX
    const minBodyScreenLeft = scene.screenWallPadding
    const maxBodyScreenLeft = hasActiveCombatWave()
        ? canvas.width - scene.screenWallPadding - player.width
        : Number.POSITIVE_INFINITY
    const clampedBodyScreenLeft = clamp(
        bodyScreenLeft,
        minBodyScreenLeft,
        maxBodyScreenLeft
    )
    const clampedFeetBottom = clamp(
        feetScreenTop + feetHeight,
        scene.topFeetLimitY,
        canvas.height - 10
    )

    nextX = clampedBodyScreenLeft + cameraX
    nextY = (clampedFeetBottom - feetHeight) - feetHitbox.topOffset

    player.x = nextX
    player.y = nextY
}

function drawScene() {
    drawInGame.clearRect(0, 0, canvas.width, canvas.height)
    drawBackground()
    drawProps()
    drawEnemies()
    drawPlayer()
    drawSuperRipples()
    drawFrontInteractionProps()
    drawGoArrow()
    drawHud()
    drawGameOverOverlay()
}

function mainLoop() {
    if (!player.isGameOver) {
        updateStageDespawn()
        updateEnemies()
        updatePlayer()
        updateGoArrowState()
        updateSuperRipples()
    }
    drawScene()
    requestAnimationFrame(mainLoop)
}

window.addEventListener('keydown', (event) => {
    if (
        event.code === 'ArrowLeft' ||
        event.code === 'ArrowRight' ||
        event.code === 'ArrowUp' ||
        event.code === 'ArrowDown' ||
        event.code === 'KeyW' ||
        event.code === 'KeyA' ||
        event.code === 'KeyR' ||
        event.code === 'KeyS' ||
        event.code === 'KeyD' ||
        event.code === 'Space'
    ) {
        event.preventDefault()
    }

    if (!event.repeat && tryActivateSuperCombo(event.code)) {
        keys.add(event.code)
        return
    }

    if (event.code === 'Space' && !event.repeat) {
        jumpBufferFrames = 8
    }

    if ((event.code === 'ArrowDown' || event.code === 'KeyS') && !event.repeat && !keys.has('KeyA')) {
        tryInteractWithTrashCircle()
    }

    if (event.code === 'KeyA' && !event.repeat && player.attackTimer === 0 && player.superAttackTimer === 0) {
        player.attackTimer = player.attackDuration
        player.attackHitIds.clear()
    }

    if (event.code === 'KeyR' && !event.repeat && player.isGameOver) {
        resetRunState()
    }

    keys.add(event.code)
})

window.addEventListener('keyup', (event) => {
    keys.delete(event.code)
})

canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect()
    mouseX = Math.floor(event.clientX - rect.left)
    mouseY = Math.floor(event.clientY - rect.top)
})

drawScene()
requestAnimationFrame(mainLoop)