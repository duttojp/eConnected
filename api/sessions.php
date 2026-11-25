<?php
/**
 * sessions.php - API de gestion de l'historique des séances stockées sur OVH
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    // Lister les séances sauvegardées
    $files = glob(SESSIONS_DIR . '/*.json');
    $sessions = [];

    foreach ($files as $file) {
        $content = file_get_contents($file);
        $data = json_decode($content, true);
        if ($data) {
            // Ne renvoyer que le résumé pour alléger la liste
            $sessions[] = [
                'id' => $data['id'] ?? basename($file, '.json'),
                'startTime' => $data['startTime'] ?? null,
                'elapsedSeconds' => $data['elapsedSeconds'] ?? 0,
                'stats' => $data['stats'] ?? []
            ];
        }
    }

    // Trier de la plus récente à la plus ancienne
    usort($sessions, function($a, $b) {
        return strtotime($b['startTime'] ?? '0') - strtotime($a['startTime'] ?? '0');
    });

    jsonResponse(['sessions' => $sessions]);
}

if ($method === 'POST') {
    // Sauvegarder une séance sans forcément synchroniser Google Fit
    $input = file_get_contents('php://input');
    $sessionData = json_decode($input, true);

    if (!$sessionData) {
        jsonResponse(['error' => 'Format JSON invalide'], 400);
    }

    $id = $sessionData['id'] ?? ('session_' . time());
    $filePath = SESSIONS_DIR . '/' . preg_replace('/[^a-zA-Z0-9_-]/', '', $id) . '.json';

    file_put_contents($filePath, json_encode($sessionData, JSON_PRETTY_PRINT));
    jsonResponse(['success' => true, 'id' => $id]);
}
