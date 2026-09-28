from fastapi.testclient import TestClient
from test_daily_learning_route import RouteTests
from app.main import app
from app.api.routes.student_workspace import get_current_workspace_user,get_student_workspace_service
from app.services.student_workspace_service import StudentWorkspaceService
from app.repositories.student_workspace_repository import StudentWorkspaceRepository


class RouteApiTests(RouteTests):
    def setUp(self):
        super().setUp()
        self.user={'id':1,'role':'student','username':'1','display_name':'测试'}
        app.dependency_overrides[get_current_workspace_user]=lambda:self.user
        app.dependency_overrides[get_student_workspace_service]=lambda:StudentWorkspaceService(StudentWorkspaceRepository(self.repo.path))
        self.client=TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        super().tearDown()

    def test_public_route_and_payload_validation(self):
        response=self.client.get('/api/v1/me/learning/route')
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.json()['steps']),5)
        bad=self.client.post('/api/v1/me/learning/answers',json={'event_key':'one','assignment_id':self.assignment,'answer':'a','correct':True})
        self.assertEqual(bad.status_code,422)

    def test_collection_pagination_and_other_user_hidden(self):
        record=self.record('first','b')
        response=self.client.get('/api/v1/me/learning/collection')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['total'],1)
        self.user={'id':2,'role':'student','username':'2','display_name':'测试2'}
        self.assertEqual(self.client.get('/api/v1/me/learning/collection').json()['total'],0)
        self.assertEqual(self.client.get(f"/api/v1/me/learning/collection/{record['collection_id']}").status_code,404)
