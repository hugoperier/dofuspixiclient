<?php
require_once __DIR__ . '/../vendor/autoload.php';

use App\CarriedAnchors;
use Arakne\Swf\SwfFile;
use Arakne\Swf\Extractor\SwfExtractor;

function tag(int $code, string $data = ''): string {
    $n = strlen($data);
    return pack('v', ($code << 6) | min($n, 63)) . ($n >= 63 ? pack('V', $n) : '') . $data;
}
function push(string $value): string { $data = "\0$value\0"; return "\x96" . pack('v', strlen($data)) . $data; }
function matrix(int $x, int $y): string {
    $n = (int) ceil(log(max(1, abs($x), abs($y)) + 1, 2)) + 1;
    $bits = '00' . sprintf('%05b', $n);
    foreach ([$x, $y] as $v) $bits .= str_pad(decbin($v < 0 ? (1 << $n) + $v : $v), $n, '0', STR_PAD_LEFT);
    $bits = str_pad($bits, (int) ceil(strlen($bits) / 8) * 8, '0');
    return implode('', array_map(fn ($byte) => chr(bindec($byte)), str_split($bits, 8)));
}

// A marker registers once, then follows placement moves and nested translation.
$register = push('this') . "\x1c\x96\x05\x00\x07\x01\x00\x00\x00" . push('GAC') . "\x1c" . push('registerCarried') . "\x52\x17\0";
$marker = pack('vv', 2, 1) . tag(12, $register) . tag(1) . tag(0);
$moving = pack('vv', 1, 3) . tag(26, "\x06" . pack('vv', 1, 2) . matrix(20, -200)) . tag(1) .
    tag(26, "\x05" . pack('v', 1) . matrix(40, -400)) . tag(1) . tag(28, pack('v', 1)) . tag(1) . tag(0);
$wrapper = pack('vv', 3, 1) . tag(26, "\x06" . pack('vv', 1, 1) . matrix(100, 200)) . tag(1) . tag(0);
$body = "\x08\x00" . pack('vv', 20 * 256, 1) . tag(39, $marker) . tag(39, $moving) . tag(39, $wrapper) . tag(1) . tag(0);
$path = tempnam(sys_get_temp_dir(), 'carried-anchors-');
try {
    file_put_contents($path, 'FWS' . chr(8) . pack('V', strlen($body) + 8) . $body);
    $extractor = new SwfExtractor(new SwfFile($path));
    $actual = (new CarriedAnchors())->extract($extractor->character(3));
    $expected = [['x' => 6.0, 'y' => 0.0], ['x' => 7.0, 'y' => -10.0], null];
    if ($actual !== $expected) throw new RuntimeException('Incorrect carried transforms: ' . json_encode($actual));
    $extractor->release();
    echo "PASS: registration, nested translation, moved placement and removal\n";
} finally { unlink($path); }
