# 🚴 Domyos Connect - Alternative Web à eConnected pour Domyos Bike 500

Application Web progressive (PWA / Web Bluetooth) conçue pour connecter un vélo d'appartement **Decathlon Domyos Bike 500** directement depuis un navigateur web (Chrome, Edge, Opera sur smartphone, tablette ou ordinateur), remplacer l'application officielle *eConnected*, et **remonter automatiquement les séances d'entraînement dans Google Fit**.

Conçue spécifiquement pour un déploiement ultra-simple sur un **hébergement mutualisé OVH (PHP & JavaScript)** sans aucun outil de compilation ou serveur Node.js nécessaire.

---

## 🌟 Fonctionnalités

1. **Connexion Bluetooth directe (Web Bluetooth API)** :
   - Aucune application mobile native à installer depuis le Play Store / App Store.
   - Supporte le protocole propriétaire **Domyos UART (eConnected)** (`49535343-fe7d-4ae5-8fa9-9fafd205e455`) issu de l'ingénierie inverse.
   - Supporte également le protocole standard **FTMS (Fitness Machine Service - 0x1826)** des consoles plus récentes.
2. **Tableau de bord haute visibilité pour tablette/smartphone** :
   - Vitesse instantanée (km/h).
   - Cadence de pédalage (RPM).
   - Puissance mécanique estimée en temps réel (Watts) selon la formule dynamométrique du volant d'inertie magnétique (6 kg).
   - Distance parcourue (km) et calories dépensées (kcal).
   - Rythme cardiaque (BPM) si capteurs mains ou ceinture cardiaque connectée.
   - Chronomètre précis avec temps actif.
3. **Contrôle interactif de la résistance** :
   - Boutons tactiles géants `[−]` et `[+]` pour ajuster la résistance (niveaux 1 à 15) directement depuis l'écran.
   - Raccourcis de résistance (Plat, Rythme, Côte, Col, Max).
4. **Mode Simulation intégré** :
   - Permet de tester toute l'interface, l'enregistrement et la synchronisation Google Fit sans être physiquement à côté du vélo.
5. **Synchronisation Google Fit (API Google Fitness)** :
   - Authentification sécurisée OAuth 2.0 (gérée par le backend PHP OVH sans exposer vos clés secrètes).
   - Création de la séance de cyclisme (*Activity Type: Biking*).
   - Envoi des séries temporelles échantillonnées à la seconde (vitesse, cadence, distance delta, calories, watts).
6. **Export universel de secours (TCX)** :
   - Téléchargement en 1 clic d'un fichier `.TCX` (Training Center XML) standard compatible avec **Strava**, **Garmin Connect**, **Google Fit**, etc.
7. **Historique des séances** :
   - Sauvegarde automatique des résumés sur votre serveur OVH (dans `data/sessions/`).

---

## 📁 Architecture des fichiers

```text
eConnected/
├── index.php                  # Interface Web principale (Tableau de bord responsive)
├── .htaccess                  # Configuration Apache OVH (Force HTTPS, types MIME, sécurité)
├── css/
│   └── style.css              # Design sombre sportif haute lisibilité
├── js/
│   ├── app.js                 # Contrôleur applicatif principal (ES6 Module)
│   ├── bluetooth/
│   │   ├── domyos-ble.js       # Pilote Web Bluetooth (Domyos UART + FTMS)
│   │   └── domyos-simulator.js # Simulateur virtuel pour tests
│   ├── recorder/
│   │   └── session-recorder.js # Enregistreur temporel & calcul des statistiques
│   └── utils/
│       └── tcx-generator.js    # Générateur de fichiers d'export TCX
├── api/
│   ├── config.php             # Configuration & helpers cURL Google API
│   ├── oauth_login.php        # Redirection vers la page d'accord Google
│   ├── oauth_callback.php     # Échange sécurisé du code contre access_token
│   ├── oauth_status.php       # Statut de connexion et déconnexion
│   ├── fit_sync.php           # Envoi de la séance et des points vers Google Fit
│   └── sessions.php           # API d'historique des séances locales
└── data/
    └── .htaccess              # Sécurité Apache (Interdit l'accès public aux tokens)
```

---

## 🚀 Guide de déploiement sur Hébergement OVH

L'application ne nécessite aucun build npm : elle s'exécute nativement avec PHP 7.4 / 8.x et JavaScript ES6.

### Étape 1 : Activer le SSL / HTTPS sur OVH (Obligatoire)
La **Web Bluetooth API** est bloquée par les navigateurs en HTTP non sécurisé. Le HTTPS est donc **strictement requis**.
1. Rendez-vous sur votre [Espace Client OVH](https://www.ovh.com/manager/).
2. Allez dans **Web Cloud** > **Hébergements** > Cliquez sur votre domaine.
3. Dans l'onglet **Informations générales**, vérifiez que **Certificat SSL** est sur **Actif (Let's Encrypt)**.
4. Si ce n'est pas le cas, cliquez sur les trois petits points `...` > **Activer le certificat SSL** (gratuit, prêt en quelques minutes).

### Étape 2 : Envoyer les fichiers par FTP
1. Connectez-vous à votre espace FTP OVH (avec FileZilla, Cyberduck ou le WebFTP d'OVH).
2. Rendez-vous dans le dossier racine de votre site (généralement `www/` ou un sous-dossier comme `www/domyos/`).
3. Téléversez l'intégralité du contenu du dossier `eConnected`.

---

## 🔑 Configuration de l'API Google Fit (Google Cloud Console)

Pour permettre la synchronisation avec Google Fit, vous devez créer vos identifiants OAuth 2.0 gratuits chez Google :

1. Rendez-vous sur [Google Cloud Console](https://console.cloud.google.com/).
2. Créez un nouveau projet (ex: `Domyos-Fit-Sync`).
3. **Activer l'API** :
   - Allez dans **API et services** > **Bibliothèque**.
   - Recherchez **Fitness API** et cliquez sur **Activer**.
4. **Configurer l'écran de consentement OAuth** :
   - Allez dans **API et services** > **Écran de consentement OAuth**.
   - Sélectionnez **Utilisateurs externes**, puis **Créer**.
   - Renseignez le nom de l'application (ex: `Domyos Connect`) et votre adresse e-mail.
   - Dans l'onglet **Utilisateurs test**, ajoutez votre propre adresse e-mail Gmail (celle liée à votre compte Google Fit).
5. **Créer les identifiants** :
   - Allez dans **API et services** > **Identifiants** > **Créer des identifiants** > **ID client OAuth**.
   - Type d'application : **Application Web**.
   - Nom : `Domyos Web OVH`.
   - Dans **URIs de redirection autorisés**, ajoutez l'URL exacte de votre script de rappel :
     `https://votre-domaine.ovh/api/oauth_callback.php`
     *(ou `https://votre-domaine.ovh/domyos/api/oauth_callback.php` si placé dans un sous-dossier)*.
   - Cliquez sur **Créer**.
6. **Renseigner les identifiants dans le code** :
   - Ouvrez le fichier `api/config.php` sur votre serveur OVH et remplacez les valeurs :
     ```php
     define('GOOGLE_CLIENT_ID', 'VOTRE_CLIENT_ID.apps.googleusercontent.com');
     define('GOOGLE_CLIENT_SECRET', 'VOTRE_CLIENT_SECRET');
     ```

---

## 📱 Utilisation au quotidien sur le vélo

1. Posez votre tablette ou smartphone Android sur le support du guidon de votre **Domyos Bike 500**.
2. Ouvrez **Google Chrome** (ou **Edge**) et naviguez sur `https://votre-domaine.ovh/`.
   *Astuce : Dans le menu de Chrome, cliquez sur **Ajouter à l'écran d'accueil** pour ouvrir l'application en plein écran comme une vraie application native.*
3. Donnez deux ou trois tours de pédales pour allumer la console du vélo.
4. Cliquez sur le bouton bleu **"Connecter Vélo"** :
   - La fenêtre de recherche Bluetooth du navigateur s'ouvre.
   - Sélectionnez votre vélo (**DOMYOS-XXXX** ou **Bike 500**).
5. La connexion s'établit en quelques secondes ! Le badge passe au vert.
6. Cliquez sur **"▶ Démarrer la séance"** :
   - Les valeurs de vitesse, cadence et puissance s'animent en temps réel.
   - Vous pouvez régler la résistance magnétique avec les boutons `[+]` et `[−]` directement sur l'écran.
7. Quand vous avez terminé, cliquez sur **"⏹ Terminer"** :
   - La fenêtre récapitulative s'ouvre avec vos statistiques.
   - Cliquez sur **"☁️ Envoyer vers Google Fit"** pour téléverser immédiatement l'entraînement dans votre journal Google Fit !
   - Vous pouvez également cliquer sur **"📥 Télécharger fichier TCX"** pour l'importer manuellement dans Strava si désiré.
