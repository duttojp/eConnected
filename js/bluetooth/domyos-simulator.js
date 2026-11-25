/**
 * DomyosSimulator - Simulateur de Domyos Bike 500 pour test et développement
 * Même interface d'événements et méthodes que DomyosBLE
 */

export class DomyosSimulator {
  constructor() {
    this.isConnected = false;
    this.intervalId = null;

    this.metrics = {
      speed: 0,
      cadence: 0,
      distance: 0,
      calories: 0,
      resistance: 6,
      heartRate: 130,
      watts: 0,
      timestamp: null
    };

    this.listeners = {
      data: [],
      connected: [],
      disconnected: [],
      error: [],
      status: []
    };
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Erreur simulateur [${event}]:`, e);
        }
      });
    }
  }

  async connect() {
    this.emit('status', 'Démarrage du simulateur Domyos Bike 500...');
    await new Promise(r => setTimeout(r, 600));

    this.isConnected = true;
    this.emit('connected', {
      name: 'Domyos Bike 500 [SIMULATION]',
      mode: 'simulation'
    });

    let currentCadence = 75;
    let totalSeconds = 0;

    this.intervalId = setInterval(() => {
      if (!this.isConnected) return;
      totalSeconds++;

      // Légère variation naturelle du pédalage
      const jitter = (Math.random() - 0.48) * 3;
      currentCadence = Math.max(50, Math.min(105, currentCadence + jitter));

      // Calcul de la vitesse selon la cadence et résistance
      const speed = (currentCadence * 0.35) + (this.metrics.resistance * 0.4);

      // Calcul des Watts
      const baseW = 18 + (this.metrics.resistance * 12.5);
      const rpmFactor = Math.pow(currentCadence / 60.0, 1.35);
      const watts = Math.round(baseW * rpmFactor);

      // Incrément de distance (km parcourus en 1 seconde)
      const distIncrement = (speed / 3600.0);
      this.metrics.distance = Number((this.metrics.distance + distIncrement).toFixed(3));

      // Incrément de calories (estimation kJ / 4.184)
      const calIncrement = (watts * 1.0) / (4184 * 0.24); // efficacité cycliste ~24%
      this.metrics.calories = Number((this.metrics.calories + calIncrement).toFixed(1));

      // Fréquence cardiaque simulée
      const targetHr = 115 + (this.metrics.resistance * 3.5) + ((currentCadence - 60) * 0.5);
      this.metrics.heartRate = Math.round(targetHr + (Math.random() * 4 - 2));

      this.metrics.speed = Number(speed.toFixed(1));
      this.metrics.cadence = Math.round(currentCadence);
      this.metrics.watts = Math.max(0, watts);
      this.metrics.timestamp = Date.now();

      this.emit('data', { ...this.metrics });
    }, 1000);

    return true;
  }

  async setResistance(targetResistance) {
    const level = Math.max(1, Math.min(15, Math.round(targetResistance)));
    this.metrics.resistance = level;
    console.log(`[Simulateur] Résistance modifiée: ${level}`);
    return level;
  }

  disconnect() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isConnected = false;
    this.emit('disconnected', 'Simulateur arrêté');
  }
}
