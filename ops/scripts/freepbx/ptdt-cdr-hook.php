#!/usr/bin/php
<?php
declare(strict_types=1);

const DEFAULT_CONFIG = '/etc/ptdt-dialer/freepbx-cdr-hook.env';
const DEFAULT_LOG = '/var/log/ptdt-freepbx-cdr-hook.log';

function log_line(string $message): void
{
    $line = sprintf("[%s] %s\n", gmdate('c'), $message);
    @file_put_contents(getenv('PTDT_FREEPBX_HOOK_LOG') ?: DEFAULT_LOG, $line, FILE_APPEND | LOCK_EX);
}

function read_config(string $path): array
{
    if (!is_readable($path)) {
        throw new RuntimeException("Config file is not readable: {$path}");
    }

    $config = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || substr($line, 0, 1) === '#' || strpos($line, '=') === false) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $config[trim($key)] = trim($value, " \t\n\r\0\x0B\"'");
    }
    return $config;
}

function read_agi_environment(): void
{
    while (($line = fgets(STDIN)) !== false) {
        if (trim($line) === '') {
            return;
        }
    }
}

function agi_get(string $expression): string
{
    fwrite(STDOUT, "GET FULL VARIABLE {$expression}\n");
    fflush(STDOUT);

    $response = fgets(STDIN);
    if ($response === false) {
        return '';
    }

    if (preg_match('/result=1\s+\((.*)\)/', trim($response), $matches)) {
        return trim($matches[1]);
    }
    return '';
}

function clean_text(?string $value, int $max = 240): string
{
    $value = preg_replace('/[\x00-\x1F\x7F]/', '', $value ?? '') ?? '';
    return substr(trim($value), 0, $max);
}

function clean_digits(?string $value, int $max = 32): string
{
    return substr(preg_replace('/\D+/', '', $value ?? '') ?? '', 0, $max);
}

function normalize_api_base(string $base): string
{
    $base = rtrim(trim($base), '/');
    if ($base === '') {
        throw new RuntimeException('PTDT_DIALER_API_BASE is required');
    }
    return $base;
}

function post_json(string $url, string $secret, array $payload): array
{
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES);
    if ($body === false) {
        throw new RuntimeException('Unable to encode CDR payload');
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => [
                'Content-Type: application/json',
                'X-PTDT-Ingest-Secret: ' . $secret,
            ],
            'content' => $body,
            'ignore_errors' => true,
            'timeout' => 12,
        ],
    ]);

    $response = @file_get_contents($url, false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
            $status = (int) $matches[1];
            break;
        }
    }

    return ['status' => $status, 'response' => $response === false ? '' : $response];
}

try {
    read_agi_environment();
    $config = read_config(getenv('PTDT_FREEPBX_HOOK_CONFIG') ?: DEFAULT_CONFIG);
    $apiBase = normalize_api_base($config['PTDT_DIALER_API_BASE'] ?? '');
    $secret = trim($config['PTDT_FREEPBX_INGEST_SECRET'] ?? '');
    if ($secret === '') {
        throw new RuntimeException('PTDT_FREEPBX_INGEST_SECRET is required');
    }

    $callId = clean_digits(agi_get('${PTDT_CALL_ID}'));
    $uniqueId = clean_text(agi_get('${UNIQUEID}'), 80);
    $linkedId = clean_text(agi_get('${CHANNEL(linkedid)}'), 80);
    $billsec = clean_digits(agi_get('${CDR(billsec)}'), 12);
    $duration = clean_digits(agi_get('${CDR(duration)}'), 12);

    $payload = [
        'event' => 'cdr',
        'callId' => $callId,
        'providerCallId' => $linkedId ?: $uniqueId,
        'uniqueid' => $uniqueId,
        'linkedid' => $linkedId,
        'src' => clean_text(agi_get('${CDR(src)}'), 80) ?: clean_text(agi_get('${CALLERID(num)}'), 80),
        'dst' => clean_text(agi_get('${CDR(dst)}'), 80) ?: clean_text(agi_get('${EXTEN}'), 80),
        'startedAt' => clean_text(agi_get('${CDR(start)}'), 80),
        'answeredAt' => clean_text(agi_get('${CDR(answer)}'), 80),
        'endedAt' => clean_text(agi_get('${CDR(end)}'), 80),
        'durationSeconds' => $duration,
        'billsec' => $billsec,
        'disposition' => clean_text(agi_get('${CDR(disposition)}'), 80),
    ];

    if ($payload['callId'] === '' && $payload['providerCallId'] === '') {
        log_line('Skipped CDR post: missing PTDT_CALL_ID and provider reference');
        exit(0);
    }

    $url = $apiBase . '/recordings/ingest/freepbx/cdr';
    $result = post_json($url, $secret, $payload);
    $ok = $result['status'] >= 200 && $result['status'] < 300;
    log_line(sprintf(
        '%s CDR post callId=%s uniqueid=%s linkedid=%s billsec=%s http=%d',
        $ok ? 'OK' : 'FAILED',
        $payload['callId'] ?: '-',
        $payload['uniqueid'] ?: '-',
        $payload['linkedid'] ?: '-',
        $payload['billsec'] ?: '0',
        $result['status']
    ));
    exit($ok ? 0 : 1);
} catch (Throwable $error) {
    log_line('ERROR ' . $error->getMessage());
    exit(1);
}
