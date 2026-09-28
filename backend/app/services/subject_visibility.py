"""前后端共用学科显示开关；历史记录保留。"""
import json
from pathlib import Path

_path = Path(__file__).resolve().parents[3] / "shared/subject-visibility.json"
ENABLED_SUBJECTS = frozenset(json.loads(_path.read_text(encoding="utf-8"))["enabledSubjects"])


def is_subject_enabled(subject):
    return subject in ENABLED_SUBJECTS
