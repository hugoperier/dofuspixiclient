<?php
// Synthetic SWF: no retail assets are required for this regression test.
require_once __DIR__ . '/../vendor/autoload.php';

use App\SpriteSounds;
use App\PublishedSpriteAnimations;
use Arakne\Swf\SwfFile;
use Arakne\Swf\Extractor\SwfExtractor;

function tag(int $code, string $data = ''): string
{
    $length = strlen($data);
    return pack('v', ($code << 6) | min($length, 63)) .
        ($length >= 63 ? pack('V', $length) : '') . $data;
}

function action(int $opcode, string $data): string
{
    return chr($opcode) . pack('v', strlen($data)) . $data;
}

function playSound(string $name, bool $constant = false, bool $nested = false): string
{
    $pool = $constant ? action(0x88, pack('v', 1) . $name . "\0") : '';
    $argument = $constant ? "\x08\x00" : "\x00$name\0";
    $receiver = $nested
        ? action(0x96, "\x00_parent\0") . "\x1c" . action(0x96, "\x00SOMA\0") . "\x4e"
        : action(0x96, "\x00SOMA\0") . "\x1c";
    return $pool . action(0x96, $argument . "\x07" . pack('V', 1)) .
        $receiver . action(0x96, "\x00playSound\0") . "\x52\x17";
}

foreach ([
    [[23], 69, 20, 60, 3],
    [[69], 69, 40, 60, 1],
    [[23], 70, 20, 60, null],
    [[23], 69, 40, 60, null],
] as [$lengths, $frames, $sourceFps, $targetFps, $scale]) {
    if (PublishedSpriteAnimations::frameScale($lengths, $frames, $sourceFps, $targetFps) !== $scale) {
        throw new RuntimeException('Incorrect published frame resampling');
    }
}

$child = pack('vv', 2, 2) .
    tag(12, playSound('first') . "\0") . tag(1) .
    tag(12, playSound('voice', true) . playSound('impact', false, true) . "\0") . tag(1) . tag(0);
// The child is born on root frame 1, then held through root frame 3.
$root = pack('vv', 1, 4) . tag(1) .
    tag(26, "\x02" . pack('vv', 1, 2)) . tag(1) . tag(1) . tag(1) . tag(0);
$body = "\x08\x00" . pack('vv', 20 * 256, 1) .
    tag(39, $child) . tag(39, $root) .
    tag(56, pack('vv', 1, 1) . "walkR\0") . tag(1) . tag(0);
$path = tempnam(sys_get_temp_dir(), 'sprite-sound-test-');
try {
    file_put_contents($path, 'FWS' . chr(8) . pack('V', strlen($body) + 8) . $body);
    $extractor = new SwfExtractor(new SwfFile($path));
    $reader = new SpriteSounds();
    $sprite = $extractor->character(1);
    if ($reader->recursiveFrameCount($sprite) !== $sprite->framesCount(true)) {
        throw new RuntimeException('Recursive length differs from renderer');
    }
    $actual = $reader->extract($sprite, 4);
    $expected = [
        ['frame' => 1, 'soundId' => 'first'],
        ['frame' => 2, 'soundId' => 'voice'],
        ['frame' => 2, 'soundId' => 'impact'],
    ];
    if ($actual !== $expected) {
        throw new RuntimeException('Unexpected nested cues: ' . json_encode($actual));
    }
    $extractor->release();
    echo "PASS: nested placement, simultaneous literal/constant calls, held frame\n";
} finally {
    unlink($path);
}
