<?php
// Usage: php scripts/export-fight-markers.php <retail-client/clips/sprites> <output>
require __DIR__ . '/../tools/assets-exporter/vendor/autoload.php';
use Arakne\Swf\SwfFile;
use Arakne\Swf\Extractor\SwfExtractor;
use Arakne\Swf\Extractor\Drawer\Converter\Converter;
use Arakne\Swf\Extractor\Timeline\Frame;

$source = $argv[1] ?? throw new RuntimeException('Missing sprite source directory');
$output = $argv[2] ?? throw new RuntimeException('Missing output directory');
if (!is_dir($output)) mkdir($output, 0777, true);
$manifest = [];
foreach ([0, 3] as $id) {
    $extractor = new SwfExtractor(new SwfFile("$source/$id.swf"));
    $root = $extractor->timeline()->frames[0];
    $converter = new Converter(subpixelStrokeWidth: false);
    foreach (['art' => false, 'circle' => true] as $layer => $isCircle) {
        $objects = array_filter($root->objects, static fn($obj) => ($obj->name === 'cercle') === $isCircle);
        if (!$objects) throw new RuntimeException("Empty $id/$layer");
        $frame = (new Frame($root->bounds, $objects))->compact();
        $svg = $converter->toSvg($frame, 0);
        // White mask: Pixi multiplies tint. Only the isolated circle is recoloured.
        if ($isCircle) $svg = preg_replace('/#000000\b/i', '#ffffff', $svg);
        file_put_contents("$output/$id-$layer.svg", $svg);
        $manifest["$id-$layer"] = [
            'x' => $frame->bounds->xmin / 20, 'y' => $frame->bounds->ymin / 20,
            'width' => ($frame->bounds->xmax - $frame->bounds->xmin) / 20,
            'height' => ($frame->bounds->ymax - $frame->bounds->ymin) / 20,
        ];
    }
    $extractor->release();
}
file_put_contents("$output/manifest.json", json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
