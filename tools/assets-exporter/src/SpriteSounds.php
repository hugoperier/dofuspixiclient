<?php
namespace App;

use Arakne\Swf\Extractor\Sprite\SpriteDefinition;
use Arakne\Swf\Extractor\Timeline\Frame;
use Arakne\Swf\Parser\Structure\Action\Type;

/** Extract sound cues from the same nested timelines baked into sprite strips. */
final class SpriteSounds
{
    private array $frameSounds = [];
    private array $audible = [];
    private array $lengths = [];

    /** Same recursive length as the renderer, memoized for shared body parts. */
    public function recursiveFrameCount(SpriteDefinition $sprite): int
    {
        if (isset($this->lengths[$sprite->id])) return $this->lengths[$sprite->id];
        $frames = $sprite->timeline()->frames;
        $count = $this->lengths[$sprite->id] = count($frames);
        foreach ($frames as $index => $frame) {
            $length = 1;
            foreach ($frame->objects as $object) {
                $length = max($length, $object->object instanceof SpriteDefinition
                    ? $this->recursiveFrameCount($object->object)
                    : $object->object->framesCount(true));
            }
            $count = max($count, $index + $length);
        }
        return $this->lengths[$sprite->id] = $count;
    }

    /** @return list<array{frame:int,soundId:string}> */
    public function extract(SpriteDefinition $sprite, ?int $frameCount = null): array
    {
        if (!$this->hasSounds($sprite)) return [];
        $state = $this->instance($sprite);
        $sounds = [];
        $count = $frameCount ?? $this->recursiveFrameCount($sprite);
        for ($frame = 0; $frame < $count; ++$frame) {
            $this->step($state, $frame, $sounds, []);
        }
        return $sounds;
    }

    /** Body-part/decorative timelines dominate the files but carry no audio. */
    private function hasSounds(SpriteDefinition $sprite): bool
    {
        if (isset($this->audible[$sprite->id])) return $this->audible[$sprite->id];
        $this->audible[$sprite->id] = false;
        foreach ($sprite->timeline()->frames as $frame) {
            if ($this->sounds($frame)) return $this->audible[$sprite->id] = true;
            foreach ($frame->objects as $object) {
                if ($object->object instanceof SpriteDefinition && $this->hasSounds($object->object)) {
                    return $this->audible[$sprite->id] = true;
                }
            }
        }
        return false;
    }

    private function instance(SpriteDefinition $sprite): array
    {
        return ['sprite' => $sprite, 'age' => 0, 'last' => -1, 'children' => []];
    }

    private function step(array &$state, int $globalFrame, array &$sounds, array $ancestors): void
    {
        $sprite = $state['sprite'];
        if (isset($ancestors[$sprite->id])) return;
        $ancestors[$sprite->id] = true;
        $frames = $sprite->timeline()->frames;
        $index = min($state['age']++, count($frames) - 1);
        $frame = $frames[$index];
        if ($state['last'] !== $index) {
            foreach ($this->sounds($frame) as $name) {
                $sounds[] = ['frame' => $globalFrame, 'soundId' => $name];
            }
            $state['last'] = $index;
        }
        // Keep child age through placement moves. A newly placed child starts
        // at frame zero, rather than borrowing the parent's absolute frame.
        foreach ($state['children'] as $depth => $_) {
            if (!isset($frame->objects[$depth])) unset($state['children'][$depth]);
        }
        foreach ($frame->objects as $depth => $object) {
            $child = $object->object;
            if (!$child instanceof SpriteDefinition || !$this->hasSounds($child)) {
                unset($state['children'][$depth]);
                continue;
            }
            if (($state['children'][$depth]['sprite']->id ?? null) !== $child->id) {
                $state['children'][$depth] = $this->instance($child);
            }
            $this->step($state['children'][$depth], $globalFrame, $sounds, $ancestors);
        }
    }

    private function sounds(Frame $frame): array
    {
        $key = spl_object_id($frame);
        if (isset($this->frameSounds[$key])) return $this->frameSounds[$key];
        $sounds = [];
        foreach ($frame->actions as $tag) {
            $pool = [];
            $stack = [];
            $registers = [];
            foreach ($tag->actions as $action) {
                switch ($action->opcode->name) {
                    case 'ActionConstantPool': $pool = $action->data; break;
                    case 'ActionPush':
                        foreach ($action->data as $value) {
                            $stack[] = match ($value->type) {
                                Type::Constant8, Type::Constant16 => $pool[$value->value] ?? null,
                                Type::Register => $registers[$value->value] ?? null,
                                default => $value->value,
                            };
                        }
                        break;
                    case 'ActionGetVariable':
                        $name = array_pop($stack);
                        $stack[] = ['path' => is_string($name) ? $name : ''];
                        break;
                    case 'ActionGetMember':
                        $member = array_pop($stack);
                        $object = array_pop($stack);
                        $stack[] = ['path' => (is_array($object) ? ($object['path'] ?? '') : '') . '.' . (is_string($member) ? $member : '')];
                        break;
                    case 'ActionStoreRegister': $registers[$action->data] = end($stack); break;
                    case 'ActionPushDuplicate': $stack[] = end($stack); break;
                    case 'ActionStackSwap':
                        $a = array_pop($stack); $b = array_pop($stack);
                        $stack[] = $a; $stack[] = $b;
                        break;
                    case 'ActionCallMethod':
                        $method = array_pop($stack);
                        $object = array_pop($stack);
                        $count = array_pop($stack);
                        $arguments = [];
                        if (is_int($count) && $count >= 0 && $count <= count($stack)) {
                            for ($i = 0; $i < $count; ++$i) $arguments[] = array_pop($stack);
                        }
                        $path = is_array($object) ? ($object['path'] ?? '') : '';
                        if ($method === 'playSound' && preg_match('/(?:^|\.)SOMA$/', $path) && is_string($arguments[0] ?? null)) {
                            $sounds[] = $arguments[0];
                        }
                        $stack[] = null; // Unknown return value, usually popped.
                        break;
                    case 'ActionPop': array_pop($stack); break;
                    // Unsupported expressions cannot become literal sound names.
                    case 'ActionEnd': case 'ActionStop': case 'ActionPlay': break;
                    default: $stack = []; break;
                }
            }
        }
        return $this->frameSounds[$key] = $sounds;
    }
}
