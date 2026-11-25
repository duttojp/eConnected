/**
 * SessionRecorder - Enregistreur de séance de cyclisme d'intérieur
 * Capture échantillonnée de la télémétrie, calcul des statistiques globales
 */

export class SessionRecorder {
  constructor() {
    this.status = 'idle'; // 'idle', 'recording', 'paused', 'completed'
    this.startTime = null;
    this.endTime = null;
    this.elapsedSeconds = 0;
    this.timerInterval = null;

    // Échantillons chronologiques
    this.samples = [];

    // Dernier état de métrique reçu du vélo
    this.currentData = null;

    // Statistiques agrégées
    this.stats = {
      totalTimeSeconds: 0,
      totalDistanceMeters: 0,
      totalCalories: 0,
      avgSpeedKmH: 0,
      maxSpeedKmH: 0,
      avgCadence: 0,
      maxCadence: 0,
      avgWatts: 0,
      maxWatts: 0,
      avgHeartRate: 0,
      maxHeartRate: 0
    };

    this.listeners = {
      tick: [],
      stateChanged: []
    };
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  feedData(metrics) {
    this.currentData = metrics;
  }

  start() {
    if (this.status === 'recording') return;

    this.status = 'recording';
    this.startTime = new Date();
    this.samples = [];
    this.elapsedSeconds = 0;

    this.startTimer();
    this.emit('stateChanged', this.status);
  }

  pause() {
    if (this.status !== 'recording') return;
    this.status = 'paused';
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.emit('stateChanged', this.status);
  }

  resume() {
    if (this.status !== 'paused') return;
    this.status = 'recording';
    this.startTimer();
    this.emit('stateChanged', this.status);
  }

  stop() {
    if (this.status === 'idle') return null;

    this.status = 'completed';
    this.endTime = new Date();

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.computeFinalStats();
    this.emit('stateChanged', this.status);

    return this.exportSessionData();
  }

  reset() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.status = 'idle';
    this.startTime = null;
    this.endTime = null;
    this.elapsedSeconds = 0;
    this.samples = [];
    this.stats = {
      totalTimeSeconds: 0,
      totalDistanceMeters: 0,
      totalCalories: 0,
      avgSpeedKmH: 0,
      maxSpeedKmH: 0,
      avgCadence: 0,
      maxCadence: 0,
      avgWatts: 0,
      maxWatts: 0,
      avgHeartRate: 0,
      maxHeartRate: 0
    };
    this.emit('stateChanged', this.status);
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;

      // Échantillonnage à la seconde
      const sample = {
        timeOffset: this.elapsedSeconds,
        timestamp: new Date().toISOString(),
        speed: this.currentData ? this.currentData.speed : 0,
        cadence: this.currentData ? this.currentData.cadence : 0,
        watts: this.currentData ? this.currentData.watts : 0,
        distanceMeters: this.currentData ? Math.round(this.currentData.distance * 1000) : 0,
        calories: this.currentData ? this.currentData.calories : 0,
        resistance: this.currentData ? this.currentData.resistance : 1,
        heartRate: this.currentData ? this.currentData.heartRate : 0
      };

      this.samples.push(sample);
      this.computeIntermediaryStats();

      this.emit('tick', {
        elapsedSeconds: this.elapsedSeconds,
        formattedTime: this.formatTime(this.elapsedSeconds),
        sample,
        stats: this.stats
      });
    }, 1000);
  }

  computeIntermediaryStats() {
    if (this.samples.length === 0) return;

    let sumSpeed = 0;
    let sumCadence = 0;
    let sumWatts = 0;
    let sumHr = 0;
    let countHr = 0;
    let maxSpeed = 0;
    let maxCadence = 0;
    let maxWatts = 0;
    let maxHr = 0;

    for (const s of this.samples) {
      sumSpeed += s.speed;
      sumCadence += s.cadence;
      sumWatts += s.watts;

      if (s.speed > maxSpeed) maxSpeed = s.speed;
      if (s.cadence > maxCadence) maxCadence = s.cadence;
      if (s.watts > maxWatts) maxWatts = s.watts;

      if (s.heartRate > 0) {
        sumHr += s.heartRate;
        countHr++;
        if (s.heartRate > maxHr) maxHr = s.heartRate;
      }
    }

    const n = this.samples.length;
    const last = this.samples[n - 1];

    this.stats = {
      totalTimeSeconds: this.elapsedSeconds,
      totalDistanceMeters: last.distanceMeters,
      totalCalories: last.calories,
      avgSpeedKmH: Number((sumSpeed / n).toFixed(1)),
      maxSpeedKmH: Number(maxSpeed.toFixed(1)),
      avgCadence: Math.round(sumCadence / n),
      maxCadence: Math.round(maxCadence),
      avgWatts: Math.round(sumWatts / n),
      maxWatts: Math.round(maxWatts),
      avgHeartRate: countHr > 0 ? Math.round(sumHr / countHr) : 0,
      maxHeartRate: Math.round(maxHr)
    };
  }

  computeFinalStats() {
    this.computeIntermediaryStats();
  }

  formatTime(totalSec) {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    const pad = (n) => String(n).padStart(2, '0');
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }

  exportSessionData() {
    return {
      id: 'session_' + (this.startTime ? this.startTime.getTime() : Date.now()),
      activityType: 'Biking',
      startTime: this.startTime ? this.startTime.toISOString() : new Date().toISOString(),
      endTime: this.endTime ? this.endTime.toISOString() : new Date().toISOString(),
      elapsedSeconds: this.elapsedSeconds,
      stats: { ...this.stats },
      samples: [...this.samples]
    };
  }
}
