<?php
/**
 * oauth_callback.php - Réception du code d'autorisation et échange de tokens
 */
require_once __DIR__ . '/config.php';

$code = $_GET['code'] ?? null;
$error = $_GET['error'] ?? null;
$state = $_GET['state'] ?? null;

if ($error) {
    header('Location: ' . BASE_URL . '/index.php?fit_error=' . urlencode($error));
    exit;
}

if (!$code) {
    die("Code d'autorisation manquant.");
}

// Échange du code contre les tokens
$tokenUrl = 'https://oauth2.googleapis.com/token';
$postFields = http_build_query([
    'client_id' => GOOGLE_CLIENT_ID,
    'client_secret' => GOOGLE_CLIENT_SECRET,
    'code' => $code,
    'grant_type' => 'authorization_code',
    'redirect_uri' => GOOGLE_REDIRECT_URI
]);

$res = httpRequest($tokenUrl, 'POST', ['Content-Type: application/x-www-form-urlencoded'], $postFields);

if ($res['code'] === 200 && !empty($res['json']['access_token'])) {
    $tokens = [
        'access_token' => $res['json']['access_token'],
        'refresh_token' => $res['json']['refresh_token'] ?? null,
        'expires_at' => time() + ($res['json']['expires_in'] ?? 3600),
        'created_at' => time()
    ];

    // Si on n'a pas reçu de nouveau refresh_token, conserver l'ancien
    if (empty($tokens['refresh_token'])) {
        $existing = getStoredTokens();
        if ($existing && !empty($existing['refresh_token'])) {
            $tokens['refresh_token'] = $existing['refresh_token'];
        }
    }

    saveStoredTokens($tokens);
    header('Location: ' . BASE_URL . '/index.php?fit_auth=success');
    exit;
} else {
    $errMsg = $res['json']['error_description'] ?? $res['error'] ?? 'Échec obtention token';
    header('Location: ' . BASE_URL . '/index.php?fit_error=' . urlencode($errMsg));
    exit;
}
