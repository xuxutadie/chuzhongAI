import test from 'node:test';
import assert from 'node:assert/strict';
import {getRoleHomePath, getRoleDestination} from '../app/student-session-model.ts';
import {getRegistrationDestination} from '../app/student-registration-model.ts';

test('教师不会被学生页面 next 带入错误工作台', () => {
  assert.equal(getRoleHomePath('teacher'), '/teacher/students');
  assert.equal(getRoleDestination('teacher','/subjects/math'), '/teacher/students');
  assert.equal(getRoleDestination('teacher','/teacher/profile'), '/teacher/profile');
  assert.equal(getRoleDestination('student','/teacher/students'), '/dashboard');
  assert.equal(getRegistrationDestination('teacher-register','/dashboard','teacher'), '/teacher/students');
  assert.equal(getRoleDestination('teacher','/model-config'), '/teacher/students');
});
