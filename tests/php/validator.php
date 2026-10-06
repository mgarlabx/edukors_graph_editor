<?php
/**
 * Runs the player's own src/validate.php on one course read from stdin, so
 * tests/validate.parity.test.ts can hold the editor's validator to it: what the
 * player refuses to import, the editor must report as an error.
 *
 *   php validator.php <path to player/src> < course.json
 */
declare(strict_types=1);

require_once ($argv[1] ?? '') . '/validate.php';

$validator = new CourseValidator();
$validator->validate(json_decode((string) stream_get_contents(STDIN), true));
echo json_encode(
    ['errors' => $validator->errors(), 'warnings' => $validator->warnings()],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);
