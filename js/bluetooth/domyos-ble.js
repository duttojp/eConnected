/**
 * DomyosBLE - Pilote Web Bluetooth pour Domyos Bike 500
 * Basé sur l'analyse exacte des trames btsnoop HCI de l'application officielle eConnected
 */

export class DomyosBLE {
  constructor() {
    // Service & Caractéristiques Microchip Transparent UART (ISSC)
    this.DOMYOS_SERVICE_UUID = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
    this.DOMYOS_NOTIFY_CHAR_UUID = '49535343-1e4d-4bd9-ba61-23c647249616'; // TX : Console vers App
    this.DOMYOS_WRITE_CHAR_UUID = '49535343-8841-43f4-a8d4-ecbe34729bb3';  // RX : App vers Console

    // Bluetooth FTMS standard
    this.FTMS_SERVICE_UUID = '00001826-0000-1000-8000-00805f9b34fb';
    this.FTMS_INDOOR_BIKE_DATA_UUID = '00002ad2-0000-1000-8000-00805f9b34fb';
    this.FTMS_CONTROL_POINT_UUID = '00002ad9-0000-1000-8000-00805f9b34fb';

    // État
    this.device = null;
    this.server = null;
    this.mode = null;
    this.notifyChar = null;
    this.writeChar = null;
    this.isConnected = false;

    // Timers
    this.pollTimer = null;    // Boucle de communication (toutes les 300 ms)
    this.isSending = false;
    this.sessionStartedSent = false;
    this.pendingResistance = null;
    this.workoutElapsedSeconds = 0;
    this.lastLoggedRxHex = '';
    this.writeErrorCount = 0;

    // Métriques courantes
    this.metrics = {
      speed: 0,        // km/h
      cadence: 0,      // RPM
      distance: 0,     // km
      calories: 0,     // kcal
      resistance: 1,   // niveau (1 à 15)
      heartRate: 0,    // bpm
      watts: 0,        // Watts
      timestamp: null
    };

    this.listeners = {
      data: [],
      connected: [],
      disconnected: [],
      error: [],
      status: [],
      log: []
    };
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error(e); }
      });
    }
  }

  log(msg) {
    const time = new Date().toLocaleTimeString('fr-FR');
    this.emit('log', `[${time}] ${msg}`);
    console.log(`[DomyosBLE] ${msg}`);
  }

  setWorkoutTime(elapsedSeconds) {
    this.workoutElapsedSeconds = elapsedSeconds;
  }

  /**
   * Connexion Bluetooth
   */
  async connect() {
    if (!DomyosBLE.isSupported()) {
      const err = new Error("Web Bluetooth n'est pas supporté par ce navigateur. Utilisez Chrome ou Edge sous HTTPS.");
      this.emit('error', err);
      throw err;
    }

    try {
      this.log('Recherche du Domyos Bike 500...');
      this.emit('status', 'Recherche du Domyos Bike 500...');

      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Domyos-Bike' },
          { namePrefix: 'DOMYOS' },
          { namePrefix: 'Domyos' },
          { services: [this.DOMYOS_SERVICE_UUID] },
          { services: [this.FTMS_SERVICE_UUID] }
        ],
        optionalServices: [
          this.DOMYOS_SERVICE_UUID,
          this.FTMS_SERVICE_UUID,
          'device_information',
          'heart_rate'
        ]
      }).catch(async () => {
        this.log('Ouverture du sélecteur tous appareils...');
        return await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            this.DOMYOS_SERVICE_UUID,
            this.FTMS_SERVICE_UUID,
            'device_information',
            'heart_rate'
          ]
        });
      });

      if (!this.device) {
        throw new Error("Aucun appareil sélectionné");
      }

      this.device.addEventListener('gattserverdisconnected', () => this.handleDisconnection());

      this.log(`Connexion GATT à ${this.device.name || 'Domyos Bike'}...`);
      this.emit('status', `Connexion à ${this.device.name || 'Domyos Bike'}...`);
      this.server = await this.device.gatt.connect();

      let connectedSuccess = false;

      // 1. Protocole Domyos UART (eConnected)
      try {
        const domyosService = await this.server.getPrimaryService(this.DOMYOS_SERVICE_UUID);
        if (domyosService) {
          this.mode = 'domyos';
          this.notifyChar = await domyosService.getCharacteristic(this.DOMYOS_NOTIFY_CHAR_UUID);
          this.writeChar = await domyosService.getCharacteristic(this.DOMYOS_WRITE_CHAR_UUID);

          // Abonnement aux notifications entrantes
          await this.notifyChar.startNotifications();
          this.notifyChar.addEventListener('characteristicvaluechanged', (e) => this.handleIncomingPacket(e));
          this.log('Notifications activées sur TX.');

          // Séquence d'initialisation exacte eConnected
          await this.sendEConnectedHandshake();

          // Démarrage des boucles actives de communication
          this.startPollingAndDisplayLoops();

          connectedSuccess = true;
          this.log('Console initialisée et synchronisée avec succès !');
          this.emit('status', 'Connecté au Domyos Bike 500');
        }
      } catch (errDomyos) {
        this.log(`Service Domyos UART non trouvé (${errDomyos.message}), essai FTMS...`);
      }

      // 2. Fallback FTMS
      if (!connectedSuccess) {
        try {
          const ftmsService = await this.server.getPrimaryService(this.FTMS_SERVICE_UUID);
          if (ftmsService) {
            this.mode = 'ftms';
            this.notifyChar = await ftmsService.getCharacteristic(this.FTMS_INDOOR_BIKE_DATA_UUID);
            try {
              this.writeChar = await ftmsService.getCharacteristic(this.FTMS_CONTROL_POINT_UUID);
            } catch (_) {}

            await this.notifyChar.startNotifications();
            this.notifyChar.addEventListener('characteristicvaluechanged', (e) => this.handleFTMSPacket(e));
            connectedSuccess = true;
            this.emit('status', 'Connecté via FTMS standard');
          }
        } catch (errFtms) {
          this.log(`Erreur FTMS : ${errFtms.message}`);
        }
      }

      if (!connectedSuccess) {
        throw new Error("L'appareil n'expose ni le service Domyos ni le service FTMS compatible.");
      }

      this.isConnected = true;
      this.emit('connected', {
        name: this.device.name || 'Domyos Bike 500',
        mode: this.mode
      });

      return true;

    } catch (error) {
      this.log(`Échec : ${error.message}`);
      this.emit('error', error);
      this.handleDisconnection();
      throw error;
    }
  }

  buildDomyosPacket(bytes) {
    let sum = 0;
    for (let i = 0; i < bytes.length; i++) sum += bytes[i];
    return new Uint8Array([...bytes, sum & 0xff]);
  }

  buildResistancePacket(resistance) {
    return this.buildDomyosPacket([
      0xf0, 0xad,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      resistance & 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0x01, 0xff,
      0x00, 0x00
    ]);
  }

  buildCdPacket(stateByte) {
    const distUnits = Math.round((this.metrics.distance || 0) * 10);
    const hi = stateByte === 0x00 ? 0x00 : (distUnits >> 8) & 0xff;
    const lo = stateByte === 0x00 ? 0x00 : (distUnits & 0xff) || 0x01;
    return this.buildDomyosPacket([
      0xf0, 0xcd,
      0x01, hi, lo, 0x01,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0x00, 0x00, 0x00, 0x08, 0x00, 0x00
    ]);
  }

  buildDisplayPacket(modeByte) {
    const totalSec    = Math.floor(this.workoutElapsedSeconds || 0);
    const mins        = Math.floor(totalSec / 60);
    const secs        = totalSec % 60;
    const speedTenths = Math.round((this.metrics.speed || 0) * 10);
    const distTenths  = Math.round((this.metrics.distance || 0) * 10) & 0xff;
    const bpmInt      = Math.round(this.metrics.heartRate || 0);
    const rpmInt      = Math.round(this.metrics.cadence || 0);
    const calInt      = Math.round(this.metrics.calories || 0);

    return this.buildDomyosPacket([
      0xf0, 0xcb,
      modeByte,
      mins & 0xff, secs & 0xff,
      0xff, 0x01,
      (speedTenths >> 8) & 0xff, speedTenths & 0xff,
      0x01, distTenths,
      (bpmInt >> 8) & 0xff, bpmInt & 0xff,
      0x00, 0x01,
      (rpmInt >> 8) & 0xff, rpmInt & 0xff,
      0x00, 0x01,
      (calInt >> 8) & 0xff, calInt & 0xff,
      0x00,
      0x00, 0x08, 0x00, 0x00
    ]);
  }

  /**
   * Séquence exacte du Handshake eConnected (validée sur Domyos Bike 500)
   */
  async sendEConnectedHandshake() {
    this.log("Envoi du handshake de démarrage eConnected...");
    this.sessionStartedSent = false;

    const handshakeSequence = [
      new Uint8Array([0xf0, 0xc9, 0xb9]),
      new Uint8Array([0xf0, 0xa3, 0x93]),
      new Uint8Array([0xf0, 0xa4, 0x94]),
      new Uint8Array([0xf0, 0xac, 0x9c]),
      new Uint8Array([0xf0, 0xa5, 0x95]),
      new Uint8Array([0xf0, 0xab, 0x9b]),
      this.buildResistancePacket(this.metrics.resistance || 1),
      this.buildDisplayPacket(0x02),
      this.buildCdPacket(0x00),
      new Uint8Array([0xf0, 0xca, 0x00, 0xba]),
      new Uint8Array([0xf0, 0xc8, 0x01, 0xb9])
    ];

    for (const pkt of handshakeSequence) {
      await this.writeRaw(pkt);
      await new Promise(r => setTimeout(r, 120));
    }

    this.log("Handshake eConnected validé.");
  }

  /**
   * Écrit une commande vers la console Domyos (privilégie writeValueWithResponse)
   */
  async writeRaw(uint8Array) {
    if (!this.writeChar) return;
    try {
      if (this.writeChar.properties && this.writeChar.properties.write) {
        await this.writeChar.writeValueWithResponse(uint8Array);
      } else if (this.writeChar.properties && this.writeChar.properties.writeWithoutResponse) {
        await this.writeChar.writeValueWithoutResponse(uint8Array);
      } else {
        await this.writeChar.writeValue(uint8Array);
      }
    } catch (err) {
      try {
        await this.writeChar.writeValue(uint8Array);
      } catch (e2) {
        this.writeErrorCount++;
        if (this.writeErrorCount <= 5) {
          this.log(`Erreur écriture BLE : ${e2.message || e2}`);
        }
        console.warn("Write error:", e2);
      }
    }
  }

  /**
   * Boucle de communication (300 ms) :
   * alterne F0-AC-9C, F0-CB (affichage LCD), F0-C4-03-B7 et F0-AD (résistance)
   */
  startPollingAndDisplayLoops() {
    this.stopLoops();
    let cycle = 0;

    this.pollTimer = setInterval(async () => {
      if (this.isSending || !this.writeChar || !this.isConnected) return;
      this.isSending = true;
      try {
        const isPedaling = this.metrics.cadence > 0 || this.metrics.speed > 0;

        if (!this.sessionStartedSent && isPedaling) {
          this.sessionStartedSent = true;
          await this.writeRaw(this.buildCdPacket(0x01));
          await new Promise(r => setTimeout(r, 80));
          await this.writeRaw(new Uint8Array([0xf0, 0xc4, 0x03, 0xb7]));
        } else if (this.pendingResistance !== null) {
          const resToSend = this.pendingResistance;
          this.pendingResistance = null;
          await this.writeRaw(this.buildResistancePacket(resToSend));
          this.log(`Résistance réglée à ${resToSend}`);
        } else if (cycle % 3 === 1) {
          const mode = isPedaling ? 0x03 : 0x02;
          await this.writeRaw(this.buildDisplayPacket(mode));
        } else if (cycle % 6 === 4) {
          await this.writeRaw(this.buildCdPacket(0x01));
          await new Promise(r => setTimeout(r, 40));
          await this.writeRaw(new Uint8Array([0xf0, 0xc4, 0x03, 0xb7]));
        } else {
          await this.writeRaw(new Uint8Array([0xf0, 0xac, 0x9c]));
        }
        cycle++;
      } catch (e) {
      } finally {
        this.isSending = false;
      }
    }, 300);
  }

  stopLoops() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Traitement des paquets entrants notifiés par la console
   */
  handleIncomingPacket(event) {
    const dv = event.target.value;
    if (!dv || dv.byteLength < 2) return;

    const data = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
    if (hex !== this.lastLoggedRxHex) {
      this.lastLoggedRxHex = hex;
      this.log(`RX (${data.length}o): ${hex}`);
    }

    // Ignorer le paquet de numéro de série / version F0-AB (qui polluait les calculs)
    if (data[0] === 0xf0 && data[1] === 0xab) {
      return;
    }

    // Acquittement de changement de résistance F0-BD
    if (data[0] === 0xf0 && data[1] === 0xbd) {
      if (data.length > 10) {
        this.metrics.resistance = data[10];
        this.emit('data', { ...this.metrics });
      }
      return;
    }

    // Vraie télémétrie de pédalage : F0-BC (20 octets)
    if (data[0] === 0xf0 && data[1] === 0xbc && data.length >= 15) {
      this.parseF0BCPacket(data);
      return;
    }
  }

  /**
   * Décodage exact de la télémétrie F0-BC (20 octets) validée sur le btsnoop log :
   * [6..7]   : Vitesse en 0.1 km/h
   * [9]      : Cadence en RPM
   * [10..11] : Calories en kcal
   * [12..13] : Distance (unités de 10 mètres)
   * [14]     : Niveau de résistance (1 à 15)
   * [18]     : Fréquence cardiaque (BPM)
   */
  parseF0BCPacket(data) {
    // 1. Vitesse (km/h)
    const rawSpeed = (data[6] << 8) | data[7];
    const speed = rawSpeed > 0 && rawSpeed < 1000 ? rawSpeed / 10.0 : 0;

    // 2. Cadence (RPM)
    let cadence = data[9];
    if (cadence === 0xff || cadence > 220) cadence = 0;

    // 3. Calories (kcal)
    let calories = this.metrics.calories;
    if (data[10] !== 0xff) {
      calories = (data[10] << 8) | data[11];
    }

    // 4. Distance (km)
    let distance = this.metrics.distance;
    const rawDist = (data[12] << 8) | data[13];
    if (data[12] !== 0xff) {
      distance = rawDist * 0.1; // Chaque unité = 100 mètres = 0.1 km
    }

    // 5. Résistance (1 à 15)
    const res = data[14];
    if (res >= 1 && res <= 20) {
      this.metrics.resistance = res;
    }

    // 6. Fréquence cardiaque (BPM)
    let heartRate = 0;
    if (data.length > 18 && data[18] > 30 && data[18] < 240) {
      heartRate = data[18];
    }

    // 7. Calcul dynamique des Watts
    const watts = this.calculateWatts(cadence, this.metrics.resistance);

    this.metrics = {
      speed: Number(speed.toFixed(1)),
      cadence: Math.round(cadence),
      distance: Number(distance.toFixed(2)),
      calories: Math.round(calories),
      resistance: Math.round(this.metrics.resistance),
      heartRate: Math.round(heartRate),
      watts: Math.round(watts),
      timestamp: Date.now()
    };

    this.emit('data', { ...this.metrics });
  }

  /**
   * Décodage FTMS standard
   */
  handleFTMSPacket(event) {
    const value = event.target.value;
    if (!value || value.byteLength < 4) return;

    const flags = value.getUint16(0, true);
    let offset = 2;

    let speed = 0;
    if ((flags & 0x01) === 0) {
      speed = value.getUint16(offset, true) / 100.0;
      offset += 2;
    }

    let cadence = 0;
    if (flags & (1 << 2)) {
      cadence = value.getUint16(offset, true) * 0.5;
      offset += 2;
    }

    let distance = this.metrics.distance;
    if (flags & (1 << 4)) {
      const d0 = value.getUint8(offset);
      const d1 = value.getUint8(offset + 1);
      const d2 = value.getUint8(offset + 2);
      distance = ((d2 << 16) | (d1 << 8) | d0) / 1000.0;
      offset += 3;
    }

    let resistance = this.metrics.resistance;
    if (flags & (1 << 5)) {
      resistance = value.getInt16(offset, true);
      offset += 2;
    }

    let watts = 0;
    if (flags & (1 << 6)) {
      watts = value.getInt16(offset, true);
      offset += 2;
    } else {
      watts = this.calculateWatts(cadence, resistance);
    }

    let calories = this.metrics.calories;
    if (flags & (1 << 8)) {
      calories = value.getUint16(offset, true);
      offset += 5;
    }

    let heartRate = 0;
    if (flags & (1 << 9)) {
      heartRate = value.getUint8(offset);
      offset += 1;
    }

    this.metrics = {
      speed: Number(speed.toFixed(1)),
      cadence: Math.round(cadence),
      distance: Number(distance.toFixed(2)),
      calories: Math.round(calories),
      resistance: Math.max(1, Math.round(resistance)),
      heartRate: Math.round(heartRate),
      watts: Math.max(0, Math.round(watts)),
      timestamp: Date.now()
    };

    this.emit('data', { ...this.metrics });
  }

  /**
   * Commande de réglage de la résistance (F0-AD)
   */
  async setResistance(targetResistance) {
    const level = Math.max(1, Math.min(15, Math.round(targetResistance)));
    this.metrics.resistance = level;

    if (!this.isConnected || !this.writeChar) {
      return level;
    }

    if (this.mode === 'domyos') {
      this.pendingResistance = level;
      this.log(`Commande résistance mise en file : Niveau ${level}`);
    } else if (this.mode === 'ftms') {
      try {
        const ftmsCmd = new Uint8Array([0x04, level]);
        await this.writeRaw(ftmsCmd);
      } catch (err) {
        console.error('Erreur FTMS résistance:', err);
      }
    }

    return level;
  }

  calculateWatts(cadence, resistance) {
    if (cadence <= 0) return 0;
    const r = Math.max(1, Math.min(15, resistance));
    const baseW = 18 + (r * 12.5);
    const rpmFactor = Math.pow(cadence / 60.0, 1.35);
    return Math.max(0, Math.min(999, Math.round(baseW * rpmFactor)));
  }

  handleDisconnection() {
    this.stopLoops();
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.device = null;
    this.server = null;
    this.notifyChar = null;
    this.writeChar = null;
    this.mode = null;

    if (wasConnected) {
      this.log('Vélo déconnecté');
      this.emit('disconnected', 'Appareil déconnecté');
    }
  }

  disconnect() {
    this.stopLoops();
    if (this.writeChar && this.isConnected) {
      // Paquet de fin de séance officiel eConnected
      this.writeRaw(new Uint8Array([0xf0, 0xca, 0x00, 0xba])).catch(() => {});
    }
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.handleDisconnection();
  }
}
