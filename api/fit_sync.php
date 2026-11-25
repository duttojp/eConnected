<?php
/**
 * fit_sync.php - Transmission de la séance vers l'API Google Fit
 * Reçoit les données de session en JSON et crée les DataSources, Datasets et Session Google Fit
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Méthode POST requise'], 405);
}

$accessToken = getValidAccessToken();
if (!$accessToken) {
    jsonResponse(['error' => 'Non authentifié auprès de Google Fit. Veuillez vous connecter.'], 401);
}

$input = file_get_contents('php://input');
$sessionData = json_decode($input, true);

if (!$sessionData || empty($sessionData['samples'])) {
    jsonResponse(['error' => 'Données de session invalides ou échantillons manquants.'], 400);
}

// 1. Sauvegarde locale de la séance sur le serveur OVH
$sessionId = $sessionData['id'] ?? ('session_' . time());
$sessionFilePath = SESSIONS_DIR . '/' . preg_replace('/[^a-zA-Z0-9_-]/', '', $sessionId) . '.json';
@file_put_contents($sessionFilePath, json_encode($sessionData, JSON_PRETTY_PRINT));

// 2. Préparation des timestamps en millisecondes et nanosecondes
$startTimeMs = strtotime($sessionData['startTime']) * 1000;
$endTimeMs = strtotime($sessionData['endTime']) * 1000;

if ($endTimeMs <= $startTimeMs) {
    $endTimeMs = $startTimeMs + (count($sessionData['samples']) * 1000);
}

$startTimeNanos = sprintf('%.0f', $startTimeMs * 1000000);
$endTimeNanos = sprintf('%.0f', $endTimeMs * 1000000);

$authHeader = "Authorization: Bearer $accessToken";
$jsonHeader = "Content-Type: application/json;encoding=utf-8";

// Identifiant d'application / package pour Google Fit
$appPackage = "com.econnected.domyosbike";
$deviceModel = "Domyos Bike 500";

/**
 * Helper pour créer une DataSource Google Fit
 */
function getOrCreateDataSource($authHeader, $dataTypeName, $streamName, $appPackage, $deviceModel) {
    $dsId = "raw:$dataTypeName:$appPackage:$streamName";
    $url = "https://fitness.googleapis.com/fitness/v1/users/me/dataSources/" . urlencode($dsId);

    $check = httpRequest($url, 'GET', [$authHeader]);
    if ($check['code'] === 200) {
        return $dsId;
    }

    // Création
    $createUrl = "https://fitness.googleapis.com/fitness/v1/users/me/dataSources";
    $payload = [
        "dataStreamName" => $streamName,
        "type" => "raw",
        "application" => [
            "name" => "eConnected Web",
            "packageName" => $appPackage,
            "version" => "1.0"
        ],
        "dataType" => [
            "name" => $dataTypeName
        ],
        "device" => [
            "manufacturer" => "Decathlon",
            "model" => $deviceModel,
            "type" => "fitnessEquipment",
            "uid" => "domyos-bike-500-web"
        ]
    ];

    $res = httpRequest($createUrl, 'POST', [$authHeader, "Content-Type: application/json"], $payload);
    if ($res['code'] === 200 || $res['code'] === 409) {
        return $res['json']['dataStreamId'] ?? $dsId;
    }

    return $dsId;
}

// 3. Déclaration des DataSources requises
$speedDsId = getOrCreateDataSource($authHeader, "com.google.speed", "speed_stream", $appPackage, $deviceModel);
$cadenceDsId = getOrCreateDataSource($authHeader, "com.google.cycling.cadence", "cadence_stream", $appPackage, $deviceModel);
$distanceDsId = getOrCreateDataSource($authHeader, "com.google.distance.delta", "distance_stream", $appPackage, $deviceModel);
$caloriesDsId = getOrCreateDataSource($authHeader, "com.google.calories.expended", "calories_stream", $appPackage, $deviceModel);
$powerDsId = getOrCreateDataSource($authHeader, "com.google.power.sample", "power_stream", $appPackage, $deviceModel);

// 4. Préparation des points d'échantillonnage (DataPoints)
$speedPoints = [];
$cadencePoints = [];
$distancePoints = [];
$caloriesPoints = [];
$powerPoints = [];
$heartRatePoints = [];

$samples = $sessionData['samples'];
$lastDistMeters = 0;
$lastCalories = 0;

foreach ($samples as $i => $s) {
    $tSec = strtotime($s['timestamp']);
    $ptStartNanos = sprintf('%.0f', $tSec * 1000000000);
    $ptEndNanos = sprintf('%.0f', ($tSec + 1) * 1000000000);

    // Vitesse (en m/s dans Google Fit)
    $speedMs = floatval($s['speed']) / 3.6;
    $speedPoints[] = [
        "dataTypeName" => "com.google.speed",
        "startTimeNanos" => $ptStartNanos,
        "endTimeNanos" => $ptEndNanos,
        "value" => [["fpVal" => round($speedMs, 2)]]
    ];

    // Cadence de pédalage (RPM)
    $cadencePoints[] = [
        "dataTypeName" => "com.google.cycling.cadence",
        "startTimeNanos" => $ptStartNanos,
        "endTimeNanos" => $ptEndNanos,
        "value" => [["fpVal" => floatval($s['cadence'])]]
    ];

    // Puissance (Watts)
    if (!empty($s['watts'])) {
        $powerPoints[] = [
            "dataTypeName" => "com.google.power.sample",
            "startTimeNanos" => $ptStartNanos,
            "endTimeNanos" => $ptEndNanos,
            "value" => [["fpVal" => floatval($s['watts'])]]
        ];
    }

    // Distance Delta (mètres par tranche)
    $curDist = floatval($s['distanceMeters']);
    $deltaDist = max(0, $curDist - $lastDistMeters);
    $lastDistMeters = $curDist;
    if ($deltaDist > 0) {
        $distancePoints[] = [
            "dataTypeName" => "com.google.distance.delta",
            "startTimeNanos" => $ptStartNanos,
            "endTimeNanos" => $ptEndNanos,
            "value" => [["fpVal" => round($deltaDist, 2)]]
        ];
    }

    // Calories Expended (kcal)
    $curCal = floatval($s['calories']);
    $deltaCal = max(0, $curCal - $lastCalories);
    $lastCalories = $curCal;
    if ($deltaCal > 0) {
        $caloriesPoints[] = [
            "dataTypeName" => "com.google.calories.expended",
            "startTimeNanos" => $ptStartNanos,
            "endTimeNanos" => $ptEndNanos,
            "value" => [["fpVal" => round($deltaCal, 3)]]
        ];
    }
}

/**
 * Helper d'envoi d'un dataset vers Google Fit
 */
function uploadDataset($authHeader, $dsId, $startTimeNanos, $endTimeNanos, $points) {
    if (empty($points)) return true;

    $url = "https://fitness.googleapis.com/fitness/v1/users/me/dataSources/" . urlencode($dsId) . "/datasets/$startTimeNanos-$endTimeNanos";
    $payload = [
        "dataSourceId" => $dsId,
        "minStartTimeNs" => $startTimeNanos,
        "maxEndTimeNs" => $endTimeNanos,
        "point" => $points
    ];

    $res = httpRequest($url, 'PATCH', [$authHeader, "Content-Type: application/json"], $payload);
    return ($res['code'] >= 200 && $res['code'] < 300);
}

// 5. Envoi des Datasets
$errors = [];
if (!uploadDataset($authHeader, $speedDsId, $startTimeNanos, $endTimeNanos, $speedPoints)) $errors[] = "Erreur sync vitesse";
if (!uploadDataset($authHeader, $cadenceDsId, $startTimeNanos, $endTimeNanos, $cadencePoints)) $errors[] = "Erreur sync cadence";
if (!uploadDataset($authHeader, $distanceDsId, $startTimeNanos, $endTimeNanos, $distancePoints)) $errors[] = "Erreur sync distance";
if (!uploadDataset($authHeader, $caloriesDsId, $startTimeNanos, $endTimeNanos, $caloriesPoints)) $errors[] = "Erreur sync calories";
if (!uploadDataset($authHeader, $powerDsId, $startTimeNanos, $endTimeNanos, $powerPoints)) $errors[] = "Erreur sync puissance";

// 6. Création de la Session Google Fit (ActivityType 1 = Biking)
$sessionUrl = "https://fitness.googleapis.com/fitness/v1/users/me/sessions/" . urlencode($sessionId);
$stats = $sessionData['stats'];
$distanceKm = round(($stats['totalDistanceMeters'] ?? 0) / 1000.0, 2);
$cal = round($stats['totalCalories'] ?? 0);

$sessionPayload = [
    "id" => $sessionId,
    "name" => "Vélo d'appartement Domyos (" . $distanceKm . " km)",
    "description" => sprintf("Séance Domyos Bike 500 : %s km, %d kcal, %d RPM moy., %d Watts moy.", 
        $distanceKm, $cal, $stats['avgCadence'] ?? 0, $stats['avgWatts'] ?? 0
    ),
    "startTimeMillis" => $startTimeMs,
    "endTimeMillis" => $endTimeMs,
    "activityType" => 1, // 1 = Biking (cyclisme)
    "application" => [
        "name" => "eConnected Web Domyos",
        "packageName" => $appPackage,
        "version" => "1.0"
    ]
];

$sessionRes = httpRequest($sessionUrl, 'PUT', [$authHeader, "Content-Type: application/json"], $sessionPayload);

if ($sessionRes['code'] >= 200 && $sessionRes['code'] < 300) {
    jsonResponse([
        'success' => true,
        'sessionId' => $sessionId,
        'message' => 'Séance synchronisée avec succès dans Google Fit !',
        'details' => [
            'pointsVitesse' => count($speedPoints),
            'pointsCadence' => count($cadencePoints),
            'distanceKm' => $distanceKm,
            'calories' => $cal
        ]
    ]);
} else {
    jsonResponse([
        'success' => false,
        'error' => 'Échec création session Google Fit',
        'google_response' => $sessionRes['body']
    ], 500);
}
