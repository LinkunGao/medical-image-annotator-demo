<template>
  <Transition name="modal-fly" :duration="{ enter: 600, leave: 1500 }">
    <div v-if="show" class="health-overlay">
      <div class="health-modal premium-glass">
        
        <!-- Annotation Scene -->
        <div class="annotation-scene">
          
          <!-- Holographic medical screen on the LEFT -->
          <div class="hologram-screen-wrapper">
            <div class="hologram-screen">
              <div class="medical-scan">
                <div class="organ-shape"></div>
                <div class="grid-overlay"></div>
                <!-- Animated Bounding Box -->
                <div class="bounding-box">
                  <div class="corner-tl"></div>
                  <div class="corner-tr"></div>
                  <div class="corner-bl"></div>
                  <div class="corner-br"></div>
                  <div class="crosshair"></div>
                </div>
              </div>
            </div>
            <div class="projection-beam"></div>
          </div>
          
          <!-- The Original Prototype Image on the RIGHT, completely exposed -->
          <div class="doctor-container">
            <img src="/logo.png" class="doctor-logo" alt="Doctor Annotator" />
          </div>

        </div>

        <div class="health-info">
          <h2 class="health-title">Medical Image Annotator Initialization</h2>
          <div class="health-status">
            <div class="pulse-ring"></div>
            <span>Connecting to Backend...</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill"></div>
          </div>
          <p class="health-attempt">Phase synchronization: Attempt {{ attemptCount }}</p>
        </div>
        
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">

defineProps({
  show: {
    type: Boolean,
    required: true,
    default: true
  },
  attemptCount: {
    type: Number,
    required: true,
    default: 0
  }
});
</script>

<style scoped>
/* Vue Transitions */
.modal-fly-enter-active {
  transition: opacity 0.6s ease;
}
.modal-fly-leave-active {
  transition: opacity 1.5s ease;
}
.modal-fly-enter-from,
.modal-fly-leave-to {
  opacity: 0;
}

/* Modal Inner Fly Animation */
.modal-fly-enter-active .health-modal {
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.modal-fly-leave-active .health-modal {
  transition: all 1.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-fly-enter-from .health-modal {
  transform: scale(0.8) translateY(20px);
}
.modal-fly-leave-to .health-modal {
  transform: scale(0.1) translate(100vw, -100vh); /* Shrinks and sucked to the top right */
}

/* Base styles */
.health-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at center, rgba(15, 23, 42, 0.4) 0%, rgba(2, 6, 23, 0.7) 100%);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.health-modal.premium-glass {
  background: rgba(20, 30, 45, 0.7);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 20px;
  padding: 40px 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  min-width: 480px; 
  box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(56, 189, 248, 0.1) inset;
  position: relative;
  overflow: hidden;
}

.health-modal.premium-glass::before {
  content: '';
  position: absolute;
  top: 0; left: -100%; width: 50%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.05), transparent);
  animation: shine 4s infinite linear;
}

@keyframes shine {
  100% { left: 200%; }
}

/* Annotation Scene Layout */
.annotation-scene {
  display: flex;
  flex-direction: row; /* Ensure Side by side */
  justify-content: center;
  align-items: center;
  gap: 40px; /* Space between hologram and character */
  height: 200px;
  width: 100%;
  position: relative;
  margin-top: 10px;
  z-index: 2;
}

/* Hologram Screen Wrapper on LEFT */
.hologram-screen-wrapper {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: floatHologram 3s infinite ease-in-out alternate-reverse;
}

@keyframes floatHologram {
  0% { transform: translateY(0px) scale(1); }
  100% { transform: translateY(-5px) scale(1.02); }
}

.hologram-screen {
  width: 140px;
  height: 100px;
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.6);
  border-radius: 8px;
  position: relative;
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.4), inset 0 0 15px rgba(56, 189, 248, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  backdrop-filter: blur(2px);
}

.projection-beam {
  width: 100px;
  height: 40px;
  background: linear-gradient(to top, rgba(56, 189, 248, 0) 0%, rgba(56, 189, 248, 0.2) 100%);
  clip-path: polygon(20% 100%, 80% 100%, 100% 0, 0 0);
  opacity: 0.6;
  margin-top: -1px;
}

.hologram-screen::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: rgba(125, 211, 252, 0.9);
  box-shadow: 0 0 10px rgba(125, 211, 252, 1);
  animation: scanline 2s infinite linear;
  z-index: 15;
}

@keyframes scanline {
  0% { transform: translateY(-5px); }
  100% { transform: translateY(105px); }
}

.medical-scan {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.organ-shape {
  width: 70px;
  height: 50px;
  background: radial-gradient(ellipse at center, rgba(56, 189, 248, 0.5) 0%, rgba(14, 165, 233, 0.2) 60%, transparent 100%);
  border-radius: 50% 60% 50% 40% / 40% 50% 60% 50%;
  filter: blur(1px);
}

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image: 
    linear-gradient(rgba(56, 189, 248, 0.2) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 189, 248, 0.2) 1px, transparent 1px);
  background-size: 15px 15px;
  opacity: 0.6;
}

.bounding-box {
  position: absolute;
  border: 1.5px solid #a3e635;
  background: rgba(163, 230, 53, 0.15);
  box-shadow: 0 0 8px rgba(163, 230, 53, 0.6);
  animation: drawBox 3s infinite cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 10;
}

.bounding-box > div:not(.crosshair) {
  position: absolute;
  width: 4px;
  height: 4px;
  background: #a3e635;
  border-radius: 50%;
}
.corner-tl { top: -2px; left: -2px; }
.corner-tr { top: -2px; right: -2px; }
.corner-bl { bottom: -2px; left: -2px; }
.corner-br { bottom: -2px; right: -2px; }

.crosshair {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 8px;
  height: 8px;
  border: 1.5px solid white;
  border-radius: 50%;
  background: #a3e635;
  box-shadow: 0 0 5px white;
  animation: cursorPulse 3s infinite;
}

@keyframes cursorPulse {
  0%, 75% { opacity: 1; transform: scale(1); }
  85%, 100% { opacity: 0; transform: scale(1.5); }
}

@keyframes drawBox {
  0%, 10% {
    top: 25px; left: 35px;
    width: 0px; height: 0px;
    opacity: 0;
  }
  15% {
    opacity: 1;
    top: 25px; left: 35px;
    width: 0px; height: 0px;
  }
  50%, 75% {
    top: 25px; left: 35px;
    width: 60px; height: 45px;
    opacity: 1;
  }
  85%, 100% {
    top: 25px; left: 35px;
    width: 60px; height: 45px;
    opacity: 0;
  }
}

/* Original Doctor Image on RIGHT */
.doctor-container {
  position: relative;
  height: 100%;
  display: flex;
  align-items: flex-end;
  /* Make her breathe/float to add some dynamic life */
  animation: breatheDoctor 4s infinite ease-in-out alternate;
}

@keyframes breatheDoctor {
  0% { transform: translateY(0px) scale(1); }
  100% { transform: translateY(-5px) scale(1.02); }
}

.doctor-logo {
  height: 200px;
  width: auto;
  filter: drop-shadow(0 10px 15px rgba(0, 0, 0, 0.4));
  z-index: 5;
}

/* Info Section Styles */
.health-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.health-title {
  margin: 0;
  color: #f8fafc;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 2px 10px rgba(56, 189, 248, 0.2);
}

.health-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #cbd5e1;
  font-size: 14px;
  font-weight: 500;
}

.pulse-ring {
  width: 8px;
  height: 8px;
  background-color: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  animation: pulsing 1.5s infinite cubic-bezier(0.66, 0, 0, 1);
}

@keyframes pulsing {
  to { box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); }
}

.progress-track {
  width: 100%;
  height: 4px;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  overflow: hidden;
  margin: 4px 0;
  position: relative;
}

.progress-fill {
  height: 100%;
  width: 30%;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  border-radius: 10px;
  animation: progressPulse 2s infinite ease-in-out;
}

@keyframes progressPulse {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(100%); }
  100% { transform: translateX(300%); }
}

.health-attempt {
  margin: 0;
  color: #64748b;
  font-size: 11px;
  letter-spacing: 0.5px;
  font-family: monospace;
}
</style>
