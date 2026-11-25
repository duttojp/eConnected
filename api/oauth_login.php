<?php
/**
 * oauth_login.php - Démarre le flux d'authentification OAuth 2.0 vers Google
 */
require_once __DIR__ . '/config.php';

// Vérification de la configuration Google
if (strpos(GOOGLE_CLIENT_ID, 'VOTRE_CLIENT_ID') !== false) {
    die("Erreur : Veuillez renseigner votre GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans api/config.php");
}

$state = bin2hex(random_bytes(16));
$_SESSION['oauth_state'] = $state;

$params = [
    'client_id' => GOOGLE_CLIENT_ID,
    'redirect_uri' => GOOGLE_REDIRECT_URI,
    'response_type' => 'code',
    'scope' => GOOGLE_SCOPES,
    'access_type' => 'offline',
    'prompt' => 'consent',
    'state' => $state
];

$authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);

header('Location: ' . $authUrl);
exit;
