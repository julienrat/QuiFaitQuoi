<?php

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function normalize_phone(?string $phone): ?string
{
    if ($phone === null) {
        return null;
    }
    $digits = preg_replace('/\D+/', '', $phone);
    if (strlen($digits) === 10) {
        return preg_replace('/(\d{2})(?=\d)/', '$1.', $digits);
    }
    return trim($phone);
}

try {
    switch ($action) {
        case 'admin_setup': {
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $token = $data['token'] ?? '';
            $config = require __DIR__ . '/config.php';
            if ($config['admin_setup_token'] === '' || $token !== $config['admin_setup_token']) {
                json_response(['error' => 'invalid_setup_token'], 403);
            }

            $username = trim($data['username'] ?? '');
            $password = $data['password'] ?? '';
            if ($username === '' || $password === '') {
                json_response(['error' => 'missing_fields'], 400);
            }

            $pdo = db();
            $count = (int)$pdo->query('select count(*) as c from admin_users')->fetch()['c'];
            if ($count > 0) {
                json_response(['error' => 'admin_already_exists'], 409);
            }

            $hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare('insert into admin_users (username, password_hash) values (:u, :p)');
            $stmt->execute([':u' => $username, ':p' => $hash]);
            json_response(['ok' => true]);
        }
        case 'admin_login': {
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $username = trim($data['username'] ?? '');
            $password = $data['password'] ?? '';

            $pdo = db();
            $stmt = $pdo->prepare('select id, password_hash from admin_users where username = :u');
            $stmt->execute([':u' => $username]);
            $user = $stmt->fetch();
            if (!$user || !password_verify($password, $user['password_hash'])) {
                json_response(['error' => 'invalid_credentials'], 401);
            }

            start_admin_session();
            $_SESSION['admin_user_id'] = (int)$user['id'];
            json_response(['ok' => true]);
        }
        case 'admin_logout': {
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            start_admin_session();
            $_SESSION = [];
            session_destroy();
            json_response(['ok' => true]);
        }
        case 'admin_me': {
            if ($method !== 'GET') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $adminId = current_admin_id();
            json_response(['authenticated' => $adminId !== null]);
        }
        case 'create_event': {
            require_admin();
            $data = read_json_body();
            $title = trim($data['title'] ?? '');
            if ($title === '') {
                json_response(['error' => 'title_required'], 400);
            }

            $theme = $data['theme'] ?? 'sand';
            $token = bin2hex(random_bytes(12));
            $pdo = db();
            $stmt = $pdo->prepare('insert into events (title, description, location, start_at, end_at, theme, public_token) values (:t, :d, :l, :s, :e, :th, :pt) returning id, public_token');
            $stmt->execute([
                ':t' => $title,
                ':d' => $data['description'] ?? null,
                ':l' => $data['location'] ?? null,
                ':s' => $data['start_at'] ?? null,
                ':e' => $data['end_at'] ?? null,
                ':th' => $theme,
                ':pt' => $token,
            ]);
            $row = $stmt->fetch();
            json_response(['id' => (int)$row['id'], 'public_token' => $row['public_token']]);
        }
        case 'list_events': {
            require_admin();
            $pdo = db();
            $rows = $pdo->query('select * from events order by created_at desc')->fetchAll();
            json_response(['events' => $rows]);
        }
        case 'update_event': {
            require_admin();
            $data = read_json_body();
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) {
                json_response(['error' => 'invalid_id'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('update events set title = :t, description = :d, location = :l, start_at = :s, end_at = :e, theme = :th where id = :id');
            $stmt->execute([
                ':t' => $data['title'] ?? '',
                ':d' => $data['description'] ?? null,
                ':l' => $data['location'] ?? null,
                ':s' => $data['start_at'] ?? null,
                ':e' => $data['end_at'] ?? null,
                ':th' => $data['theme'] ?? 'sand',
                ':id' => $id,
            ]);
            json_response(['ok' => true]);
        }
        case 'delete_event': {
            require_admin();
            $data = read_json_body();
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) {
                json_response(['error' => 'invalid_id'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('delete from events where id = :id');
            $stmt->execute([':id' => $id]);
            json_response(['ok' => true]);
        }
        case 'create_task': {
            require_admin();
            $data = read_json_body();
            $eventId = (int)($data['event_id'] ?? 0);
            $title = trim($data['title'] ?? '');
            if ($eventId <= 0 || $title === '' || empty($data['start_at'])) {
                json_response(['error' => 'missing_fields'], 400);
            }
            $expected = (int)($data['expected_volunteers'] ?? 1);
            if ($expected < 1) {
                $expected = 1;
            }
            $pdo = db();
            $stmt = $pdo->prepare('insert into tasks (event_id, title, description, start_at, end_at, expected_volunteers) values (:e, :t, :d, :s, :en, :ex) returning id');
            $stmt->execute([
                ':e' => $eventId,
                ':t' => $title,
                ':d' => $data['description'] ?? null,
                ':s' => $data['start_at'],
                ':en' => $data['end_at'] ?? null,
                ':ex' => $expected,
            ]);
            $row = $stmt->fetch();
            json_response(['id' => (int)$row['id']]);
        }
        case 'list_tasks': {
            require_admin();
            $eventId = (int)($_GET['event_id'] ?? 0);
            if ($eventId <= 0) {
                json_response(['error' => 'invalid_event'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('select * from tasks where event_id = :e order by start_at asc');
            $stmt->execute([':e' => $eventId]);
            $tasks = $stmt->fetchAll();
            json_response(['tasks' => $tasks]);
        }
        case 'list_tasks_admin': {
            require_admin();
            $eventId = (int)($_GET['event_id'] ?? 0);
            if ($eventId <= 0) {
                json_response(['error' => 'invalid_event'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('select * from tasks where event_id = :e order by start_at asc');
            $stmt->execute([':e' => $eventId]);
            $tasks = $stmt->fetchAll();

            $assignStmt = $pdo->prepare(
                'select ta.task_id, ta.comment, v.id as volunteer_id, v.first_name, v.last_name, v.email, v.phone
                 from task_assignments ta
                 join volunteers v on v.id = ta.volunteer_id
                 where v.event_id = :e
                 order by v.last_name, v.first_name'
            );
            $assignStmt->execute([':e' => $eventId]);
            $assignments = $assignStmt->fetchAll();

            $byTask = [];
            foreach ($assignments as $a) {
                $tid = (int)$a['task_id'];
                if (!isset($byTask[$tid])) {
                    $byTask[$tid] = [];
                }
                $byTask[$tid][] = [
                    'volunteer_id' => (int)$a['volunteer_id'],
                    'first_name' => $a['first_name'],
                    'last_name' => $a['last_name'],
                    'email' => $a['email'],
                    'phone' => $a['phone'],
                    'comment' => $a['comment'] ?? '',
                ];
            }

            $result = [];
            foreach ($tasks as $t) {
                $tid = (int)$t['id'];
                $t['assigned'] = $byTask[$tid] ?? [];
                $result[] = $t;
            }

            json_response(['tasks' => $result]);
        }
        case 'admin_add_assignment': {
            require_admin();
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $taskId = (int)($data['task_id'] ?? 0);
            $volunteerId = (int)($data['volunteer_id'] ?? 0);
            $comment = trim((string)($data['comment'] ?? ''));
            if ($taskId <= 0 || $volunteerId <= 0) {
                json_response(['error' => 'missing_fields'], 400);
            }

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $taskStmt = $pdo->prepare('select id, event_id, expected_volunteers from tasks where id = :t');
                $taskStmt->execute([':t' => $taskId]);
                $task = $taskStmt->fetch();
                if (!$task) {
                    $pdo->rollBack();
                    json_response(['error' => 'invalid_task'], 400);
                }

                $volStmt = $pdo->prepare('select id, event_id from volunteers where id = :v');
                $volStmt->execute([':v' => $volunteerId]);
                $vol = $volStmt->fetch();
                if (!$vol || (int)$vol['event_id'] !== (int)$task['event_id']) {
                    $pdo->rollBack();
                    json_response(['error' => 'invalid_volunteer'], 400);
                }

                $dupStmt = $pdo->prepare('select 1 from task_assignments where task_id = :t and volunteer_id = :v');
                $dupStmt->execute([':t' => $taskId, ':v' => $volunteerId]);
                if ($dupStmt->fetch()) {
                    $pdo->rollBack();
                    json_response(['error' => 'already_assigned'], 409);
                }

                $countStmt = $pdo->prepare(
                    'select count(*) as c from task_assignments ta
                     join volunteers v on v.id = ta.volunteer_id
                     where ta.task_id = :t and v.event_id = :e'
                );
                $countStmt->execute([':t' => $taskId, ':e' => (int)$task['event_id']]);
                $count = (int)$countStmt->fetch()['c'];
                if ($count >= (int)$task['expected_volunteers']) {
                    $pdo->rollBack();
                    json_response(['error' => 'task_full'], 409);
                }

                $ins = $pdo->prepare('insert into task_assignments (task_id, volunteer_id, comment) values (:t, :v, :c)');
                $ins->execute([
                    ':t' => $taskId,
                    ':v' => $volunteerId,
                    ':c' => $comment === '' ? null : $comment,
                ]);

                $pdo->commit();
                json_response(['ok' => true]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        }
        case 'admin_remove_assignment': {
            require_admin();
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $taskId = (int)($data['task_id'] ?? 0);
            $volunteerId = (int)($data['volunteer_id'] ?? 0);
            if ($taskId <= 0 || $volunteerId <= 0) {
                json_response(['error' => 'missing_fields'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('delete from task_assignments where task_id = :t and volunteer_id = :v');
            $stmt->execute([':t' => $taskId, ':v' => $volunteerId]);
            json_response(['ok' => true]);
        }
        case 'admin_update_assignment_comment': {
            require_admin();
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $taskId = (int)($data['task_id'] ?? 0);
            $volunteerId = (int)($data['volunteer_id'] ?? 0);
            $comment = trim((string)($data['comment'] ?? ''));
            if ($taskId <= 0 || $volunteerId <= 0) {
                json_response(['error' => 'missing_fields'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('update task_assignments set comment = :c where task_id = :t and volunteer_id = :v');
            $stmt->execute([
                ':c' => $comment === '' ? null : $comment,
                ':t' => $taskId,
                ':v' => $volunteerId,
            ]);
            json_response(['ok' => true]);
        }
        case 'export_volunteers_csv': {
            require_admin();
            $eventId = (int)($_GET['event_id'] ?? 0);
            if ($eventId <= 0) {
                json_response(['error' => 'invalid_event'], 400);
            }
            $pdo = db();

            $eventStmt = $pdo->prepare('select title from events where id = :e');
            $eventStmt->execute([':e' => $eventId]);
            $event = $eventStmt->fetch();
            if (!$event) {
                json_response(['error' => 'not_found'], 404);
            }
            $title = $event['title'] ?? 'evenement';

            $stmt = $pdo->prepare(
                'select v.id, v.first_name, v.last_name, v.email, v.phone
                 from volunteers v
                 where v.event_id = :e
                 order by v.last_name, v.first_name'
            );
            $stmt->execute([':e' => $eventId]);
            $vols = $stmt->fetchAll();

            $assignStmt = $pdo->prepare(
                'select v.id as volunteer_id, t.title as task_title, ta.comment
                 from task_assignments ta
                 join tasks t on t.id = ta.task_id
                 join volunteers v on v.id = ta.volunteer_id
                 where t.event_id = :e
                 order by t.start_at asc'
            );
            $assignStmt->execute([':e' => $eventId]);
            $assignments = $assignStmt->fetchAll();

            $byVol = [];
            foreach ($assignments as $a) {
                $vid = (int)$a['volunteer_id'];
                if (!isset($byVol[$vid])) {
                    $byVol[$vid] = [];
                }
                $label = $a['task_title'];
                if (!empty($a['comment'])) {
                    $label .= ' (' . $a['comment'] . ')';
                }
                $byVol[$vid][] = $label;
            }

            $filename = 'benevoles_' . preg_replace('/[^a-z0-9_-]+/i', '_', $title) . '.csv';
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');

            $out = fopen('php://output', 'w');
            fputcsv($out, ['id', 'prenom', 'nom', 'email', 'telephone', 'taches']);
            foreach ($vols as $v) {
                $tasks = $byVol[(int)$v['id']] ?? [];
                fputcsv($out, [
                    $v['id'],
                    $v['first_name'],
                    $v['last_name'],
                    $v['email'],
                    $v['phone'],
                    implode(' | ', $tasks),
                ]);
            }
            fclose($out);
            exit;
        }
        case 'export_tasks_csv': {
            require_admin();
            $eventId = (int)($_GET['event_id'] ?? 0);
            if ($eventId <= 0) {
                json_response(['error' => 'invalid_event'], 400);
            }
            $pdo = db();

            $eventStmt = $pdo->prepare('select title from events where id = :e');
            $eventStmt->execute([':e' => $eventId]);
            $event = $eventStmt->fetch();
            if (!$event) {
                json_response(['error' => 'not_found'], 404);
            }

            $tasksStmt = $pdo->prepare(
                'select id, title, start_at, expected_volunteers
                 from tasks
                 where event_id = :e
                 order by start_at asc'
            );
            $tasksStmt->execute([':e' => $eventId]);
            $tasks = $tasksStmt->fetchAll();

            $assignStmt = $pdo->prepare(
                'select ta.task_id, v.first_name, v.last_name, v.phone, ta.comment
                 from task_assignments ta
                 join volunteers v on v.id = ta.volunteer_id
                 join tasks t on t.id = ta.task_id
                 where t.event_id = :e
                 order by t.start_at asc, v.last_name, v.first_name'
            );
            $assignStmt->execute([':e' => $eventId]);
            $assignments = $assignStmt->fetchAll();

            $byTask = [];
            foreach ($assignments as $a) {
                $tid = (int)$a['task_id'];
                if (!isset($byTask[$tid])) {
                    $byTask[$tid] = [];
                }
                $label = trim($a['first_name'] . ' ' . $a['last_name']);
                if (!empty($a['phone'])) {
                    $label .= ' (' . $a['phone'] . ')';
                }
                if (!empty($a['comment'])) {
                    $label .= ' - ' . $a['comment'];
                }
                $byTask[$tid][] = $label;
            }

            $filename = 'taches_' . preg_replace('/[^a-z0-9_-]+/i', '_', $event['title'] ?? 'evenement') . '.csv';
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');

            $out = fopen('php://output', 'w');
            fputcsv($out, ['tache', 'date', 'inscrits', 'total_attendu', 'liste_benevoles']);
            foreach ($tasks as $t) {
                $tid = (int)$t['id'];
                $list = $byTask[$tid] ?? [];
                fputcsv($out, [
                    $t['title'],
                    $t['start_at'],
                    count($list),
                    $t['expected_volunteers'],
                    implode(' | ', $list),
                ]);
            }
            fclose($out);
            exit;
        }
        case 'duplicate_event': {
            require_admin();
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $eventId = (int)($data['id'] ?? 0);
            if ($eventId <= 0) {
                json_response(['error' => 'invalid_event'], 400);
            }
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $eventStmt = $pdo->prepare('select * from events where id = :id');
                $eventStmt->execute([':id' => $eventId]);
                $event = $eventStmt->fetch();
                if (!$event) {
                    $pdo->rollBack();
                    json_response(['error' => 'not_found'], 404);
                }

                $token = bin2hex(random_bytes(12));
                $newTitle = $event['title'] . ' (copie)';
                $insEvent = $pdo->prepare(
                    'insert into events (title, description, location, start_at, end_at, theme, public_token)
                     values (:t, :d, :l, :s, :e, :th, :pt) returning id'
                );
                $insEvent->execute([
                    ':t' => $newTitle,
                    ':d' => $event['description'] ?? null,
                    ':l' => $event['location'] ?? null,
                    ':s' => $event['start_at'] ?? null,
                    ':e' => $event['end_at'] ?? null,
                    ':th' => $event['theme'] ?? 'sand',
                    ':pt' => $token,
                ]);
                $newId = (int)$insEvent->fetch()['id'];

                $tasksStmt = $pdo->prepare('select * from tasks where event_id = :e');
                $tasksStmt->execute([':e' => $eventId]);
                $tasks = $tasksStmt->fetchAll();
                foreach ($tasks as $t) {
                    $insTask = $pdo->prepare(
                        'insert into tasks (event_id, title, description, start_at, end_at, expected_volunteers)
                         values (:e, :t, :d, :s, :en, :ex)'
                    );
                    $insTask->execute([
                        ':e' => $newId,
                        ':t' => $t['title'],
                        ':d' => $t['description'] ?? null,
                        ':s' => $t['start_at'],
                        ':en' => $t['end_at'] ?? null,
                        ':ex' => (int)$t['expected_volunteers'],
                    ]);
                }

                $pdo->commit();
                json_response(['id' => $newId]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        }
        case 'import_volunteers_csv': {
            require_admin();
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $eventId = (int)($data['event_id'] ?? 0);
            $csv = $data['csv'] ?? '';
            if ($eventId <= 0 || trim($csv) === '') {
                json_response(['error' => 'missing_fields'], 400);
            }
            $pdo = db();
            $lines = preg_split('/\r\n|\r|\n/', trim($csv));
            if (!$lines) {
                json_response(['error' => 'invalid_csv'], 400);
            }
            $headers = str_getcsv(array_shift($lines));
            $map = array_flip(array_map('strtolower', $headers));
            $required = ['prenom', 'nom'];
            foreach ($required as $r) {
                if (!isset($map[$r])) {
                    json_response(['error' => 'missing_columns'], 400);
                }
            }
            foreach ($lines as $line) {
                if (trim($line) === '') {
                    continue;
                }
                $row = str_getcsv($line);
                $first = $row[$map['prenom']] ?? '';
                $last = $row[$map['nom']] ?? '';
                if (trim($first) === '' || trim($last) === '') {
                    continue;
                }
                $email = $map['email'] ?? null;
                $phone = $map['telephone'] ?? ($map['téléphone'] ?? null);
                $phoneValue = $phone !== null ? normalize_phone($row[$phone] ?? null) : null;
                $stmt = $pdo->prepare('insert into volunteers (event_id, first_name, last_name, email, phone) values (:e, :f, :l, :m, :p)');
                $stmt->execute([
                    ':e' => $eventId,
                    ':f' => trim($first),
                    ':l' => trim($last),
                    ':m' => $email !== null ? ($row[$email] ?? null) : null,
                    ':p' => $phoneValue,
                ]);
            }
            json_response(['ok' => true]);
        }
        case 'import_tasks_csv': {
            require_admin();
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $eventId = (int)($data['event_id'] ?? 0);
            $csv = $data['csv'] ?? '';
            if ($eventId <= 0 || trim($csv) === '') {
                json_response(['error' => 'missing_fields'], 400);
            }
            $pdo = db();
            $lines = preg_split('/\r\n|\r|\n/', trim($csv));
            if (!$lines) {
                json_response(['error' => 'invalid_csv'], 400);
            }
            $headers = str_getcsv(array_shift($lines));
            $map = array_flip(array_map('strtolower', $headers));
            $required = ['tache', 'date', 'total_attendu'];
            foreach ($required as $r) {
                if (!isset($map[$r])) {
                    json_response(['error' => 'missing_columns'], 400);
                }
            }
            foreach ($lines as $line) {
                if (trim($line) === '') {
                    continue;
                }
                $row = str_getcsv($line);
                $title = $row[$map['tache']] ?? '';
                $date = $row[$map['date']] ?? '';
                $expected = (int)($row[$map['total_attendu']] ?? 1);
                if (trim($title) === '' || trim($date) === '') {
                    continue;
                }
                $stmt = $pdo->prepare(
                    'insert into tasks (event_id, title, start_at, expected_volunteers)
                     values (:e, :t, :s, :ex)'
                );
                $stmt->execute([
                    ':e' => $eventId,
                    ':t' => trim($title),
                    ':s' => $date,
                    ':ex' => $expected > 0 ? $expected : 1,
                ]);
            }
            json_response(['ok' => true]);
        }
        case 'update_task': {
            require_admin();
            $data = read_json_body();
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) {
                json_response(['error' => 'invalid_id'], 400);
            }
            $expected = (int)($data['expected_volunteers'] ?? 1);
            if ($expected < 1) {
                $expected = 1;
            }
            $pdo = db();
            $stmt = $pdo->prepare('update tasks set title = :t, description = :d, start_at = :s, end_at = :en, expected_volunteers = :ex where id = :id');
            $stmt->execute([
                ':t' => $data['title'] ?? '',
                ':d' => $data['description'] ?? null,
                ':s' => $data['start_at'] ?? null,
                ':en' => $data['end_at'] ?? null,
                ':ex' => $expected,
                ':id' => $id,
            ]);
            json_response(['ok' => true]);
        }
        case 'delete_task': {
            require_admin();
            $data = read_json_body();
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) {
                json_response(['error' => 'invalid_id'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('delete from tasks where id = :id');
            $stmt->execute([':id' => $id]);
            json_response(['ok' => true]);
        }
        case 'create_volunteer_admin': {
            require_admin();
            $data = read_json_body();
            $eventId = (int)($data['event_id'] ?? 0);
            $first = trim($data['first_name'] ?? '');
            $last = trim($data['last_name'] ?? '');
            if ($eventId <= 0 || $first === '' || $last === '') {
                json_response(['error' => 'missing_fields'], 400);
            }
            $phone = normalize_phone($data['phone'] ?? null);
            $pdo = db();
            $stmt = $pdo->prepare('insert into volunteers (event_id, first_name, last_name, email, phone) values (:e, :f, :l, :m, :p) returning id');
            $stmt->execute([
                ':e' => $eventId,
                ':f' => $first,
                ':l' => $last,
                ':m' => $data['email'] ?? null,
                ':p' => $phone,
            ]);
            $row = $stmt->fetch();
            json_response(['id' => (int)$row['id']]);
        }
        case 'list_volunteers': {
            require_admin();
            $eventId = (int)($_GET['event_id'] ?? 0);
            if ($eventId <= 0) {
                json_response(['error' => 'invalid_event'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('select * from volunteers where event_id = :e order by created_at desc');
            $stmt->execute([':e' => $eventId]);
            $rows = $stmt->fetchAll();
            json_response(['volunteers' => $rows]);
        }
        case 'update_volunteer': {
            require_admin();
            $data = read_json_body();
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) {
                json_response(['error' => 'invalid_id'], 400);
            }
            $phone = normalize_phone($data['phone'] ?? null);
            $pdo = db();
            $stmt = $pdo->prepare('update volunteers set first_name = :f, last_name = :l, email = :m, phone = :p where id = :id');
            $stmt->execute([
                ':f' => $data['first_name'] ?? '',
                ':l' => $data['last_name'] ?? '',
                ':m' => $data['email'] ?? null,
                ':p' => $phone,
                ':id' => $id,
            ]);
            json_response(['ok' => true]);
        }
        case 'delete_volunteer': {
            require_admin();
            $data = read_json_body();
            $id = (int)($data['id'] ?? 0);
            if ($id <= 0) {
                json_response(['error' => 'invalid_id'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('delete from volunteers where id = :id');
            $stmt->execute([':id' => $id]);
            json_response(['ok' => true]);
        }
        case 'get_event_public': {
            $token = $_GET['token'] ?? '';
            if ($token === '') {
                json_response(['error' => 'missing_token'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('select id, title, description, location, start_at, end_at, theme from events where public_token = :t');
            $stmt->execute([':t' => $token]);
            $event = $stmt->fetch();
            if (!$event) {
                json_response(['error' => 'not_found'], 404);
            }
            json_response(['event' => $event]);
        }
        case 'list_tasks_public': {
            $token = $_GET['token'] ?? '';
            if ($token === '') {
                json_response(['error' => 'missing_token'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('select id from events where public_token = :t');
            $stmt->execute([':t' => $token]);
            $event = $stmt->fetch();
            if (!$event) {
                json_response(['error' => 'not_found'], 404);
            }
            $eventId = (int)$event['id'];

            $tasksStmt = $pdo->prepare('select * from tasks where event_id = :e order by start_at asc');
            $tasksStmt->execute([':e' => $eventId]);
            $tasks = $tasksStmt->fetchAll();

            $assignStmt = $pdo->prepare(
                'select ta.task_id, ta.comment, v.first_name, v.last_name, v.id as volunteer_id
                 from task_assignments ta
                 join volunteers v on v.id = ta.volunteer_id
                 join tasks t on t.id = ta.task_id
                 where t.event_id = :e
                 order by v.last_name, v.first_name'
            );
            $assignStmt->execute([':e' => $eventId]);
            $assignments = $assignStmt->fetchAll();

            $byTask = [];
            foreach ($assignments as $a) {
                $tid = (int)$a['task_id'];
                if (!isset($byTask[$tid])) {
                    $byTask[$tid] = [];
                }
                $byTask[$tid][] = [
                    'volunteer_id' => (int)$a['volunteer_id'],
                    'first_name' => $a['first_name'],
                    'last_name' => $a['last_name'],
                    'comment' => $a['comment'] ?? '',
                ];
            }

            $result = [];
            foreach ($tasks as $t) {
                $tid = (int)$t['id'];
                $assigned = $byTask[$tid] ?? [];
                $remaining = (int)$t['expected_volunteers'] - count($assigned);
                if ($remaining < 0) {
                    $remaining = 0;
                }
                $t['assigned'] = $assigned;
                $t['remaining'] = $remaining;
                $result[] = $t;
            }

            json_response(['tasks' => $result]);
        }
        case 'upsert_volunteer_public': {
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $token = $data['token'] ?? '';
            $first = trim($data['first_name'] ?? '');
            $last = trim($data['last_name'] ?? '');
            if ($token === '' || $first === '' || $last === '') {
                json_response(['error' => 'missing_fields'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('select id from events where public_token = :t');
            $stmt->execute([':t' => $token]);
            $event = $stmt->fetch();
            if (!$event) {
                json_response(['error' => 'not_found'], 404);
            }
            $eventId = (int)$event['id'];
            $phone = normalize_phone($data['phone'] ?? null);

            $volunteerId = (int)($data['volunteer_id'] ?? 0);
            if ($volunteerId > 0) {
                $update = $pdo->prepare('update volunteers set first_name = :f, last_name = :l, email = :m, phone = :p where id = :id and event_id = :e');
                $update->execute([
                    ':f' => $first,
                    ':l' => $last,
                    ':m' => $data['email'] ?? null,
                    ':p' => $phone,
                    ':id' => $volunteerId,
                    ':e' => $eventId,
                ]);
                if ($update->rowCount() > 0) {
                    json_response(['volunteer_id' => $volunteerId]);
                }
            }

            $insert = $pdo->prepare('insert into volunteers (event_id, first_name, last_name, email, phone) values (:e, :f, :l, :m, :p) returning id');
            $insert->execute([
                ':e' => $eventId,
                ':f' => $first,
                ':l' => $last,
                ':m' => $data['email'] ?? null,
                ':p' => $phone,
            ]);
            $row = $insert->fetch();
            json_response(['volunteer_id' => (int)$row['id']]);
        }
        case 'get_volunteer_public': {
            $token = $_GET['token'] ?? '';
            $volunteerId = (int)($_GET['volunteer_id'] ?? 0);
            if ($token === '' || $volunteerId <= 0) {
                json_response(['error' => 'missing_fields'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('select e.id as event_id from events e where e.public_token = :t');
            $stmt->execute([':t' => $token]);
            $event = $stmt->fetch();
            if (!$event) {
                json_response(['error' => 'not_found'], 404);
            }
            $eventId = (int)$event['event_id'];
            $v = $pdo->prepare('select id, first_name, last_name, email, phone from volunteers where id = :id and event_id = :e');
            $v->execute([':id' => $volunteerId, ':e' => $eventId]);
            $vol = $v->fetch();
            if (!$vol) {
                json_response(['error' => 'not_found'], 404);
            }

            $a = $pdo->prepare(
                'select ta.task_id, ta.comment
                 from task_assignments ta
                 join tasks t on t.id = ta.task_id
                 where ta.volunteer_id = :v and t.event_id = :e'
            );
            $a->execute([':v' => $volunteerId, ':e' => $eventId]);
            $rows = $a->fetchAll();
            $taskIds = array_map(fn($r) => (int)$r['task_id'], $rows);
            $taskComments = [];
            foreach ($rows as $r) {
                $taskComments[(int)$r['task_id']] = $r['comment'] ?? '';
            }

            json_response(['volunteer' => $vol, 'task_ids' => $taskIds, 'task_comments' => $taskComments]);
        }
        case 'set_assignments_public': {
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $token = $data['token'] ?? '';
            $volunteerId = (int)($data['volunteer_id'] ?? 0);
            $taskIds = $data['task_ids'] ?? [];
            $taskComments = is_array($data['task_comments'] ?? null) ? $data['task_comments'] : [];
            if ($token === '' || $volunteerId <= 0 || !is_array($taskIds)) {
                json_response(['error' => 'missing_fields'], 400);
            }

            $pdo = db();
            $stmt = $pdo->prepare('select id from events where public_token = :t');
            $stmt->execute([':t' => $token]);
            $event = $stmt->fetch();
            if (!$event) {
                json_response(['error' => 'not_found'], 404);
            }
            $eventId = (int)$event['id'];

            $pdo->beginTransaction();
            try {
                $checkVol = $pdo->prepare('select id from volunteers where id = :v and event_id = :e');
                $checkVol->execute([':v' => $volunteerId, ':e' => $eventId]);
                if (!$checkVol->fetch()) {
                    $pdo->rollBack();
                    json_response(['error' => 'invalid_volunteer'], 400);
                }

                $pdo->prepare('delete from task_assignments where volunteer_id = :v')->execute([':v' => $volunteerId]);

                $taskIds = array_values(array_unique(array_map('intval', $taskIds)));
                foreach ($taskIds as $taskId) {
                    if ($taskId <= 0) {
                        continue;
                    }
                    $taskStmt = $pdo->prepare('select id, expected_volunteers from tasks where id = :t and event_id = :e');
                    $taskStmt->execute([':t' => $taskId, ':e' => $eventId]);
                    $task = $taskStmt->fetch();
                    if (!$task) {
                        $pdo->rollBack();
                        json_response(['error' => 'invalid_task'], 400);
                    }

                    $countStmt = $pdo->prepare(
                        'select count(*) as c from task_assignments ta
                         join volunteers v on v.id = ta.volunteer_id
                         where ta.task_id = :t and v.event_id = :e'
                    );
                    $countStmt->execute([':t' => $taskId, ':e' => $eventId]);
                    $count = (int)$countStmt->fetch()['c'];

                    if ($count >= (int)$task['expected_volunteers']) {
                        $pdo->rollBack();
                        json_response(['error' => 'task_full', 'task_id' => $taskId], 409);
                    }

                    $comment = null;
                    if (array_key_exists($taskId, $taskComments)) {
                        $comment = trim((string)$taskComments[$taskId]);
                    }
                    $insert = $pdo->prepare('insert into task_assignments (task_id, volunteer_id, comment) values (:t, :v, :c)');
                    $insert->execute([':t' => $taskId, ':v' => $volunteerId, ':c' => $comment === '' ? null : $comment]);
                }

                $pdo->commit();
                json_response(['ok' => true]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        }
        case 'lookup_volunteer_by_phone': {
            if ($method !== 'POST') {
                json_response(['error' => 'method_not_allowed'], 405);
            }
            $data = read_json_body();
            $token = $data['token'] ?? '';
            $phone = normalize_phone($data['phone'] ?? null);
            if ($token === '' || $phone === null || $phone === '') {
                json_response(['error' => 'missing_fields'], 400);
            }
            $pdo = db();
            $stmt = $pdo->prepare('select id from events where public_token = :t');
            $stmt->execute([':t' => $token]);
            $event = $stmt->fetch();
            if (!$event) {
                json_response(['error' => 'not_found'], 404);
            }
            $eventId = (int)$event['id'];

            $v = $pdo->prepare('select id, first_name, last_name, email, phone from volunteers where event_id = :e and phone = :p order by id desc limit 1');
            $v->execute([':e' => $eventId, ':p' => $phone]);
            $vol = $v->fetch();
            if (!$vol) {
                json_response(['error' => 'not_found'], 404);
            }

            $a = $pdo->prepare(
                'select ta.task_id, ta.comment
                 from task_assignments ta
                 join tasks t on t.id = ta.task_id
                 where ta.volunteer_id = :v and t.event_id = :e'
            );
            $a->execute([':v' => (int)$vol['id'], ':e' => $eventId]);
            $rows = $a->fetchAll();
            $taskIds = array_map(fn($r) => (int)$r['task_id'], $rows);
            $taskComments = [];
            foreach ($rows as $r) {
                $taskComments[(int)$r['task_id']] = $r['comment'] ?? '';
            }

            json_response(['volunteer' => $vol, 'task_ids' => $taskIds, 'task_comments' => $taskComments]);
        }
        default:
            json_response(['error' => 'unknown_action'], 404);
    }
} catch (Throwable $e) {
    json_response(['error' => 'server_error', 'detail' => $e->getMessage()], 500);
}
