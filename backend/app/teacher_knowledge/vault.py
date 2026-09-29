"""复用配置加密算法，学校配置使用独立目录和加密上下文。"""
import hashlib
from uuid import UUID
from app.services.personal_api_vault import PersonalAPIVault, PersonalAPIStorageError


class SchoolAPIVault(PersonalAPIVault):
    def __init__(self, database_path, space_id):
        super().__init__(database_path)
        self.space_id = str(UUID(space_id))
        self.school_root = self.database_path.parent / f'.{self.database_path.name}.school-api'
        self.directory = self.school_root / self.space_id

    def _entropy(self, user_id):
        return hashlib.sha256(super()._entropy(user_id) + self.space_id.encode('ascii')).digest()

    def update(self, user_id, updater):
        self._check_path(self._path(user_id))
        self.school_root.mkdir(mode=0o700, exist_ok=True)
        super().update(user_id, updater)

    def _check_path(self, path):
        if self.school_root.is_symlink() or self.school_root.is_junction():
            raise PersonalAPIStorageError('学校配置存储位置不可用')
        super()._check_path(path)
