<?php

require_once __DIR__ . '/db.php';

function start_admin_session(): void
{
    $config = require __DIR__ . '/config.php';
    if (session_status() === PHP_SESSION_NONE) {
        session_name($config['session_name']);
        session_start();
    }
}

function require_admin(): void
{
    start_admin_session();
    if (empty($_SESSION['admin_user_id'])) {
        json_response(['error' => 'unauthorized'], 401);
    }
}

function current_admin_id(): ?int
{
    start_admin_session();
    return isset($_SESSION['admin_user_id']) ? (int)$_SESSION['admin_user_id'] : null;
}

