-- BLOCK sync_question_sharing_sets
WITH
  nqss AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($new_question_sharing_sets::JSONB) AS (question_id bigint, sharing_set_id bigint)
  )
INSERT INTO
  sharing_set_questions (question_id, sharing_set_id)
SELECT
  question_id,
  sharing_set_id
FROM
  nqss
ON CONFLICT (question_id, sharing_set_id) DO NOTHING;

-- BLOCK sync_course_sharing_sets
WITH
  ncss AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($new_course_sharing_sets::JSONB) AS (name text, description text)
  )
INSERT INTO
  sharing_sets (course_id, name, description)
SELECT
  $course_id,
  name,
  description
FROM
  ncss
ON CONFLICT (course_id, name) DO
UPDATE
SET
  description = EXCLUDED.description;

-- BLOCK select_course_sharing_sets
SELECT
  ss.name,
  ss.id
FROM
  sharing_sets AS ss
WHERE
  ss.course_id = $course_id;
