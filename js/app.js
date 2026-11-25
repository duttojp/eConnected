/**
 * App.js - Contrôleur principal de l'application eConnected Web
 * Orchestration du pilote BLE, de la simulation, de l'enregistreur et de l'interface
 */

import { DomyosBLE } from './bluetooth/domyos-ble.js?v=20261124d';
import { DomyosSimulator } from './bluetooth/domyos-simulator.js';
import { SessionRecorder } from './recorder/session-recorder.js';
import { TCXGenerator } from './utils/tcx-generator.js';

class App {
  constructor() {
    this.ble = new DomyosBLE();
    this.sim = new DomyosSimulator();
    this.activeDevice = null;

    this.recorder = new SessionRecorder();
    this.lastCompletedSession = null;

    this.googleFitConnected = false;

    // Éléments DOM
    this.dom = {
      // Badges
      badgeBle: document.getElementById('badge-ble'),
      badgeBleText: document.getElementById('badge-ble-text'),
      badgeFit: document.getElementById('badge-fit'),
      badgeFitText: document.getElementById('badge-fit-text'),

      // Boutons Header
      btnConnectBle: document.getElementById('btn-connect-ble'),
      btnSimulate: document.getElementById('btn-simulate'),
      btnHistory: document.getElementById('btn-history'),
      btnSettings: document.getElementById('btn-settings'),

      // Chrono & Contrôles
      timerValue: document.getElementById('timer-value'),
      btnSessionStart: document.getElementById('btn-session-start'),
      btnSessionPause: document.getElementById('btn-session-pause'),
      btnSessionStop: document.getElementById('btn-session-stop'),

      // Métriques primaires
      valSpeed: document.getElementById('val-speed'),
      valCadence: document.getElementById('val-cadence'),
      valWatts: document.getElementById('val-watts'),

      // Métriques secondaires
      valDistance: document.getElementById('val-distance'),
      valCalories: document.getElementById('val-calories'),
      valHeartRate: document.getElementById('val-heartrate'),

      // Résistance
      valResistance: document.getElementById('val-resistance'),
      btnResistDown: document.getElementById('btn-resist-down'),
      btnResistUp: document.getElementById('btn-resist-up'),
      presetChips: document.querySelectorAll('.preset-chip'),

      // Modal Résumé
      modalSummary: document.getElementById('modal-summary'),
      btnCloseSummary: document.getElementById('btn-close-summary'),
      sumDuration: document.getElementById('sum-duration'),
      sumDistance: document.getElementById('sum-distance'),
      sumCalories: document.getElementById('sum-calories'),
      sumAvgSpeed: document.getElementById('sum-avg-speed'),
      sumAvgCadence: document.getElementById('sum-avg-cadence'),
      sumAvgWatts: document.getElementById('sum-avg-watts'),
      btnSyncGoogleFit: document.getElementById('btn-sync-google-fit'),
      btnDownloadTcx: document.getElementById('btn-download-tcx'),
      btnNewSession: document.getElementById('btn-new-session'),
      syncStatusBox: document.getElementById('sync-status-box'),

      // Modal Historique
      modalHistory: document.getElementById('modal-history'),
      btnCloseHistory: document.getElementById('btn-close-history'),
      historyListContainer: document.getElementById('history-list-container'),

      // Console Débogage BLE
      btnLogs: document.getElementById('btn-logs'),
      debugLogPanel: document.getElementById('debug-log-panel'),
      debugLogContent: document.getElementById('debug-log-content'),
      btnClearLogs: document.getElementById('btn-clear-logs'),

      // Toasts
      toastContainer: document.getElementById('toast-container')
    };

    this.init();
  }

  async init() {
    this.setupEvents();
    this.setupRecorder();
    this.checkGoogleFitStatus();

    // Vérifier les paramètres d'URL (redirection OAuth Google)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('fit_auth') === 'success') {
      this.showToast('✅ Authentification Google Fit réussie !');
      window.history.replaceState({}, document.title, window.location.pathname);
      this.checkGoogleFitStatus();
    } else if (urlParams.get('fit_error')) {
      this.showToast('❌ Erreur Google Fit : ' + urlParams.get('fit_error'));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  setupEvents() {
    // Connexion Bluetooth
    this.dom.btnConnectBle.addEventListener('click', () => this.toggleBluetooth());

    // Simulation
    this.dom.btnSimulate.addEventListener('click', () => this.toggleSimulation());

    // Contrôles de session
    this.dom.btnSessionStart.addEventListener('click', () => this.startSession());
    this.dom.btnSessionPause.addEventListener('click', () => this.pauseSession());
    this.dom.btnSessionStop.addEventListener('click', () => this.stopSession());

    // Contrôles de résistance
    this.dom.btnResistDown.addEventListener('click', () => this.changeResistance(-1));
    this.dom.btnResistUp.addEventListener('click', () => this.changeResistance(1));
    this.dom.presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const level = parseInt(chip.dataset.level, 10);
        this.setResistance(level);
      });
    });

    // Badge Google Fit (clic pour se connecter/déconnecter)
    this.dom.badgeFit.addEventListener('click', () => {
      if (!this.googleFitConnected) {
        window.location.href = 'api/oauth_login.php';
      } else {
        if (confirm("Voulez-vous vous déconnecter de Google Fit ?")) {
          fetch('api/oauth_status.php?action=logout')
            .then(() => this.checkGoogleFitStatus());
        }
      }
    });

    // Modals
    this.dom.btnCloseSummary.addEventListener('click', () => this.closeSummaryModal());
    this.dom.btnNewSession.addEventListener('click', () => {
      this.closeSummaryModal();
      this.recorder.reset();
    });

    this.dom.btnSyncGoogleFit.addEventListener('click', () => this.syncToGoogleFit());
    this.dom.btnDownloadTcx.addEventListener('click', () => {
      if (this.lastCompletedSession) {
        const filename = TCXGenerator.download(this.lastCompletedSession);
        this.showToast(`📥 Fichier ${filename} téléchargé !`);
      }
    });

    // Historique
    this.dom.btnHistory.addEventListener('click', () => this.openHistoryModal());
    this.dom.btnCloseHistory.addEventListener('click', () => this.closeHistoryModal());

    // Console Débogage BLE
    if (this.dom.btnLogs) {
      this.dom.btnLogs.addEventListener('click', () => {
        const isHidden = this.dom.debugLogPanel.style.display === 'none';
        this.dom.debugLogPanel.style.display = isHidden ? 'flex' : 'none';
      });
    }
    if (this.dom.btnClearLogs) {
      this.dom.btnClearLogs.addEventListener('click', () => {
        this.dom.debugLogContent.innerHTML = '';
      });
    }
  }

  setupRecorder() {
    this.recorder.on('tick', (data) => {
      this.dom.timerValue.textContent = data.formattedTime;
      // Met à jour le temps de séance sur le vélo Domyos pour l'écran LCD
      this.ble.setWorkoutTime(data.elapsedSeconds);
    });

    this.recorder.on('stateChanged', (status) => {
      if (status === 'recording') {
        this.dom.btnSessionStart.style.display = 'none';
        this.dom.btnSessionPause.style.display = 'inline-flex';
        this.dom.btnSessionStop.style.display = 'inline-flex';
        this.dom.btnSessionPause.textContent = '⏸ Pause';
      } else if (status === 'paused') {
        this.dom.btnSessionPause.textContent = '▶ Reprendre';
      } else if (status === 'idle' || status === 'completed') {
        this.dom.btnSessionStart.style.display = 'inline-flex';
        this.dom.btnSessionPause.style.display = 'none';
        this.dom.btnSessionStop.style.display = 'none';
        if (status === 'idle') {
          this.dom.timerValue.textContent = '00:00';
        }
      }
    });
  }

  async checkGoogleFitStatus() {
    try {
      const res = await fetch('api/oauth_status.php');
      const data = await res.json();
      this.googleFitConnected = data.connected;

      if (data.connected) {
        this.dom.badgeFit.className = 'status-badge connected';
        this.dom.badgeFitText.textContent = 'Google Fit : Connecté';
      } else {
        this.dom.badgeFit.className = 'status-badge';
        this.dom.badgeFitText.textContent = 'Google Fit : Non connecté';
      }
    } catch (e) {
      console.warn('Impossible de vérifier le statut Google Fit:', e);
    }
  }

  async toggleBluetooth() {
    if (this.activeDevice === this.ble && this.ble.isConnected) {
      this.ble.disconnect();
      return;
    }

    if (this.activeDevice === this.sim && this.sim.isConnected) {
      this.sim.disconnect();
    }

    this.dom.badgeBle.className = 'status-badge scanning';
    this.dom.badgeBleText.textContent = 'Recherche Bluetooth...';

    // Liaison des événements BLE
    this.ble.on('status', (msg) => this.showToast(msg));
    this.ble.on('log', (msg) => this.addDebugLog(msg));
    this.ble.on('data', (metrics) => this.handleMetrics(metrics));

    this.ble.on('connected', (info) => {
      this.activeDevice = this.ble;
      this.dom.badgeBle.className = 'status-badge connected';
      this.dom.badgeBleText.textContent = `Connecté : ${info.name}`;
      this.dom.btnConnectBle.textContent = 'Déconnecter';
      this.showToast(`🚴 Connecté au ${info.name} !`);
    });

    this.ble.on('disconnected', () => {
      this.activeDevice = null;
      this.dom.badgeBle.className = 'status-badge';
      this.dom.badgeBleText.textContent = 'Bluetooth : Déconnecté';
      this.dom.btnConnectBle.textContent = 'Connecter Vélo';
      this.showToast('Vélo déconnecté');
    });

    this.ble.on('error', (err) => {
      this.dom.badgeBle.className = 'status-badge';
      this.dom.badgeBleText.textContent = 'Erreur Bluetooth';
      this.showToast('Erreur : ' + err.message);
    });

    try {
      await this.ble.connect();
    } catch (_) {
      // Erreur déjà traitée dans le callback error
    }
  }

  async toggleSimulation() {
    if (this.activeDevice === this.sim && this.sim.isConnected) {
      this.sim.disconnect();
      return;
    }

    if (this.activeDevice === this.ble && this.ble.isConnected) {
      this.ble.disconnect();
    }

    this.sim.on('data', (metrics) => this.handleMetrics(metrics));
    this.sim.on('connected', (info) => {
      this.activeDevice = this.sim;
      this.dom.badgeBle.className = 'status-badge connected';
      this.dom.badgeBleText.textContent = info.name;
      this.dom.btnSimulate.textContent = 'Arrêter Simulation';
      this.showToast('Simulation démarrée');
    });

    this.sim.on('disconnected', () => {
      this.activeDevice = null;
      this.dom.badgeBle.className = 'status-badge';
      this.dom.badgeBleText.textContent = 'Bluetooth : Déconnecté';
      this.dom.btnSimulate.textContent = 'Simulateur';
      this.showToast('Simulation arrêtée');
    });

    await this.sim.connect();
  }

  handleMetrics(m) {
    // Mise à jour de l'enregistreur
    this.recorder.feedData(m);

    // Mise à jour de l'affichage
    this.dom.valSpeed.textContent = m.speed.toFixed(1);
    this.dom.valCadence.textContent = m.cadence;
    this.dom.valWatts.textContent = m.watts;

    this.dom.valDistance.textContent = m.distance.toFixed(2);
    this.dom.valCalories.textContent = m.calories;
    this.dom.valHeartRate.textContent = m.heartRate > 0 ? m.heartRate : '--';

    this.dom.valResistance.textContent = m.resistance;

    // Mise à jour visuelle des puces de résistance
    this.dom.presetChips.forEach(chip => {
      const lvl = parseInt(chip.dataset.level, 10);
      chip.classList.toggle('active', lvl === m.resistance);
    });
  }

  async changeResistance(delta) {
    const cur = parseInt(this.dom.valResistance.textContent, 10) || 1;
    const next = Math.max(1, Math.min(15, cur + delta));
    await this.setResistance(next);
  }

  async setResistance(level) {
    if (this.activeDevice && typeof this.activeDevice.setResistance === 'function') {
      const res = await this.activeDevice.setResistance(level);
      this.dom.valResistance.textContent = res;
    } else {
      this.dom.valResistance.textContent = level;
      this.showToast('Vélo non connecté');
    }
  }

  startSession() {
    this.recorder.start();
    this.showToast('⏱ Séance démarrée ! Bon entraînement.');
  }

  pauseSession() {
    if (this.recorder.status === 'recording') {
      this.recorder.pause();
      this.showToast('Séance en pause');
    } else if (this.recorder.status === 'paused') {
      this.recorder.resume();
      this.showToast('Séance reprise');
    }
  }

  stopSession() {
    if (this.recorder.elapsedSeconds < 5) {
      if (!confirm("La séance fait moins de 5 secondes. Voulez-vous vraiment la terminer ?")) {
        return;
      }
    }

    const sessionData = this.recorder.stop();
    this.lastCompletedSession = sessionData;

    // Sauvegarde automatique sur le serveur OVH
    this.saveSessionToServer(sessionData);

    // Affichage de la modal résumé
    this.openSummaryModal(sessionData);
  }

  openSummaryModal(session) {
    const s = session.stats;
    this.dom.sumDuration.textContent = this.recorder.formatTime(session.elapsedSeconds);
    this.dom.sumDistance.textContent = (s.totalDistanceMeters / 1000.0).toFixed(2) + ' km';
    this.dom.sumCalories.textContent = s.totalCalories + ' kcal';
    this.dom.sumAvgSpeed.textContent = s.avgSpeedKmH + ' km/h';
    this.dom.sumAvgCadence.textContent = s.avgCadence + ' RPM';
    this.dom.sumAvgWatts.textContent = s.avgWatts + ' W';

    this.dom.syncStatusBox.className = 'sync-status-box';
    this.dom.syncStatusBox.style.display = 'none';

    this.dom.modalSummary.classList.add('active');
  }

  closeSummaryModal() {
    this.dom.modalSummary.classList.remove('active');
  }

  async syncToGoogleFit() {
    if (!this.lastCompletedSession) return;

    if (!this.googleFitConnected) {
      if (confirm("Vous n'êtes pas encore connecté à Google Fit. Voulez-vous vous authentifier maintenant ?")) {
        window.location.href = 'api/oauth_login.php';
      }
      return;
    }

    this.dom.syncStatusBox.className = 'sync-status-box';
    this.dom.syncStatusBox.style.display = 'block';
    this.dom.syncStatusBox.textContent = '⏳ Envoi de la séance vers Google Fit en cours...';

    try {
      const res = await fetch('api/fit_sync.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.lastCompletedSession)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        this.dom.syncStatusBox.className = 'sync-status-box success';
        this.dom.syncStatusBox.textContent = '🎉 ' + data.message;
        this.showToast('✅ Synchronisé avec Google Fit !');
      } else {
        this.dom.syncStatusBox.className = 'sync-status-box error';
        this.dom.syncStatusBox.textContent = '❌ Erreur : ' + (data.error || 'Échec de synchronisation');
      }
    } catch (e) {
      this.dom.syncStatusBox.className = 'sync-status-box error';
      this.dom.syncStatusBox.textContent = '❌ Erreur réseau lors de la synchronisation.';
    }
  }

  async saveSessionToServer(session) {
    try {
      await fetch('api/sessions.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
      });
    } catch (e) {
      console.warn('Impossible de sauvegarder la séance sur le serveur:', e);
    }
  }

  async openHistoryModal() {
    this.dom.historyListContainer.innerHTML = '<p style="color:var(--text-muted);">Chargement de l\'historique...</p>';
    this.dom.modalHistory.classList.add('active');

    try {
      const res = await fetch('api/sessions.php');
      const data = await res.json();
      const sessions = data.sessions || [];

      if (sessions.length === 0) {
        this.dom.historyListContainer.innerHTML = '<p style="color:var(--text-muted); padding:16px 0;">Aucune séance enregistrée pour le moment.</p>';
        return;
      }

      let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
      for (const s of sessions) {
        const date = new Date(s.startTime).toLocaleDateString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const dist = ((s.stats.totalDistanceMeters || 0) / 1000.0).toFixed(2);
        const time = this.recorder.formatTime(s.elapsedSeconds || 0);

        html += `
          <div style="background:var(--bg-dark); padding:12px; border-radius:8px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>${date}</strong>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                ⏱ ${time} &nbsp;|&nbsp; 🚴 ${dist} km &nbsp;|&nbsp; 🔥 ${s.stats.totalCalories || 0} kcal &nbsp;|&nbsp; ⚡ ${s.stats.avgWatts || 0} W
              </div>
            </div>
          </div>`;
      }
      html += '</div>';
      this.dom.historyListContainer.innerHTML = html;

    } catch (e) {
      this.dom.historyListContainer.innerHTML = '<p style="color:var(--accent-red);">Erreur lors du chargement de l\'historique.</p>';
    }
  }

  closeHistoryModal() {
    this.dom.modalHistory.classList.remove('active');
  }

  addDebugLog(message) {
    if (!this.dom.debugLogContent) return;
    const line = document.createElement('div');
    line.className = 'debug-log-line';
    line.textContent = message;
    this.dom.debugLogContent.appendChild(line);
    this.dom.debugLogContent.scrollTop = this.dom.debugLogContent.scrollHeight;
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

// Initialisation dès chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
