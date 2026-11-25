<?php
/**
 * Configuration de l'application et de l'API Google Fit
 * Déployable sur hébergement mutualisé OVH (PHP 7.4 / 8.x)
 */

session_start();

// Activer le rapport d'erreurs en dev si besoin (désactiver en production)
ini_set('display_errors', 0);
error_reporting(E_ALL);

// Chemins des données locales
define('DATA_DIR', __DIR__ . '/../data');
define('TOKENS_FILE', DATA_DIR . '/google_tokens.json');
define('SESSIONS_DIR', DATA_DIR . '/sessions');

// Création des répertoires si non existants
if (!file_exists(DATA_DIR)) {
    @mkdir(DATA_DIR, 0755, true);
}
if (!file_exists(SESSIONS_DIR)) {
    @mkdir(SESSIONS_DIR, 0755, true);
}

// -------------------------------------------------------------
// IDENTIFIANTS GOOGLE CLOUD OAUTH 2.0
// À remplacer par vos identifiants obtenus dans https://console.cloud.google.com/
// -------------------------------------------------------------
define('GOOGLE_CLIENT_ID', getenv('GOOGLE_CLIENT_ID') ?: 'VOTRE_CLIENT_ID_GOOGLE.apps.googleusercontent.com');
define('GOOGLE_CLIENT_SECRET', getenv('GOOGLE_CLIENT_SECRET') ?: 'VOTRE_CLIENT_SECRET_GOOGLE');

// Détection automatique de l'URL de base sur OVH
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $_SERVER['SERVER_PORT'] == 443 ? "https://" : "http://";
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$baseDir = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'])), '/\\');
$baseUrl = $protocol . $host . ($baseDir ? $baseDir : '');

define('BASE_URL', $baseUrl);
define('GOOGLE_REDIRECT_URI', BASE_URL . '/api/oauth_callback.php');

// Scopes Google Fit requis pour enregistrer une séance de vélo
define('GOOGLE_SCOPES', implode(' ', [
    'https://www.googleapis.com/auth/fitness.activity.write',
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.body.write',
    'https://www.googleapis.com/auth/fitness.location.write',
    'https://www.googleapis.com/auth/fitness.heart_rate.write'
]));

/**
 * Fonctions utilitaires
 */
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

function getStoredTokens() {
    if (file_exists(TOKENS_FILE)) {
        $content = file_get_contents(TOKENS_FILE);
        $tokens = json_decode($content, true);
        if (is_array($tokens)) return $tokens;
    }
    return null;
}

function saveStoredTokens($tokens) {
    return file_put_contents(TOKENS_FILE, json_encode($tokens, JSON_PRETTY_PRINT));
}

function clearStoredTokens() {
    if (file_exists(TOKENS_FILE)) {
        @unlink(TOKENS_FILE);
    }
    unset($_SESSION['google_access_token']);
    unset($_SESSION['google_refresh_token']);
}

/**
 * Requête HTTP cURL générique
 */
function httpRequest($url, $method = 'GET', $headers = [], $postData = null) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);

    if (!empty($headers)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }

    if ($postData !== null) {
        if (is_array($postData) || is_object($postData)) {
            $postData = json_encode($postData);
        }
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    return [
        'code' => $httpCode,
        'body' => $response,
        'json' => json_decode($response, true),
        'error' => $error
    ];
}

/**
 * Rafraîchit l'access_token Google si expiré
 */
function getValidAccessToken() {
    $tokens = getStoredTokens();
    if (!$tokens || empty($tokens['refresh_token'])) {
        return null;
    }

    // Vérifier si le token est encore valide (avec marge de 60s)
    if (!empty($tokens['access_token']) && !empty($tokens['expires_at']) && time() < ($tokens['expires_at'] - 60)) {
        return $tokens['access_token'];
    }

    // Renouvellement via le refresh_token
    $refreshUrl = 'https://oauth2.googleapis.com/token';
    $postFields = http_build_query([
        'client_id' => GOOGLE_CLIENT_ID,
        'client_secret' => GOOGLE_CLIENT_SECRET,
        'refresh_token' => $tokens['refresh_token'],
        'grant_type' => 'refresh_token'
    ]);

    $res = httpRequest($refreshUrl, 'POST', ['Content-Type: application/x-www-form-urlencoded'], $postFields);

    if ($res['code'] === 200 && !empty($res['json']['access_token'])) {
        $tokens['access_token'] = $res['json']['access_token'];
        $tokens['expires_at'] = time() + ($res['json']['expires_in'] ?? 3600);
        saveStoredTokens($tokens);
        return $tokens['access_token'];
    }

    return null;
}
