<?php
/**
 * eConnected Web - Alternative pour Domyos Bike 500
 * Application Web Bluetooth & Synchronisation Google Fit
 */
require_once __DIR__ . '/api/config.php';
?>
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Domyos Connect | eConnected Web</title>
  <meta name="description" content="Connectez votre vélo Domyos Bike 500 en Bluetooth et synchronisez vos séances d'entraînement vers Google Fit.">
  <meta name="theme-color" content="#0f172a">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>

  <div class="app-container">

    <!-- Header & Statuts -->
    <header>
      <div class="logo-section">
        <div class="logo-icon">🚴</div>
        <div class="logo-title">
          <h1>Domyos Connect</h1>
          <span>Alternative eConnected & Google Fit</span>
        </div>
      </div>

      <div class="badges-group">
        <div id="badge-ble" class="status-badge" title="État de la connexion Bluetooth avec le vélo">
          <span class="dot"></span>
          <span id="badge-ble-text">Bluetooth : Déconnecté</span>
        </div>

        <div id="badge-fit" class="status-badge" style="cursor: pointer;" title="Cliquez pour vous connecter ou déconnecter de Google Fit">
          <span class="dot"></span>
          <span id="badge-fit-text">Google Fit : Vérification...</span>
        </div>
      </div>

      <div class="header-actions">
        <button id="btn-connect-ble" class="btn btn-primary" title="Connecter le vélo en Web Bluetooth">
          Connecter Vélo
        </button>
        <button id="btn-simulate" class="btn btn-outline" title="Tester l'application sans vélo physique">
          Simulateur
        </button>
        <button id="btn-history" class="btn btn-outline btn-icon" title="Historique des séances">
          📊
        </button>
        <button id="btn-logs" class="btn btn-outline btn-icon" title="Afficher/Masquer les logs Bluetooth">
          📟
        </button>
      </div>
    </header>

    <!-- Console de Débogage Bluetooth (repliable) -->
    <div id="debug-log-panel" class="debug-log-panel" style="display: none;">
      <div class="debug-log-header">
        <span style="font-size:0.85rem; font-weight:600; color:var(--primary);">📟 Console de communication Bluetooth</span>
        <button id="btn-clear-logs" class="btn btn-outline" style="padding:3px 8px; font-size:0.75rem;">Effacer</button>
      </div>
      <div id="debug-log-content" class="debug-log-content">
        <em>Les échanges Bluetooth s'afficheront ici en temps réel...</em>
      </div>
    </div>

    <!-- Bandeau Chronomètre & Contrôle Séance -->
    <div class="timer-banner">
      <div class="timer-display">
        <span class="timer-label">Durée</span>
        <span id="timer-value" class="timer-value">00:00</span>
      </div>

      <div class="session-controls">
        <button id="btn-session-start" class="btn btn-green">
          ▶ Démarrer la séance
        </button>
        <button id="btn-session-pause" class="btn btn-warning" style="display: none;">
          ⏸ Pause
        </button>
        <button id="btn-session-stop" class="btn btn-danger" style="display: none;">
          ⏹ Terminer
        </button>
      </div>
    </div>

    <!-- Métriques Clés Primaires (Vitesse, Cadence, Watts) -->
    <div class="metrics-grid-primary">
      <!-- Vitesse -->
      <div class="metric-card speed">
        <div class="metric-card-header">
          <span>Vitesse</span>
          <span class="metric-unit">km/h</span>
        </div>
        <div id="val-speed" class="metric-value-large">0.0</div>
      </div>

      <!-- Cadence -->
      <div class="metric-card cadence">
        <div class="metric-card-header">
          <span>Cadence</span>
          <span class="metric-unit">RPM</span>
        </div>
        <div id="val-cadence" class="metric-value-large">0</div>
      </div>

      <!-- Puissance (Watts) -->
      <div class="metric-card watts">
        <div class="metric-card-header">
          <span>Puissance</span>
          <span class="metric-unit">Watts</span>
        </div>
        <div id="val-watts" class="metric-value-large">0</div>
      </div>
    </div>

    <!-- Métriques Secondaires (Distance, Calories, Cardio) -->
    <div class="metrics-grid-secondary">
      <div class="small-card">
        <div class="small-card-icon">📍</div>
        <div class="small-card-info">
          <h4>Distance</h4>
          <div class="small-card-value"><span id="val-distance">0.00</span> <small style="font-size:0.9rem; color:var(--text-muted)">km</small></div>
        </div>
      </div>

      <div class="small-card">
        <div class="small-card-icon">🔥</div>
        <div class="small-card-info">
          <h4>Calories</h4>
          <div class="small-card-value"><span id="val-calories">0</span> <small style="font-size:0.9rem; color:var(--text-muted)">kcal</small></div>
        </div>
      </div>

      <div class="small-card">
        <div class="small-card-icon">❤️</div>
        <div class="small-card-info">
          <h4>Cardio</h4>
          <div class="small-card-value"><span id="val-heartrate">--</span> <small style="font-size:0.9rem; color:var(--text-muted)">BPM</small></div>
        </div>
      </div>
    </div>

    <!-- Contrôle Interactif de la Résistance Domyos Bike 500 -->
    <div class="resistance-panel">
      <div class="resistance-header">
        <h3>⚡ Résistance Magnétique</h3>
        <span style="font-size:0.85rem; color:var(--text-muted)">Commande moteur console Domyos</span>
      </div>

      <div class="resistance-control-row">
        <button id="btn-resist-down" class="btn-resistance" title="Diminuer la résistance">−</button>
        <div class="resistance-display">
          <span id="val-resistance" class="resistance-number">1</span>
          <span class="resistance-scale">Niveau (1 à 15)</span>
        </div>
        <button id="btn-resist-up" class="btn-resistance" title="Augmenter la résistance">+</button>
      </div>

      <div class="resistance-presets">
        <span style="align-self:center; font-size:0.8rem; color:var(--text-muted); margin-right:4px;">Raccourcis :</span>
        <button class="preset-chip active" data-level="1">1 (Échauffement)</button>
        <button class="preset-chip" data-level="4">4 (Plat)</button>
        <button class="preset-chip" data-level="7">7 (Rythme)</button>
        <button class="preset-chip" data-level="10">10 (Côte)</button>
        <button class="preset-chip" data-level="13">13 (Col)</button>
        <button class="preset-chip" data-level="15">15 (Max)</button>
      </div>
    </div>

  </div>

  <!-- Modal Résumé de fin de séance -->
  <div id="modal-summary" class="modal-overlay">
    <div class="modal-box">
      <div class="modal-header">
        <h2>🎉 Séance Terminée !</h2>
        <button id="btn-close-summary" class="btn-close">&times;</button>
      </div>

      <p style="color:var(--text-muted); font-size:0.9rem;">
        Voici le récapitulatif de votre entraînement sur le Domyos Bike 500 :
      </p>

      <div class="summary-stats-grid">
        <div class="summary-stat-item">
          <span>Durée</span>
          <strong id="sum-duration">00:00</strong>
        </div>
        <div class="summary-stat-item">
          <span>Distance</span>
          <strong id="sum-distance">0.00 km</strong>
        </div>
        <div class="summary-stat-item">
          <span>Calories</span>
          <strong id="sum-calories">0 kcal</strong>
        </div>
        <div class="summary-stat-item">
          <span>Vitesse Moy.</span>
          <strong id="sum-avg-speed">0.0 km/h</strong>
        </div>
        <div class="summary-stat-item">
          <span>Cadence Moy.</span>
          <strong id="sum-avg-cadence">0 RPM</strong>
        </div>
        <div class="summary-stat-item">
          <span>Puissance Moy.</span>
          <strong id="sum-avg-watts">0 W</strong>
        </div>
      </div>

      <div id="sync-status-box" class="sync-status-box"></div>

      <div class="modal-footer">
        <button id="btn-sync-google-fit" class="btn btn-green">
          ☁️ Envoyer vers Google Fit
        </button>
        <button id="btn-download-tcx" class="btn btn-primary">
          📥 Télécharger fichier TCX (Strava / Garmin)
        </button>
        <button id="btn-new-session" class="btn btn-outline">
          Nouvelle séance
        </button>
      </div>
    </div>
  </div>

  <!-- Modal Historique des séances -->
  <div id="modal-history" class="modal-overlay">
    <div class="modal-box">
      <div class="modal-header">
        <h2>📊 Historique des Séances</h2>
        <button id="btn-close-history" class="btn-close">&times;</button>
      </div>
      <div id="history-list-container" style="max-height: 380px; overflow-y: auto;">
        <!-- Chargé dynamiquement -->
      </div>
    </div>
  </div>

  <!-- Toasts de notification -->
  <div id="toast-container" class="toast-container"></div>

  <!-- Script ES6 Principal -->
  <script type="module" src="js/app.js?v=20261124d"></script>
</body>
</html>
