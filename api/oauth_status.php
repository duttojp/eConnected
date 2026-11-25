<?php
/**
 * oauth_status.php - Vérifie l'état de connexion à Google Fit et permet la déconnexion
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$action = $_GET['action'] ?? 'status';

if ($action === 'logout') {
    clearStoredTokens();
    jsonResponse(['success' => true, 'connected' => false, 'message' => 'Déconnecté de Google Fit']);
}

$token = getValidAccessToken();

if ($token) {
    jsonResponse([
        'connected' => true,
        'message' => 'Connecté à Google Fit'
    ]);
} else {
    jsonResponse([
        'connected' => false,
        'message' => 'Non connecté à Google Fit'
    ]);
}
