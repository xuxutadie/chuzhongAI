CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS app_user (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(32),
    email VARCHAR(255),
    password_hash TEXT,
    display_name VARCHAR(80) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'parent', 'coach', 'admin')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (phone),
    UNIQUE (email)
);

COMMENT ON TABLE app_user IS '用户表，对应启动指令中的 user 用户表。';

CREATE TABLE IF NOT EXISTS student_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    grade_level VARCHAR(20) NOT NULL,
    city VARCHAR(80) NOT NULL DEFAULT '贵阳',
    school_name VARCHAR(120),
    learning_goal TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_point (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject VARCHAR(20) NOT NULL CHECK (subject IN ('chinese', 'math', 'english')),
    grade_level VARCHAR(20) NOT NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT,
    source_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_task (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profile(id) ON DELETE CASCADE,
    subject VARCHAR(20) NOT NULL CHECK (subject IN ('chinese', 'math', 'english')),
    title VARCHAR(160) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    due_date DATE,
    created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profile(id) ON DELETE CASCADE,
    subject VARCHAR(20) NOT NULL CHECK (subject IN ('chinese', 'math', 'english')),
    exam_name VARCHAR(160) NOT NULL,
    score NUMERIC(5, 2),
    full_score NUMERIC(5, 2),
    exam_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wrong_question (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profile(id) ON DELETE CASCADE,
    knowledge_point_id UUID REFERENCES knowledge_point(id) ON DELETE SET NULL,
    subject VARCHAR(20) NOT NULL CHECK (subject IN ('chinese', 'math', 'english')),
    question_text TEXT NOT NULL,
    student_answer TEXT,
    correct_answer TEXT,
    error_reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'reviewing', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_report (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profile(id) ON DELETE CASCADE,
    report_type VARCHAR(40) NOT NULL,
    title VARCHAR(160) NOT NULL,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_by VARCHAR(40) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_profile_user_id ON student_profile(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_point_subject_grade ON knowledge_point(subject, grade_level);
CREATE INDEX IF NOT EXISTS idx_learning_task_student_id ON learning_task(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_record_student_id ON exam_record(student_id);
CREATE INDEX IF NOT EXISTS idx_wrong_question_student_id ON wrong_question(student_id);
CREATE INDEX IF NOT EXISTS idx_study_report_student_id ON study_report(student_id);

