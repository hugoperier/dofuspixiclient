<?php
namespace App;

use Arakne\Swf\Extractor\Sprite\SpriteDefinition;
use Arakne\Swf\Extractor\Timeline\Frame;
use Arakne\Swf\Parser\Structure\Action\Type;

/** Replay placement transforms, without executing SWF code, for GAC.registerCarried(this). */
final class CarriedAnchors
{
    private array $registeredFrames = [];

    public function extract(SpriteDefinition $sprite): array
    {
        $state = $this->instance($sprite);
        $count = (new SpriteSounds())->recursiveFrameCount($sprite);
        $points = [];
        for ($i = 0; $i < $count; ++$i) {
            $point = null;
            $this->step($state, [1, 0, 0, 1, 0, 0], $point, []);
            $points[] = $point;
        }
        return array_filter($points, fn ($point) => $point !== null) ? $points : [];
    }

    private function instance(SpriteDefinition $sprite): array
    {
        return ['sprite' => $sprite, 'age' => 0, 'registered' => false, 'children' => []];
    }

    private function step(array &$state, array $matrix, ?array &$point, array $ancestors): void
    {
        $sprite = $state['sprite'];
        if (isset($ancestors[$sprite->id])) return;
        $ancestors[$sprite->id] = true;
        $frames = $sprite->timeline()->frames;
        if (!$frames) return;
        $frame = $frames[min($state['age']++, count($frames) - 1)];
        $state['registered'] = $state['registered'] || $this->registersCarried($frame);
        if ($state['registered']) $point = ['x' => round($matrix[4] / 20, 3), 'y' => round($matrix[5] / 20, 3)];
        foreach ($state['children'] as $depth => $_) {
            if (!isset($frame->objects[$depth])) unset($state['children'][$depth]);
        }
        foreach ($frame->objects as $depth => $object) {
            $child = $object->object;
            if (!$child instanceof SpriteDefinition) continue;
            if (($state['children'][$depth]['sprite']->id ?? null) !== $child->id) {
                $state['children'][$depth] = $this->instance($child);
            }
            // Arakne normalizes placed objects to their bounding-box origin.
            // GAC registers the original SWF origin, so undo that offset.
            $bounds = $child->bounds();
            $m = $object->matrix->translate(-$bounds->xmin, -$bounds->ymin);
            [$a, $b, $c, $d, $x, $y] = $matrix;
            $combined = [
                $a * $m->scaleX + $c * $m->rotateSkew0,
                $b * $m->scaleX + $d * $m->rotateSkew0,
                $a * $m->rotateSkew1 + $c * $m->scaleY,
                $b * $m->rotateSkew1 + $d * $m->scaleY,
                $a * $m->translateX + $c * $m->translateY + $x,
                $b * $m->translateX + $d * $m->translateY + $y,
            ];
            $this->step($state['children'][$depth], $combined, $point, $ancestors);
        }
    }

    private function registersCarried(Frame $frame): bool
    {
        $key = spl_object_id($frame);
        if (isset($this->registeredFrames[$key])) return $this->registeredFrames[$key];
        foreach ($frame->actions as $tag) {
            $pool = []; $names = [];
            foreach ($tag->actions as $action) {
                if ($action->opcode->name === 'ActionConstantPool') $pool = $action->data;
                if ($action->opcode->name === 'ActionPush') {
                    foreach ($action->data as $value) {
                        $names[] = match ($value->type) {
                            Type::Constant8, Type::Constant16 => $pool[$value->value] ?? null,
                            default => $value->value,
                        };
                    }
                }
                if ($action->opcode->name === 'ActionCallMethod') {
                    if (end($names) === 'registerCarried' && in_array('GAC', $names, true)) return $this->registeredFrames[$key] = true;
                    $names = [];
                }
            }
        }
        return $this->registeredFrames[$key] = false;
    }
}
