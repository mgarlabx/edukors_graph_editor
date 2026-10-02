<?php
/**
 * Runs the player's own src/ai.php and src/course.php on one request read from
 * stdin, so tests/judge.parity.test.ts can hold the editor's port to them.
 * Touches no database: only the pure functions are called.
 *
 *   echo '{"op":"judge",...}' | php harness.php <path to player/src>
 */
declare(strict_types=1);

$src = $argv[1] ?? '';
$in  = json_decode((string) stream_get_contents(STDIN), true);

// The config is read once and cached; reading it first from a file of our own
// keeps the real private/config.php (and its key) out of the run.
$config = tempnam(sys_get_temp_dir(), 'edukors-cfg');
file_put_contents($config, '<?php return ' . var_export([
    'judge' => ['min_confidence' => (float) ($in['floor'] ?? 0), 'model' => (string) ($in['slug'] ?? 'typesafe/jev-1.13')],
], true) . ';');
require_once $src . '/config.php';
edukors_config($config);
require_once $src . '/ai.php';

$out = null;
switch ($in['op']) {
    case 'judge':
        try {
            $items = $in['content']['items'] ?? [];
            $read  = ai_judge_read($in['answers'], $in['type'], $items);
            $vars  = ai_judge_vars($in['nodeId'], $in['type'], $in['content'], $read);
            $out   = ['judged' => true, 'vars' => ai_judge_maps($vars), 'reason' => null];
        } catch (AiNotJudged $e) {
            $out = ['judged' => false, 'vars' => (object) [], 'reason' => $e->getMessage()];
        }
        break;
    case 'block':
        $out = ai_judgement_block($in['judge'], $in['vars']);
        break;
    case 'body':
        $out = ai_judge_body($in['type'], $in['items'], $in['state'], $in['model']);
        break;
    case 'state':
        $out = ai_judge_state($in['content'], $in['vars']);
        break;
    case 'write':
        $course = new Course($in['course']);
        $node   = $course->node($in['nodeId']);
        $prompt = Course::resolveStorage(Course::localize($node['content']['prompt'] ?? [], $in['lang']), $in['vars']);
        $judge  = $course->node((string) ($node['content']['from'] ?? ''));
        if ($judge !== null) {
            $prompt .= "\n\n" . ai_judgement_block($judge, $in['vars']);
        }
        $system = trim($course->systemPrompt() . "\n\nThe student's language is \"{$in['lang']}\". Answer in that language.");
        $out = ['system' => $system, 'user' => $prompt];
        break;
    case 'next':
        $course = new Course($in['course']);
        $out = $course->nextNodeId($in['from'], $in['vars']);
        break;
    case 'model':
        try {
            $out = ['slug' => ai_judge_model()];
        } catch (Throwable $e) {
            $out = ['error' => $e->getMessage()];
        }
        break;
    case 'same':
        $out = ai_judge_same_model($in['answered'], $in['asked']);
        break;
}
@unlink($config);
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
