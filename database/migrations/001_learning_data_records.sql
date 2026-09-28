CREATE TABLE IF NOT EXISTS study_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profile(id) ON DELETE CASCADE,
    task_id UUID NOT NULL UNIQUE REFERENCES learning_task(id) ON DELETE CASCADE,
    subject VARCHAR(20) NOT NULL CHECK (subject IN ('chinese', 'math', 'english')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    duration_minutes INTEGER CHECK (duration_minutes >= 0),
    mastery_level SMALLINT CHECK (mastery_level BETWEEN 1 AND 5),
    student_feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        status <> 'completed'
        OR (
            completed_at IS NOT NULL
            AND duration_minutes IS NOT NULL
            AND mastery_level IS NOT NULL
        )
    )
);

COMMENT ON TABLE study_record IS '学生学习任务执行记录。';

CREATE TABLE IF NOT EXISTS growth_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profile(id) ON DELETE CASCADE,
    source_type VARCHAR(40) NOT NULL CHECK (source_type IN ('task_completion')),
    source_id UUID NOT NULL REFERENCES learning_task(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL CHECK (delta <> 0),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, source_type, source_id)
);

COMMENT ON TABLE growth_record IS '学生成长值变动流水。';

CREATE INDEX IF NOT EXISTS idx_study_record_student_created_at
    ON study_record(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_record_student_created_at
    ON growth_record(student_id, created_at DESC);
