CREATE TABLE IF NOT EXISTS learning_question_assignments (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, source TEXT NOT NULL,
 source_ref TEXT NOT NULL, question_key TEXT NOT NULL, content_version TEXT NOT NULL,
 private_snapshot_json TEXT NOT NULL, context_json TEXT NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(user_id,source,source_ref)
);
CREATE TABLE IF NOT EXISTS question_answer_events (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, event_key TEXT NOT NULL,
 assignment_id TEXT NOT NULL REFERENCES learning_question_assignments(id),
 answer_json TEXT NOT NULL, result TEXT NOT NULL
 CHECK(result IN ('correct','wrong','skipped','unverified')),
 occurred_at TEXT NOT NULL, received_at TEXT NOT NULL,
 UNIQUE(user_id,event_key)
);
CREATE TABLE IF NOT EXISTS wrong_question_learning (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
 wrong_question_id INTEGER UNIQUE REFERENCES wrong_questions(id) ON DELETE SET NULL,
 identity_key TEXT NOT NULL, parent_id INTEGER REFERENCES wrong_question_learning(id),
 stage TEXT NOT NULL DEFAULT 'pending_verification',
 evidence_version INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
 wrong_count INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL DEFAULT '{}',
 due_date TEXT, review_passes INTEGER NOT NULL DEFAULT 0, last_pass_date TEXT,
 suppressed INTEGER NOT NULL DEFAULT 0 CHECK(suppressed IN (0,1)),
 UNIQUE(user_id,identity_key)
);
CREATE TABLE IF NOT EXISTS wrong_question_event_links (
 event_id INTEGER PRIMARY KEY REFERENCES question_answer_events(id),
 learning_id INTEGER NOT NULL REFERENCES wrong_question_learning(id),
 disposition TEXT NOT NULL CHECK(disposition IN ('linked','suppressed'))
);
CREATE TABLE IF NOT EXISTS wrong_question_ai_jobs (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
 learning_id INTEGER NOT NULL REFERENCES wrong_question_learning(id),
 request_key TEXT NOT NULL, kind TEXT NOT NULL, evidence_version INTEGER NOT NULL,
 status TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until TEXT, input_json TEXT NOT NULL,
 result_json TEXT, error_code TEXT, model_metadata_json TEXT, updated_at TEXT NOT NULL,
 UNIQUE(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS wrong_question_practice_items (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
 learning_id INTEGER NOT NULL REFERENCES wrong_question_learning(id),
 assignment_id TEXT UNIQUE NOT NULL REFERENCES learning_question_assignments(id),
 stage TEXT NOT NULL, validation_status TEXT NOT NULL,
 validator_version TEXT NOT NULL, parameters_hash TEXT NOT NULL,
 hint_used INTEGER NOT NULL DEFAULT 0, frozen INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wrong_question_practice_attempts (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, request_id TEXT NOT NULL,
 item_id TEXT NOT NULL REFERENCES wrong_question_practice_items(id),
 event_id INTEGER UNIQUE NOT NULL REFERENCES question_answer_events(id),
 independent INTEGER NOT NULL, state_before_json TEXT NOT NULL,
 state_after_json TEXT NOT NULL, submitted_at TEXT NOT NULL,
 UNIQUE(user_id,request_id), UNIQUE(user_id,item_id)
);
CREATE TABLE IF NOT EXISTS wrong_question_daily_reviews (
 user_id INTEGER NOT NULL, study_date TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0, plan_json TEXT NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY(user_id,study_date)
);
CREATE TABLE IF NOT EXISTS daily_learning_routes (
 user_id INTEGER NOT NULL, study_date TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0, course_snapshot_json TEXT NOT NULL,
 state_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,study_date)
);
CREATE INDEX IF NOT EXISTS idx_learning_event_owner ON question_answer_events(user_id,received_at,id);
CREATE INDEX IF NOT EXISTS idx_learning_due ON wrong_question_learning(user_id,suppressed,due_date,id);
CREATE INDEX IF NOT EXISTS idx_learning_jobs ON wrong_question_ai_jobs(status,lease_until,updated_at);
