<?php
namespace App;

/** Read only the string/animation tables of the published DASF binary. */
final class PublishedSpriteAnimations
{
    /** Match native strips or the old atlas pipeline's integer resampling. */
    public static function frameScale(array $lengths, int $frames, int $sourceFps, int $targetFps): ?int
    {
        if (in_array($frames, $lengths, true)) return 1;
        if ($sourceFps <= 0 || $targetFps <= $sourceFps || $targetFps % $sourceFps !== 0) return null;
        $scale = intdiv($targetFps, $sourceFps);
        if ($frames % $scale !== 0 || !in_array(intdiv($frames, $scale), $lengths, true)) return null;
        return $scale;
    }

    public static function read(string $path): array
    {
        if (!is_file($path)) return [];
        $bytes = file_get_contents($path);
        if (substr($bytes, 0, 4) !== 'DASF') throw new \RuntimeException("Invalid asset: $path");
        $count = unpack('v', $bytes, 12)[1];
        $sections = [];
        for ($i = 0; $i < $count; ++$i) {
            $s = unpack('vtype/Voffset/Vlength', $bytes, 20 + 10 * $i);
            $sections[$s['type']] = $s['offset'];
        }
        $base = $sections[6];
        $n = unpack('v', $bytes, $base)[1];
        $strings = [];
        for ($i = 0; $i < $n; ++$i) {
            $s = unpack('Voffset/vlength', $bytes, $base + 2 + $i * 6);
            $strings[] = substr($bytes, $base + 2 + 6 * $n + $s['offset'], $s['length']);
        }
        $p = $sections[7];
        $n = unpack('v', $bytes, $p)[1]; $p += 2;
        $animations = [];
        for ($i = 0; $i < $n; ++$i) {
            $a = unpack('vname/vfps', $bytes, $p);
            $frames = unpack('v', $bytes, $p + 12)[1];
            $animations[$strings[$a['name']]] = ['fps' => $a['fps'], 'frames' => $frames];
            $p += 19 + 4 * $frames;
        }
        return $animations;
    }
}
