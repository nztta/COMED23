<?php
// api/helpers/discord.php
require_once __DIR__ . '/../config/database.php';

/**
 * Send embed notification to Discord via Webhook.
 * Colors: Info = 3447003 (blue), Success = 3066993 (green), Error = 15158332 (red), Warn = 15105570 (orange).
 */
function sendDiscordNotification(string $title, string $message, string $color = '3447003'): void {
    $webhookUrl = getenv('DISCORD_WEBHOOK_URL');
    
    // Fallback to database settings
    if (empty($webhookUrl)) {
        try {
            $db = getDatabaseConnection();
            $stmt = $db->prepare("SELECT value FROM settings WHERE key = 'discord_webhook_url'");
            $stmt->execute();
            $webhookUrl = $stmt->fetchColumn();
        } catch (Exception $e) {
            // Ignore
        }
    }

    if (empty($webhookUrl)) {
        return;
    }

    $payload = json_encode([
        'username' => 'COMED23 Finance Notification',
        'embeds' => [
            [
                'title' => $title,
                'description' => $message,
                'color' => intval($color),
                'timestamp' => date('c')
            ]
        ]
    ]);

    $ch = curl_init($webhookUrl);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    
    curl_exec($ch);
    curl_close($ch);
}
