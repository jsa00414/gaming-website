import * as THREE from 'three';

const MATCH_SECONDS = 90;
const MAG_SIZE = 30;
const RESERVE_START = 90;
const PLAYER_SPEED = 14;
const PLAYER_HEIGHT = 1.6;
const ENEMY_COUNT = 8;

export function createGame(canvas, ui) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c1814);
  scene.fog = new THREE.Fog(0x1c1814, 18, 55);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.position.set(0, PLAYER_HEIGHT, 8);

  const hemi = new THREE.HemisphereLight(0xffe6c8, 0x2a2218, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xff8a4a, 1.35);
  sun.position.set(12, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const fill = new THREE.PointLight(0xd6ff2f, 0.45, 40);
  fill.position.set(-8, 4, -6);
  scene.add(fill);

  const arena = buildArena();
  scene.add(arena.group);

  const enemies = [];
  const enemyMat = new THREE.MeshStandardMaterial({
    color: 0x2d2924,
    roughness: 0.75,
    metalness: 0.15,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xd6ff2f,
    emissive: 0x4a5a00,
    roughness: 0.4,
  });

  for (let i = 0; i < ENEMY_COUNT; i++) {
    enemies.push(spawnEnemy(scene, enemyMat, accentMat, i));
  }

  const muzzleFlash = new THREE.PointLight(0xff4a12, 0, 8);
  camera.add(muzzleFlash);
  scene.add(camera);

  const gun = buildGun();
  camera.add(gun);

  const state = {
    running: false,
    locked: false,
    kills: 0,
    hp: 100,
    ammo: MAG_SIZE,
    reserve: RESERVE_START,
    timeLeft: MATCH_SECONDS,
    yaw: 0,
    pitch: 0,
    keys: new Set(),
    lastShot: 0,
    damageCooldown: 0,
    ended: false,
  };

  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const tmp = new THREE.Vector3();

  function resize() {
    const parent = canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  function setOverlay(title, copy, showButton = true) {
    ui.overlay.hidden = false;
    ui.hud.hidden = true;
    ui.overlayTitle.textContent = title;
    ui.overlayCopy.textContent = copy;
    ui.startBtn.hidden = !showButton;
    ui.startBtn.textContent = state.ended ? 'Play Again' : 'Drop In';
  }

  function hideOverlay() {
    ui.overlay.hidden = true;
    ui.hud.hidden = false;
  }

  function updateHud() {
    ui.score.textContent = `Kills ${state.kills}`;
    const m = Math.floor(state.timeLeft / 60);
    const s = Math.floor(state.timeLeft % 60)
      .toString()
      .padStart(2, '0');
    ui.timer.textContent = `${m.toString().padStart(2, '0')}:${s}`;
    ui.ammo.textContent = `${state.ammo} / ${state.reserve}`;
    ui.hpText.textContent = `${Math.max(0, Math.ceil(state.hp))} HP`;
    ui.hpFill.style.transform = `scaleX(${Math.max(0, state.hp / 100)})`;
  }

  function resetMatch() {
    state.kills = 0;
    state.hp = 100;
    state.ammo = MAG_SIZE;
    state.reserve = RESERVE_START;
    state.timeLeft = MATCH_SECONDS;
    state.ended = false;
    state.damageCooldown = 0;
    camera.position.set(0, PLAYER_HEIGHT, 8);
    state.yaw = 0;
    state.pitch = 0;
    enemies.forEach((e, i) => resetEnemy(e, i));
    updateHud();
  }

  function endMatch(won) {
    state.running = false;
    state.ended = true;
    if (state.locked) {
      document.exitPointerLock?.();
    }
    const title = won ? 'Arena cleared' : state.hp <= 0 ? 'Downed' : 'Time out';
    const copy = won
      ? `You dropped ${state.kills} hostiles. Extract secured.`
      : `Final tally: ${state.kills} kills. Drop in again.`;
    setOverlay(title, copy, true);
  }

  function tryShoot(now) {
    if (!state.running || state.ammo <= 0) return;
    if (now - state.lastShot < 110) return;
    state.lastShot = now;
    state.ammo -= 1;
    muzzleFlash.intensity = 4;
    gun.position.z = 0.12;
    updateHud();

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const bodies = enemies.filter((e) => e.alive).map((e) => e.mesh);
    const hits = raycaster.intersectObjects(bodies, false);
    if (hits.length) {
      const enemy = enemies.find((e) => e.mesh === hits[0].object);
      if (enemy) {
        enemy.hp -= 34;
        enemy.mesh.material = enemy.mesh.material.clone();
        enemy.mesh.material.emissive = new THREE.Color(0xff4a12);
        setTimeout(() => {
          if (enemy.alive) enemy.mesh.material.emissive = new THREE.Color(0x000000);
        }, 80);
        if (enemy.hp <= 0) {
          enemy.alive = false;
          enemy.mesh.visible = false;
          enemy.accent.visible = false;
          state.kills += 1;
          updateHud();
          if (enemies.every((e) => !e.alive)) {
            endMatch(true);
          } else {
            setTimeout(() => resetEnemy(enemy, Math.floor(Math.random() * 8)), 1800);
          }
        }
      }
    }
  }

  function reload() {
    if (!state.running) return;
    const need = MAG_SIZE - state.ammo;
    if (need <= 0 || state.reserve <= 0) return;
    const take = Math.min(need, state.reserve);
    state.ammo += take;
    state.reserve -= take;
    updateHud();
  }

  function onKeyDown(e) {
    const key = e.key.toLowerCase();
    state.keys.add(key);
    if (key === 'r') reload();
    if (key === 'escape' && state.locked) {
      document.exitPointerLock?.();
    }
  }

  function onKeyUp(e) {
    state.keys.delete(e.key.toLowerCase());
  }

  function onMouseMove(e) {
    if (!state.locked || !state.running) return;
    state.yaw -= e.movementX * 0.0022;
    state.pitch -= e.movementY * 0.0022;
    state.pitch = Math.max(-1.2, Math.min(1.2, state.pitch));
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (!state.locked) {
      canvas.requestPointerLock();
      return;
    }
    tryShoot(performance.now());
  }

  function onPointerLockChange() {
    state.locked = document.pointerLockElement === canvas;
    if (state.locked && !state.running && !state.ended) {
      state.running = true;
      hideOverlay();
      clock.start();
    }
    if (!state.locked && state.running) {
      state.running = false;
      setOverlay('Paused', 'Click the arena to resume the match.', true);
      ui.startBtn.textContent = 'Resume';
    }
  }

  function startFromButton() {
    if (state.ended || state.timeLeft <= 0 || state.hp <= 0) {
      resetMatch();
    }
    canvas.requestPointerLock();
  }

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    resize();

    if (state.running) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        updateHud();
        endMatch(false);
      } else {
        updateHud();
      }

      camera.rotation.order = 'YXZ';
      camera.rotation.y = state.yaw;
      camera.rotation.x = state.pitch;

      const forward = new THREE.Vector3(
        -Math.sin(state.yaw),
        0,
        -Math.cos(state.yaw),
      );
      const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
      const wish = new THREE.Vector3();
      if (state.keys.has('w')) wish.add(forward);
      if (state.keys.has('s')) wish.sub(forward);
      if (state.keys.has('d')) wish.add(right);
      if (state.keys.has('a')) wish.sub(right);
      if (wish.lengthSq() > 0) {
        wish.normalize().multiplyScalar(PLAYER_SPEED * dt);
        camera.position.add(wish);
      }
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -16, 16);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -16, 16);
      camera.position.y = PLAYER_HEIGHT;

      muzzleFlash.intensity = THREE.MathUtils.lerp(muzzleFlash.intensity, 0, dt * 18);
      gun.position.z = THREE.MathUtils.lerp(gun.position.z, 0, dt * 12);

      state.damageCooldown = Math.max(0, state.damageCooldown - dt);
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        enemy.t += dt;
        enemy.mesh.position.x = enemy.home.x + Math.sin(enemy.t * enemy.speed) * enemy.radius;
        enemy.mesh.position.z = enemy.home.z + Math.cos(enemy.t * enemy.speed * 0.8) * enemy.radius;
        enemy.accent.position.copy(enemy.mesh.position);
        enemy.accent.position.y = 1.55;

        tmp.copy(enemy.mesh.position).sub(camera.position);
        const dist = tmp.length();
        if (dist < 2.2 && state.damageCooldown <= 0) {
          state.hp -= 12;
          state.damageCooldown = 0.55;
          updateHud();
          if (state.hp <= 0) {
            state.hp = 0;
            endMatch(false);
          }
        }
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  resize();
  resetMatch();
  setOverlay('Ready up', 'Click the arena to start. Survive ninety seconds.');
  updateHud();

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  ui.startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startFromButton();
  });

  requestAnimationFrame(tick);

  return {
    dispose() {
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      renderer.dispose();
    },
  };
}

function buildArena() {
  const group = new THREE.Group();
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xb7ae9f,
    roughness: 0.95,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x3a342c,
    roughness: 0.85,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xff4a12,
    emissive: 0x401000,
    roughness: 0.5,
  });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const grid = new THREE.GridHelper(40, 20, 0x6a6256, 0x8a8174);
  grid.position.y = 0.01;
  group.add(grid);

  const wallGeo = new THREE.BoxGeometry(1, 4, 1);
  const layout = [
    [-10, 2, -6, 8, 4, 1],
    [8, 2, -4, 1, 4, 10],
    [-4, 2, 8, 12, 4, 1],
    [12, 2, 6, 1, 4, 8],
    [0, 2, -12, 14, 4, 1],
    [-14, 2, 0, 1, 4, 16],
    [14, 2, -2, 1, 4, 12],
  ];

  for (const [x, y, z, sx, sy, sz] of layout) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (let i = 0; i < 10; i++) {
    const pillar = new THREE.Mesh(wallGeo, i % 2 ? trimMat : wallMat);
    pillar.position.set((i - 4.5) * 3.2, 2, ((i % 3) - 1) * 7);
    pillar.scale.set(1.2, 1, 1.2);
    pillar.castShadow = true;
    group.add(pillar);
  }

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x5c5042, roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), crateMat);
    crate.position.set((i % 3) * 5 - 5, 0.7, Math.floor(i / 3) * 8 - 4);
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);
  }

  return { group };
}

function buildGun() {
  const gun = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.16, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x1a1815, metalness: 0.4, roughness: 0.45 }),
  );
  body.position.set(0.22, -0.22, -0.55);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.04, 0.45, 10),
    new THREE.MeshStandardMaterial({ color: 0x2f2b26, metalness: 0.6, roughness: 0.35 }),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.22, -0.18, -0.95);
  const mag = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.22, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xff4a12 }),
  );
  mag.position.set(0.22, -0.34, -0.45);
  gun.add(body, barrel, mag);
  return gun;
}

function spawnEnemy(scene, bodyMat, accentMat, index) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 4, 8), bodyMat);
  mesh.castShadow = true;
  const accent = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), accentMat);
  const enemy = {
    mesh,
    accent,
    alive: true,
    hp: 100,
    home: new THREE.Vector3(),
    radius: 2 + (index % 3),
    speed: 0.7 + (index % 4) * 0.2,
    t: index,
  };
  resetEnemy(enemy, index);
  scene.add(mesh, accent);
  return enemy;
}

function resetEnemy(enemy, index) {
  const angle = (index / ENEMY_COUNT) * Math.PI * 2;
  enemy.home.set(Math.cos(angle) * 10, 1.1, Math.sin(angle) * 10 - 2);
  enemy.mesh.position.copy(enemy.home);
  enemy.accent.position.set(enemy.home.x, 1.55, enemy.home.z);
  enemy.alive = true;
  enemy.hp = 100;
  enemy.mesh.visible = true;
  enemy.accent.visible = true;
  enemy.t = Math.random() * Math.PI * 2;
}
