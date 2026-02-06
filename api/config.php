<?php

// Basic config. Prefer environment variables in production.
return [
    'pg_host' => getenv('PGHOST') ?: '127.0.0.1',
    'pg_port' => getenv('PGPORT') ?: '5432',
    'pg_db' => getenv('PGDATABASE') ?: 'benevoles',
    'pg_user' => getenv('PGUSER') ?: 'benevoles',
    'pg_pass' => getenv('PGPASSWORD') ?: 'benevoles',
    'admin_setup_token' => getenv('ADMIN_SETUP_TOKEN') ?: '',
    'session_name' => 'gbv2_admin',
];
